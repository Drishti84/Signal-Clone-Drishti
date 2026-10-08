import secrets
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session as Db

from app.constants import FIXED_OTP, SESSION_DAYS
from app.errors import BadRequest
from app.models import Session, User, utcnow


def is_registered(db: Db, phone: str) -> bool:
    return db.scalar(select(User.id).where(User.phone == phone)) is not None


def verify_otp(db: Db, phone: str, otp: str) -> tuple[User, str, bool]:
    """`phone` is already normalised. Creates the user on first login.
    Returns (user, session token, needs_profile)."""
    if otp != FIXED_OTP:
        raise BadRequest("Incorrect code")
    user = db.scalar(select(User).where(User.phone == phone))
    if user is None:
        user = User(phone=phone)
        db.add(user)
        db.flush()
    token = secrets.token_urlsafe(32)
    db.add(Session(user_id=user.id, token=token,
                   expires_at=utcnow() + timedelta(days=SESSION_DAYS)))
    return user, token, user.display_name is None


def user_for_token(db: Db, token: str) -> User | None:
    session = db.scalar(select(Session).where(Session.token == token))
    if session is None or session.expires_at <= utcnow():
        return None
    return session.user


def logout(db: Db, token: str) -> None:
    session = db.scalar(select(Session).where(Session.token == token))
    if session is not None:
        db.delete(session)


def demo_users(db: Db) -> list[User]:
    return list(db.scalars(select(User).where(User.is_demo).order_by(User.id)))
