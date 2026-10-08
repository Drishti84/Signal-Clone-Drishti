from datetime import datetime

from sqlalchemy import ForeignKey, Index, LargeBinary, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, utcnow


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        # Lets a client retry a send safely: same sender + client_id = same message.
        UniqueConstraint("sender_id", "client_id"),
        Index("ix_messages_conversation_id_id", "conversation_id", "id"),
        # Never hand out an id twice. Without this SQLite reuses the id of a
        # purged newest message, and read markers and clients rely on ids
        # only ever growing.
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"))
    sender_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))  # null: system
    type: Mapped[str] = mapped_column(String(8), default="text")  # "text" | "system"
    body: Mapped[str] = mapped_column(Text)
    reply_to_id: Mapped[int | None] = mapped_column(
        ForeignKey("messages.id", ondelete="SET NULL"))
    client_id: Mapped[str | None] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    # "Delete for everyone": the row stays as a tombstone, the text is wiped.
    deleted_at: Mapped[datetime | None] = mapped_column()
    # Disappearing messages: the row is removed entirely after this time.
    expires_at: Mapped[datetime | None] = mapped_column(index=True)

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")  # noqa: F821
    reply_to: Mapped["Message | None"] = relationship(remote_side=[id], lazy="joined")
    receipts: Mapped[list["MessageReceipt"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", passive_deletes=True)
    reactions: Mapped[list["Reaction"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="Reaction.id",
        passive_deletes=True)
    attachment: Mapped["Attachment | None"] = relationship(
        cascade="all, delete-orphan", lazy="selectin", passive_deletes=True)


class MessageReceipt(Base):
    """One row per recipient of a message; drives the sent/delivered/read checks."""

    __tablename__ = "message_receipts"
    __table_args__ = (UniqueConstraint("message_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[int] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    delivered_at: Mapped[datetime | None] = mapped_column()
    read_at: Mapped[datetime | None] = mapped_column()


class Reaction(Base):
    __tablename__ = "reactions"
    __table_args__ = (UniqueConstraint("message_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[int] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    emoji: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class Attachment(Base):
    """One image or file sent with a message.

    It is uploaded first, on its own, and has no message yet; sending the
    message then claims it. The bytes live here and not on the message so
    that loading messages never reads file data."""

    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    uploader_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # Null until the message is sent; unique, so a file belongs to one message.
    message_id: Mapped[int | None] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"), unique=True)
    filename: Mapped[str] = mapped_column(String(120))
    content_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column()
    is_image: Mapped[bool] = mapped_column(default=False)
    width: Mapped[int | None] = mapped_column()
    height: Mapped[int | None] = mapped_column()
    data: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
