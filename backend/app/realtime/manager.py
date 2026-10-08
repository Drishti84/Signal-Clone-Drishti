import logging
from collections import defaultdict

from fastapi import WebSocket

from app.realtime.events import Event, to_jsonable

log = logging.getLogger(__name__)


class ConnectionManager:
    """Open sockets per user. In memory, so correct for a single process only.
    A user with several tabs has several sockets and counts as online once."""

    def __init__(self) -> None:
        self._sockets: dict[int, set[WebSocket]] = defaultdict(set)

    def reset(self) -> None:
        self._sockets.clear()

    def connect(self, user_id: int, ws: WebSocket) -> bool:
        """Register a socket. True when the user just came online."""
        came_online = not self._sockets[user_id]
        self._sockets[user_id].add(ws)
        return came_online

    def disconnect(self, user_id: int, ws: WebSocket) -> bool:
        """Forget a socket. True when it was the user's last one."""
        self._sockets[user_id].discard(ws)
        if self._sockets[user_id]:
            return False
        del self._sockets[user_id]
        return True

    def is_online(self, user_id: int) -> bool:
        return bool(self._sockets.get(user_id))

    def online_ids(self) -> set[int]:
        return {user_id for user_id, sockets in self._sockets.items() if sockets}

    async def dispatch(self, events: list[Event]) -> None:
        for event in events:
            frame = {"type": event.type, "data": to_jsonable(event.data)}
            for user_id in set(event.user_ids):
                for ws in list(self._sockets.get(user_id, ())):
                    try:
                        await ws.send_json(frame)
                    except Exception:  # a dead socket must not block the others
                        log.debug("dropping failed send to user %s", user_id)


manager = ConnectionManager()
