import uuid

import pytest
from starlette.websockets import WebSocketDisconnect

from tests.conftest import login


def token(headers):
    return headers["Authorization"].removeprefix("Bearer ")


def connect(client, headers):
    return client.websocket_connect(f"/ws?token={token(headers)}")


def next_of_type(ws, wanted):
    """Skip unrelated frames (presence and so on) until `wanted` arrives."""
    for _ in range(10):
        frame = ws.receive_json()
        if frame["type"] == wanted:
            return frame["data"]
    raise AssertionError(f"no {wanted} frame")


def types_until_pong(ws):
    """Ping, then list the types of every frame that was queued ahead of the pong."""
    ws.send_json({"type": "ping", "data": {}})
    seen = []
    for _ in range(10):
        kind = ws.receive_json()["type"]
        if kind == "pong":
            return seen
        seen.append(kind)
    raise AssertionError("no pong")


def quiet(ws):
    """True when nothing at all was queued for this socket."""
    return types_until_pong(ws) == []


def pair(client):
    ha, asha = login(client, "9000000001", "Asha")
    hr, rohan = login(client, "9000000002", "Rohan")
    conv = client.post("/api/conversations/direct", headers=ha,
                       json={"user_id": rohan["id"]}).json()
    return ha, hr, asha, rohan, conv["id"]


def send(client, headers, conv_id, body="hi"):
    return client.post(f"/api/conversations/{conv_id}/messages", headers=headers,
                       json={"body": body, "client_id": str(uuid.uuid4())}).json()


def test_bad_token_is_closed_with_4401(client):
    with pytest.raises(WebSocketDisconnect) as closed:
        with client.websocket_connect("/ws?token=nope") as ws:
            ws.receive_json()
    assert closed.value.code == 4401


def test_online_recipient_gets_the_message_and_it_is_delivered(client):
    ha, hr, asha, _, conv_id = pair(client)
    with connect(client, hr) as rohan_ws:
        msg = send(client, ha, conv_id, "hello")
        assert msg["status"] == "delivered"
        assert next_of_type(rohan_ws, "message.new")["message"]["body"] == "hello"


def test_offline_message_is_delivered_on_connect_and_sender_is_told(client):
    ha, hr, _, _, conv_id = pair(client)
    with connect(client, ha) as asha_ws:
        msg = send(client, ha, conv_id)
        assert msg["status"] == "sent"
        with connect(client, hr):
            status = next_of_type(asha_ws, "message.status")
            assert status == {"conversation_id": conv_id, "message_ids": [msg["id"]],
                              "status": "delivered"}


def test_read_notifies_the_sender(client):
    ha, hr, _, _, conv_id = pair(client)
    with connect(client, ha) as asha_ws, connect(client, hr):
        msg = send(client, ha, conv_id)
        client.post(f"/api/conversations/{conv_id}/read", headers=hr,
                    json={"message_id": msg["id"]})
        assert next_of_type(asha_ws, "message.status")["status"] == "read"


def test_reaction_reaches_the_other_member(client):
    ha, hr, _, rohan, conv_id = pair(client)
    with connect(client, ha) as asha_ws:
        msg = send(client, ha, conv_id)
        client.put(f"/api/messages/{msg['id']}/reaction", headers=hr, json={"emoji": "👍"})
        assert next_of_type(asha_ws, "message.reaction") == {
            "conversation_id": conv_id, "message_id": msg["id"],
            "reactions": [{"emoji": "👍", "user_ids": [rohan["id"]]}]}


def test_typing_is_relayed_to_other_members_only(client):
    ha, hr, asha, _, conv_id = pair(client)
    with connect(client, ha) as asha_ws, connect(client, hr) as rohan_ws:
        asha_ws.send_json({"type": "typing.start", "data": {"conversation_id": conv_id}})
        assert next_of_type(rohan_ws, "typing") == {
            "conversation_id": conv_id, "user_id": asha["id"], "is_typing": True}
        asha_ws.send_json({"type": "typing.stop", "data": {"conversation_id": conv_id}})
        assert next_of_type(rohan_ws, "typing")["is_typing"] is False
        assert "typing" not in types_until_pong(asha_ws)  # no echo of her own typing


def test_typing_from_a_non_member_and_malformed_frames_are_dropped(client):
    ha, hr, _, _, conv_id = pair(client)
    hm, _ = login(client, "9000000003", "Meera")
    with connect(client, hr) as rohan_ws, connect(client, hm) as meera_ws:
        meera_ws.send_json({"type": "typing.start", "data": {"conversation_id": conv_id}})
        meera_ws.send_json({"type": "typing.start", "data": {"conversation_id": "x"}})
        meera_ws.send_json({"type": "typing.start"})
        meera_ws.send_json({"type": "nonsense"})
        meera_ws.send_json([1, 2, 3])
        meera_ws.send_text("not json at all")
        assert quiet(meera_ws)  # the socket survived every bad frame
        assert quiet(rohan_ws)  # and nothing was relayed to Rohan


def test_presence_tracks_first_and_last_tab(client):
    ha, hr, _, rohan, conv_id = pair(client)
    send(client, ha, conv_id)  # makes them chat partners
    with connect(client, ha) as asha_ws:
        with connect(client, hr):
            assert next_of_type(asha_ws, "presence")["is_online"] is True
            with connect(client, hr):
                pass  # second tab opens and closes
            assert quiet(asha_ws)  # no second "online", and no "offline" yet
        offline = next_of_type(asha_ws, "presence")
        assert offline["user_id"] == rohan["id"] and offline["is_online"] is False
        assert offline["last_seen_at"].endswith("Z")
    assert client.get("/api/users/me", headers=hr).json()["is_online"] is False


def test_rest_responses_report_who_is_online(client):
    ha, hr, _, rohan, conv_id = pair(client)
    with connect(client, hr):
        members = client.get(f"/api/conversations/{conv_id}", headers=ha).json()["members"]
        online = {m["user"]["id"]: m["user"]["is_online"] for m in members}
        assert online[rohan["id"]] is True


def test_both_tabs_of_one_user_receive_events(client):
    ha, hr, _, _, conv_id = pair(client)
    with connect(client, hr) as tab1, connect(client, hr) as tab2:
        send(client, ha, conv_id, "both")
        assert next_of_type(tab1, "message.new")["message"]["body"] == "both"
        assert next_of_type(tab2, "message.new")["message"]["body"] == "both"


def test_new_group_reaches_its_members_live(client):
    ha, hr, _, rohan, _ = pair(client)
    with connect(client, hr) as rohan_ws:
        client.post("/api/conversations/group", headers=ha,
                    json={"name": "Trip", "member_ids": [rohan["id"]]})
        conv = next_of_type(rohan_ws, "conversation.new")["conversation"]
        assert conv["name"] == "Trip" and conv["last_message"]["type"] == "system"


def test_profile_change_reaches_chat_partners(client):
    ha, hr, asha, _, conv_id = pair(client)
    send(client, ha, conv_id)
    with connect(client, hr) as rohan_ws:
        client.patch("/api/users/me", headers=ha, json={"display_name": "Asha K"})
        updated = next_of_type(rohan_ws, "user.updated")["user"]
        assert updated["id"] == asha["id"] and updated["display_name"] == "Asha K"
