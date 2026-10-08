import { create } from "zustand";

import { api } from "@/lib/api";
import type { Message, MessagePage, MessageStatus, ReactionGroup } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { useConversations } from "@/store/conversations";

type MessagesState = {
  /** Oldest first. Messages still being sent sit at the end with negative ids. */
  byConversation: Record<number, Message[]>;
  hasMore: Record<number, boolean>;
  /** Where the "unread messages" divider goes; fixed when a chat is opened. */
  firstUnread: Record<number, number | null>;
  loadLatest: (conversationId: number) => Promise<void>;
  loadOlder: (conversationId: number) => Promise<boolean>;
  send: (conversationId: number, body: string, replyTo?: Message | null) => void;
  retry: (conversationId: number, clientId: string) => void;
  applyNew: (message: Message) => void;
  applyStatus: (conversationId: number, messageIds: number[], status: MessageStatus) => void;
  applyReactions: (conversationId: number, messageId: number, reactions: ReactionGroup[]) => void;
  clearUnreadDivider: (conversationId: number) => void;
  reset: () => void;
};

const STATUS_RANK: Record<MessageStatus, number> = {
  failed: 0, sending: 1, sent: 2, delivered: 3, read: 4,
};

/** A status only ever moves forward; a late "delivered" must not undo "read". */
function later(current: MessageStatus | null, next: MessageStatus | null): MessageStatus | null {
  if (!current || !next) return next ?? current;
  return STATUS_RANK[next] >= STATUS_RANK[current] ? next : current;
}

let temporaryId = 0;

/** Saved messages by id, then unsent ones in the order they were written. */
function sorted(messages: Message[]): Message[] {
  const position = (message: Message) =>
    message.id > 0 ? message.id : Number.MAX_SAFE_INTEGER + message.id;
  return [...messages].sort((a, b) => position(a) - position(b));
}

/** Merge a page from the server with what is on screen, keeping unsent messages. */
function merge(existing: Message[], incoming: Message[]): Message[] {
  const byKey = new Map<string, Message>();
  for (const message of [...existing, ...incoming]) {
    const key = message.client_id ?? `id-${message.id}`;
    const previous = byKey.get(key);
    // The server's copy replaces an optimistic one with the same client_id.
    if (!previous || message.id > 0) byKey.set(key, message);
  }
  return sorted([...byKey.values()]);
}

function firstUnreadId(messages: Message[], unreadCount: number, meId: number): number | null {
  if (unreadCount <= 0) return null;
  const fromOthers = messages.filter((m) => m.type === "text" && m.sender_id !== meId);
  return fromOthers[Math.max(0, fromOthers.length - unreadCount)]?.id ?? null;
}

function isBeingViewed(conversationId: number): boolean {
  return (
    useConversations.getState().activeId === conversationId &&
    document.visibilityState === "visible" &&
    document.hasFocus()
  );
}

export const useMessages = create<MessagesState>((set, get) => {
  const replace = (conversationId: number, update: (messages: Message[]) => Message[]) =>
    set((state) => ({
      byConversation: {
        ...state.byConversation,
        [conversationId]: update(state.byConversation[conversationId] ?? []),
      },
    }));

  const post = async (conversationId: number, message: Message) => {
    try {
      const saved = await api.post<Message>(`/api/conversations/${conversationId}/messages`, {
        body: message.body,
        client_id: message.client_id,
        reply_to_id: message.reply_to?.id ?? null,
      });
      get().applyNew(saved);
    } catch {
      replace(conversationId, (messages) =>
        messages.map((m) => (m.client_id === message.client_id ? { ...m, status: "failed" } : m)),
      );
    }
  };

  return {
    byConversation: {},
    hasMore: {},
    firstUnread: {},

    loadLatest: async (conversationId) => {
      // Read before the request: opening a chat marks it read soon after, and
      // the divider must reflect what was unread at the moment of opening.
      const unread = useConversations.getState().byId[conversationId]?.unread_count ?? 0;
      const meId = useAuth.getState().user?.id ?? -1;
      const page = await api.get<MessagePage>(`/api/conversations/${conversationId}/messages`);
      set((state) => {
        const existing = state.byConversation[conversationId];
        const merged = merge(existing ?? [], page.messages);
        return {
          byConversation: { ...state.byConversation, [conversationId]: merged },
          // Older pages already loaded stay loaded, so keep what we knew.
          hasMore:
            existing === undefined
              ? { ...state.hasMore, [conversationId]: page.has_more }
              : state.hasMore,
          firstUnread:
            unread > 0
              ? { ...state.firstUnread, [conversationId]: firstUnreadId(merged, unread, meId) }
              : state.firstUnread,
        };
      });
    },

    loadOlder: async (conversationId) => {
      const current = get().byConversation[conversationId] ?? [];
      const oldest = current.find((message) => message.id > 0);
      if (!oldest || !get().hasMore[conversationId]) return false;
      const page = await api.get<MessagePage>(
        `/api/conversations/${conversationId}/messages?before=${oldest.id}`,
      );
      replace(conversationId, (messages) => merge(messages, page.messages));
      set((state) => ({ hasMore: { ...state.hasMore, [conversationId]: page.has_more } }));
      return page.messages.length > 0;
    },

    send: (conversationId, body, replyTo) => {
      const me = useAuth.getState().user;
      if (!me) return;
      // Shown immediately as "sending"; the server's copy replaces it by client_id.
      const optimistic: Message = {
        id: --temporaryId,
        conversation_id: conversationId,
        sender_id: me.id,
        type: "text",
        body,
        client_id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        status: "sending",
        reply_to: replyTo
          ? { id: replyTo.id, sender_id: replyTo.sender_id, body: replyTo.body.slice(0, 200) }
          : null,
        reactions: [],
      };
      replace(conversationId, (messages) => [...messages, optimistic]);
      get().clearUnreadDivider(conversationId);
      useConversations.getState().patch(conversationId, {
        last_message: optimistic,
        last_message_at: optimistic.created_at,
        unread_count: 0,
      });
      void post(conversationId, optimistic);
    },

    retry: (conversationId, clientId) => {
      const failed = get().byConversation[conversationId]?.find((m) => m.client_id === clientId);
      if (!failed) return;
      replace(conversationId, (messages) =>
        messages.map((m) => (m.client_id === clientId ? { ...m, status: "sending" } : m)),
      );
      // Same client_id, so the server cannot store it twice.
      void post(conversationId, failed);
    },

    applyNew: (message) => {
      const conversationId = message.conversation_id;
      const meId = useAuth.getState().user?.id ?? -1;
      const conversations = useConversations.getState();
      const conversation = conversations.byId[conversationId];

      if (!conversation) {
        // First message of a chat we have not loaded: fetch it, with this
        // message already counted in its unread total.
        void conversations.ensure(conversationId);
        return;
      }

      const loaded = get().byConversation[conversationId] !== undefined;
      let alreadyHad = false;
      if (loaded) {
        replace(conversationId, (messages) => {
          const index = messages.findIndex(
            (m) => m.id === message.id || (!!m.client_id && m.client_id === message.client_id && m.sender_id === message.sender_id),
          );
          if (index === -1) return sorted([...messages, message]);
          alreadyHad = messages[index].id > 0;
          const next = [...messages];
          next[index] = { ...message, status: later(messages[index].status, message.status) };
          return sorted(next);
        });
      } else {
        alreadyHad = conversation.last_message?.id === message.id;
      }

      const isNewest = !conversation.last_message || conversation.last_message.id <= message.id;
      const countsAsUnread =
        !alreadyHad && message.type === "text" && message.sender_id !== meId &&
        !isBeingViewed(conversationId);
      conversations.patch(conversationId, {
        ...(isNewest ? { last_message: message, last_message_at: message.created_at } : {}),
        unread_count: conversation.unread_count + (countsAsUnread ? 1 : 0),
      });
    },

    applyStatus: (conversationId, messageIds, status) => {
      const ids = new Set(messageIds);
      replace(conversationId, (messages) =>
        messages.map((m) => (ids.has(m.id) ? { ...m, status: later(m.status, status) } : m)),
      );
      const conversations = useConversations.getState();
      const last = conversations.byId[conversationId]?.last_message;
      if (last && ids.has(last.id)) {
        conversations.patch(conversationId, {
          last_message: { ...last, status: later(last.status, status) },
        });
      }
    },

    applyReactions: (conversationId, messageId, reactions) =>
      replace(conversationId, (messages) =>
        messages.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
      ),

    clearUnreadDivider: (conversationId) =>
      set((state) =>
        state.firstUnread[conversationId]
          ? { firstUnread: { ...state.firstUnread, [conversationId]: null } }
          : state,
      ),

    reset: () => set({ byConversation: {}, hasMore: {}, firstUnread: {} }),
  };
});
