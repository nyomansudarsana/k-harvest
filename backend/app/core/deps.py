from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.security import decode_access_token
from app.models.user import User

security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    username: str = payload.get("sub")
    if username is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.query(User).filter(User.username == username, User.deleted_at.is_(None)).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if user.status != "Active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "Administrator":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required")
    return current_user


def require_permission(menu_code: str, action: str = "can_view"):
    """Factory that returns a FastAPI dependency checking role-based menu permissions."""
    def _check(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        if current_user.role == "Administrator":
            return current_user
        from app.models.rbac import MenuPermission
        perm = db.query(MenuPermission).filter(
            MenuPermission.role_name == current_user.role,
            MenuPermission.menu_code == menu_code,
        ).first()
        if not perm or not getattr(perm, action, False):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You do not have '{action}' permission for '{menu_code}'",
            )
        return current_user
    return _check
