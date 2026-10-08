"use client";

import { Ban, Copy, MoreHorizontal, Reply, Smile, Timer, Trash2 } from "lucide-react";
import { memo, useRef, useState, type CSSProperties } from "react";

import { StatusIcon } from "@/components/chat/StatusIcon";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { api, errorMessage } from "@/lib/api";
import { AVATAR_COLORS, REACTION_EMOJI } from "@/lib/constants";
import { bubbleTime, deletedText, displayName } from "@/lib/format";
import { useDismiss } from "@/lib/hooks";
import type { Message, ReactionGroup, User } from "@/lib/types";
import { useMessages } from "@/store/messages";
import { useUi } from "@/store/ui";

type Props = {
  message: Message;
  /** First / last bubble in a run from the same sender. */
  isFirst: boolean;
  isLast: boolean;
  isMine: boolean;
  isGroup: boolean;
  meId: number;
  users: Record<number, User>;
};

/** What the reactions look like after `meId` picks `emoji`: picking the
 * same emoji again removes it, a different one replaces it. Each person has
 * at most one reaction, so two chips on a message are two people. */
function toggled(reactions: ReactionGroup[], meId: number, emoji: string) {
  const had = reactions.find((group) => group.user_ids.includes(meId))?.emoji;
  const without = reactions
    .map((group) => ({ ...group, user_ids: group.user_ids.filter((id) => id !== meId) }))
    .filter((group) => group.user_ids.length > 0);
  if (had === emoji) return { next: without, removed: true };
  const target = without.find((group) => group.emoji === emoji);
  if (target) target.user_ids = [...target.user_ids, meId];
  else without.push({ emoji, user_ids: [meId] });
  return { next: without, removed: false };
}

export const MessageBubble = memo(function MessageBubble({
  message, isFirst, isLast, isMine, isGroup, meId, users,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const picker = useRef<HTMLDivElement>(null);
  const reacting = useRef(false);
  useDismiss(picker, pickerOpen, () => setPickerOpen(false));

  const sender = message.sender_id !== null ? users[message.sender_id] : undefined;
  const saved = message.id > 0;
  const deleted = message.deleted;
  const myReaction = message.reactions.find((group) => group.user_ids.includes(meId))?.emoji;
  const hasReactions = !deleted && message.reactions.length > 0;
  const showName = isGroup && !isMine && isFirst;
  const senderPalette = AVATAR_COLORS[sender?.avatar.color ?? ""] ?? AVATAR_COLORS.A100;

  const react = async (emoji: string) => {
    setPickerOpen(false);
    // One change at a time: two quick clicks would otherwise race each other
    // and the server could end up keeping the one clicked first.
    if (reacting.current) return;
    reacting.current = true;
    const { next, removed } = toggled(message.reactions, meId, emoji);
    const store = useMessages.getState();
    store.applyReactions(message.conversation_id, message.id, next); // show it right away
    try {
      const path = `/api/messages/${message.id}/reaction`;
      const updated = removed ? await api.del<Message>(path) : await api.put<Message>(path, { emoji });
      store.applyReactions(message.conversation_id, message.id, updated.reactions);
    } catch (error) {
      store.applyReactions(message.conversation_id, message.id, message.reactions);
      useUi.getState().toast(errorMessage(error), "error");
    } finally {
      reacting.current = false;
    }
  };

  const copy = () => {
    navigator.clipboard
      .writeText(message.body)
      .then(() => useUi.getState().toast("Copied"))
      .catch(() => useUi.getState().toast("Couldn't copy", "error"));
  };

  const deleteForEveryone = async () => {
    setConfirmingDelete(false);
    try {
      const tombstone = await api.del<Message>(`/api/messages/${message.id}`);
      useMessages.getState().applyUpdated(tombstone);
    } catch (error) {
      useUi.getState().toast(errorMessage(error), "error");
    }
  };

  const menuItems: MenuItem[] = [{ label: "Copy text", icon: <Copy size={15} />, onSelect: copy }];
  if (isMine) {
    menuItems.push({
      label: "Delete for everyone",
      icon: <Trash2 size={15} />,
      danger: true,
      onSelect: () => setConfirmingDelete(true),
    });
  }

  // The corners that touch the next bubble in the same run are tightened.
  const corners = isMine
    ? `${isFirst ? "rounded-tr-[18px]" : "rounded-tr-[4px]"} ${isLast ? "rounded-br-[18px]" : "rounded-br-[4px]"} rounded-l-[18px]`
    : `${isFirst ? "rounded-tl-[18px]" : "rounded-tl-[4px]"} ${isLast ? "rounded-bl-[18px]" : "rounded-bl-[4px]"} rounded-r-[18px]`;

  const quoted = message.reply_to;

  return (
    <div
      data-message-id={message.id}
      className={`group/message flex items-end gap-2 ${isMine ? "flex-row-reverse" : ""}`}
      style={{ marginTop: isFirst ? 12 : 2, marginBottom: hasReactions ? 16 : 0 }}
    >
      {isGroup && !isMine && (
        <span className="w-7 shrink-0">{isLast && <UserAvatar user={sender} size={28} />}</span>
      )}

      <div className="relative min-w-0 max-w-[min(62%,540px)] max-md:max-w-[78%]">
        <div
          className={`px-3 py-[7px] ${corners} ${isMine ? "bg-bubble-out text-white" : "bg-bubble-in text-fg"}`}
        >
          {showName && (
            <div
              className="sender-name mb-0.5 text-[13px] font-semibold"
              style={{ "--name-light": senderPalette.fg, "--name-dark": senderPalette.bg } as CSSProperties}
            >
              {displayName(sender)}
            </div>
          )}

          {quoted && !deleted && (
            <button
              type="button"
              onClick={() => useUi.getState().jumpToMessage(quoted.id)}
              className={`mb-1.5 block w-full rounded-lg border-l-4 px-2 py-1 text-left text-[13px] ${isMine ? "border-white bg-white/20" : "border-accent bg-quote-in"}`}
            >
              <span className="block font-semibold">
                {quoted.sender_id === meId
                  ? "You"
                  : displayName(quoted.sender_id !== null ? users[quoted.sender_id] : null)}
              </span>
              <span className={`line-clamp-2 opacity-90 [overflow-wrap:anywhere] ${quoted.deleted ? "italic" : ""}`}>
                {quoted.deleted ? "Deleted message" : quoted.body}
              </span>
            </button>
          )}

          <div className="flex flex-wrap items-end justify-end gap-x-2">
            {deleted ? (
              <span className="mr-auto flex min-w-0 items-center gap-1.5 italic opacity-80">
                <Ban size={14} className="shrink-0" /> {deletedText(isMine)}
              </span>
            ) : (
              <span className="mr-auto min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
                {message.body}
              </span>
            )}
            <span
              className={`flex shrink-0 translate-y-[2px] items-center gap-1 text-[11px] leading-4 ${isMine ? "text-white/80" : "text-fg-2"}`}
              style={{ "--status-gap": "var(--bubble-out)" } as CSSProperties}
            >
              {message.expires_at && !deleted && (
                <span title="Disappearing message" className="flex">
                  <Timer size={11} aria-label="Disappearing message" />
                </span>
              )}
              {bubbleTime(message.created_at)}
              {isMine && message.status && !deleted && <StatusIcon status={message.status} />}
            </span>
          </div>
        </div>

        {hasReactions && (
          <div className={`absolute -bottom-4 flex gap-1 ${isMine ? "right-2" : "left-2"}`}>
            {message.reactions.map((group) => {
              const mine = group.user_ids.includes(meId);
              const names = group.user_ids
                .map((id) => (id === meId ? "You" : displayName(users[id])))
                .join(", ");
              return (
                <button
                  key={group.emoji}
                  type="button"
                  onClick={() => void react(group.emoji)}
                  aria-label={`${group.emoji} from ${names}`}
                  title={`${names}${mine ? " (click to remove yours)" : " (click to react the same way)"}`}
                  className={`flex h-6 items-center gap-1 rounded-full border-2 border-bg px-1.5 text-[13px] leading-none ${mine ? "bg-accent/25 ring-1 ring-accent" : "bg-hover"}`}
                >
                  <span>{group.emoji}</span>
                  {group.user_ids.length > 1 && (
                    <span className="text-[11px] font-medium text-fg-2">{group.user_ids.length}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {message.status === "failed" && (
          <p className="mt-1 text-right text-xs text-danger">
            Not sent.{" "}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() =>
                message.client_id &&
                useMessages.getState().retry(message.conversation_id, message.client_id)
              }
            >
              Retry
            </button>
          </p>
        )}
      </div>

      {saved && !deleted && (
        <div
          ref={picker}
          className={`relative flex shrink-0 items-center gap-0.5 self-center transition-opacity focus-within:opacity-100 group-hover/message:opacity-100 ${pickerOpen ? "opacity-100" : "opacity-0"} ${isMine ? "flex-row-reverse" : ""}`}
        >
          <ActionButton label="React" onClick={() => setPickerOpen((open) => !open)}>
            <Smile size={17} />
          </ActionButton>
          <ActionButton label="Reply" onClick={() => useUi.getState().setReplyTo(message)}>
            <Reply size={17} />
          </ActionButton>
          <Menu
            align={isMine ? "right" : "left"}
            up
            trigger={(toggle) => (
              <ActionButton label="More" onClick={toggle}><MoreHorizontal size={17} /></ActionButton>
            )}
            items={menuItems}
          />

          {pickerOpen && (
            <div
              role="menu"
              aria-label="React"
              className={`animate-pop-in absolute bottom-full z-20 mb-1 flex gap-0.5 rounded-full bg-surface p-1 shadow-pop ring-1 ring-border ${isMine ? "right-0" : "left-0"}`}
            >
              {REACTION_EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  role="menuitem"
                  aria-label={`React with ${emoji}`}
                  onClick={() => void react(emoji)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-xl transition-transform hover:scale-125 ${myReaction === emoji ? "bg-selected" : ""}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete for everyone?"
          message="This message will be removed for everyone in the chat. They will see that a message was deleted."
          confirmLabel="Delete"
          danger
          onConfirm={() => void deleteForEveryone()}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
});

function ActionButton({
  label, onClick, children,
}: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-full text-fg-2 hover:bg-hover hover:text-fg"
    >
      {children}
    </button>
  );
}
