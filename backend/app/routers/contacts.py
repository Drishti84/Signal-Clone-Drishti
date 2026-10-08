from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session as Db

from app.database import get_db
from app.deps import get_profiled_user
from app.models import User
from app.realtime.manager import manager
from app.schemas.contact import ContactIn
from app.schemas.user import UserOut
from app.services import contacts, users
from app.services.serializers import user_out

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


@router.get("", response_model=list[UserOut])
def list_contacts(me: User = Depends(get_profiled_user), db: Db = Depends(get_db)):
    online = manager.online_ids()
    return [user_out(user, online) for user in contacts.list_contacts(db, me)]


@router.post("", response_model=UserOut, status_code=201)
def add_contact(body: ContactIn, me: User = Depends(get_profiled_user),
                db: Db = Depends(get_db)):
    target_id = body.user_id
    if target_id is None:
        target_id = users.lookup_by_phone(db, body.phone).id
    target = contacts.add_contact(db, me, target_id)
    db.commit()
    return user_out(target, manager.online_ids())


@router.delete("/{user_id}", status_code=204)
def remove_contact(user_id: int, me: User = Depends(get_profiled_user),
                   db: Db = Depends(get_db)):
    contacts.remove_contact(db, me, user_id)
    db.commit()
    return Response(status_code=204)
