from sqlalchemy import select
from sqlalchemy.orm import Session as Db

from app.models import Contact, ConversationMember


def audience(db: Db, user_id: int) -> list[int]:
    """Who should hear that `user_id` came online or changed their profile:
    everyone they share a conversation with, plus everyone who saved them
    as a contact."""
    mine = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == user_id)
    partners = select(ConversationMember.user_id).where(
        ConversationMember.conversation_id.in_(mine))
    owners = select(Contact.owner_id).where(Contact.contact_id == user_id)
    ids = set(db.scalars(partners)) | set(db.scalars(owners))
    ids.discard(user_id)
    return sorted(ids)
