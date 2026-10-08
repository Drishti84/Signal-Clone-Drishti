from app.models import Conversation, Message, MessageReceipt, Reaction, User, utcnow
from app.seed import seed_if_empty
from tests.conftest import login


def test_seed_fills_an_empty_database_once(db):
    assert seed_if_empty(db) is True
    db.commit()
    assert db.query(User).filter(User.is_demo).count() == 8
    assert db.query(Conversation).filter_by(type="direct").count() >= 6
    assert db.query(Conversation).filter_by(type="group").count() == 3
    assert db.query(Message).count() >= 150
    assert db.query(Message).filter(Message.reply_to_id.isnot(None)).count() >= 10
    assert db.query(Reaction).count() >= 15
    assert seed_if_empty(db) is False
    assert db.query(User).count() == 8


def test_seed_does_not_touch_a_database_that_has_users(db):
    db.add(User(phone="+911234567890", display_name="Real"))
    db.commit()
    assert seed_if_empty(db) is False
    assert db.query(User).count() == 1


def test_seeded_timestamps_are_in_the_past_and_ordered(db):
    seed_if_empty(db)
    db.commit()
    now = utcnow()
    for conv in db.query(Conversation):
        stamps = [m.created_at for m in db.query(Message)
                  .filter_by(conversation_id=conv.id).order_by(Message.id)]
        assert stamps == sorted(stamps)
        assert stamps[-1] <= now
        assert conv.last_message_at == stamps[-1]


def test_seeded_app_is_usable_through_the_api(client, db):
    seed_if_empty(db)
    db.commit()
    headers, me = login(client, "+919000000001")
    assert me["display_name"]
    conversations = client.get("/api/conversations", headers=headers).json()
    assert len(conversations) >= 5
    stamps = [c["last_message_at"] for c in conversations]
    assert stamps == sorted(stamps, reverse=True)
    assert sum(1 for c in conversations if c["unread_count"] > 0) >= 3
    assert all(c["last_message"] for c in conversations)
    first = client.get(f"/api/conversations/{conversations[0]['id']}/messages",
                       headers=headers).json()
    assert first["messages"]
    assert len(client.get("/api/contacts", headers=headers).json()) == 7
    read_flags = {flag for (flag,) in db.query(MessageReceipt.read_at.isnot(None)).distinct()}
    assert read_flags == {True, False}  # a mix of read and unread
    own = db.query(Message).filter_by(sender_id=me["id"]).all()
    from app.services.serializers import aggregate_status
    assert {aggregate_status(m.receipts) for m in own} >= {"read", "delivered", "sent"}
