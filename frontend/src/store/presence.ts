import { create } from "zustand";

import { TYPING_EXPIRY_MS } from "@/lib/constants";
import type { User } from "@/lib/types";

type PresenceState = {
  /** Every user we have seen, by id. The single source for names, avatars
   * and online state, so one update reaches every place a user is shown. */
  users: Record<number, User>;
  /** conversation id -> user id -> time the typing indicator expires. */
  typing: Record<number, Record<number, number>>;
  upsertUsers: (users: User[]) => void;
  setPresence: (userId: number, isOnline: boolean, lastSeenAt: string | null) => void;
  setTyping: (conversationId: number, userId: number, isTyping: boolean) => void;
  reset: () => void;
};

export const usePresence = create<PresenceState>((set, get) => ({
  users: {},
  typing: {},

  upsertUsers: (incoming) => {
    if (incoming.length === 0) return;
    set((state) => {
      const users = { ...state.users };
      for (const user of incoming) users[user.id] = user;
      return { users };
    });
  },

  setPresence: (userId, isOnline, lastSeenAt) =>
    set((state) => {
      const user = state.users[userId];
      if (!user) return state;
      return {
        users: { ...state.users, [userId]: { ...user, is_online: isOnline, last_seen_at: lastSeenAt } },
      };
    }),

  setTyping: (conversationId, userId, isTyping) => {
    const expiresAt = Date.now() + TYPING_EXPIRY_MS;
    set((state) => {
      const inConversation = { ...state.typing[conversationId] };
      if (isTyping) inConversation[userId] = expiresAt;
      else delete inConversation[userId];
      return { typing: { ...state.typing, [conversationId]: inConversation } };
    });
    if (!isTyping) return;
    // If "stopped typing" never arrives, the indicator still goes away.
    setTimeout(() => {
      if (get().typing[conversationId]?.[userId] === expiresAt) {
        get().setTyping(conversationId, userId, false);
      }
    }, TYPING_EXPIRY_MS);
  },

  reset: () => set({ users: {}, typing: {} }),
}));

const NOBODY: number[] = [];

/** Ids of the people typing in a conversation right now. */
export function typingUserIds(
  typing: PresenceState["typing"],
  conversationId: number,
): number[] {
  const entries = typing[conversationId];
  if (!entries) return NOBODY;
  const ids = Object.keys(entries).map(Number);
  return ids.length ? ids : NOBODY;
}
