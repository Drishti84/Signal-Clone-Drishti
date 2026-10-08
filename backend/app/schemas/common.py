from datetime import datetime
from typing import Annotated

from pydantic import PlainSerializer


def iso_utc(value: datetime) -> str:
    """Stored datetimes are naive UTC; say so explicitly on the wire."""
    return value.isoformat(timespec="milliseconds") + "Z"


UtcDateTime = Annotated[datetime, PlainSerializer(iso_utc, return_type=str)]
