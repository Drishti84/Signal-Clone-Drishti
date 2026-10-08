import { create } from "zustand";

import { api } from "@/lib/api";
import { rememberLocalUrl } from "@/lib/attachments";
import type {
  Attachment, Message, MessagePage, MessageStatus, ReactionGroup,
} from "@/lib/types";
import { useAuth } from "@/store/auth";
import { useConversations } from "@/store/conversations";
import { usePresence } from "@/store/presence";
import { useUi } from "@/store/ui";

/** A file to send with a message, with its pixel size if it is a picture. */
export type OutgoingFile = { file: File; width?: number; height?: number };

type MessagesState = {
  /** Oldest first. Messages still being sent sit at the end with negative ids. */
  byConversation: Record<number, Message[]>;
  hasMore: Record<number, boolean>;
  /** Where the "unread messages" divider goes; fixed when a chat is opened. */
  firstUnread: Record<number, number | null>;
  loadLatest: (conversationId: number) => Promise<void>;
  loadOlder: (conversationId: number) => Promise<boolean>;
  send: (
    conversationId: number,
    body: string,
    replyTo?: Message | null,
    attachment?: OutgoingFile,
  ) => void;
  /** Send several files, each as its own message, in the order given. */
  sendFiles: (
    conversationId: number,
    files: OutgoingFile[],
    caption: string,
    replyTo?: Message | null,
  ) => void;
  retry: (conversationId: number, clientId: string) => void;
  applyNew: (message: Message) => void;
  applyStatus: (conversationId: number, messageIds: number[], status: MessageStatus) => void;
  applyReactions: (conversationId: number, messageId: number, reactions: ReactionGroup[]) => void;
  /** A message changed in place (for now: it was deleted for everyone). */
  applyUpdated: (message: Message) => void;
  /** Disappearing messages whose time is up. */
  applyExpired: (conversationId: number, messageIds: number[]) => void;
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

// Files on their way out, by the message's client_id. The uploaded id is
// kept once the upload succeeds, so a retry of the message step does not
// send the file again.
const outgoing = new Map<string, OutgoingFile & { uploaded?: Attachment }>();

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
    useUi.getState().view === "chats" && // Calls and Stories hide the open chat
    document.visibilityState === "visible" &&
    document.hasFocus()
  );
}

export const useMessages = create<MessagesState>((set, get) => {
  /** Change a chat's loaded messages. A chat that has not been opened yet is
   * left alone (its history will come from the server when it is opened),
   * unless `create` says this change is what starts the list. */
  const replace = (
    conversationId: number,
    update: (messages: Message[]) => Message[],
    create = false,
  ) =>
    set((state) => {
      const current = state.byConversation[conversationId];
      if (current === undefined && !create) return state;
      return {
        byConversation: { ...state.byConversation, [conversationId]: update(current ?? []) },
      };
    });

  /** Messages can come from people who have since left the chat. */
  const rememberSenders = (messages: Message[]) =>
    usePresence.getState().ensureUsers(
      messages.flatMap((message) => [message.sender_id, message.reply_to?.sender_id ?? null]),
    );

  const post = async (conversationId: number, message: Message) => {
    const pending = message.client_id ? outgoing.get(message.client_id) : undefined;
    try {
      if (pending && !pending.uploaded) {
        // Step one: store the file. Step two below sends the message with it.
        const form = new FormData();
        form.append("file", pending.file, pending.file.name);
        if (pending.width) form.append("width", String(pending.width));
        if (pending.height) form.append("height", String(pending.height));
        pending.uploaded = await api.post<Attachment>(
          `/api/conversations/${conversationId}/attachments`, form,
        );
      }
      const saved = await api.post<Message>(`/api/conversations/${conversationId}/messages`, {
        body: message.body,
        client_id: message.client_id,
        reply_to_id: message.reply_to?.id ?? null,
        attachment_id: pending?.uploaded?.id ?? null,
      });
      if (saved.attachment && message.attachment?.local_url) {
        // Keep showing our own copy instead of downloading it back.
        rememberLocalUrl(saved.attachment.id, message.attachment.local_url);
      }
      if (message.client_id) outgoing.delete(message.client_id);
      get().applyNew(saved);
    } catch {
      // Only a bubble that is still unsaved has failed. If the socket already
      // delivered the saved copy, the message went through.
      const stillUnsaved = (m: Message) => m.client_id === message.client_id && m.id < 0;
      replace(conversationId, (messages) =>
        messages.map((m) => (stillUnsaved(m) ? { ...m, status: "failed" } : m)),
      );
      const conversations = useConversations.getState();
      const last = conversations.byId[conversationId]?.last_message;
      if (last && stillUnsaved(last)) {
        conversations.patch(conversationId, { last_message: { ...last, status: "failed" } });
      }
    }
  };

  /** Put a message on screen as "sending" and return it; nothing is sent yet. */
  const enqueue = (
    conversationId: number,
    body: string,
    replyTo?: Message | null,
    attachment?: OutgoingFile,
  ): Message | null => {
    const me = useAuth.getState().user;
    if (!me) return null;
    const clientId = crypto.randomUUID();
    if (attachment) outgoing.set(clientId, attachment);
    const timer = useConversations.getState().byId[conversationId]?.disappearing_seconds;
    // Shown immediately as "sending"; the server's copy replaces it by client_id.
    const optimistic: Message = {
      id: --temporaryId,
      conversation_id: conversationId,
      sender_id: me.id,
      type: "text",
      body,
      client_id: clientId,
      created_at: new Date().toISOString(),
      status: "sending",
      deleted: false,
      // Shown at once with its timer icon; the server sets the real time.
      expires_at: timer ? new Date(Date.now() + timer * 1000).toISOString() : null,
      reply_to: replyTo
        ? {
            id: replyTo.id,
            sender_id: replyTo.sender_id,
            body: replyTo.body.slice(0, 200),
            deleted: replyTo.deleted,
          }
        : null,
      reactions: [],
      attachment: attachment
        ? {
            id: temporaryId, // not saved yet; replaced by the server's copy
            filename: attachment.file.name,
            content_type: attachment.file.type,
            size: attachment.file.size,
            is_image: attachment.width !== undefined,
            width: attachment.width ?? null,
            height: attachment.height ?? null,
            local_url: URL.createObjectURL(attachment.file),
          }
        : null,
    };
    replace(conversationId, (messages) => [...messages, optimistic], true);
    get().clearUnreadDivider(conversationId);
    useConversations.getState().patch(conversationId, {
      last_message: optimistic,
      last_message_at: optimistic.created_at,
      unread_count: 0,
    });
    return optimistic;
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
            state.hasMore[conversationId] === undefined
              ? { ...state.hasMore, [conversationId]: page.has_more }
              : state.hasMore,
          firstUnread:
            unread > 0
              ? { ...state.firstUnread, [conversationId]: firstUnreadId(merged, unread, meId) }
              : state.firstUnread,
        };
      });
      rememberSenders(page.messages);
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
      rememberSenders(page.messages);
      return page.messages.length > 0;
    },

    send: (conversationId, body, replyTo, attachment) => {
      const message = enqueue(conversationId, body, replyTo, attachment);
      if (message) void post(conversationId, message);
    },

    sendFiles: (conversationId, files, caption, replyTo) => {
      // Every bubble appears straight away; the caption and the reply go
      // with the first file.
      const queued = files
        .map((file, index) =>
          enqueue(conversationId, index === 0 ? caption : "", index === 0 ? replyTo : null, file),
        )
        .filter((message): message is Message => message !== null);
      // Sent strictly one after another, so they arrive in the order they
      // were picked whatever their sizes. A failure does not stop the rest;
      // that bubble is marked "Not sent" and can be retried on its own.
      void (async () => {
        for (const message of queued) await post(conversationId, message);
      })();
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

      rememberSenders([message]);
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

    applyUpdated: (message) => {
      replace(message.conversation_id, (messages) =>
        messages.map((m) =>
          m.id === message.id ? { ...message, status: later(m.status, message.status) } : m,
        ),
      );
      const conversations = useConversations.getState();
      const last = conversations.byId[message.conversation_id]?.last_message;
      if (last?.id === message.id) {
        conversations.patch(message.conversation_id, { last_message: message });
      }
    },

    applyExpired: (conversationId, messageIds) => {
      const gone = new Set(messageIds);
      replace(conversationId, (messages) =>
        messages
          .filter((m) => !gone.has(m.id))
          // A reply to an expired message keeps its text but loses the quote.
          .map((m) => (m.reply_to && gone.has(m.reply_to.id) ? { ...m, reply_to: null } : m)),
      );
      const conversations = useConversations.getState();
      const conversation = conversations.byId[conversationId];
      if (!conversation) return;
      // The preview or the unread badge may have been about a message that
      // is gone now; the server knows what the chat looks like without it.
      const previewGone = !!conversation.last_message && gone.has(conversation.last_message.id);
      if (previewGone || conversation.unread_count > 0) {
        void conversations.refresh(conversationId).catch(() => undefined);
      }
    },

    clearUnreadDivider: (conversationId) =>
      set((state) =>
        state.firstUnread[conversationId]
          ? { firstUnread: { ...state.firstUnread, [conversationId]: null } }
          : state,
      ),

    reset: () => {
      outgoing.clear();
      set({ byConversation: {}, hasMore: {}, firstUnread: {} });
    },
  };
});
