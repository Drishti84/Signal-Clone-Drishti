from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session as Db

from app.database import get_db
from app.models import User
from app.services import auth


def get_token(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    return authorization.removeprefix("Bearer ")


def get_current_user(token: str = Depends(get_token), db: Db = Depends(get_db)) -> User:
    user = auth.user_for_token(db, token)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user
