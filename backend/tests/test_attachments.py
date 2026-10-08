import uuid
from datetime import timedelta

from app.constants import ATTACHMENT_MAX_BYTES
from app.models import Attachment, utcnow
from app.services.expiry import purge_expired
from tests.conftest import login
from tests.test_realtime import connect, next_of_type

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
GIF = b"GIF89a" + b"\x00" * 64
PDF = b"%PDF-1.7\n" + b"\x00" * 64
HTML = b"<html><script>alert(1)</script></html>"


def pair(client):
    ha, asha = login(client, "9000000001", "Asha")
    hr, rohan = login(client, "9000000002", "Rohan")
    conv = client.post("/api/conversations/direct", headers=ha,
                       json={"user_id": rohan["id"]}).json()
    return ha, hr, asha, rohan, conv["id"]


def upload(client, headers, conv_id, name="photo.png", data=PNG, mime="image/png", **fields):
    return client.post(f"/api/conversations/{conv_id}/attachments", headers=headers,
                       files={"file": (name, data, mime)}, data=fields)


def send(client, headers, conv_id, body="", **extra):
    return client.post(f"/api/conversations/{conv_id}/messages", headers=headers,
                       json={"body": body, "client_id": str(uuid.uuid4()), **extra})


def history(client, headers, conv_id):
    return client.get(f"/api/conversations/{conv_id}/messages", headers=headers).json()["messages"]


def test_image_is_uploaded_sent_and_downloaded_by_the_other_member(client):
    ha, hr, _, _, conv_id = pair(client)
    up = upload(client, ha, conv_id, width="640", height="480")
    assert up.status_code == 201
    att = up.json()
    assert att == {"id": att["id"], "filename": "photo.png", "content_type": "image/png",
                   "size": len(PNG), "is_image": True, "width": 640, "height": 480}
    msg = send(client, ha, conv_id, "look at this", attachment_id=att["id"])
    assert msg.status_code == 201
    assert msg.json()["attachment"] == att and msg.json()["body"] == "look at this"
    seen = history(client, hr, conv_id)[0]
    assert seen["attachment"] == att
    got = client.get(f"/api/attachments/{att['id']}", headers=hr)
    assert got.status_code == 200 and got.content == PNG
    assert got.headers["content-type"] == "image/png"
    assert got.headers["x-content-type-options"] == "nosniff"


def test_attachment_can_be_sent_without_any_text(client):
    ha, hr, _, _, conv_id = pair(client)
    att = upload(client, ha, conv_id).json()
    msg = send(client, ha, conv_id, "   ", attachment_id=att["id"])
    assert msg.status_code == 201 and msg.json()["body"] == ""
    assert send(client, ha, conv_id, "   ").status_code == 422  # still no empty text messages
    listed = client.get("/api/conversations", headers=hr).json()[0]
    assert listed["last_message"]["attachment"]["filename"] == "photo.png"
    assert listed["unread_count"] == 1


def test_non_image_files_are_only_ever_served_as_downloads(client):
    ha, hr, _, _, conv_id = pair(client)
    for name, data, mime in (("notes.pdf", PDF, "application/pdf"),
                             ("page.html", HTML, "text/html"),
                             ("fake.png", HTML, "image/png")):  # lies about its type
        att = upload(client, ha, conv_id, name=name, data=data, mime=mime).json()
        assert att["is_image"] is False and att["width"] is None
        send(client, ha, conv_id, attachment_id=att["id"])
        got = client.get(f"/api/attachments/{att['id']}", headers=hr)
        assert got.headers["content-type"] == "application/octet-stream"
        assert got.headers["content-disposition"].startswith("attachment")
        assert got.content == data


def test_gif_counts_as_an_image(client):
    ha, _, _, _, conv_id = pair(client)
    att = upload(client, ha, conv_id, name="fun.gif", data=GIF, mime="image/gif").json()
    assert att["is_image"] is True and att["content_type"] == "image/gif"


def test_upload_limits(client):
    ha, _, _, _, conv_id = pair(client)
    assert upload(client, ha, conv_id, data=b"").status_code == 400
    too_big = upload(client, ha, conv_id, name="big.bin", mime="application/octet-stream",
                     data=b"\x01" * (ATTACHMENT_MAX_BYTES + 1))
    assert too_big.status_code == 400
    assert too_big.json()["detail"] == "Files can be at most 5 MB"
    exactly = upload(client, ha, conv_id, name="ok.bin", mime="application/octet-stream",
                     data=b"\x01" * ATTACHMENT_MAX_BYTES)
    assert exactly.status_code == 201


def test_filename_is_reduced_to_a_safe_display_name(client):
    ha, _, _, _, conv_id = pair(client)
    att = upload(client, ha, conv_id, name="..\\..\\secret/../evil name.png").json()
    assert att["filename"] == "evil name.png"
    long = upload(client, ha, conv_id, name="a" * 300 + ".pdf", data=PDF,
                  mime="application/pdf").json()
    assert len(long["filename"]) <= 120 and long["filename"].endswith(".pdf")
    assert upload(client, ha, conv_id, name="   ").json()["filename"] == "file"


def test_only_members_can_upload_or_download(client):
    ha, hr, _, _, conv_id = pair(client)
    hm, _ = login(client, "9000000003", "Meera")
    assert upload(client, hm, conv_id).status_code == 403
    att = upload(client, ha, conv_id).json()
    # Not sent yet: only the uploader may fetch it.
    assert client.get(f"/api/attachments/{att['id']}", headers=ha).status_code == 200
    assert client.get(f"/api/attachments/{att['id']}", headers=hr).status_code == 403
    send(client, ha, conv_id, attachment_id=att["id"])
    assert client.get(f"/api/attachments/{att['id']}", headers=hr).status_code == 200
    assert client.get(f"/api/attachments/{att['id']}", headers=hm).status_code == 403
    assert client.get(f"/api/attachments/{att['id']}").status_code == 401
    assert client.get("/api/attachments/99999", headers=ha).status_code == 404


def test_an_attachment_can_only_be_sent_once_by_its_uploader_in_its_own_chat(client):
    ha, hr, _, _, conv_id = pair(client)
    hm, meera = login(client, "9000000003", "Meera")
    other = client.post("/api/conversations/direct", headers=ha,
                        json={"user_id": meera["id"]}).json()
    att = upload(client, ha, conv_id).json()
    assert send(client, hr, conv_id, attachment_id=att["id"]).status_code == 400  # not his
    assert send(client, ha, other["id"], attachment_id=att["id"]).status_code == 400  # wrong chat
    assert send(client, ha, conv_id, attachment_id=99999).status_code == 400
    assert send(client, ha, conv_id, attachment_id=att["id"]).status_code == 201
    assert send(client, ha, conv_id, attachment_id=att["id"]).status_code == 400  # already used
    assert len(history(client, ha, conv_id)) == 1


def test_removed_group_member_loses_access_to_its_files(client):
    ha, asha = login(client, "9000000001", "Asha")
    hr, rohan = login(client, "9000000002", "Rohan")
    group = client.post("/api/conversations/group", headers=ha,
                        json={"name": "G", "member_ids": [rohan["id"]]}).json()
    att = upload(client, ha, group["id"]).json()
    send(client, ha, group["id"], attachment_id=att["id"])
    assert client.get(f"/api/attachments/{att['id']}", headers=hr).status_code == 200
    client.delete(f"/api/conversations/{group['id']}/members/{rohan['id']}", headers=ha)
    assert client.get(f"/api/attachments/{att['id']}", headers=hr).status_code == 403


def test_deleting_the_message_for_everyone_removes_the_file(client, db):
    ha, hr, _, _, conv_id = pair(client)
    att = upload(client, ha, conv_id).json()
    msg = send(client, ha, conv_id, "caption", attachment_id=att["id"]).json()
    deleted = client.delete(f"/api/messages/{msg['id']}", headers=ha).json()
    assert deleted["attachment"] is None and deleted["deleted"] is True
    assert client.get(f"/api/attachments/{att['id']}", headers=hr).status_code == 404
    assert db.get(Attachment, att["id"]) is None


def test_a_disappearing_message_takes_its_file_with_it(client, db):
    ha, hr, _, _, conv_id = pair(client)
    client.patch(f"/api/conversations/{conv_id}/disappearing", headers=ha, json={"seconds": 30})
    att = upload(client, ha, conv_id).json()
    send(client, ha, conv_id, attachment_id=att["id"])
    purge_expired(db, utcnow() + timedelta(seconds=31))
    db.commit()
    assert db.get(Attachment, att["id"]) is None
    assert client.get(f"/api/attachments/{att['id']}", headers=hr).status_code == 404


def test_reply_preview_names_the_attachment_when_there_is_no_text(client):
    ha, hr, _, _, conv_id = pair(client)
    photo = upload(client, ha, conv_id).json()
    first = send(client, ha, conv_id, attachment_id=photo["id"]).json()
    doc = upload(client, ha, conv_id, name="notes.pdf", data=PDF, mime="application/pdf").json()
    second = send(client, ha, conv_id, attachment_id=doc["id"]).json()
    reply_photo = send(client, hr, conv_id, "nice", reply_to_id=first["id"]).json()
    reply_doc = send(client, hr, conv_id, "thanks", reply_to_id=second["id"]).json()
    assert reply_photo["reply_to"]["body"] == "Photo"
    assert reply_doc["reply_to"]["body"] == "notes.pdf"


def test_attachment_message_reaches_the_other_browser_live(client):
    ha, hr, _, _, conv_id = pair(client)
    att = upload(client, ha, conv_id).json()
    with connect(client, hr) as rohan_ws:
        send(client, ha, conv_id, attachment_id=att["id"])
        assert next_of_type(rohan_ws, "message.new")["message"]["attachment"]["id"] == att["id"]
