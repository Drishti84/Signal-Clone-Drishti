from sqlalchemy.orm import Session as Db

from app.constants import DISAPPEARING_CHOICES
from app.models import Conversation, User
from app.realtime.events import Event
from app.services.conversations import get_member
from app.services.members import announce


def set_timer(db: Db, me: User, conversation_id: int, seconds: int | None,
              online: set[int]) -> tuple[Conversation, list[Event]]:
    """Turn disappearing messages on, change the timer, or turn it off.
    Any member may do this, in direct chats and in groups. Only messages
    sent from now on are affected."""
    conv = get_member(db, conversation_id, me.id).conversation
    if conv.disappearing_seconds == seconds:
        return conv, []
    conv.disappearing_seconds = seconds
    body = (f"{me.display_name} set disappearing messages to {DISAPPEARING_CHOICES[seconds]}"
            if seconds else f"{me.display_name} turned off disappearing messages")
    return conv, announce(db, conv, [body], online)
