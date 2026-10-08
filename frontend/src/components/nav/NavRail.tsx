"use client";

import { CircleDashed, MessageCircle, Phone, Settings, type LucideIcon } from "lucide-react";

import { UserAvatar } from "@/components/ui/UserAvatar";
import { useAuth } from "@/store/auth";
import { useConversations } from "@/store/conversations";
import { useUi, type View } from "@/store/ui";

const TABS: { view: View; label: string; Icon: LucideIcon }[] = [
  { view: "chats", label: "Chats", Icon: MessageCircle },
  { view: "calls", label: "Calls", Icon: Phone },
  { view: "stories", label: "Stories", Icon: CircleDashed },
];

/** The narrow strip on the far left: section tabs on top, settings and
 * your own profile at the bottom. */
export function NavRail() {
  const view = useUi((state) => state.view);
  const setView = useUi((state) => state.setView);
  const openDialog = useUi((state) => state.openDialog);
  const me = useAuth((state) => state.user);
  const unread = useConversations((state) =>
    Object.values(state.byId).reduce((total, c) => total + c.unread_count, 0),
  );

  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-1 border-r border-border bg-pane py-3">
      {TABS.map(({ view: tab, label, Icon }) => (
        <button
          key={tab}
          type="button"
          aria-label={label}
          title={label}
          aria-current={view === tab ? "page" : undefined}
          onClick={() => setView(tab)}
          className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${view === tab ? "bg-selected" : "hover:bg-hover"}`}
        >
          <Icon size={22} strokeWidth={view === tab ? 2.2 : 1.8} />
          {tab === "chats" && unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      ))}

      <div className="flex-1" />

      <button
        type="button"
        aria-label="Settings"
        title="Settings"
        onClick={() => openDialog("settings")}
        className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-hover"
      >
        <Settings size={22} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        aria-label="Your profile"
        title="Your profile"
        onClick={() => openDialog("settings")}
        className="mt-1 rounded-full"
      >
        <UserAvatar user={me} size={32} />
      </button>
    </nav>
  );
}
