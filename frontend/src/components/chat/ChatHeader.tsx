"use client";

import { ArrowLeft, Info, Phone, Search, Timer, Video } from "lucide-react";

import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { selectConversation } from "@/lib/actions";
import { DISAPPEARING_OPTIONS } from "@/lib/constants";
import { conversationTitle, displayName, lastSeen, otherMember } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { Conversation } from "@/lib/types";
import { typingUserIds, usePresence } from "@/store/presence";
import { useUi } from "@/store/ui";

type Props = { conversation: Conversation; meId: number };

export function ChatHeader({ conversation, meId }: Props) {
  const users = usePresence((state) => state.users);
  const typing = usePresence((state) => state.typing);
  const detailsOpen = useUi((state) => state.detailsOpen);
  const setDetailsOpen = useUi((state) => state.setDetailsOpen);
  const toast = useUi((state) => state.toast);
  const focusSearch = useUi((state) => state.focusSearch);
  const now = useNow();

  const isGroup = conversation.type === "group";
  const stored = otherMember(conversation, meId);
  const other = stored ? (users[stored.id] ?? stored) : null;
  const typingIds = typingUserIds(typing, conversation.id).filter((id) => id !== meId);

  const timer = DISAPPEARING_OPTIONS.find(
    (option) => option.seconds !== null && option.seconds === conversation.disappearing_seconds,
  );

  let subtitle: string;
  if (typingIds.length > 0) {
    subtitle = !isGroup
      ? "typing…"
      : typingIds.length > 1
        ? "Several people are typing…"
        : `${displayName(users[typingIds[0]]).split(" ")[0]} is typing…`;
  } else if (isGroup) {
    const count = conversation.members.length;
    subtitle = `${count} member${count === 1 ? "" : "s"}`;
  } else {
    subtitle = other?.is_online ? "Online" : lastSeen(other?.last_seen_at ?? null, now);
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-4 max-md:px-2">
      <IconButton label="Back to chats" className="md:hidden" onClick={() => selectConversation(null)}>
        <ArrowLeft size={20} />
      </IconButton>
      <button
        type="button"
        onClick={() => setDetailsOpen(!detailsOpen)}
        className="-ml-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-hover"
      >
        {isGroup ? (
          <Avatar name={conversation.name} color={conversation.avatar_color} size={36} />
        ) : (
          <UserAvatar user={other} size={36} showOnline ringClass="border-bg" />
        )}
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold leading-5">
            {conversationTitle(conversation, meId, users)}
          </span>
          <span className={`flex items-center gap-1 truncate text-xs ${typingIds.length ? "text-accent" : "text-fg-2"}`}>
            <span className="truncate">{subtitle}</span>
            {timer && (
              <span
                className="flex shrink-0 items-center gap-0.5 text-fg-2"
                title={`Disappearing messages: ${timer.label}`}
              >
                · <Timer size={12} /> {timer.short}
              </span>
            )}
          </span>
        </span>
      </button>

      <IconButton label="Video call" onClick={() => toast("Video calls are coming soon")}>
        <Video size={20} />
      </IconButton>
      <IconButton label="Voice call" onClick={() => toast("Voice calls are coming soon")}>
        <Phone size={18} />
      </IconButton>
      <IconButton label="Search" className="max-md:hidden" onClick={focusSearch}>
        <Search size={18} />
      </IconButton>
      <IconButton
        label={isGroup ? "Group details" : "Contact details"}
        active={detailsOpen}
        onClick={() => setDetailsOpen(!detailsOpen)}
      >
        <Info size={19} />
      </IconButton>
    </header>
  );
}
