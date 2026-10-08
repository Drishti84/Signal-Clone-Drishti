from collections import defaultdict
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session as Db

from app.models import ConversationMember, Message, utcnow
from app.realtime.events import Event


def purge_expired(db: Db, now: datetime | None = None) -> list[Event]:
    """Remove every disappearing message whose time is up, and return one
    `message.expired` event per affected chat so open browsers drop them too.

    Rows are deleted outright: receipts and reactions go with them (database
    cascades), and a reply that quoted one simply loses its quote."""
    now = now or utcnow()
    expired = db.execute(
        select(Message.id, Message.conversation_id)
        .where(Message.expires_at.is_not(None), Message.expires_at <= now)
        .order_by(Message.id)).all()
    if not expired:
        return []

    by_conversation: dict[int, list[int]] = defaultdict(list)
    for message_id, conversation_id in expired:
        by_conversation[conversation_id].append(message_id)

    members: dict[int, list[int]] = defaultdict(list)
    for conversation_id, user_id in db.execute(
            select(ConversationMember.conversation_id, ConversationMember.user_id)
            .where(ConversationMember.conversation_id.in_(by_conversation))):
        members[conversation_id].append(user_id)

    db.execute(delete(Message).where(Message.id.in_([row.id for row in expired])))
    db.expire_all()  # rows loaded earlier in this session may be gone now
    return [Event(members[conversation_id], "message.expired",
                  {"conversation_id": conversation_id, "message_ids": ids})
            for conversation_id, ids in by_conversation.items()]
