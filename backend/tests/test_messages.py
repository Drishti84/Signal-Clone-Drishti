import uuid

from tests.conftest import login


def setup_direct(client):
    ha, asha = login(client, "9000000001", "Asha")
    hr, rohan = login(client, "9000000002", "Rohan")
    conv = client.post("/api/conversations/direct", headers=ha,
                       json={"user_id": rohan["id"]}).json()
    return ha, hr, asha, rohan, conv["id"]


def send(client, headers, conv_id, body="hi", **extra):
    payload = {"body": body, "client_id": str(uuid.uuid4()), **extra}
    return client.post(f"/api/conversations/{conv_id}/messages", headers=headers, json=payload)


def messages(client, headers, conv_id):
    return client.get(f"/api/conversations/{conv_id}/messages", headers=headers).json()["messages"]


def test_send_persists_and_orders_the_conversation_list(client):
    ha, hr, asha, rohan, conv_id = setup_direct(client)
    r = send(client, ha, conv_id, "  hello  ")
    assert r.status_code == 201
    msg = r.json()
    assert msg["body"] == "hello" and msg["status"] == "sent" and msg["sender_id"] == asha["id"]
    assert msg["created_at"].endswith("Z")
    listed = client.get("/api/conversations", headers=hr).json()
    assert listed[0]["last_message"]["id"] == msg["id"]
    assert listed[0]["unread_count"] == 1
    assert client.get("/api/conversations", headers=ha).json()[0]["unread_count"] == 0


def test_resend_with_same_client_id_does_not_duplicate(client):
    ha, _, _, _, conv_id = setup_direct(client)
    payload = {"body": "once", "client_id": str(uuid.uuid4())}
    first = client.post(f"/api/conversations/{conv_id}/messages", headers=ha, json=payload)
    second = client.post(f"/api/conversations/{conv_id}/messages", headers=ha, json=payload)
    assert second.status_code == 200 and second.json()["id"] == first.json()["id"]
    assert len(messages(client, ha, conv_id)) == 1


def test_two_senders_may_use_the_same_client_id(client):
    ha, hr, _, _, conv_id = setup_direct(client)
    payload = {"body": "same id", "client_id": str(uuid.uuid4())}
    a = client.post(f"/api/conversations/{conv_id}/messages", headers=ha, json=payload)
    b = client.post(f"/api/conversations/{conv_id}/messages", headers=hr, json=payload)
    assert a.status_code == 201 and b.status_code == 201 and a.json()["id"] != b.json()["id"]


def test_blank_and_oversized_bodies_are_rejected(client):
    ha, _, _, _, conv_id = setup_direct(client)
    assert send(client, ha, conv_id, "   \n ").status_code == 422
    assert send(client, ha, conv_id, "x" * 4001).status_code == 422
    assert send(client, ha, conv_id, "x" * 4000).status_code == 201
    assert len(messages(client, ha, conv_id)) == 1


def test_non_members_are_locked_out(client):
    ha, _, _, _, conv_id = setup_direct(client)
    hm, _ = login(client, "9000000003", "Meera")
    msg = send(client, ha, conv_id).json()
    assert send(client, hm, conv_id).status_code == 403
    assert client.get(f"/api/conversations/{conv_id}/messages", headers=hm).status_code == 403
    assert client.post(f"/api/conversations/{conv_id}/read", headers=hm,
                       json={"message_id": msg["id"]}).status_code == 403
    assert client.put(f"/api/messages/{msg['id']}/reaction", headers=hm,
                      json={"emoji": "👍"}).status_code == 403
    assert client.delete(f"/api/messages/{msg['id']}/reaction", headers=hm).status_code == 403
    assert messages(client, ha, conv_id)[0]["reactions"] == []


def test_pagination_returns_ascending_pages(client):
    ha, _, _, _, conv_id = setup_direct(client)
    ids = [send(client, ha, conv_id, f"m{i}").json()["id"] for i in range(5)]
    newest = client.get(f"/api/conversations/{conv_id}/messages?limit=2", headers=ha).json()
    assert [m["id"] for m in newest["messages"]] == ids[3:] and newest["has_more"] is True
    older = client.get(f"/api/conversations/{conv_id}/messages?limit=10&before={ids[3]}",
                       headers=ha).json()
    assert [m["id"] for m in older["messages"]] == ids[:3] and older["has_more"] is False
    assert client.get(f"/api/conversations/{conv_id}/messages?limit=0",
                      headers=ha).status_code == 422
    assert client.get(f"/api/conversations/{conv_id}/messages?limit=500",
                      headers=ha).status_code == 422


def test_read_updates_status_and_unread_count(client):
    ha, hr, _, _, conv_id = setup_direct(client)
    first = send(client, ha, conv_id).json()
    second = send(client, ha, conv_id).json()
    r = client.post(f"/api/conversations/{conv_id}/read", headers=hr,
                    json={"message_id": second["id"]})
    assert r.status_code == 204
    assert [m["status"] for m in messages(client, ha, conv_id)] == ["read", "read"]
    assert client.get("/api/conversations", headers=hr).json()[0]["unread_count"] == 0
    # Marking an older message read never moves the marker backwards.
    client.post(f"/api/conversations/{conv_id}/read", headers=hr, json={"message_id": first["id"]})
    send(client, ha, conv_id)
    assert client.get("/api/conversations", headers=hr).json()[0]["unread_count"] == 1


def test_read_marker_must_be_a_message_in_this_conversation(client):
    ha, hr, _, _, conv_id = setup_direct(client)
    hm, meera = login(client, "9000000003", "Meera")
    other = client.post("/api/conversations/direct", headers=ha,
                        json={"user_id": meera["id"]}).json()
    elsewhere = send(client, ha, other["id"]).json()
    send(client, ha, conv_id)
    r = client.post(f"/api/conversations/{conv_id}/read", headers=hr,
                    json={"message_id": elsewhere["id"] + 100})
    assert r.status_code == 404
    assert client.get("/api/conversations", headers=hr).json()[0]["unread_count"] == 1


def test_reading_part_of_a_chat_leaves_the_rest_unread(client):
    ha, hr, _, _, conv_id = setup_direct(client)
    first = send(client, ha, conv_id).json()
    send(client, ha, conv_id)
    client.post(f"/api/conversations/{conv_id}/read", headers=hr, json={"message_id": first["id"]})
    assert [m["status"] for m in messages(client, ha, conv_id)] == ["read", "sent"]
    assert client.get("/api/conversations", headers=hr).json()[0]["unread_count"] == 1


def test_group_status_needs_every_recipient(client):
    ha, asha = login(client, "9000000001", "Asha")
    hr, rohan = login(client, "9000000002", "Rohan")
    hm, meera = login(client, "9000000003", "Meera")
    group = client.post("/api/conversations/group", headers=ha,
                        json={"name": "G", "member_ids": [rohan["id"], meera["id"]]}).json()
    msg = send(client, ha, group["id"]).json()
    client.post(f"/api/conversations/{group['id']}/read", headers=hr, json={"message_id": msg["id"]})
    status = lambda: messages(client, ha, group["id"])[-1]["status"]
    assert status() == "sent"
    client.post(f"/api/conversations/{group['id']}/read", headers=hm, json={"message_id": msg["id"]})
    assert status() == "read"


def test_reply_must_point_into_the_same_conversation(client):
    ha, hr, _, _, conv_id = setup_direct(client)
    hm, meera = login(client, "9000000003", "Meera")
    other = client.post("/api/conversations/direct", headers=ha,
                        json={"user_id": meera["id"]}).json()
    original = send(client, ha, conv_id, "original").json()
    reply = send(client, hr, conv_id, "reply", reply_to_id=original["id"]).json()
    assert reply["reply_to"] == {"id": original["id"], "sender_id": original["sender_id"],
                                 "body": "original"}
    assert send(client, ha, other["id"], "x", reply_to_id=original["id"]).status_code == 400
    assert send(client, ha, conv_id, "x", reply_to_id=99999).status_code == 400


def test_reaction_is_replaced_then_removed(client):
    ha, hr, _, rohan, conv_id = setup_direct(client)
    msg = send(client, ha, conv_id).json()
    url = f"/api/messages/{msg['id']}/reaction"
    assert client.put(url, headers=hr, json={"emoji": "👍"}).json()["reactions"] == [
        {"emoji": "👍", "user_ids": [rohan["id"]]}]
    assert client.put(url, headers=hr, json={"emoji": "❤️"}).json()["reactions"] == [
        {"emoji": "❤️", "user_ids": [rohan["id"]]}]
    assert client.delete(url, headers=hr).json()["reactions"] == []
    assert client.delete(url, headers=hr).status_code == 200  # removing nothing is fine
    assert client.put(url, headers=hr, json={"emoji": ""}).status_code == 422
    assert client.put("/api/messages/99999/reaction", headers=hr,
                      json={"emoji": "👍"}).status_code == 404


def test_two_people_reacting_the_same_way_are_grouped(client):
    ha, hr, asha, rohan, conv_id = setup_direct(client)
    msg = send(client, ha, conv_id).json()
    url = f"/api/messages/{msg['id']}/reaction"
    client.put(url, headers=hr, json={"emoji": "👍"})
    both = client.put(url, headers=ha, json={"emoji": "👍"}).json()["reactions"]
    assert both == [{"emoji": "👍", "user_ids": [rohan["id"], asha["id"]]}]
