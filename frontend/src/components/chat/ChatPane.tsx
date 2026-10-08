"use client";

import { useEffect, useMemo, useRef } from "react";

import { ChatHeader } from "@/components/chat/ChatHeader";
import { Composer } from "@/components/chat/Composer";
import { MessageList } from "@/components/chat/MessageList";
import { DetailsPanel } from "@/components/dialogs/DetailsPanel";
import { api, errorMessage } from "@/lib/api";
import { useWindowFocused } from "@/lib/hooks";
import type { Conversation } from "@/lib/types";
import { useConversations } from "@/store/conversations";
import { useMessages } from "@/store/messages";
import { usePresence } from "@/store/presence";
import { useUi } from "@/store/ui";

type Props = { conversation: Conversation; meId: number };

/** One open conversation: header, messages, composer and the details
 * panel. The page keys this by conversation id, so every chat gets a fresh
 * instance. */
export function ChatPane({ conversation, meId }: Props) {
  const id = conversation.id;
  const messages = useMessages((state) => state.byConversation[id]);
  const users = usePresence((state) => state.users);
  const detailsOpen = useUi((state) => state.detailsOpen);
  const focused = useWindowFocused();
  const markedUpTo = useRef(0);

  useEffect(() => {
    useMessages
      .getState()
      .loadLatest(id)
      .catch((error) => useUi.getState().toast(errorMessage(error), "error"));
    // The divider belongs to this visit; next time it is worked out afresh.
    return () => useMessages.getState().clearUnreadDivider(id);
  }, [id]);

  const newestFromOthers = useMemo(() => {
    if (!messages) return 0;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.id > 0 && message.sender_id !== meId) return message.id;
    }
    return 0;
  }, [messages, meId]);

  // Tell the server what has been read, but only while this tab is really
  // being looked at, so receipts are honest.
  useEffect(() => {
    if (!focused || newestFromOthers <= markedUpTo.current) return;
    const previous = markedUpTo.current;
    markedUpTo.current = newestFromOthers;
    useConversations.getState().patch(id, { unread_count: 0 });
    api.post(`/api/conversations/${id}/read`, { message_id: newestFromOthers }).catch(() => {
      markedUpTo.current = previous; // try again on the next change
    });
  }, [focused, newestFromOthers, id]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col bg-bg">
        <ChatHeader conversation={conversation} meId={meId} />
        <MessageList conversation={conversation} meId={meId} />
        <Composer conversationId={id} meId={meId} users={users} />
      </section>
      {detailsOpen && <DetailsPanel conversation={conversation} meId={meId} />}
    </div>
  );
}
