from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

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


class AttachmentOut(BaseModel):
    id: int
    filename: str
    content_type: str
    size: int
    is_image: bool
    width: int | None
    height: int | None


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
    attachment: AttachmentOut | None


class MessagePageOut(BaseModel):
    messages: list[MessageOut]
    has_more: bool


class MessageIn(BaseModel):
    body: str = ""
    client_id: str = Field(min_length=36, max_length=36)
    reply_to_id: int | None = None
    # An upload made just before, sent along with (or instead of) the text.
    attachment_id: int | None = None

    @field_validator("body")
    @classmethod
    def _body(cls, value: str) -> str:
        value = value.strip()
        if len(value) > MESSAGE_MAX_LENGTH:
            raise ValueError(f"Message must be at most {MESSAGE_MAX_LENGTH} characters")
        return value

    @model_validator(mode="after")
    def _not_empty(self):
        if not self.body and self.attachment_id is None:
            raise ValueError("Write a message or attach a file")
        return self


class ReadIn(BaseModel):
    message_id: int


class ReactionIn(BaseModel):
    emoji: str = Field(min_length=1, max_length=16)
