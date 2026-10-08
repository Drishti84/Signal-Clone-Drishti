import { GROUP_WINDOW_MS } from "@/lib/constants";
import { dayLabel } from "@/lib/format";
import type { Message } from "@/lib/types";

/** What the message list actually renders, top to bottom. */
export type Row =
  | { kind: "day"; key: string; label: string }
  | { kind: "unread"; key: string }
  | { kind: "system"; key: string; message: Message }
  | { kind: "message"; key: string; message: Message; isFirst: boolean; isLast: boolean };

function sameGroup(a: Message, b: Message): boolean {
  return (
    a.type === "text" &&
    b.type === "text" &&
    a.sender_id === b.sender_id &&
    Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) < GROUP_WINDOW_MS
  );
}

/** Turn a flat, oldest-first message list into rows: day dividers, one
 * unread divider, system lines, and bubbles that know whether they start or
 * end a run from the same sender. */
export function buildRows(messages: Message[], firstUnreadId: number | null, now: number): Row[] {
  const rows: Row[] = [];
  let previous: Message | null = null;

  messages.forEach((message, index) => {
    const label = dayLabel(message.created_at, now);
    const newDay = !previous || dayLabel(previous.created_at, now) !== label;
    if (newDay) rows.push({ kind: "day", key: `day-${message.id}`, label });

    const startsUnread = firstUnreadId !== null && message.id === firstUnreadId;
    if (startsUnread) rows.push({ kind: "unread", key: "unread" });

    const key = message.client_id ?? `m-${message.id}`;
    if (message.type === "system") {
      rows.push({ kind: "system", key, message });
    } else {
      const next = messages[index + 1];
      const nextStartsUnread = !!next && firstUnreadId !== null && next.id === firstUnreadId;
      const nextIsNewDay = !!next && dayLabel(next.created_at, now) !== label;
      rows.push({
        kind: "message",
        key,
        message,
        isFirst: newDay || startsUnread || !previous || !sameGroup(previous, message),
        isLast: !next || nextStartsUnread || nextIsNewDay || !sameGroup(message, next),
      });
    }
    previous = message;
  });
  return rows;
}
