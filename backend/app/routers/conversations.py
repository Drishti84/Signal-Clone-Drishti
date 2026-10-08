from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session as Db

from app.database import get_db
from app.deps import get_profiled_user
from app.models import Conversation, User
from app.realtime.events import Event
from app.realtime.manager import manager
from app.schemas.conversation import (AddMembersIn, ConversationOut, DirectIn,
                                      DisappearingIn, GroupIn, GroupNameIn, RoleIn)
from app.services import conversations, disappearing, members
from app.services.serializers import conversation_out

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


def _out_for(db: Db, conv: Conversation, me: User) -> dict:
    """One conversation as `me` sees it: with their own unread count."""
    member = conversations.get_member(db, conv.id, me.id)
    return conversation_out(conv, conversations.last_message(db, conv.id),
                            conversations.unread_count(db, member), manager.online_ids())


@router.get("", response_model=list[ConversationOut])
def list_conversations(me: User = Depends(get_profiled_user), db: Db = Depends(get_db)):
    online = manager.online_ids()
    return [conversation_out(conv, latest, unread, online)
            for conv, latest, unread in conversations.list_for_user(db, me)]


@router.post("/direct", response_model=ConversationOut)
def open_direct(body: DirectIn, me: User = Depends(get_profiled_user),
                db: Db = Depends(get_db)):
    conv, _created = conversations.open_direct(db, me, body.user_id)
    db.commit()
    return _out_for(db, conv, me)


@router.post("/group", response_model=ConversationOut, status_code=201)
def create_group(body: GroupIn, background: BackgroundTasks,
                 me: User = Depends(get_profiled_user), db: Db = Depends(get_db)):
    conv = conversations.create_group(db, me, body.name, body.member_ids)
    db.commit()
    out = _out_for(db, conv, me)  # nobody has unread messages in a brand-new group
    background.add_task(manager.dispatch, [
        Event(conversations.member_ids(conv), "conversation.new", {"conversation": out})])
    return out


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(conversation_id: int, me: User = Depends(get_profiled_user),
                     db: Db = Depends(get_db)):
    member = conversations.get_member(db, conversation_id, me.id)
    return _out_for(db, member.conversation, me)


# --- Group administration -------------------------------------------------
# The rules (who may do what) live in services/members.py; these routes only
# commit, broadcast and shape the reply.

def _finish(db: Db, result: members.Result, me: User,
            background: BackgroundTasks) -> dict | None:
    conv, events = result
    db.commit()
    background.add_task(manager.dispatch, events)
    still_member = conv is not None and me.id in conversations.member_ids(conv)
    return _out_for(db, conv, me) if still_member else None


@router.patch("/{conversation_id}", response_model=ConversationOut)
def rename_group(conversation_id: int, body: GroupNameIn, background: BackgroundTasks,
                 me: User = Depends(get_profiled_user), db: Db = Depends(get_db)):
    result = members.rename(db, me, conversation_id, body.name, manager.online_ids())
    return _finish(db, result, me, background)


@router.post("/{conversation_id}/members", response_model=ConversationOut)
def add_members(conversation_id: int, body: AddMembersIn, background: BackgroundTasks,
                me: User = Depends(get_profiled_user), db: Db = Depends(get_db)):
    result = members.add_members(db, me, conversation_id, body.user_ids, manager.online_ids())
    return _finish(db, result, me, background)


@router.delete("/{conversation_id}/members/{user_id}",
               response_model=ConversationOut | None)
def remove_member(conversation_id: int, user_id: int, background: BackgroundTasks,
                  me: User = Depends(get_profiled_user), db: Db = Depends(get_db)):
    """Remove someone, or leave by passing your own id. Replies with null
    when the caller is no longer in the group."""
    result = members.remove_member(db, me, conversation_id, user_id, manager.online_ids())
    return _finish(db, result, me, background)


@router.patch("/{conversation_id}/members/{user_id}", response_model=ConversationOut)
def set_role(conversation_id: int, user_id: int, body: RoleIn, background: BackgroundTasks,
             me: User = Depends(get_profiled_user), db: Db = Depends(get_db)):
    result = members.set_role(db, me, conversation_id, user_id, body.role,
                              manager.online_ids())
    return _finish(db, result, me, background)


@router.patch("/{conversation_id}/disappearing", response_model=ConversationOut)
def set_disappearing(conversation_id: int, body: DisappearingIn, background: BackgroundTasks,
                     me: User = Depends(get_profiled_user), db: Db = Depends(get_db)):
    """Set or clear the disappearing-message timer. Open to every member."""
    result = disappearing.set_timer(db, me, conversation_id, body.seconds, manager.online_ids())
    return _finish(db, result, me, background)
