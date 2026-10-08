class ConnectionManager:
    """Open sockets per user. In memory, so correct for a single process only."""

    def reset(self) -> None:
        pass

    def online_ids(self) -> set[int]:
        return set()

    async def dispatch(self, events: list) -> None:
        pass


manager = ConnectionManager()
