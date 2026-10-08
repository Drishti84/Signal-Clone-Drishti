import re

from app.config import settings
from app.errors import BadRequest


def normalize_phone(raw: str) -> str:
    """Return E.164. Accepts spaces, dashes and brackets; a bare 10-digit
    number gets the default country code."""
    cleaned = re.sub(r"[\s\-()]", "", raw or "")
    if not re.fullmatch(r"\+?\d+", cleaned):
        raise BadRequest("Enter a valid phone number")
    if not cleaned.startswith("+"):
        if len(cleaned) != 10:
            raise BadRequest("Enter a valid phone number")
        cleaned = settings.default_country_code + cleaned
    if not 8 <= len(cleaned) - 1 <= 15:
        raise BadRequest("Enter a valid phone number")
    return cleaned
