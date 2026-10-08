from dataclasses import dataclass, field
from datetime import datetime

from fastapi.encoders import jsonable_encoder

from app.schemas.common import iso_utc


@dataclass
class Event:
    """One socket frame addressed to a set of users. Services return these;
    routers hand them to the connection manager after committing."""

    user_ids: list[int]
    type: str
    data: dict = field(default_factory=dict)


def to_jsonable(data: dict) -> dict:
    """Same datetime format on the socket as in REST responses."""
    return jsonable_encoder(data, custom_encoder={datetime: iso_utc})
