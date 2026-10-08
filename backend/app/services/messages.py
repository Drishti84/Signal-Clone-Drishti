from sqlalchemy import select
from sqlalchemy.orm import Session as Db

from app.errors import BadRequest
from app.models import Message, MessageReceipt, User, utcnow
from app.realtime.events import Event
from app.services.conversations import get_member, member_ids
from app.services.serializers import message_out


def send_message(db: Db, me: User, conversation_id: int, body: str, client_id: str,
                 reply_to_id: int | None, online: set[int]
                 ) -> tuple[Message, list[Event], bool]:
    """Save a message and its receipts. Returns (message, events, created);
    `created` is False when this client_id was already saved, which happens
    when the client retries after losing the first response."""
    member = get_member(db, conversation_id, me.id)
    conv = member.conversation
    existing = db.scalar(select(Message).where(
        Message.sender_id == me.id, Message.client_id == client_id))
    if existing is not None:
        return existing, [], False
    if reply_to_id is not None:
        target = db.get(Message, reply_to_id)
        if target is None or target.conversation_id != conversation_id:
            raise BadRequest("You can only reply to a message in this chat")
    now = utcnow()
    msg = Message(conversation_id=conversation_id, sender_id=me.id, type="text",
                  body=body, client_id=client_id, reply_to_id=reply_to_id, created_at=now)
    recipients = [uid for uid in member_ids(conv) if uid != me.id]
    # Recipients with an open socket receive it as part of this same request.
    msg.receipts = [MessageReceipt(user_id=uid, delivered_at=now if uid in online else None)
                    for uid in recipients]
    db.add(msg)
    db.flush()
    conv.last_message_at = now
    member.last_read_message_id = msg.id  # your own message is never unread
    db.flush()
    db.refresh(msg)
    events = [Event(member_ids(conv), "message.new", {"message": message_out(msg)})]
    return msg, events, True


def list_messages(db: Db, me: User, conversation_id: int, before: int | None,
                  limit: int) -> tuple[list[Message], bool]:
    """One page, oldest first, ending just before message id `before`
    (or at the newest message). Also says whether older pages exist."""
    get_member(db, conversation_id, me.id)
    query = select(Message).where(Message.conversation_id == conversation_id)
    if before is not None:
        query = query.where(Message.id < before)
    # Ask for one extra row: its presence tells us there is an older page.
    rows = db.scalars(query.order_by(Message.id.desc()).limit(limit + 1)).all()
    return list(reversed(rows[:limit])), len(rows) > limit
