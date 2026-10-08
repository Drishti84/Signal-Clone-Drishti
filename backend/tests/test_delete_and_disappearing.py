import uuid
from datetime import timedelta

from app.models import Message, utcnow
from app.services.expiry import purge_expired
from tests.conftest import login
from tests.test_realtime import connect, next_of_type


def pair(client):
    ha, asha = login(client, "9000000001", "Asha")
    hr, rohan = login(client, "9000000002", "Rohan")
    conv = client.post("/api/conversations/direct", headers=ha,
                       json={"user_id": rohan["id"]}).json()
    return ha, hr, asha, rohan, conv["id"]


def send(client, headers, conv_id, body="hi", **extra):
    return client.post(f"/api/conversations/{conv_id}/messages", headers=headers,
                       json={"body": body, "client_id": str(uuid.uuid4()), **extra}).json()


def history(client, headers, conv_id):
    return client.get(f"/api/conversations/{conv_id}/messages", headers=headers).json()["messages"]


# --- Delete for everyone ---------------------------------------------------

def test_sender_deletes_a_message_for_everyone(client):
    ha, hr, _, rohan, conv_id = pair(client)
    msg = send(client, ha, conv_id, "oops, wrong chat")
    client.put(f"/api/messages/{msg['id']}/reaction", headers=hr, json={"emoji": "👍"})
    r = client.delete(f"/api/messages/{msg['id']}", headers=ha)
    assert r.status_code == 200
    assert r.json()["deleted"] is True and r.json()["body"] == ""
    seen_by_rohan = history(client, hr, conv_id)[0]
    assert seen_by_rohan["deleted"] is True
    assert seen_by_rohan["body"] == ""  # the text is gone from the server, not just hidden
    assert seen_by_rohan["reactions"] == []
    assert seen_by_rohan["id"] == msg["id"]  # the bubble stays, as a tombstone


def test_deleted_text_is_removed_from_the_database(client, db):
    ha, _, _, _, conv_id = pair(client)
    msg = send(client, ha, conv_id, "secret")
    client.delete(f"/api/messages/{msg['id']}", headers=ha)
    row = db.get(Message, msg["id"])
    assert row.body == "" and row.deleted_at is not None


def test_only_the_sender_can_delete(client):
    ha, hr, _, _, conv_id = pair(client)
    hm, _ = login(client, "9000000003", "Meera")
    msg = send(client, ha, conv_id, "mine")
    assert client.delete(f"/api/messages/{msg['id']}", headers=hr).status_code == 403
    assert client.delete(f"/api/messages/{msg['id']}", headers=hm).status_code == 403
    assert client.delete("/api/messages/99999", headers=ha).status_code == 404
    assert history(client, ha, conv_id)[0]["body"] == "mine"


def test_deleting_twice_is_harmless_and_system_lines_cannot_be_deleted(client):
    ha, _, _, rohan, conv_id = pair(client)
    msg = send(client, ha, conv_id)
    assert client.delete(f"/api/messages/{msg['id']}", headers=ha).status_code == 200
    assert client.delete(f"/api/messages/{msg['id']}", headers=ha).status_code == 200
    group = client.post("/api/conversations/group", headers=ha,
                        json={"name": "G", "member_ids": [rohan["id"]]}).json()
    system_id = group["last_message"]["id"]
    assert client.delete(f"/api/messages/{system_id}", headers=ha).status_code == 403


def test_a_deleted_message_cannot_be_reacted_to_and_hides_in_reply_quotes(client):
    ha, hr, _, _, conv_id = pair(client)
    original = send(client, ha, conv_id, "original text")
    reply = send(client, hr, conv_id, "reply", reply_to_id=original["id"])
    client.delete(f"/api/messages/{original['id']}", headers=ha)
    again = [m for m in history(client, hr, conv_id) if m["id"] == reply["id"]][0]
    assert again["reply_to"] == {"id": original["id"], "sender_id": original["sender_id"],
                                 "body": "", "deleted": True}
    assert client.put(f"/api/messages/{original['id']}/reaction", headers=hr,
                      json={"emoji": "👍"}).status_code == 400


def test_deletion_is_pushed_to_the_other_person(client):
    ha, hr, _, _, conv_id = pair(client)
    msg = send(client, ha, conv_id, "gone soon")
    with connect(client, hr) as rohan_ws:
        client.delete(f"/api/messages/{msg['id']}", headers=ha)
        updated = next_of_type(rohan_ws, "message.updated")["message"]
        assert updated["id"] == msg["id"] and updated["deleted"] is True and updated["body"] == ""


# --- Disappearing messages -------------------------------------------------

def test_timer_can_be_set_and_cleared_by_a_member(client):
    ha, hr, _, _, conv_id = pair(client)
    hm, _ = login(client, "9000000003", "Meera")
    url = f"/api/conversations/{conv_id}/disappearing"
    assert client.get(f"/api/conversations/{conv_id}", headers=ha).json()["disappearing_seconds"] is None
    r = client.patch(url, headers=ha, json={"seconds": 300})
    assert r.status_code == 200 and r.json()["disappearing_seconds"] == 300
    assert history(client, hr, conv_id)[-1]["body"] == "Asha set disappearing messages to 5 minutes"
    assert history(client, hr, conv_id)[-1]["type"] == "system"
    r = client.patch(url, headers=hr, json={"seconds": None})
    assert r.json()["disappearing_seconds"] is None
    assert history(client, ha, conv_id)[-1]["body"] == "Rohan turned off disappearing messages"
    assert client.patch(url, headers=hm, json={"seconds": 300}).status_code == 403
    assert client.patch(url, headers=ha, json={"seconds": 7}).status_code == 422
    assert client.patch(url, headers=ha, json={"seconds": -30}).status_code == 422


def test_setting_the_same_timer_again_adds_no_system_line(client):
    ha, _, _, _, conv_id = pair(client)
    url = f"/api/conversations/{conv_id}/disappearing"
    client.patch(url, headers=ha, json={"seconds": 30})
    client.patch(url, headers=ha, json={"seconds": 30})
    assert len(history(client, ha, conv_id)) == 1


def test_messages_sent_while_the_timer_is_on_get_an_expiry(client):
    ha, _, _, _, conv_id = pair(client)
    before = send(client, ha, conv_id, "stays")
    client.patch(f"/api/conversations/{conv_id}/disappearing", headers=ha, json={"seconds": 30})
    during = send(client, ha, conv_id, "goes")
    client.patch(f"/api/conversations/{conv_id}/disappearing", headers=ha, json={"seconds": None})
    after = send(client, ha, conv_id, "stays too")
    assert before["expires_at"] is None and after["expires_at"] is None
    assert during["expires_at"].endswith("Z")


def test_expired_messages_are_purged_and_everyone_is_told(client, db):
    ha, hr, asha, rohan, conv_id = pair(client)
    keep = send(client, ha, conv_id, "keep")
    client.patch(f"/api/conversations/{conv_id}/disappearing", headers=ha, json={"seconds": 30})
    gone = send(client, ha, conv_id, "gone")

    assert purge_expired(db, utcnow() + timedelta(seconds=29)) == []
    db.commit()
    assert len(history(client, ha, conv_id)) == 3  # keep, the timer line, gone

    events = purge_expired(db, utcnow() + timedelta(seconds=31))
    db.commit()
    assert len(events) == 1
    assert events[0].type == "message.expired"
    assert sorted(events[0].user_ids) == sorted([asha["id"], rohan["id"]])
    assert events[0].data == {"conversation_id": conv_id, "message_ids": [gone["id"]]}
    bodies = [m["body"] for m in history(client, hr, conv_id)]
    assert bodies == ["keep", "Asha set disappearing messages to 30 seconds"]
    assert db.get(Message, gone["id"]) is None
    assert db.get(Message, keep["id"]) is not None


def test_an_expired_message_is_hidden_even_before_the_purge_runs(client, db):
    ha, hr, _, _, conv_id = pair(client)
    client.patch(f"/api/conversations/{conv_id}/disappearing", headers=ha, json={"seconds": 30})
    msg = send(client, ha, conv_id, "gone")
    db.query(Message).filter_by(id=msg["id"]).update(
        {"expires_at": utcnow() - timedelta(seconds=1)})
    db.commit()
    assert [m["body"] for m in history(client, hr, conv_id)] == [
        "Asha set disappearing messages to 30 seconds"]


def test_purge_keeps_unread_counts_and_the_chat_list_correct(client, db):
    ha, hr, _, _, conv_id = pair(client)
    first = send(client, ha, conv_id, "read me")
    client.post(f"/api/conversations/{conv_id}/read", headers=hr, json={"message_id": first["id"]})
    client.patch(f"/api/conversations/{conv_id}/disappearing", headers=ha, json={"seconds": 30})
    timer_line = history(client, hr, conv_id)[-1]
    vanishing = send(client, ha, conv_id, "vanishing")
    client.post(f"/api/conversations/{conv_id}/read", headers=hr,
                json={"message_id": vanishing["id"]})
    purge_expired(db, utcnow() + timedelta(seconds=31))
    db.commit()
    listed = client.get("/api/conversations", headers=hr).json()[0]
    # The read marker pointed at the purged message; nothing older may turn unread.
    assert listed["unread_count"] == 0
    assert listed["last_message"]["id"] == timer_line["id"]
    send(client, ha, conv_id, "new one")
    assert client.get("/api/conversations", headers=hr).json()[0]["unread_count"] == 1


def test_a_reply_to_a_purged_message_survives_without_its_quote(client, db):
    ha, hr, _, _, conv_id = pair(client)
    client.patch(f"/api/conversations/{conv_id}/disappearing", headers=ha, json={"seconds": 30})
    original = send(client, ha, conv_id, "original")
    client.patch(f"/api/conversations/{conv_id}/disappearing", headers=ha, json={"seconds": None})
    reply = send(client, hr, conv_id, "reply", reply_to_id=original["id"])
    purge_expired(db, utcnow() + timedelta(seconds=31))
    db.commit()
    kept = [m for m in history(client, ha, conv_id) if m["id"] == reply["id"]][0]
    assert kept["body"] == "reply" and kept["reply_to"] is None


def test_timer_change_is_pushed_live(client):
    ha, hr, _, _, conv_id = pair(client)
    with connect(client, hr) as rohan_ws:
        client.patch(f"/api/conversations/{conv_id}/disappearing", headers=ha,
                     json={"seconds": 3600})
        updated = next_of_type(rohan_ws, "conversation.updated")["conversation"]
        assert updated["disappearing_seconds"] == 3600


def test_group_timer_works_for_any_member(client):
    ha, _ = login(client, "9000000001", "Asha")
    hr, rohan = login(client, "9000000002", "Rohan")
    group = client.post("/api/conversations/group", headers=ha,
                        json={"name": "G", "member_ids": [rohan["id"]]}).json()
    r = client.patch(f"/api/conversations/{group['id']}/disappearing", headers=hr,
                     json={"seconds": 86400})
    assert r.status_code == 200 and r.json()["disappearing_seconds"] == 86400
    assert r.json()["last_message"]["body"] == "Rohan set disappearing messages to 1 day"
