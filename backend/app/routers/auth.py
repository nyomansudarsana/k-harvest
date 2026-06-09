import logging
import traceback
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.security import verify_password, create_access_token
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.user import LoginRequest, TokenResponse, UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


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
        logger.info(f"created_at={user.created_at}, updated_at={user.updated_at}")

        if not verify_password(payload.password, user.password_hash):
            logger.warning(f"Login failed: password mismatch for user '{payload.username}'")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

        if user.status != "Active":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")

        token = create_access_token({"sub": user.username})
        logger.info(f"Login successful for user '{payload.username}'")

        return TokenResponse(
            access_token=token,
            user=UserResponse.model_validate(user),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LOGIN ERROR — type: {type(e).__name__}, message: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal login error: {type(e).__name__}: {str(e)}")


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
