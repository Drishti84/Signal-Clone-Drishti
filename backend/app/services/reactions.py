from sqlalchemy.orm import Session as Db

from app.errors import BadRequest, NotFound
from app.models import Message, Reaction, User
from app.realtime.events import Event
from app.services.conversations import get_member, member_ids
from app.services.serializers import message_out


def _load(db: Db, me: User, message_id: int) -> tuple[Message, list[int]]:
    """The message plus its conversation's member ids, if `me` may see it."""
    msg = db.get(Message, message_id)
    if msg is None:
        raise NotFound("Message not found")
    member = get_member(db, msg.conversation_id, me.id)
    return msg, member_ids(member.conversation)


def _changed(db: Db, msg: Message, audience: list[int]) -> tuple[Message, list[Event]]:
    db.flush()
    db.refresh(msg, ["reactions"])
    event = Event(audience, "message.reaction", {
        "conversation_id": msg.conversation_id, "message_id": msg.id,
        "reactions": message_out(msg)["reactions"]})
    return msg, [event]


def set_reaction(db: Db, me: User, message_id: int, emoji: str) -> tuple[Message, list[Event]]:
    """One reaction per user per message: a second one replaces the first."""
    msg, audience = _load(db, me, message_id)
    if msg.deleted_at is not None:
        raise BadRequest("This message was deleted")
    mine = next((r for r in msg.reactions if r.user_id == me.id), None)
    if mine is None:
        db.add(Reaction(message_id=msg.id, user_id=me.id, emoji=emoji))
    else:
        mine.emoji = emoji
    return _changed(db, msg, audience)


def remove_reaction(db: Db, me: User, message_id: int) -> tuple[Message, list[Event]]:
    msg, audience = _load(db, me, message_id)
    mine = next((r for r in msg.reactions if r.user_id == me.id), None)
    if mine is None:
        return msg, []
    db.delete(mine)
    return _changed(db, msg, audience)
