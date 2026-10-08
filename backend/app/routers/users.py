import hashlib

from fastapi import APIRouter, BackgroundTasks, Depends, Header, Response, UploadFile
from sqlalchemy.orm import Session as Db

from app.constants import AVATAR_MAX_BYTES
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.realtime.events import Event
from app.realtime.manager import manager
from app.schemas.user import ProfileUpdate, UserOut
from app.services import presence, users
from app.services.phone import normalize_phone
from app.services.serializers import user_out

router = APIRouter(prefix="/api/users", tags=["users"])


def _profile_changed(db: Db, me: User, background: BackgroundTasks) -> dict:
    """Commit a profile change and tell everyone who can see this user."""
    db.commit()
    out = user_out(me, manager.online_ids())
    audience = presence.audience(db, me.id) + [me.id]
    background.add_task(manager.dispatch, [Event(audience, "user.updated", {"user": out})])
    return out


@router.get("", response_model=list[UserOut])
def search_users(q: str | None = None, me: User = Depends(get_current_user),
                 db: Db = Depends(get_db)):
    online = manager.online_ids()
    return [user_out(user, online) for user in users.search(db, me, q)]


# Fixed paths are declared before "/{user_id}/..." so they are matched first.
@router.get("/me", response_model=UserOut)
def get_me(me: User = Depends(get_current_user)):
    return user_out(me, manager.online_ids())


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileUpdate, background: BackgroundTasks,
              me: User = Depends(get_current_user), db: Db = Depends(get_db)):
    for field in body.model_fields_set:
        setattr(me, field, getattr(body, field))
    return _profile_changed(db, me, background)


@router.put("/me/avatar", response_model=UserOut)
def upload_avatar(file: UploadFile, background: BackgroundTasks,
                  me: User = Depends(get_current_user), db: Db = Depends(get_db)):
    # One byte past the limit is enough to know the photo is too big.
    data = file.file.read(AVATAR_MAX_BYTES + 1)
    users.set_avatar(db, me, data)
    return _profile_changed(db, me, background)


@router.delete("/me/avatar", response_model=UserOut)
def delete_avatar(background: BackgroundTasks, me: User = Depends(get_current_user),
                  db: Db = Depends(get_db)):
    users.remove_avatar(db, me)
    return _profile_changed(db, me, background)


@router.get("/lookup", response_model=UserOut)
def lookup(phone: str, _me: User = Depends(get_current_user), db: Db = Depends(get_db)):
    user = users.lookup_by_phone(db, normalize_phone(phone))
    return user_out(user, manager.online_ids())


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, _me: User = Depends(get_current_user), db: Db = Depends(get_db)):
    """Used to show the name of someone who wrote in a chat but has since left it."""
    return user_out(users.get_user(db, user_id), manager.online_ids())


@router.get("/{user_id}/avatar")
def get_avatar(user_id: int, if_none_match: str | None = Header(default=None),
               db: Db = Depends(get_db)):
    """Public on purpose: an <img> tag cannot send the auth header.

    The browser may keep the photo but must check it is still current (an
    ETag built from the image bytes), so a replaced photo is never shown stale."""
    avatar = users.get_avatar(db, user_id)
    etag = f'"{hashlib.sha256(avatar.data).hexdigest()[:32]}"'
    headers = {"Cache-Control": "no-cache", "ETag": etag}
    if if_none_match == etag:
        return Response(status_code=304, headers=headers)
    return Response(content=avatar.data, media_type=avatar.content_type, headers=headers)
