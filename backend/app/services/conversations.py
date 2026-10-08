from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session as Db
from sqlalchemy.orm import contains_eager

from app.constants import AVATAR_COLORS
from app.errors import BadRequest, Forbidden, NotFound
from app.models import Conversation, ConversationMember, Message, User


def get_member(db: Db, conversation_id: int, user_id: int) -> ConversationMember:
    """The membership row that proves `user_id` may touch this conversation.
    Every conversation and message route goes through here."""
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        raise NotFound("Conversation not found")
    for member in conv.members:
        if member.user_id == user_id:
            return member
    raise Forbidden("You are not in this conversation")


def member_ids(conv: Conversation) -> list[int]:
    return [member.user_id for member in conv.members]


def open_direct(db: Db, me: User, other_id: int) -> tuple[Conversation, bool]:
    """Return the one direct chat between two users, creating it if needed."""
    if other_id == me.id:
        raise BadRequest("You can't start a chat with yourself")
    if db.get(User, other_id) is None:
        raise NotFound("User not found")
    key = f"{min(me.id, other_id)}:{max(me.id, other_id)}"
    conv = db.scalar(select(Conversation).where(Conversation.direct_key == key))
    if conv is not None:
        return conv, False
    conv = Conversation(type="direct", created_by=me.id, direct_key=key)
    conv.members = [ConversationMember(user_id=me.id), ConversationMember(user_id=other_id)]
    db.add(conv)
    db.flush()
    return conv, True


def create_group(db: Db, me: User, name: str, member_ids: list[int]) -> Conversation:
    others = sorted(set(member_ids) - {me.id})
    if not others:
        raise BadRequest("Add at least one other member")
    found = db.scalars(select(User.id).where(User.id.in_(others))).all()
    if len(found) != len(others):
        raise BadRequest("Some members could not be found")
    conv = Conversation(type="group", name=name, created_by=me.id,
                        avatar_color=AVATAR_COLORS[len(name) % len(AVATAR_COLORS)])
    conv.members = [ConversationMember(user_id=me.id, role="admin")] + [
        ConversationMember(user_id=uid) for uid in others]
    db.add(conv)
    db.flush()
    add_system_message(db, conv, f"{me.display_name} created the group")
    return conv


def add_system_message(db: Db, conv: Conversation, body: str) -> Message:
    """A grey centred line such as "Asha added Rohan". It has no sender and
    no receipts, and never counts as unread."""
    msg = Message(conversation_id=conv.id, type="system", body=body)
    db.add(msg)
    db.flush()
    conv.last_message_at = msg.created_at
    return msg


def _is_unread():
    """Filter for messages a joined ConversationMember row has not read yet."""
    return and_(
        Message.type == "text",
        Message.sender_id != ConversationMember.user_id,
        or_(ConversationMember.last_read_message_id.is_(None),
            Message.id > ConversationMember.last_read_message_id),
    )


def unread_count(db: Db, member: ConversationMember) -> int:
    return db.scalar(
        select(func.count(Message.id))
        .join(ConversationMember, and_(
            ConversationMember.conversation_id == Message.conversation_id,
            ConversationMember.id == member.id))
        .where(_is_unread()))


def last_message(db: Db, conversation_id: int) -> Message | None:
    return db.scalar(select(Message).where(Message.conversation_id == conversation_id)
                     .order_by(Message.id.desc()).limit(1))


def list_for_user(db: Db, me: User) -> list[tuple[Conversation, Message | None, int]]:
    """(conversation, newest message, unread count) for the chat list, newest
    activity first. Three queries in total, however many conversations."""
    memberships = db.scalars(
        select(ConversationMember)
        .join(ConversationMember.conversation)
        .options(contains_eager(ConversationMember.conversation))
        .where(ConversationMember.user_id == me.id)
        .order_by(Conversation.last_message_at.desc(), Conversation.id.desc())
    ).unique().all()
    conv_ids = [m.conversation_id for m in memberships]
    if not conv_ids:
        return []

    newest_ids = (select(func.max(Message.id))
                  .where(Message.conversation_id.in_(conv_ids))
                  .group_by(Message.conversation_id))
    newest = {msg.conversation_id: msg
              for msg in db.scalars(select(Message).where(Message.id.in_(newest_ids)))}

    unread = dict(db.execute(
        select(Message.conversation_id, func.count(Message.id))
        .join(ConversationMember, and_(
            ConversationMember.conversation_id == Message.conversation_id,
            ConversationMember.user_id == me.id))
        .where(_is_unread())
        .group_by(Message.conversation_id)).all())

    rows = []
    for membership in memberships:
        conv = membership.conversation
        latest = newest.get(conv.id)
        # Like Signal: a chat you were pulled into stays hidden until someone speaks.
        if latest is None and conv.created_by != me.id:
            continue
        rows.append((conv, latest, unread.get(conv.id, 0)))
    return rows
