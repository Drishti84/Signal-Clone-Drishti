from typing import Literal

from pydantic import BaseModel, field_validator

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


class AddMembersIn(BaseModel):
    user_ids: list[int]


class RoleIn(BaseModel):
    role: Literal["admin", "member"]
