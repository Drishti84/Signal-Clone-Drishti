from tests.conftest import login

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32


def test_avatar_upload_fetch_replace_remove(client):
    headers, me = login(client, "9876543210", "Asha")
    r = client.put("/api/users/me/avatar", headers=headers,
                   files={"file": ("a.png", PNG, "image/png")})
    assert r.status_code == 200
    url = r.json()["avatar"]["image_url"]
    assert url == f"/api/users/{me['id']}/avatar?v=1"
    got = client.get(url)  # no auth header: <img> cannot send one
    assert got.content == PNG and got.headers["content-type"] == "image/png"
    r = client.put("/api/users/me/avatar", headers=headers,
                   files={"file": ("a.jpg", JPEG, "image/jpeg")})
    assert r.json()["avatar"]["image_url"].endswith("v=2")
    assert client.get(r.json()["avatar"]["image_url"]).content == JPEG
    r = client.delete("/api/users/me/avatar", headers=headers)
    assert r.json()["avatar"]["image_url"] is None
    assert client.get(f"/api/users/{me['id']}/avatar").status_code == 404


def test_avatar_rejects_non_images_and_large_files(client):
    headers, _ = login(client, "9876543210", "Asha")
    not_image = client.put("/api/users/me/avatar", headers=headers,
                           files={"file": ("a.png", b"<script>", "image/png")})
    assert not_image.status_code == 400
    too_big = client.put("/api/users/me/avatar", headers=headers,
                         files={"file": ("a.png", PNG + b"\x00" * 256 * 1024, "image/png")})
    assert too_big.status_code == 400
    assert client.get("/api/users/me", headers=headers).json()["avatar"]["image_url"] is None


def test_avatar_type_comes_from_the_bytes_not_the_upload_header(client):
    headers, me = login(client, "9876543210", "Asha")
    client.put("/api/users/me/avatar", headers=headers,
               files={"file": ("a.txt", PNG, "text/plain")})
    got = client.get(f"/api/users/{me['id']}/avatar")
    assert got.headers["content-type"] == "image/png"


def test_user_search_excludes_self_and_profileless_users(client):
    h_asha, _ = login(client, "9000000001", "Asha")
    login(client, "9000000002", "Rohan")
    login(client, "9000000003")  # never finished onboarding
    everyone = client.get("/api/users", headers=h_asha).json()
    assert [u["display_name"] for u in everyone] == ["Rohan"]
    assert client.get("/api/users?q=roh", headers=h_asha).json()[0]["display_name"] == "Rohan"
    assert client.get("/api/users?q=zzz", headers=h_asha).json() == []


def test_user_search_treats_like_wildcards_as_plain_text(client):
    h_asha, _ = login(client, "9000000001", "Asha")
    login(client, "9000000002", "Rohan")
    assert client.get("/api/users", params={"q": "%"}, headers=h_asha).json() == []
    assert client.get("/api/users", params={"q": "_"}, headers=h_asha).json() == []


def test_lookup_by_phone(client):
    h_asha, _ = login(client, "9000000001", "Asha")
    login(client, "9000000002", "Rohan")
    found = client.get("/api/users/lookup", params={"phone": "90000 00002"}, headers=h_asha)
    assert found.json()["display_name"] == "Rohan"
    missing = client.get("/api/users/lookup", params={"phone": "9000000009"}, headers=h_asha)
    assert missing.status_code == 404
    assert missing.json()["detail"] == "This number is not on Signal"
    bad = client.get("/api/users/lookup", params={"phone": "abc"}, headers=h_asha)
    assert bad.status_code == 400


def test_contacts_add_list_remove(client):
    h_asha, asha = login(client, "9000000001", "Asha")
    h_rohan, rohan = login(client, "9000000002", "Rohan")
    by_phone = client.post("/api/contacts", headers=h_asha, json={"phone": "9000000002"})
    assert by_phone.status_code == 201 and by_phone.json()["id"] == rohan["id"]
    again = client.post("/api/contacts", headers=h_asha, json={"user_id": rohan["id"]})
    assert again.status_code == 201  # idempotent, not an error
    assert [c["id"] for c in client.get("/api/contacts", headers=h_asha).json()] == [rohan["id"]]
    assert client.get("/api/contacts", headers=h_rohan).json() == []  # one-directional
    assert client.delete(f"/api/contacts/{rohan['id']}", headers=h_asha).status_code == 204
    assert client.get("/api/contacts", headers=h_asha).json() == []


def test_cannot_add_self_or_unknown_user_as_contact(client):
    h_asha, asha = login(client, "9000000001", "Asha")
    assert client.post("/api/contacts", headers=h_asha,
                       json={"user_id": asha["id"]}).status_code == 400
    assert client.post("/api/contacts", headers=h_asha,
                       json={"user_id": 9999}).status_code == 404
    assert client.post("/api/contacts", headers=h_asha,
                       json={"phone": "9000000009"}).status_code == 404
    assert client.post("/api/contacts", headers=h_asha, json={}).status_code == 422


def test_presence_audience_is_chat_partners_and_people_who_saved_you(client, db):
    from app.models import Conversation, ConversationMember
    from app.services.presence import audience
    h_asha, asha = login(client, "9000000001", "Asha")
    h_rohan, rohan = login(client, "9000000002", "Rohan")
    _, meera = login(client, "9000000003", "Meera")
    _, kabir = login(client, "9000000004", "Kabir")
    client.post("/api/contacts", headers=h_rohan, json={"user_id": asha["id"]})
    conv = Conversation(type="group", name="G", created_by=asha["id"])
    conv.members = [ConversationMember(user_id=asha["id"]),
                    ConversationMember(user_id=meera["id"])]
    db.add(conv)
    db.commit()
    assert audience(db, asha["id"]) == sorted([rohan["id"], meera["id"]])
    assert audience(db, kabir["id"]) == []
