from fastapi import APIRouter, BackgroundTasks, Depends, Query, Response
from sqlalchemy.orm import Session as Db

from app.constants import MESSAGE_PAGE_SIZE
from app.database import get_db
from app.deps import get_profiled_user
from app.models import User
from app.realtime.manager import manager
from app.schemas.message import MessageIn, MessageOut, MessagePageOut, ReactionIn, ReadIn
from app.services import messages, reactions, receipts
from app.services.serializers import message_out

router = APIRouter(prefix="/api", tags=["messages"])


@router.get("/conversations/{conversation_id}/messages", response_model=MessagePageOut)
def list_messages(conversation_id: int, before: int | None = None,
                  limit: int = Query(MESSAGE_PAGE_SIZE, ge=1, le=MESSAGE_PAGE_SIZE),
                  me: User = Depends(get_profiled_user), db: Db = Depends(get_db)):
    rows, has_more = messages.list_messages(db, me, conversation_id, before, limit)
    return {"messages": [message_out(row) for row in rows], "has_more": has_more}


@router.post("/conversations/{conversation_id}/messages", response_model=MessageOut,
             status_code=201)
def send_message(conversation_id: int, body: MessageIn, response: Response,
                 background: BackgroundTasks, me: User = Depends(get_profiled_user),
                 db: Db = Depends(get_db)):
    msg, events, created = messages.send_message(
        db, me, conversation_id, body.body, body.client_id, body.reply_to_id,
        manager.online_ids())
    db.commit()
    # Sockets are notified after the response, once the data is committed.
    background.add_task(manager.dispatch, events)
    if not created:
        response.status_code = 200
    return message_out(msg)


@router.post("/conversations/{conversation_id}/read", status_code=204)
def mark_read(conversation_id: int, body: ReadIn, background: BackgroundTasks,
              me: User = Depends(get_profiled_user), db: Db = Depends(get_db)):
    events = receipts.mark_read(db, me, conversation_id, body.message_id)
    db.commit()
    background.add_task(manager.dispatch, events)
    return Response(status_code=204, background=background)


@router.put("/messages/{message_id}/reaction", response_model=MessageOut)
def set_reaction(message_id: int, body: ReactionIn, background: BackgroundTasks,
                 me: User = Depends(get_profiled_user), db: Db = Depends(get_db)):
    msg, events = reactions.set_reaction(db, me, message_id, body.emoji)
    db.commit()
    background.add_task(manager.dispatch, events)
    return message_out(msg)


@router.delete("/messages/{message_id}/reaction", response_model=MessageOut)
def remove_reaction(message_id: int, background: BackgroundTasks,
                    me: User = Depends(get_profiled_user), db: Db = Depends(get_db)):
    msg, events = reactions.remove_reaction(db, me, message_id)
    db.commit()
    background.add_task(manager.dispatch, events)
    return message_out(msg)
