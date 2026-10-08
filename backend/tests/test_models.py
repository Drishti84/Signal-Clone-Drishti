import pytest
from sqlalchemy.exc import IntegrityError

from app.models import (Contact, Conversation, ConversationMember, Message,
                        MessageReceipt, Reaction, User)


def make_user(db, phone):
    user = User(phone=phone, display_name=phone)
    db.add(user)
    db.flush()
    return user


def make_group_with_message(db):
    a = make_user(db, "+911111111111")
    b = make_user(db, "+912222222222")
    conv = Conversation(type="group", name="G", created_by=a.id)
    db.add(conv)
    db.flush()
    msg = Message(conversation_id=conv.id, sender_id=a.id, type="text", body="hi")
    db.add(msg)
    db.flush()
    return a, b, conv, msg


def test_phone_is_unique(db):
    make_user(db, "+911111111111")
    with pytest.raises(IntegrityError):
        make_user(db, "+911111111111")


def test_direct_key_is_unique(db):
    a = make_user(db, "+911111111111")
    db.add(Conversation(type="direct", created_by=a.id, direct_key="1:2"))
    db.flush()
    db.add(Conversation(type="direct", created_by=a.id, direct_key="1:2"))
    with pytest.raises(IntegrityError):
        db.flush()


@pytest.mark.parametrize("make", [
    lambda a, b, conv, msg: ConversationMember(conversation_id=conv.id, user_id=a.id),
    lambda a, b, conv, msg: Contact(owner_id=a.id, contact_id=b.id),
    lambda a, b, conv, msg: MessageReceipt(message_id=msg.id, user_id=b.id),
    lambda a, b, conv, msg: Reaction(message_id=msg.id, user_id=b.id, emoji="👍"),
], ids=["membership", "contact", "receipt", "reaction"])
def test_one_row_per_pair(db, make):
    fixtures = make_group_with_message(db)
    db.add(make(*fixtures))
    db.flush()
    db.add(make(*fixtures))
    with pytest.raises(IntegrityError):
        db.flush()


def test_deleting_conversation_cascades(db):
    a, _, conv, _ = make_group_with_message(db)
    db.add(ConversationMember(conversation_id=conv.id, user_id=a.id, role="admin"))
    db.flush()
    db.delete(conv)
    db.flush()
    assert db.query(ConversationMember).count() == 0
    assert db.query(Message).count() == 0


def test_foreign_keys_are_enforced(db):
    db.add(Message(conversation_id=9999, type="text", body="orphan"))
    with pytest.raises(IntegrityError):
        db.flush()


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}
