from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, Form, Query, Response, UploadFile
from sqlalchemy.orm import Session as Db

from app.constants import ATTACHMENT_MAX_BYTES, MESSAGE_PAGE_SIZE
from app.database import get_db
from app.deps import get_profiled_user
from app.models import User
from app.realtime.manager import manager
from app.schemas.message import (AttachmentOut, MessageIn, MessageOut, MessagePageOut,
                                 ReactionIn, ReadIn)
from app.services import attachments, messages, reactions, receipts
from app.services.serializers import attachment_out, message_out

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
        manager.online_ids(), body.attachment_id)
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


@router.delete("/messages/{message_id}", response_model=MessageOut)
def delete_message(message_id: int, background: BackgroundTasks,
                   me: User = Depends(get_profiled_user), db: Db = Depends(get_db)):
    """Delete for everyone. Only the sender may do this."""
    msg, events = messages.delete_message(db, me, message_id)
    db.commit()
    background.add_task(manager.dispatch, events)
    return message_out(msg)


@router.post("/conversations/{conversation_id}/attachments", response_model=AttachmentOut,
             status_code=201)
def upload_attachment(conversation_id: int, file: UploadFile,
                      width: int | None = Form(default=None),
                      height: int | None = Form(default=None),
                      me: User = Depends(get_profiled_user), db: Db = Depends(get_db)):
    """Step one of sending a file: store it. Step two is sending a message
    with the returned id. `width` and `height` are the picture's size, if
    the browser knows it."""
    data = file.file.read(ATTACHMENT_MAX_BYTES + 1)  # one byte over = too big
    attachment = attachments.upload(db, me, conversation_id, file.filename,
                                    file.content_type, data, width, height)
    db.commit()
    return attachment_out(attachment)


@router.get("/attachments/{attachment_id}")
def download_attachment(attachment_id: int, me: User = Depends(get_profiled_user),
                        db: Db = Depends(get_db)):
    """The file's bytes, for members of its chat only. The browser fetches
    this with the auth header and shows or saves the result itself.

    Only real images are served as images. Everything else is sent as a plain
    download, so an uploaded HTML or SVG file can never run in our pages."""
    attachment = attachments.get_for_download(db, me, attachment_id)
    name = quote(attachment.filename)
    headers = {
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": (f"inline; filename*=UTF-8''{name}" if attachment.is_image
                                else f"attachment; filename*=UTF-8''{name}"),
    }
    media_type = attachment.content_type if attachment.is_image else "application/octet-stream"
    return Response(content=attachment.data, media_type=media_type, headers=headers)
