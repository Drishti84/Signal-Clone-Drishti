from fastapi import APIRouter, Depends, Response, UploadFile
from sqlalchemy.orm import Session as Db

from app.constants import AVATAR_MAX_BYTES
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.realtime.manager import manager
from app.schemas.user import ProfileUpdate, UserOut
from app.services import users
from app.services.phone import normalize_phone
from app.services.serializers import user_out

router = APIRouter(prefix="/api/users", tags=["users"])


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
def update_me(body: ProfileUpdate, me: User = Depends(get_current_user),
              db: Db = Depends(get_db)):
    for field in body.model_fields_set:
        setattr(me, field, getattr(body, field))
    db.commit()
    return user_out(me, manager.online_ids())


@router.put("/me/avatar", response_model=UserOut)
def upload_avatar(file: UploadFile, me: User = Depends(get_current_user),
                  db: Db = Depends(get_db)):
    # Read one byte past the limit: enough to know it is too big, without
    # pulling an arbitrarily large upload into memory.
    data = file.file.read(AVATAR_MAX_BYTES + 1)
    users.set_avatar(db, me, data)
    db.commit()
    return user_out(me, manager.online_ids())


@router.delete("/me/avatar", response_model=UserOut)
def delete_avatar(me: User = Depends(get_current_user), db: Db = Depends(get_db)):
    users.remove_avatar(db, me)
    db.commit()
    return user_out(me, manager.online_ids())


@router.get("/lookup", response_model=UserOut)
def lookup(phone: str, _me: User = Depends(get_current_user), db: Db = Depends(get_db)):
    user = users.lookup_by_phone(db, normalize_phone(phone))
    return user_out(user, manager.online_ids())


@router.get("/{user_id}/avatar")
def get_avatar(user_id: int, db: Db = Depends(get_db)):
    """Public on purpose: an <img> tag cannot send the auth header. The
    version in the URL changes with every upload, so caching forever is safe."""
    avatar = users.get_avatar(db, user_id)
    return Response(content=avatar.data, media_type=avatar.content_type,
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})
