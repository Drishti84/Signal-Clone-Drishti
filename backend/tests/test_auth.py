from datetime import timedelta

import pytest

from app.errors import BadRequest
from app.models import Session, User, utcnow
from app.services.phone import normalize_phone
from tests.conftest import login


@pytest.mark.parametrize("raw", ["+91 98765 43210", "98765-43210", "9876543210",
                                 "+91(98765)43210"])
def test_phone_formats_normalise_to_one_number(raw):
    assert normalize_phone(raw) == "+919876543210"


@pytest.mark.parametrize("raw", ["", "abc", "12", "+1234567890123456", "98765abc10"])
def test_bad_phone_is_rejected(raw):
    with pytest.raises(BadRequest):
        normalize_phone(raw)


def test_request_otp_reports_registration(client):
    r = client.post("/api/auth/request-otp", json={"phone": "9876543210"})
    assert r.json() == {"is_registered": False}
    login(client, "9876543210", "Asha")
    r = client.post("/api/auth/request-otp", json={"phone": "+91 98765 43210"})
    assert r.json() == {"is_registered": True}


def test_verify_creates_user_once_and_flags_missing_profile(client):
    r = client.post("/api/auth/verify-otp", json={"phone": "9876543210", "otp": "123456"})
    body = r.json()
    assert body["needs_profile"] is True
    assert body["user"]["phone"] == "+919876543210"
    headers = {"Authorization": f"Bearer {body['token']}"}
    client.patch("/api/users/me", json={"display_name": "Asha"}, headers=headers)
    again = client.post("/api/auth/verify-otp",
                        json={"phone": "+91 98765 43210", "otp": "123456"}).json()
    assert again["needs_profile"] is False
    assert again["user"]["id"] == body["user"]["id"]


def test_wrong_otp_is_rejected(client):
    r = client.post("/api/auth/verify-otp", json={"phone": "9876543210", "otp": "000000"})
    assert r.status_code == 400
    assert r.json() == {"detail": "Incorrect code"}


def test_malformed_phone_is_422_over_http(client):
    r = client.post("/api/auth/request-otp", json={"phone": "abc"})
    assert r.status_code == 422


def test_me_requires_a_valid_token(client):
    assert client.get("/api/users/me").status_code == 401
    assert client.get("/api/users/me",
                      headers={"Authorization": "Bearer nope"}).status_code == 401


def test_logout_invalidates_only_that_session(client):
    h1, _ = login(client, "9876543210", "Asha")
    h2, _ = login(client, "9876543210")
    assert client.post("/api/auth/logout", headers=h1).status_code == 204
    assert client.get("/api/users/me", headers=h1).status_code == 401
    assert client.get("/api/users/me", headers=h2).status_code == 200


def test_expired_session_is_rejected(client, db):
    headers, _ = login(client, "9876543210", "Asha")
    db.query(Session).update({"expires_at": utcnow() - timedelta(seconds=1)})
    db.commit()
    assert client.get("/api/users/me", headers=headers).status_code == 401


def test_profile_update_validates_fields(client):
    headers, _ = login(client, "9876543210")
    ok = client.patch("/api/users/me", headers=headers, json={
        "display_name": "  Asha  ", "about": "Hi", "avatar_color": "A140",
        "avatar_preset": "cat"})
    assert ok.json()["display_name"] == "Asha"
    assert ok.json()["avatar"] == {"color": "A140", "preset": "cat", "image_url": None}
    for bad in ({"display_name": "   "}, {"display_name": "x" * 65},
                {"avatar_color": "red"}, {"avatar_preset": "dragon"},
                {"about": "x" * 141}):
        assert client.patch("/api/users/me", headers=headers, json=bad).status_code == 422


def test_profile_update_only_touches_fields_that_were_sent(client):
    headers, _ = login(client, "9876543210")
    client.patch("/api/users/me", headers=headers,
                 json={"display_name": "Asha", "about": "Hi", "avatar_preset": "cat"})
    kept = client.patch("/api/users/me", headers=headers, json={"avatar_color": "A130"}).json()
    assert kept["display_name"] == "Asha" and kept["about"] == "Hi"
    assert kept["avatar"]["preset"] == "cat"
    cleared = client.patch("/api/users/me", headers=headers,
                           json={"avatar_preset": None, "about": ""}).json()
    assert cleared["avatar"]["preset"] is None and cleared["about"] is None


def test_demo_users_lists_only_seeded_accounts(client, db):
    db.add(User(phone="+911000000001", display_name="Demo", is_demo=True))
    db.commit()
    login(client, "9876543210", "Asha")
    names = [u["display_name"] for u in client.get("/api/auth/demo-users").json()]
    assert names == ["Demo"]


def test_phone_with_non_ascii_digits_is_rejected():
    with pytest.raises(BadRequest):
        normalize_phone("+91٩٨٧٦٥٤٣٢١٠")


def test_cors_origins_ignore_trailing_slashes_and_blanks():
    from app.config import Settings
    settings = Settings(cors_origins=" https://a.example/ , ,http://localhost:3000")
    assert settings.cors_origin_list == ["https://a.example", "http://localhost:3000"]


def test_user_without_a_profile_cannot_chat_yet(client):
    headers, _ = login(client, "9876543210")  # verified, but no display name yet
    _, rohan = login(client, "9000000002", "Rohan")
    for response in (
        client.post("/api/conversations/group", headers=headers,
                    json={"name": "G", "member_ids": [rohan["id"]]}),
        client.post("/api/conversations/direct", headers=headers, json={"user_id": rohan["id"]}),
        client.get("/api/conversations", headers=headers),
        client.post("/api/contacts", headers=headers, json={"user_id": rohan["id"]}),
    ):
        assert response.status_code == 403
        assert response.json() == {"detail": "Finish setting up your profile first"}
    assert client.get("/api/users/me", headers=headers).status_code == 200
