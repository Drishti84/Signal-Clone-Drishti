"""Group administration: rename, add, remove, leave, promote, demote.

Every function returns (conversation, events). The conversation is None when
the last member left and the group was deleted."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session as Db

from app.errors import BadRequest, Forbidden, NotFound
from app.models import (Conversation, ConversationMember, Message, MessageReceipt,
                        User)
from app.realtime.events import Event
from app.services.conversations import add_system_message, get_member, member_ids
from app.services.receipts import status_events
from app.services.serializers import conversation_out, message_out

Result = tuple[Conversation | None, list[Event]]


def _group_member(db: Db, conversation_id: int, user_id: int) -> ConversationMember:
    member = get_member(db, conversation_id, user_id)
    if member.conversation.type != "group":
        raise BadRequest("This only works in groups")
    return member


def _admin(db: Db, conversation_id: int, user_id: int) -> ConversationMember:
    member = _group_member(db, conversation_id, user_id)
    if member.role != "admin":
        raise Forbidden("Only admins can do this")
    return member


def _find(conv: Conversation, user_id: int) -> ConversationMember:
    for member in conv.members:
        if member.user_id == user_id:
            return member
    raise NotFound("That person is not in this group")


def _snapshot(conv: Conversation, last: Message, online: set[int]) -> dict:
    # Unread counts differ per viewer, so the broadcast carries 0 and each
    # client keeps the count it already has.
    return conversation_out(conv, last, 0, online)


def announce(db: Db, conv: Conversation, bodies: list[str], online: set[int],
              new_user_ids: list[int] = ()) -> list[Event]:
    """Write one system line per change, then tell the members. People who
    just joined get `conversation.new`; everyone else `conversation.updated`."""
    db.flush()
    db.refresh(conv, ["members"])
    system = [add_system_message(db, conv, body) for body in bodies]
    everyone = member_ids(conv)
    existing = [uid for uid in everyone if uid not in new_user_ids]
    snapshot = _snapshot(conv, system[-1], online)
    events = [Event(existing, "message.new", {"message": message_out(msg)}) for msg in system]
    events.append(Event(existing, "conversation.updated", {"conversation": snapshot}))
    if new_user_ids:
        events.append(Event(list(new_user_ids), "conversation.new", {"conversation": snapshot}))
    return events


def rename(db: Db, me: User, conversation_id: int, name: str, online: set[int]) -> Result:
    conv = _admin(db, conversation_id, me.id).conversation
    if conv.name == name:
        return conv, []
    conv.name = name
    return conv, announce(db, conv, [f"{me.display_name} renamed the group to {name}"], online)


def add_members(db: Db, me: User, conversation_id: int, user_ids: list[int],
                online: set[int]) -> Result:
    conv = _admin(db, conversation_id, me.id).conversation
    new_ids = sorted(set(user_ids) - set(member_ids(conv)))
    if not new_ids:
        return conv, []
    users = db.scalars(select(User).where(User.id.in_(new_ids)).order_by(User.id)).all()
    if len(users) != len(new_ids):
        raise BadRequest("Some members could not be found")
    # Newcomers can read the history, but it should not all count as unread.
    newest = db.scalar(select(func.max(Message.id)).where(
        Message.conversation_id == conversation_id))
    for user in users:
        conv.members.append(ConversationMember(user_id=user.id, last_read_message_id=newest))
    bodies = [f"{me.display_name} added {user.display_name}" for user in users]
    return conv, announce(db, conv, bodies, online, new_user_ids=new_ids)


def remove_member(db: Db, me: User, conversation_id: int, target_id: int,
                  online: set[int]) -> Result:
    """Remove someone else (admins only) or leave (anyone)."""
    leaving = target_id == me.id
    actor = (_group_member if leaving else _admin)(db, conversation_id, me.id)
    conv = actor.conversation
    target = _find(conv, target_id)
    name = target.user.display_name
    conv.members.remove(target)  # delete-orphan deletes the membership row
    removed = Event([target_id], "conversation.removed", {"conversation_id": conversation_id})
    if not conv.members:
        db.delete(conv)
        return None, [removed]
    # Their unread receipts would otherwise hold back "delivered" and "read" forever.
    stale = db.scalars(select(MessageReceipt).join(Message).where(
        Message.conversation_id == conversation_id, MessageReceipt.user_id == target_id,
        MessageReceipt.read_at.is_(None))).all()
    for receipt in stale:
        db.delete(receipt)
    db.flush()
    # With that person gone, some messages may now count as delivered or read.
    freed = status_events(db, [receipt.message_id for receipt in stale])
    if not any(member.role == "admin" for member in conv.members):
        conv.members[0].role = "admin"  # members are ordered longest-standing first
    body = f"{name} left the group" if leaving else f"{me.display_name} removed {name}"
    return conv, [removed] + freed + announce(db, conv, [body], online)


def set_role(db: Db, me: User, conversation_id: int, target_id: int, role: str,
             online: set[int]) -> Result:
    conv = _admin(db, conversation_id, me.id).conversation
    target = _find(conv, target_id)
    if target.role == role:
        return conv, []
    admins = [member for member in conv.members if member.role == "admin"]
    if role == "member" and len(admins) == 1:
        raise BadRequest("A group needs at least one admin")
    target.role = role
    name = target.user.display_name
    body = (f"{me.display_name} made {name} an admin" if role == "admin"
            else f"{name} is no longer an admin")
    return conv, announce(db, conv, [body], online)
