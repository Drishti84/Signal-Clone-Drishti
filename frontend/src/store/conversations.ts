import { create } from "zustand";

import { api } from "@/lib/api";
import type { Conversation } from "@/lib/types";
import { usePresence } from "@/store/presence";

type ConversationsState = {
  byId: Record<number, Conversation>;
  activeId: number | null;
  loaded: boolean;
  load: () => Promise<void>;
  /** Add or replace. `keepUnread` keeps our own unread count, for broadcasts
   * that cannot know it. */
  upsert: (conversation: Conversation, options?: { keepUnread?: boolean }) => void;
  patch: (id: number, changes: Partial<Conversation>) => void;
  remove: (id: number) => void;
  setActive: (id: number | null) => void;
  /** Fetch a conversation we have heard about but not loaded yet. */
  ensure: (id: number) => Promise<void>;
  reset: () => void;
};

const inFlight = new Map<number, Promise<void>>();

/** Groups we are leaving ourselves. The server still sends "removed" for
 * them, and that event must not be reported as someone removing us. */
export const leaving = new Set<number>();

function rememberUsers(conversations: Conversation[]) {
  usePresence.getState().upsertUsers(
    conversations.flatMap((conversation) => conversation.members.map((member) => member.user)),
  );
}

export const useConversations = create<ConversationsState>((set, get) => ({
  byId: {},
  activeId: null,
  loaded: false,

  load: async () => {
    const list = await api.get<Conversation[]>("/api/conversations");
    rememberUsers(list);
    set((state) => {
      const byId: Record<number, Conversation> = {};
      for (const conversation of list) byId[conversation.id] = conversation;
      // A chat opened but not yet written in is not in the server's list for
      // the other side, but we still want to keep showing the one we have open.
      const active = state.activeId !== null ? state.byId[state.activeId] : undefined;
      if (active && !byId[active.id]) byId[active.id] = active;
      return { byId, loaded: true };
    });
  },

  upsert: (conversation, options) => {
    rememberUsers([conversation]);
    set((state) => {
      const existing = state.byId[conversation.id];
      const unread_count =
        options?.keepUnread && existing ? existing.unread_count : conversation.unread_count;
      return { byId: { ...state.byId, [conversation.id]: { ...conversation, unread_count } } };
    });
  },

  patch: (id, changes) =>
    set((state) => {
      const existing = state.byId[id];
      if (!existing) return state;
      return { byId: { ...state.byId, [id]: { ...existing, ...changes } } };
    }),

  remove: (id) =>
    set((state) => {
      const byId = { ...state.byId };
      delete byId[id];
      return { byId, activeId: state.activeId === id ? null : state.activeId };
    }),

  setActive: (id) => set({ activeId: id }),

  ensure: (id) => {
    if (get().byId[id]) return Promise.resolve();
    let pending = inFlight.get(id);
    if (!pending) {
      pending = api
        .get<Conversation>(`/api/conversations/${id}`)
        .then((conversation) => get().upsert(conversation))
        .catch(() => undefined)
        .finally(() => inFlight.delete(id));
      inFlight.set(id, pending);
    }
    return pending;
  },

  reset: () => set({ byId: {}, activeId: null, loaded: false }),
}));

export function sortConversations(byId: Record<number, Conversation>): Conversation[] {
  return Object.values(byId).sort(
    (a, b) => b.last_message_at.localeCompare(a.last_message_at) || b.id - a.id,
  );
}
