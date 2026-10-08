"""Turn database rows into the plain dicts the API and the socket both send."""

from app.models import Conversation, Message, User

REPLY_PREVIEW_LENGTH = 200


def user_out(user: User, online: set[int]) -> dict:
    image_url = (f"/api/users/{user.id}/avatar?v={user.avatar_version}"
                 if user.avatar is not None else None)
    return {
        "id": user.id,
        "phone": user.phone,
        "display_name": user.display_name,
        "about": user.about,
        "avatar": {"color": user.avatar_color, "preset": user.avatar_preset,
                   "image_url": image_url},
        "is_online": user.id in online,
        "last_seen_at": user.last_seen_at,
    }


def aggregate_status(receipts) -> str:
    """Sender-facing status: every recipient must have it for it to count."""
    if receipts and all(r.read_at for r in receipts):
        return "read"
    if receipts and all(r.delivered_at for r in receipts):
        return "delivered"
    return "sent"


def message_out(msg: Message) -> dict:
    grouped: dict[str, list[int]] = {}
    for reaction in msg.reactions:
        grouped.setdefault(reaction.emoji, []).append(reaction.user_id)
    reply = msg.reply_to
    return {
        "id": msg.id,
        "conversation_id": msg.conversation_id,
        "sender_id": msg.sender_id,
        "type": msg.type,
        "body": msg.body,
        "client_id": msg.client_id,
        "created_at": msg.created_at,
        "status": aggregate_status(msg.receipts) if msg.type == "text" else None,
        "reply_to": ({"id": reply.id, "sender_id": reply.sender_id,
                      "body": reply.body[:REPLY_PREVIEW_LENGTH]} if reply else None),
        "reactions": [{"emoji": emoji, "user_ids": ids} for emoji, ids in grouped.items()],
    }


def conversation_out(conv: Conversation, last_message: Message | None, unread: int,
                     online: set[int]) -> dict:
    return {
        "id": conv.id,
        "type": conv.type,
        "name": conv.name,
        "avatar_color": conv.avatar_color,
        "created_by": conv.created_by,
        "last_message_at": conv.last_message_at,
        "last_message": message_out(last_message) if last_message else None,
        "unread_count": unread,
        "members": [{"user": user_out(m.user, online), "role": m.role,
                     "joined_at": m.joined_at} for m in conv.members],
    }
