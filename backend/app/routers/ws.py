import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database import SessionLocal
from app.errors import ServiceError
from app.models import User, utcnow
from app.realtime.events import Event
from app.realtime.manager import manager
from app.services import auth, conversations, presence, receipts

router = APIRouter()

UNAUTHENTICATED = 4401  # custom close code: the client must log in again, not retry


def _presence_event(db, user: User, is_online: bool) -> Event:
    return Event(presence.audience(db, user.id), "presence",
                 {"user_id": user.id, "is_online": is_online,
                  "last_seen_at": user.last_seen_at})


@router.websocket("/ws")
async def socket(ws: WebSocket, token: str = ""):
    await ws.accept()
    with SessionLocal() as db:
        user = auth.user_for_token(db, token)
        if user is None:
            await ws.close(code=UNAUTHENTICATED)
            return
        user_id = user.id
        events: list[Event] = []
        if manager.connect(user_id, ws):
            # First tab: whatever was waiting for this user is now delivered.
            events = receipts.mark_delivered_for_user(db, user_id)
            events.append(_presence_event(db, user, True))
            db.commit()
    await manager.dispatch(events)
    try:
        while True:
            await _handle(user_id, ws, await ws.receive_text())
    except WebSocketDisconnect:
        pass
    finally:
        if manager.disconnect(user_id, ws):
            with SessionLocal() as db:
                user = db.get(User, user_id)
                user.last_seen_at = utcnow()
                event = _presence_event(db, user, False)
                db.commit()
            await manager.dispatch([event])


async def _handle(user_id: int, ws: WebSocket, raw: str) -> None:
    """Client frames: ping, typing.start, typing.stop. Anything else,
    including text that is not JSON, is ignored without closing the socket."""
    try:
        frame = json.loads(raw)
    except ValueError:
        return
    if not isinstance(frame, dict):
        return
    kind = frame.get("type")
    if kind == "ping":
        await ws.send_json({"type": "pong", "data": {}})
        return
    if kind not in ("typing.start", "typing.stop"):
        return
    data = frame.get("data")
    conversation_id = data.get("conversation_id") if isinstance(data, dict) else None
    if not isinstance(conversation_id, int):
        return
    with SessionLocal() as db:
        try:
            member = conversations.get_member(db, conversation_id, user_id)
        except ServiceError:
            return  # not their conversation: say nothing
        others = [uid for uid in conversations.member_ids(member.conversation)
                  if uid != user_id]
    # Typing is relayed, never stored.
    await manager.dispatch([Event(others, "typing", {
        "conversation_id": conversation_id, "user_id": user_id,
        "is_typing": kind == "typing.start"})])
