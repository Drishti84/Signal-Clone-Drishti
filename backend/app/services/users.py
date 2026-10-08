from sqlalchemy import or_, select
from sqlalchemy.orm import Session as Db

from app.constants import AVATAR_MAX_BYTES
from app.errors import BadRequest, NotFound
from app.models import User, UserAvatar

_MAGIC = {b"\x89PNG\r\n\x1a\n": "image/png", b"\xff\xd8\xff": "image/jpeg"}


def sniff_image_type(data: bytes) -> str | None:
    """Trust the bytes, not the upload's declared content type."""
    for magic, content_type in _MAGIC.items():
        if data.startswith(magic):
            return content_type
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def set_avatar(db: Db, user: User, data: bytes) -> None:
    if len(data) > AVATAR_MAX_BYTES:
        raise BadRequest("Photo must be 256 KB or smaller")
    content_type = sniff_image_type(data)
    if content_type is None:
        raise BadRequest("Upload a JPEG, PNG or WebP image")
    if user.avatar is None:
        user.avatar = UserAvatar(content_type=content_type, data=data)
    else:
        user.avatar.content_type, user.avatar.data = content_type, data
    # The version is part of the image URL, so browsers refetch after a change.
    user.avatar_version += 1


def remove_avatar(db: Db, user: User) -> None:
    if user.avatar is not None:
        user.avatar = None
        user.avatar_version += 1


def get_avatar(db: Db, user_id: int) -> UserAvatar:
    avatar = db.get(UserAvatar, user_id)
    if avatar is None:
        raise NotFound("No photo")
    return avatar


def get_user(db: Db, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFound("User not found")
    return user


def search(db: Db, me: User, q: str | None) -> list[User]:
    """Registered users who finished onboarding, excluding the caller."""
    query = select(User).where(User.id != me.id, User.display_name.is_not(None))
    if q and q.strip():
        term = q.strip()
        query = query.where(or_(User.display_name.icontains(term, autoescape=True),
                                User.phone.contains(term, autoescape=True)))
    return list(db.scalars(query.order_by(User.display_name)))


def lookup_by_phone(db: Db, phone: str) -> User:
    """`phone` is already normalised."""
    user = db.scalar(select(User).where(User.phone == phone))
    if user is None:
        raise NotFound("This number is not on Signal")
    return user
