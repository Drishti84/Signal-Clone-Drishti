import re

from sqlalchemy.orm import Session as Db

from app.constants import ATTACHMENT_MAX_BYTES, FILENAME_MAX_LENGTH
from app.errors import BadRequest, Forbidden, NotFound
from app.models import Attachment, User
from app.services.conversations import get_member
from app.services.users import sniff_image_type


def image_type(data: bytes) -> str | None:
    """The image type the bytes really are, or None. Decided from the
    content, never from the name or the type the browser claimed."""
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return sniff_image_type(data)


def safe_filename(raw: str | None) -> str:
    """A name fit to show and to offer as a download: no folders, no control
    characters, limited length, and the extension kept when shortening."""
    name = re.split(r"[\\/]", raw or "")[-1]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip().strip(".")
    if not name:
        return "file"
    if len(name) > FILENAME_MAX_LENGTH:
        stem, dot, extension = name.rpartition(".")
        if dot and 0 < len(extension) <= 10:
            name = stem[:FILENAME_MAX_LENGTH - len(extension) - 1] + "." + extension
        else:
            name = name[:FILENAME_MAX_LENGTH]
    return name


def upload(db: Db, me: User, conversation_id: int, filename: str | None,
           declared_type: str | None, data: bytes, width: int | None,
           height: int | None) -> Attachment:
    """Store a file for a chat. It is not visible to anyone else until the
    uploader sends a message with it."""
    get_member(db, conversation_id, me.id)
    if not data:
        raise BadRequest("That file is empty")
    if len(data) > ATTACHMENT_MAX_BYTES:
        raise BadRequest("Files can be at most 5 MB")
    sniffed = image_type(data)
    attachment = Attachment(
        conversation_id=conversation_id, uploader_id=me.id, filename=safe_filename(filename),
        content_type=sniffed or (declared_type or "application/octet-stream")[:100],
        size=len(data), is_image=sniffed is not None, data=data,
        # Only images have a size on screen; it lets the bubble reserve the
        # right space before the picture has loaded.
        width=width if sniffed and width and 0 < width <= 20000 else None,
        height=height if sniffed and height and 0 < height <= 20000 else None,
    )
    db.add(attachment)
    db.flush()
    return attachment


def claim(db: Db, me: User, conversation_id: int, attachment_id: int) -> Attachment:
    """The uploaded file to send with a new message, checked: it must be the
    sender's own, for this chat, and not already sent."""
    attachment = db.get(Attachment, attachment_id)
    if (attachment is None or attachment.uploader_id != me.id
            or attachment.conversation_id != conversation_id
            or attachment.message_id is not None):
        raise BadRequest("That attachment can't be sent here")
    return attachment


def get_for_download(db: Db, me: User, attachment_id: int) -> Attachment:
    attachment = db.get(Attachment, attachment_id)
    if attachment is None:
        raise NotFound("File not found")
    if attachment.message_id is None:
        if attachment.uploader_id != me.id:
            raise Forbidden("You can't open this file")
    else:
        get_member(db, attachment.conversation_id, me.id)  # raises for outsiders
    return attachment
