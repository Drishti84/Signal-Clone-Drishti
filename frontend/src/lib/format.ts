import type { Conversation, Message, User } from "@/lib/types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function initials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "#";
  const first = Array.from(words[0])[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function displayName(user: User | null | undefined): string {
  return user?.display_name || user?.phone || "Unknown";
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const monthDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const fullDate = new Intl.DateTimeFormat(undefined, {
  weekday: "short", month: "short", day: "numeric", year: "numeric",
});

/** Compact age for the chat list: "now", "5m", "3h", "Tue", "Oct 3". */
export function listTimestamp(iso: string, now: number): string {
  const then = new Date(iso);
  const age = Math.max(0, now - then.getTime());
  if (age < MINUTE) return "now";
  if (age < HOUR) return `${Math.floor(age / MINUTE)}m`;
  if (age < DAY) return `${Math.floor(age / HOUR)}h`;
  if (age < 7 * DAY) return weekday.format(then);
  return monthDay.format(then);
}

export function bubbleTime(iso: string): string {
  return clock.format(new Date(iso));
}

export function dayLabel(iso: string, now: number): string {
  const then = new Date(iso);
  const today = new Date(now);
  if (sameDay(then, today)) return "Today";
  if (sameDay(then, new Date(now - DAY))) return "Yesterday";
  return fullDate.format(then);
}

export function lastSeen(iso: string | null, now: number): string {
  if (!iso) return "Offline";
  const then = new Date(iso);
  const age = Math.max(0, now - then.getTime());
  if (age < MINUTE) return "Last seen just now";
  if (age < HOUR) return `Last seen ${Math.floor(age / MINUTE)}m ago`;
  if (sameDay(then, new Date(now))) return `Last seen today at ${clock.format(then)}`;
  if (sameDay(then, new Date(now - DAY))) return `Last seen yesterday at ${clock.format(then)}`;
  return `Last seen ${monthDay.format(then)}`;
}

/** In a direct chat, the person who is not me. */
export function otherMember(conversation: Conversation, meId: number): User | null {
  if (conversation.type !== "direct") return null;
  return conversation.members.find((member) => member.user.id !== meId)?.user ?? null;
}

export function conversationTitle(
  conversation: Conversation,
  meId: number,
  users: Record<number, User>,
): string {
  if (conversation.type === "group") return conversation.name ?? "Group";
  const other = otherMember(conversation, meId);
  return displayName(other ? (users[other.id] ?? other) : null);
}

/** The grey line under a chat's title: who said what last. */
export function previewText(
  message: Message | null,
  conversation: Conversation,
  meId: number,
  users: Record<number, User>,
): string {
  if (!message) return "No messages yet";
  if (message.type === "system") return message.body;
  if (message.sender_id === meId) return `You: ${message.body}`;
  if (conversation.type === "group" && message.sender_id !== null) {
    const first = displayName(users[message.sender_id]).split(" ")[0];
    return `${first}: ${message.body}`;
  }
  return message.body;
}

export function formatPhone(phone: string): string {
  // "+919876543210" -> "+91 98765 43210"; anything unusual is shown as stored.
  const match = /^\+(\d{1,3})(\d{5})(\d{5})$/.exec(phone);
  return match ? `+${match[1]} ${match[2]} ${match[3]}` : phone;
}
