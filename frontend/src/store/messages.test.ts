import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Conversation, Message, User } from "@/lib/types";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({ api, errorMessage: (error: unknown) => String(error) }));

import { useAuth } from "@/store/auth";
import { useConversations } from "@/store/conversations";
import { useMessages } from "@/store/messages";
import { useUi } from "@/store/ui";

const ME = 1;
const OTHER = 2;
const CHAT = 10;

const user = (id: number): User => ({
  id, phone: `+9190000000${id}`, display_name: `User ${id}`, about: null,
  avatar: { color: "A100", preset: null, image_url: null }, is_online: false, last_seen_at: null,
});

const message = (id: number, sender: number, extra: Partial<Message> = {}): Message => ({
  id, conversation_id: CHAT, sender_id: sender, type: "text", body: `m${id}`,
  client_id: `client-${id}`, created_at: new Date(2026, 0, 1, 10, id).toISOString(),
  status: "sent", deleted: false, expires_at: null, reply_to: null, reactions: [], ...extra,
});

const conversation = (extra: Partial<Conversation> = {}): Conversation => ({
  id: CHAT, type: "direct", name: null, avatar_color: null, created_by: ME,
  last_message_at: new Date(2026, 0, 1).toISOString(), disappearing_seconds: null,
  last_message: null, unread_count: 0,
  members: [ME, OTHER].map((id) => ({ user: user(id), role: "member", joined_at: "" })),
  ...extra,
});

/** Pretend the tab is (or is not) the one being looked at. */
function setWatching(watching: boolean) {
  vi.stubGlobal("document", {
    visibilityState: watching ? "visible" : "hidden",
    hasFocus: () => watching,
  });
}

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  useMessages.getState().reset();
  useConversations.getState().reset();
  useUi.setState({ view: "chats" });
  useAuth.setState({ token: "t", user: user(ME) });
  useConversations.getState().upsert(conversation());
  setWatching(true);
});

describe("loading history", () => {
  it("can still load older pages after an event arrived for a chat that was never opened", async () => {
    useMessages.getState().applyStatus(CHAT, [5], "read");
    api.get.mockResolvedValueOnce({ messages: [message(5, ME)], has_more: true });
    await useMessages.getState().loadLatest(CHAT);
    expect(useMessages.getState().hasMore[CHAT]).toBe(true);

    api.get.mockResolvedValueOnce({ messages: [message(4, OTHER)], has_more: false });
    expect(await useMessages.getState().loadOlder(CHAT)).toBe(true);
    expect(useMessages.getState().byConversation[CHAT].map((m) => m.id)).toEqual([4, 5]);
  });

  it("does not invent an empty history for a chat that was never opened", () => {
    useMessages.getState().applyReactions(CHAT, 5, [{ emoji: "👍", user_ids: [OTHER] }]);
    expect(useMessages.getState().byConversation[CHAT]).toBeUndefined();
  });
});

describe("unread counting", () => {
  it("counts a message that arrives while the open chat is hidden behind another tab view", () => {
    useConversations.getState().setActive(CHAT);
    useUi.setState({ view: "calls" });
    useMessages.getState().applyNew(message(7, OTHER));
    expect(useConversations.getState().byId[CHAT].unread_count).toBe(1);
  });

  it("does not count a message that arrives in the chat being looked at", () => {
    useConversations.getState().setActive(CHAT);
    useMessages.getState().applyNew(message(7, OTHER));
    expect(useConversations.getState().byId[CHAT].unread_count).toBe(0);
  });

  it("does not count the same message twice", () => {
    useMessages.getState().applyNew(message(7, OTHER));
    useMessages.getState().applyNew(message(7, OTHER));
    expect(useConversations.getState().byId[CHAT].unread_count).toBe(1);
  });
});

describe("sending", () => {
  it("replaces the optimistic bubble with the saved message instead of adding a second one", async () => {
    api.get.mockResolvedValueOnce({ messages: [], has_more: false });
    await useMessages.getState().loadLatest(CHAT);
    api.post.mockImplementationOnce(async (_path: string, body: { client_id: string }) =>
      message(20, ME, { client_id: body.client_id, status: "delivered" }));
    useMessages.getState().send(CHAT, "hello");
    expect(useMessages.getState().byConversation[CHAT][0].status).toBe("sending");
    await vi.waitFor(() => expect(useMessages.getState().byConversation[CHAT][0].id).toBe(20));
    expect(useMessages.getState().byConversation[CHAT]).toHaveLength(1);
    expect(useMessages.getState().byConversation[CHAT][0].status).toBe("delivered");
  });

  it("does not mark a message as failed once the socket has confirmed it was saved", async () => {
    api.get.mockResolvedValueOnce({ messages: [], has_more: false });
    await useMessages.getState().loadLatest(CHAT);
    let failRequest: (reason: Error) => void = () => undefined;
    api.post.mockImplementationOnce(() => new Promise((_resolve, reject) => { failRequest = reject; }));
    useMessages.getState().send(CHAT, "hello");
    const clientId = useMessages.getState().byConversation[CHAT][0].client_id;
    // The socket echo lands first, then the HTTP response is lost.
    useMessages.getState().applyNew(message(21, ME, { client_id: clientId }));
    failRequest(new Error("network"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const saved = useMessages.getState().byConversation[CHAT][0];
    expect(saved.id).toBe(21);
    expect(saved.status).toBe("sent");
  });

  it("never lets a late status move a message backwards", async () => {
    api.get.mockResolvedValueOnce({ messages: [message(5, ME, { status: "read" })], has_more: false });
    await useMessages.getState().loadLatest(CHAT);
    useMessages.getState().applyStatus(CHAT, [5], "delivered");
    expect(useMessages.getState().byConversation[CHAT][0].status).toBe("read");
  });
});

describe("deleting and expiring", () => {
  it("turns a deleted message into a tombstone in place", async () => {
    api.get.mockResolvedValueOnce({ messages: [message(5, OTHER), message(6, OTHER)], has_more: false });
    await useMessages.getState().loadLatest(CHAT);
    useConversations.getState().patch(CHAT, { last_message: message(6, OTHER) });
    useMessages.getState().applyUpdated(message(6, OTHER, { body: "", deleted: true }));
    const list = useMessages.getState().byConversation[CHAT];
    expect(list.map((m) => m.id)).toEqual([5, 6]);
    expect(list[1].deleted).toBe(true);
    expect(useConversations.getState().byId[CHAT].last_message?.deleted).toBe(true);
  });

  it("removes expired messages and refreshes the chat row when the newest one went", async () => {
    api.get.mockResolvedValueOnce({ messages: [message(5, OTHER), message(6, OTHER)], has_more: false });
    await useMessages.getState().loadLatest(CHAT);
    useConversations.getState().patch(CHAT, { last_message: message(6, OTHER) });
    api.get.mockResolvedValueOnce(conversation({ last_message: message(5, OTHER) }));
    useMessages.getState().applyExpired(CHAT, [6]);
    expect(useMessages.getState().byConversation[CHAT].map((m) => m.id)).toEqual([5]);
    await vi.waitFor(() => expect(useConversations.getState().byId[CHAT].last_message?.id).toBe(5));
    expect(api.get).toHaveBeenLastCalledWith(`/api/conversations/${CHAT}`);
  });

  it("gives a message sent while a timer is on an expiry straight away", async () => {
    useConversations.getState().patch(CHAT, { disappearing_seconds: 30 });
    api.get.mockResolvedValueOnce({ messages: [], has_more: false });
    await useMessages.getState().loadLatest(CHAT);
    api.post.mockImplementationOnce(() => new Promise(() => undefined));
    useMessages.getState().send(CHAT, "soon gone");
    expect(useMessages.getState().byConversation[CHAT][0].expires_at).toEqual(expect.any(String));
  });
});
