from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session as Db

from app.database import get_db
from app.deps import get_current_user
from app.models import Conversation, User
from app.realtime.events import Event
from app.realtime.manager import manager
from app.schemas.conversation import ConversationOut, DirectIn, GroupIn
from app.services import conversations
from app.services.serializers import conversation_out

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


def _out_for(db: Db, conv: Conversation, me: User) -> dict:
    """One conversation as `me` sees it: with their own unread count."""
    member = conversations.get_member(db, conv.id, me.id)
    return conversation_out(conv, conversations.last_message(db, conv.id),
                            conversations.unread_count(db, member), manager.online_ids())


@router.get("", response_model=list[ConversationOut])
def list_conversations(me: User = Depends(get_current_user), db: Db = Depends(get_db)):
    online = manager.online_ids()
    return [conversation_out(conv, latest, unread, online)
            for conv, latest, unread in conversations.list_for_user(db, me)]


@router.post("/direct", response_model=ConversationOut)
def open_direct(body: DirectIn, me: User = Depends(get_current_user),
                db: Db = Depends(get_db)):
    conv, _created = conversations.open_direct(db, me, body.user_id)
    db.commit()
    return _out_for(db, conv, me)


@router.post("/group", response_model=ConversationOut, status_code=201)
def create_group(body: GroupIn, background: BackgroundTasks,
                 me: User = Depends(get_current_user), db: Db = Depends(get_db)):
    conv = conversations.create_group(db, me, body.name, body.member_ids)
    db.commit()
    out = _out_for(db, conv, me)  # nobody has unread messages in a brand-new group
    background.add_task(manager.dispatch, [
        Event(conversations.member_ids(conv), "conversation.new", {"conversation": out})])
    return out


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(conversation_id: int, me: User = Depends(get_current_user),
                     db: Db = Depends(get_db)):
    member = conversations.get_member(db, conversation_id, me.id)
    return _out_for(db, member.conversation, me)
