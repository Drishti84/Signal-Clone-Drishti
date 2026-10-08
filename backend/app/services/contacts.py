from sqlalchemy import select
from sqlalchemy.orm import Session as Db

from app.errors import BadRequest, NotFound
from app.models import Contact, User


def list_contacts(db: Db, me: User) -> list[User]:
    query = (select(User).join(Contact, Contact.contact_id == User.id)
             .where(Contact.owner_id == me.id).order_by(User.display_name))
    return list(db.scalars(query))


def _find(db: Db, me: User, target_id: int) -> Contact | None:
    return db.scalar(select(Contact).where(
        Contact.owner_id == me.id, Contact.contact_id == target_id))


def add_contact(db: Db, me: User, target_id: int) -> User:
    """Adding someone twice is harmless and returns the same user."""
    if target_id == me.id:
        raise BadRequest("You can't add yourself")
    target = db.get(User, target_id)
    if target is None:
        raise NotFound("User not found")
    if _find(db, me, target_id) is None:
        db.add(Contact(owner_id=me.id, contact_id=target_id))
    return target


def remove_contact(db: Db, me: User, target_id: int) -> None:
    contact = _find(db, me, target_id)
    if contact is not None:
        db.delete(contact)
