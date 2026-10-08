"use client";

import { memo, type CSSProperties } from "react";

import { StatusIcon } from "@/components/chat/StatusIcon";
import { Avatar } from "@/components/ui/Avatar";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { listTimestamp, otherMember } from "@/lib/format";
import type { Conversation } from "@/lib/types";

type Props = {
  conversation: Conversation;
  meId: number;
  title: string;
  preview: string;
  /** e.g. "typing…" or "Rohan is typing…"; replaces the preview when set. */
  typingText: string | null;
  active: boolean;
  now: number;
  onSelect: (id: number) => void;
};

export const ConversationRow = memo(function ConversationRow({
  conversation, meId, title, preview, typingText, active, now, onSelect,
}: Props) {
  const last = conversation.last_message;
  const unread = conversation.unread_count;
  const other = otherMember(conversation, meId);
  const showStatus = !typingText && last?.type === "text" && last.sender_id === meId && last.status;

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      aria-current={active ? "true" : undefined}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${active ? "bg-selected" : "hover:bg-hover"}`}
    >
      {conversation.type === "group" ? (
        <Avatar name={conversation.name} color={conversation.avatar_color} size={48} />
      ) : (
        <UserAvatar user={other} size={48} showOnline ringClass={active ? "border-selected" : "border-pane"} />
      )}

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={`min-w-0 flex-1 truncate text-sm ${unread ? "font-semibold" : "font-medium"}`}>
            {title}
          </span>
          <span className={`shrink-0 text-xs ${unread ? "font-medium text-fg" : "text-fg-2"}`}>
            {last ? listTimestamp(conversation.last_message_at, now) : ""}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <span
            className={`min-w-0 flex-1 truncate text-[13px] ${typingText ? "italic text-accent" : unread ? "font-medium text-fg" : "text-fg-2"}`}
          >
            {typingText ?? preview}
          </span>
          {showStatus && (
            <span
              className="shrink-0 text-fg-2"
              style={{ "--status-gap": active ? "var(--selected)" : "var(--pane)" } as CSSProperties}
            >
              <StatusIcon status={last.status!} />
            </span>
          )}
          {unread > 0 && (
            <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </span>
      </span>
    </button>
  );
});
