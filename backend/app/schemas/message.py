from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.constants import MESSAGE_MAX_LENGTH
from app.schemas.common import UtcDateTime


class ReplyPreviewOut(BaseModel):
    id: int
    sender_id: int | None
    body: str
    deleted: bool


class ReactionGroupOut(BaseModel):
    emoji: str
    user_ids: list[int]


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_id: int | None
    type: Literal["text", "system"]
    body: str
    client_id: str | None
    created_at: UtcDateTime
    status: Literal["sent", "delivered", "read"] | None
    deleted: bool
    expires_at: UtcDateTime | None
    reply_to: ReplyPreviewOut | None
    reactions: list[ReactionGroupOut]


class MessagePageOut(BaseModel):
    messages: list[MessageOut]
    has_more: bool


class MessageIn(BaseModel):
    body: str
    client_id: str = Field(min_length=36, max_length=36)
    reply_to_id: int | None = None

    @field_validator("body")
    @classmethod
    def _body(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= MESSAGE_MAX_LENGTH:
            raise ValueError(f"Message must be 1 to {MESSAGE_MAX_LENGTH} characters")
        return value


class ReadIn(BaseModel):
    message_id: int


class ReactionIn(BaseModel):
    emoji: str = Field(min_length=1, max_length=16)
