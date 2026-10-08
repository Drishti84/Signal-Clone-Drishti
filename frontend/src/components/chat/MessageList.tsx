"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  DateDivider, EncryptionNotice, SystemMessage, TypingBubble, UnreadDivider,
} from "@/components/chat/Dividers";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { Spinner } from "@/components/ui/Spinner";
import { buildRows } from "@/lib/grouping";
import { useNow } from "@/lib/hooks";
import type { Conversation } from "@/lib/types";
import { useMessages } from "@/store/messages";
import { typingUserIds, usePresence } from "@/store/presence";
import { useUi } from "@/store/ui";

const STICK_WITHIN_PX = 120; // this close to the bottom, new messages keep us there
const LOAD_OLDER_WITHIN_PX = 120;
const SHOW_JUMP_BEYOND_PX = 400;
const MAX_JUMP_PAGES = 5;

type Props = { conversation: Conversation; meId: number };

/** The scrolling message area. Mounted once per conversation (the parent
 * keys it by id), so its scroll bookkeeping starts fresh for each chat. */
export function MessageList({ conversation, meId }: Props) {
  const id = conversation.id;
  const messages = useMessages((state) => state.byConversation[id]);
  const hasMore = useMessages((state) => state.hasMore[id] ?? false);
  const firstUnread = useMessages((state) => state.firstUnread[id] ?? null);
  const users = usePresence((state) => state.users);
  const typing = usePresence((state) => state.typing);
  const jumpTo = useUi((state) => state.jumpTo);
  const now = useNow(60_000);

  const scroller = useRef<HTMLDivElement>(null);
  const positioned = useRef(false);
  const dividerShown = useRef(false);
  const firstIdSeen = useRef<number | undefined>(undefined);
  const stick = useRef(true);
  const heightBeforeOlder = useRef<number | null>(null);
  const loadingOlder = useRef(false);
  const lastKeySeen = useRef<string | number | undefined>(undefined);
  const [showJump, setShowJump] = useState(false);

  const rows = useMemo(() => buildRows(messages ?? [], firstUnread, now), [messages, firstUnread, now]);
  const someoneTyping = typingUserIds(typing, id).some((userId) => userId !== meId);
  const last = messages?.[messages.length - 1];
  const lastKey = last ? (last.client_id ?? last.id) : undefined;
  const lastIsMine = last?.sender_id === meId;

  // Keep the scroll position sensible whenever the list changes.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || !messages) return;

    const firstId = messages[0]?.id;
    const divider = element.querySelector<HTMLElement>("[data-unread-divider]");
    // The divider can arrive a moment after the cached messages do.
    const dividerJustAppeared = !!divider && !dividerShown.current;
    dividerShown.current = !!divider;

    if (!positioned.current || dividerJustAppeared) {
      // Opening the chat: start at the unread divider, or at the newest message.
      positioned.current = true;
      if (divider) {
        element.scrollTop = Math.max(0, divider.offsetTop - 80);
        stick.current = false;
      } else {
        element.scrollTop = element.scrollHeight;
      }
    } else if (heightBeforeOlder.current !== null && firstId !== firstIdSeen.current) {
      // An older page was added above: hold the visible messages in place.
      element.scrollTop += element.scrollHeight - heightBeforeOlder.current;
      heightBeforeOlder.current = null;
    } else if (stick.current || (lastIsMine && lastKey !== lastKeySeen.current)) {
      element.scrollTop = element.scrollHeight;
    }
    lastKeySeen.current = lastKey;
    firstIdSeen.current = firstId;
  }, [messages, lastKey, lastIsMine, someoneTyping, firstUnread]);

  const onScroll = () => {
    const element = scroller.current;
    if (!element) return;
    const fromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    stick.current = fromBottom < STICK_WITHIN_PX;
    setShowJump(fromBottom > SHOW_JUMP_BEYOND_PX);

    if (element.scrollTop < LOAD_OLDER_WITHIN_PX && hasMore && !loadingOlder.current) {
      loadingOlder.current = true;
      heightBeforeOlder.current = element.scrollHeight;
      useMessages
        .getState()
        .loadOlder(id)
        .catch(() => {
          heightBeforeOlder.current = null;
        })
        .finally(() => {
          loadingOlder.current = false;
        });
    }
  };

  // Jump to a quoted message, loading older pages until it is found.
  useEffect(() => {
    if (!jumpTo) return;
    let cancelled = false;
    const find = () =>
      scroller.current?.querySelector<HTMLElement>(`[data-message-id="${jumpTo.messageId}"]`);

    void (async () => {
      for (let page = 0; page <= MAX_JUMP_PAGES; page += 1) {
        const target = find();
        if (target) {
          target.scrollIntoView({ block: "center", behavior: "smooth" });
          target.classList.remove("animate-flash");
          void target.offsetWidth; // restart the animation if it is already there
          target.classList.add("animate-flash");
          return;
        }
        const loadedMore = await useMessages.getState().loadOlder(id).catch(() => false);
        if (cancelled) return;
        if (!loadedMore) break;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      if (!cancelled) useUi.getState().toast("Original message not found");
    })();

    return () => {
      cancelled = true;
    };
  }, [jumpTo, id]);

  const scrollToBottom = () => {
    const element = scroller.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  };

  if (!messages) {
    return <div className="flex flex-1 items-center justify-center text-fg-2"><Spinner /></div>;
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto px-5 pb-3 max-md:px-3">
        {hasMore ? (
          <div className="flex justify-center py-3 text-fg-2"><Spinner size={16} /></div>
        ) : (
          <EncryptionNotice />
        )}

        {rows.map((row) => {
          switch (row.kind) {
            case "day":
              return <DateDivider key={row.key} label={row.label} />;
            case "unread":
              return <UnreadDivider key={row.key} />;
            case "system":
              return <SystemMessage key={row.key} body={row.message.body} />;
            case "message":
              return (
                <MessageBubble
                  key={row.key}
                  message={row.message}
                  isFirst={row.isFirst}
                  isLast={row.isLast}
                  isMine={row.message.sender_id === meId}
                  isGroup={conversation.type === "group"}
                  meId={meId}
                  users={users}
                />
              );
          }
        })}

        {someoneTyping && <TypingBubble />}
      </div>

      {showJump && (
        <button
          type="button"
          aria-label="Scroll to newest messages"
          title="Scroll to newest messages"
          onClick={scrollToBottom}
          className="animate-pop-in absolute bottom-4 right-6 flex h-9 w-9 items-center justify-center rounded-full bg-surface shadow-pop ring-1 ring-border hover:bg-hover"
        >
          <ChevronDown size={20} />
        </button>
      )}
    </div>
  );
}
