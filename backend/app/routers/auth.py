import logging
import traceback
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.security import verify_password, create_access_token
from app.core.deps import get_current_user
from app.models.user import User
from app.models.rbac import MenuPermission
from app.schemas.user import LoginRequest, TokenResponse, UserResponse, UserPermissionItem

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

_ALL_MENUS = [
    "dashboard", "command_center",
    "products", "suppliers", "users",
    "receiving", "qc", "qc_failed", "inventory", "stock_opname",
    "quotation", "invoice", "settings",
]


def _build_permissions(user: User, db: Session) -> list:
    """Return the user's menu permissions list."""
    if user.role == "Administrator":
        return [
            UserPermissionItem(
                menu_code=mc,
                can_view=True, can_create=True, can_edit=True,
                can_delete=True, can_approve=True, can_export=True,
            )
            for mc in _ALL_MENUS
        ]
    rows = db.query(MenuPermission).filter(MenuPermission.role_name == user.role).all()
    return [
        UserPermissionItem(
            menu_code=p.menu_code,
            can_view=p.can_view, can_create=p.can_create, can_edit=p.can_edit,
            can_delete=p.can_delete, can_approve=p.can_approve, can_export=p.can_export,
        )
        for p in rows
    ]


def _user_response(user: User, db: Session) -> UserResponse:
    resp = UserResponse.model_validate(user)
    resp.permissions = _build_permissions(user, db)
    return resp


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    try:
        logger.info(f"Login attempt for username: {payload.username}")

        user = db.query(User).filter(
            User.username == payload.username,
            User.deleted_at.is_(None),
        ).first()

        if user is None:
            logger.warning(f"Login failed: user '{payload.username}' not found in database")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

        logger.info(f"User found: id={user.id}, user_id={user.user_id}, status={user.status}")

        if not verify_password(payload.password, user.password_hash):
            logger.warning(f"Login failed: password mismatch for user '{payload.username}'")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

        if user.status != "Active":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")

        token = create_access_token({"sub": user.username})
        logger.info(f"Login successful for user '{payload.username}'")

        return TokenResponse(
            access_token=token,
            user=_user_response(user, db),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LOGIN ERROR — type: {type(e).__name__}, message: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal login error: {type(e).__name__}: {str(e)}")


@router.get("/me", response_model=UserResponse)
def get_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _user_response(current_user, db)
