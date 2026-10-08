import type { ServerEvent } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { useContacts } from "@/store/contacts";
import { leaving, useConversations } from "@/store/conversations";
import { useMessages } from "@/store/messages";
import { usePresence } from "@/store/presence";
import { useUi } from "@/store/ui";

/** The one place socket events enter the app. Each event is routed to the
 * same store action a REST response would use, so there is a single code
 * path for "a message arrived", "a status changed" and so on. */
export function handleServerEvent(event: ServerEvent): void {
  switch (event.type) {
    case "message.new":
      useMessages.getState().applyNew(event.data.message);
      break;

    case "message.status":
      useMessages
        .getState()
        .applyStatus(event.data.conversation_id, event.data.message_ids, event.data.status);
      break;

    case "message.reaction":
      useMessages
        .getState()
        .applyReactions(event.data.conversation_id, event.data.message_id, event.data.reactions);
      break;

    case "conversation.new":
      useConversations.getState().upsert(event.data.conversation);
      break;

    case "conversation.updated":
      // The broadcast is the same for every member, so it cannot carry our
      // own unread count.
      useConversations.getState().upsert(event.data.conversation, { keepUnread: true });
      break;

    case "conversation.removed": {
      const conversations = useConversations.getState();
      const removed = conversations.byId[event.data.conversation_id];
      if (leaving.delete(event.data.conversation_id) || !removed) break;
      conversations.remove(removed.id);
      useUi.getState().toast(`You are no longer in ${removed.name ?? "the group"}`);
      break;
    }

    case "conversation.read":
      // Another tab of ours read the chat.
      useConversations.getState().patch(event.data.conversation_id, { unread_count: 0 });
      break;

    case "typing":
      usePresence
        .getState()
        .setTyping(event.data.conversation_id, event.data.user_id, event.data.is_typing);
      break;

    case "presence":
      usePresence
        .getState()
        .setPresence(event.data.user_id, event.data.is_online, event.data.last_seen_at);
      break;

    case "user.updated": {
      const { user } = event.data;
      usePresence.getState().upsertUsers([user]);
      if (useAuth.getState().user?.id === user.id) useAuth.getState().setUser(user);
      break;
    }

    case "pong":
      break;
  }
}

/** Forget everything about the signed-in user (logout or expired session). */
export function resetStores(): void {
  useConversations.getState().reset();
  useContacts.getState().reset();
  useMessages.getState().reset();
  usePresence.getState().reset();
  useUi.getState().reset();
}
