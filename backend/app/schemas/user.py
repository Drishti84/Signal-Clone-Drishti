from pydantic import BaseModel, field_validator

from app.constants import ABOUT_MAX_LENGTH, AVATAR_COLORS, AVATAR_PRESETS, NAME_MAX_LENGTH
from app.schemas.common import UtcDateTime


class AvatarOut(BaseModel):
    color: str
    preset: str | None
    image_url: str | None


class UserOut(BaseModel):
    id: int
    phone: str
    display_name: str | None
    about: str | None
    avatar: AvatarOut
    is_online: bool
    last_seen_at: UtcDateTime | None


def clean_name(value: str) -> str:
    value = value.strip()
    if not 1 <= len(value) <= NAME_MAX_LENGTH:
        raise ValueError(f"Must be 1 to {NAME_MAX_LENGTH} characters")
    return value


class ProfileUpdate(BaseModel):
    """Every field is optional; only the ones present in the request are applied."""

    display_name: str | None = None
    about: str | None = None
    avatar_color: str | None = None
    avatar_preset: str | None = None

    @field_validator("display_name")
    @classmethod
    def _display_name(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("Display name cannot be empty")
        return clean_name(value)

    @field_validator("about")
    @classmethod
    def _about(cls, value: str | None) -> str | None:
        value = (value or "").strip()
        if len(value) > ABOUT_MAX_LENGTH:
            raise ValueError(f"Must be at most {ABOUT_MAX_LENGTH} characters")
        return value or None

    @field_validator("avatar_color")
    @classmethod
    def _avatar_color(cls, value: str | None) -> str:
        if value not in AVATAR_COLORS:
            raise ValueError("Unknown avatar colour")
        return value

    @field_validator("avatar_preset")
    @classmethod
    def _avatar_preset(cls, value: str | None) -> str | None:
        if value is not None and value not in AVATAR_PRESETS:
            raise ValueError("Unknown avatar preset")
        return value
