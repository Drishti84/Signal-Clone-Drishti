"use client";

import { CircleDashed, Phone } from "lucide-react";

import { ChatPane } from "@/components/chat/ChatPane";
import { ComingSoon, EmptyState } from "@/components/chat/EmptyState";
import { ConversationList } from "@/components/conversations/ConversationList";
import { NewChatDialog } from "@/components/dialogs/NewChatDialog";
import { NewGroupDialog } from "@/components/dialogs/NewGroupDialog";
import { SettingsDialog } from "@/components/dialogs/SettingsDialog";
import { ShortcutsDialog } from "@/components/dialogs/ShortcutsDialog";
import { NavRail } from "@/components/nav/NavRail";
import { useShortcuts } from "@/lib/shortcuts";
import { useAuth } from "@/store/auth";
import { useConversations } from "@/store/conversations";
import { useUi } from "@/store/ui";

/** The main window: nav rail, chat list, and the open chat.
 *
 * On a phone (under 768px) only one of the three is on screen at a time:
 * the chat list with the tabs along the bottom, or the open chat. */
export function Home() {
  const meId = useAuth((state) => state.user?.id ?? -1);
  const view = useUi((state) => state.view);
  const dialog = useUi((state) => state.dialog);
  const active = useConversations((state) =>
    state.activeId !== null ? state.byId[state.activeId] : undefined,
  );
  useShortcuts();
  // On a phone an open chat takes the whole screen.
  const chatOpen = view === "chats" && !!active;

  return (
    <div className="flex h-dvh max-md:flex-col-reverse">
      <NavRail hiddenOnMobile={chatOpen} />

      {view === "chats" && (
        <>
          <ConversationList hiddenOnMobile={chatOpen} />
          {active ? <ChatPane key={active.id} conversation={active} meId={meId} /> : <EmptyState />}
        </>
      )}
      {view === "calls" && (
        <ComingSoon
          Icon={Phone}
          title="Calls"
          text="Voice and video calls with the people you chat with will appear here."
        />
      )}
      {view === "stories" && (
        <ComingSoon
          Icon={CircleDashed}
          title="Stories"
          text="Share photos and text updates that disappear after 24 hours."
        />
      )}

      {dialog === "new-chat" && <NewChatDialog />}
      {dialog === "new-group" && <NewGroupDialog />}
      {dialog === "settings" && <SettingsDialog />}
      {dialog === "shortcuts" && <ShortcutsDialog />}
    </div>
  );
}
