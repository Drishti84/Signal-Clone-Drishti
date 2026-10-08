from typing import Literal

from pydantic import BaseModel, field_validator

from app.constants import DISAPPEARING_CHOICES
from app.schemas.common import UtcDateTime
from app.schemas.message import MessageOut
from app.schemas.user import UserOut, clean_name


class MemberOut(BaseModel):
    user: UserOut
    role: Literal["admin", "member"]
    joined_at: UtcDateTime


class ConversationOut(BaseModel):
    id: int
    type: Literal["direct", "group"]
    name: str | None
    avatar_color: str | None
    created_by: int
    last_message_at: UtcDateTime
    disappearing_seconds: int | None
    last_message: MessageOut | None
    unread_count: int
    members: list[MemberOut]


class DirectIn(BaseModel):
    user_id: int


class GroupNameIn(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return clean_name(value)


class GroupIn(GroupNameIn):
    member_ids: list[int]


class DisappearingIn(BaseModel):
    """`seconds` is one of the offered timers, or null to turn the timer off."""

    seconds: int | None

    @field_validator("seconds")
    @classmethod
    def _seconds(cls, value: int | None) -> int | None:
        if value is not None and value not in DISAPPEARING_CHOICES:
            raise ValueError("Choose one of the offered timers")
        return value


class AddMembersIn(BaseModel):
    user_ids: list[int]


class RoleIn(BaseModel):
    role: Literal["admin", "member"]
