import uuid

from app.models import Conversation
from tests.conftest import login
from tests.test_realtime import connect, next_of_type


def make_group(client):
    ha, asha = login(client, "9000000001", "Asha")
    hr, rohan = login(client, "9000000002", "Rohan")
    hm, meera = login(client, "9000000003", "Meera")
    hk, kabir = login(client, "9000000004", "Kabir")
    group = client.post("/api/conversations/group", headers=ha,
                        json={"name": "Trip", "member_ids": [rohan["id"], meera["id"]]}).json()
    return {"asha": (ha, asha), "rohan": (hr, rohan), "meera": (hm, meera),
            "kabir": (hk, kabir), "id": group["id"]}


def roles(client, headers, group_id):
    members = client.get(f"/api/conversations/{group_id}", headers=headers).json()["members"]
    return {m["user"]["display_name"]: m["role"] for m in members}


def last_body(client, headers, group_id):
    page = client.get(f"/api/conversations/{group_id}/messages", headers=headers).json()
    return page["messages"][-1]["body"]


def test_admin_adds_members_and_they_see_the_group(client):
    g = make_group(client)
    ha, _ = g["asha"]
    hk, kabir = g["kabir"]
    r = client.post(f"/api/conversations/{g['id']}/members", headers=ha,
                    json={"user_ids": [kabir["id"], g["rohan"][1]["id"]]})  # Rohan already in
    assert r.status_code == 200 and len(r.json()["members"]) == 4
    assert last_body(client, ha, g["id"]) == "Asha added Kabir"
    assert client.get("/api/conversations", headers=hk).json()[0]["id"] == g["id"]
    unknown = client.post(f"/api/conversations/{g['id']}/members", headers=ha,
                          json={"user_ids": [9999]})
    assert unknown.status_code == 400


def test_non_admin_cannot_manage(client):
    g = make_group(client)
    hr, rohan = g["rohan"]
    meera, kabir = g["meera"][1], g["kabir"][1]
    base = f"/api/conversations/{g['id']}"
    assert client.post(f"{base}/members", headers=hr,
                       json={"user_ids": [kabir["id"]]}).status_code == 403
    assert client.delete(f"{base}/members/{meera['id']}", headers=hr).status_code == 403
    assert client.patch(base, headers=hr, json={"name": "X"}).status_code == 403
    assert client.patch(f"{base}/members/{rohan['id']}", headers=hr,
                        json={"role": "admin"}).status_code == 403
    assert roles(client, hr, g["id"]) == {"Asha": "admin", "Rohan": "member", "Meera": "member"}


def test_outsider_cannot_manage_or_join(client):
    g = make_group(client)
    hk, kabir = g["kabir"]
    base = f"/api/conversations/{g['id']}"
    assert client.post(f"{base}/members", headers=hk,
                       json={"user_ids": [kabir["id"]]}).status_code == 403
    assert client.delete(f"{base}/members/{kabir['id']}", headers=hk).status_code == 403


def test_admin_removes_member_who_then_loses_access(client):
    g = make_group(client)
    ha, _ = g["asha"]
    hm, meera = g["meera"]
    r = client.delete(f"/api/conversations/{g['id']}/members/{meera['id']}", headers=ha)
    assert r.status_code == 200
    assert last_body(client, ha, g["id"]) == "Asha removed Meera"
    assert client.get("/api/conversations", headers=hm).json() == []
    assert client.get(f"/api/conversations/{g['id']}/messages", headers=hm).status_code == 403
    again = client.delete(f"/api/conversations/{g['id']}/members/{meera['id']}", headers=ha)
    assert again.status_code == 404


def test_removed_member_no_longer_blocks_read_status(client):
    g = make_group(client)
    ha, _ = g["asha"]
    hr, _ = g["rohan"]
    meera = g["meera"][1]
    msg = client.post(f"/api/conversations/{g['id']}/messages", headers=ha,
                      json={"body": "hi", "client_id": str(uuid.uuid4())}).json()
    client.post(f"/api/conversations/{g['id']}/read", headers=hr, json={"message_id": msg["id"]})
    client.delete(f"/api/conversations/{g['id']}/members/{meera['id']}", headers=ha)
    page = client.get(f"/api/conversations/{g['id']}/messages", headers=ha).json()
    assert [m for m in page["messages"] if m["id"] == msg["id"]][0]["status"] == "read"


def test_member_can_leave(client):
    g = make_group(client)
    ha, _ = g["asha"]
    hr, rohan = g["rohan"]
    r = client.delete(f"/api/conversations/{g['id']}/members/{rohan['id']}", headers=hr)
    assert r.status_code == 200 and r.json() is None
    assert last_body(client, ha, g["id"]) == "Rohan left the group"
    assert "Rohan" not in roles(client, ha, g["id"])


def test_last_admin_leaving_promotes_longest_standing_member(client):
    g = make_group(client)
    ha, asha = g["asha"]
    hr, _ = g["rohan"]
    client.delete(f"/api/conversations/{g['id']}/members/{asha['id']}", headers=ha)
    assert roles(client, hr, g["id"]) == {"Rohan": "admin", "Meera": "member"}


def test_last_member_leaving_deletes_the_group(client, db):
    g = make_group(client)
    for name in ("rohan", "meera", "asha"):
        headers, user = g[name]
        client.delete(f"/api/conversations/{g['id']}/members/{user['id']}", headers=headers)
    assert db.get(Conversation, g["id"]) is None


def test_promote_demote_and_rename(client):
    g = make_group(client)
    ha, asha = g["asha"]
    hr, rohan = g["rohan"]
    base = f"/api/conversations/{g['id']}"
    client.patch(f"{base}/members/{rohan['id']}", headers=ha, json={"role": "admin"})
    assert roles(client, ha, g["id"])["Rohan"] == "admin"
    assert last_body(client, ha, g["id"]) == "Asha made Rohan an admin"
    assert client.patch(base, headers=hr, json={"name": " Goa "}).json()["name"] == "Goa"
    assert last_body(client, ha, g["id"]) == "Rohan renamed the group to Goa"
    client.patch(f"{base}/members/{rohan['id']}", headers=ha, json={"role": "member"})
    assert last_body(client, ha, g["id"]) == "Rohan is no longer an admin"
    # The only remaining admin cannot demote themselves into an admin-less group.
    assert client.patch(f"{base}/members/{asha['id']}", headers=ha,
                        json={"role": "member"}).status_code == 400
    assert client.patch(f"{base}/members/{asha['id']}", headers=ha,
                        json={"role": "owner"}).status_code == 422
    assert client.patch(base, headers=ha, json={"name": "  "}).status_code == 422


def test_group_operations_are_refused_on_direct_chats(client):
    g = make_group(client)
    ha, _ = g["asha"]
    rohan, kabir = g["rohan"][1], g["kabir"][1]
    direct = client.post("/api/conversations/direct", headers=ha,
                         json={"user_id": rohan["id"]}).json()
    base = f"/api/conversations/{direct['id']}"
    assert client.post(f"{base}/members", headers=ha,
                       json={"user_ids": [kabir["id"]]}).status_code == 400
    assert client.patch(base, headers=ha, json={"name": "X"}).status_code == 400
    assert client.delete(f"{base}/members/{rohan['id']}", headers=ha).status_code == 400
    assert client.patch(f"{base}/members/{rohan['id']}", headers=ha,
                        json={"role": "admin"}).status_code == 400


def test_membership_changes_are_pushed_live(client):
    g = make_group(client)
    ha, _ = g["asha"]
    hr, _ = g["rohan"]
    hm, meera = g["meera"]
    hk, kabir = g["kabir"]
    base = f"/api/conversations/{g['id']}"
    with connect(client, hr) as rohan_ws, connect(client, hk) as kabir_ws, \
            connect(client, hm) as meera_ws:
        client.post(f"{base}/members", headers=ha, json={"user_ids": [kabir["id"]]})
        assert next_of_type(kabir_ws, "conversation.new")["conversation"]["id"] == g["id"]
        updated = next_of_type(rohan_ws, "conversation.updated")["conversation"]
        assert len(updated["members"]) == 4
        client.delete(f"{base}/members/{meera['id']}", headers=ha)
        assert next_of_type(meera_ws, "conversation.removed") == {"conversation_id": g["id"]}
        assert len(next_of_type(rohan_ws, "conversation.updated")["conversation"]["members"]) == 3


def test_member_added_later_does_not_get_old_messages_as_unread(client):
    g = make_group(client)
    ha, _ = g["asha"]
    hk, kabir = g["kabir"]
    for text in ("one", "two", "three"):
        client.post(f"/api/conversations/{g['id']}/messages", headers=ha,
                    json={"body": text, "client_id": str(uuid.uuid4())})
    client.post(f"/api/conversations/{g['id']}/members", headers=ha,
                json={"user_ids": [kabir["id"]]})
    listed = client.get("/api/conversations", headers=hk).json()
    assert listed[0]["id"] == g["id"] and listed[0]["unread_count"] == 0
    client.post(f"/api/conversations/{g['id']}/messages", headers=ha,
                json={"body": "four", "client_id": str(uuid.uuid4())})
    assert client.get("/api/conversations", headers=hk).json()[0]["unread_count"] == 1


def test_removing_the_last_unread_member_tells_the_sender_it_is_read(client):
    g = make_group(client)
    ha, _ = g["asha"]
    hr, _ = g["rohan"]
    meera = g["meera"][1]
    msg = client.post(f"/api/conversations/{g['id']}/messages", headers=ha,
                      json={"body": "hi", "client_id": str(uuid.uuid4())}).json()
    client.post(f"/api/conversations/{g['id']}/read", headers=hr, json={"message_id": msg["id"]})
    with connect(client, ha) as asha_ws:
        client.delete(f"/api/conversations/{g['id']}/members/{meera['id']}", headers=ha)
        status = next_of_type(asha_ws, "message.status")
        assert status == {"conversation_id": g["id"], "message_ids": [msg["id"]], "status": "read"}
