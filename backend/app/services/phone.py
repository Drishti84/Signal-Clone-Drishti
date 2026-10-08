import re

from app.config import settings
from app.constants import PHONE_LENGTHS
from app.errors import BadRequest


def normalize_phone(raw: str) -> str:
    """Return E.164. Accepts spaces, dashes and brackets; a bare 10-digit
    number gets the default country code."""
    cleaned = re.sub(r"[\s\-()]", "", raw or "")
    # [0-9] and not \d: \d also matches digits from other scripts, which would
    # let one phone number be registered under several spellings.
    if not re.fullmatch(r"\+?[0-9]+", cleaned):
        raise BadRequest("Enter a valid phone number")
    if not cleaned.startswith("+"):
        if len(cleaned) != 10:
            raise BadRequest("Enter a valid phone number")
        cleaned = settings.default_country_code + cleaned
    if not 8 <= len(cleaned) - 1 <= 15:
        raise BadRequest("Enter a valid phone number")
    # Where we know how long a country's numbers are, hold them to it, so a
    # mistyped extra digit is caught here and not turned into a new account.
    for code, length in PHONE_LENGTHS.items():
        if cleaned.startswith(code):
            if len(cleaned) - len(code) != length:
                raise BadRequest(f"Enter a valid {length}-digit phone number")
            break
    return cleaned
