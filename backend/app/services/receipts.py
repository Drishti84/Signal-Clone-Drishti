from sqlalchemy import select
from sqlalchemy.orm import Session as Db

from app.errors import NotFound
from app.models import Message, MessageReceipt, User, utcnow
from app.realtime.events import Event
from app.services.conversations import get_member
from app.services.serializers import aggregate_status


def status_events(db: Db, message_ids: list[int]) -> list[Event]:
    """Tell each sender the current status of these messages: one event per
    (sender, conversation, status). Messages still at "sent" need no event."""
    if not message_ids:
        return []
    messages = db.scalars(select(Message).where(
        Message.id.in_(message_ids)).order_by(Message.id)).all()
    grouped: dict[tuple[int, int, str], list[int]] = {}
    for msg in messages:
        key = (msg.sender_id, msg.conversation_id, aggregate_status(msg.receipts))
        grouped.setdefault(key, []).append(msg.id)
    return [Event([sender], "message.status",
                  {"conversation_id": conv_id, "message_ids": ids, "status": status})
            for (sender, conv_id, status), ids in grouped.items() if status != "sent"]


def _status_events(db: Db, receipts: list[MessageReceipt]) -> list[Event]:
    return status_events(db, [receipt.message_id for receipt in receipts])


def mark_read(db: Db, me: User, conversation_id: int, message_id: int) -> list[Event]:
    """Mark everything up to `message_id` as read by `me`."""
    member = get_member(db, conversation_id, me.id)
    if (member.last_read_message_id or 0) >= message_id:
        return []  # the marker only ever moves forward
    target = db.get(Message, message_id)
    if target is None or target.conversation_id != conversation_id:
        raise NotFound("Message not found")
    member.last_read_message_id = message_id
    now = utcnow()
    receipts = db.scalars(select(MessageReceipt).join(Message).where(
        Message.conversation_id == conversation_id, Message.id <= message_id,
        MessageReceipt.user_id == me.id, MessageReceipt.read_at.is_(None))).all()
    for receipt in receipts:
        receipt.read_at = now
        receipt.delivered_at = receipt.delivered_at or now
    db.flush()
    # The reader's other tabs clear their unread badge too.
    read_event = Event([me.id], "conversation.read", {
        "conversation_id": conversation_id, "last_read_message_id": message_id})
    return _status_events(db, receipts) + [read_event]


def mark_delivered_for_user(db: Db, user_id: int) -> list[Event]:
    """Called when a user's first socket connects: everything that was
    waiting for them has now been delivered."""
    receipts = db.scalars(select(MessageReceipt).where(
        MessageReceipt.user_id == user_id, MessageReceipt.delivered_at.is_(None))).all()
    now = utcnow()
    for receipt in receipts:
        receipt.delivered_at = now
    db.flush()
    return _status_events(db, receipts)
