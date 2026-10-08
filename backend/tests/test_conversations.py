from tests.conftest import login


def three_users(client):
    return (login(client, "9000000001", "Asha"), login(client, "9000000002", "Rohan"),
            login(client, "9000000003", "Meera"))


def test_direct_conversation_is_created_once_per_pair(client):
    (ha, asha), (hr, rohan), _ = three_users(client)
    first = client.post("/api/conversations/direct", headers=ha, json={"user_id": rohan["id"]})
    assert first.status_code == 200 and first.json()["type"] == "direct"
    second = client.post("/api/conversations/direct", headers=hr, json={"user_id": asha["id"]})
    assert second.json()["id"] == first.json()["id"]
    assert {m["user"]["id"] for m in first.json()["members"]} == {asha["id"], rohan["id"]}


def test_direct_conversation_rejects_self_and_unknown(client):
    (ha, asha), _, _ = three_users(client)
    assert client.post("/api/conversations/direct", headers=ha,
                       json={"user_id": asha["id"]}).status_code == 400
    assert client.post("/api/conversations/direct", headers=ha,
                       json={"user_id": 9999}).status_code == 404


def test_create_group_makes_creator_admin_and_adds_system_message(client):
    (ha, asha), (hr, rohan), (hm, meera) = three_users(client)
    r = client.post("/api/conversations/group", headers=ha,
                    json={"name": " Trip ", "member_ids": [rohan["id"], meera["id"]]})
    assert r.status_code == 201
    group = r.json()
    assert group["name"] == "Trip"
    roles = {m["user"]["id"]: m["role"] for m in group["members"]}
    assert roles == {asha["id"]: "admin", rohan["id"]: "member", meera["id"]: "member"}
    assert group["last_message"]["type"] == "system"
    assert group["last_message"]["body"] == "Asha created the group"
    assert group["last_message"]["status"] is None
    assert group["unread_count"] == 0
    assert client.get("/api/conversations", headers=hr).json()[0]["id"] == group["id"]


def test_create_group_rejects_bad_member_lists(client):
    (ha, asha), (hr, rohan), _ = three_users(client)
    post = lambda body: client.post("/api/conversations/group", headers=ha, json=body)
    assert post({"name": "G", "member_ids": []}).status_code == 400
    assert post({"name": "G", "member_ids": [asha["id"]]}).status_code == 400  # only self
    assert post({"name": "G", "member_ids": [9999]}).status_code == 400
    assert post({"name": "   ", "member_ids": [rohan["id"]]}).status_code == 422
    assert post({"name": "x" * 65, "member_ids": [rohan["id"]]}).status_code == 422
    dup = post({"name": "G", "member_ids": [rohan["id"], rohan["id"], asha["id"]]})
    assert dup.status_code == 201 and len(dup.json()["members"]) == 2  # deduplicated


def test_conversation_details_are_members_only(client):
    (ha, _), (hr, rohan), (hm, _) = three_users(client)
    conv = client.post("/api/conversations/direct", headers=ha,
                       json={"user_id": rohan["id"]}).json()
    assert client.get(f"/api/conversations/{conv['id']}", headers=hr).status_code == 200
    assert client.get(f"/api/conversations/{conv['id']}", headers=hm).status_code == 403
    assert client.get("/api/conversations/9999", headers=hm).status_code == 404


def test_empty_direct_conversation_is_hidden_from_the_other_user(client):
    (ha, _), (hr, rohan), _ = three_users(client)
    client.post("/api/conversations/direct", headers=ha, json={"user_id": rohan["id"]})
    assert len(client.get("/api/conversations", headers=ha).json()) == 1
    assert client.get("/api/conversations", headers=hr).json() == []


def test_list_is_ordered_by_most_recent_activity(client):
    (ha, _), (hr, rohan), (hm, meera) = three_users(client)
    older = client.post("/api/conversations/group", headers=ha,
                        json={"name": "Older", "member_ids": [rohan["id"]]}).json()
    newer = client.post("/api/conversations/group", headers=ha,
                        json={"name": "Newer", "member_ids": [meera["id"]]}).json()
    assert [c["id"] for c in client.get("/api/conversations", headers=ha).json()] == [
        newer["id"], older["id"]]
