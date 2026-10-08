from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as Db

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.realtime.manager import manager
from app.schemas.user import ProfileUpdate, UserOut
from app.services.serializers import user_out

router = APIRouter(prefix="/api/users", tags=["users"])


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
