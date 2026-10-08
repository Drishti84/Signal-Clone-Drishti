"use client";

import { CircleDashed, Phone } from "lucide-react";

import { ChatPane } from "@/components/chat/ChatPane";
import { ComingSoon, EmptyState } from "@/components/chat/EmptyState";
import { ConversationList } from "@/components/conversations/ConversationList";
import { NewChatDialog } from "@/components/dialogs/NewChatDialog";
import { NewGroupDialog } from "@/components/dialogs/NewGroupDialog";
import { SettingsDialog } from "@/components/dialogs/SettingsDialog";
import { NavRail } from "@/components/nav/NavRail";
import { useAuth } from "@/store/auth";
import { useConversations } from "@/store/conversations";
import { useUi } from "@/store/ui";

/** The main window: nav rail, chat list, and the open chat. */
export function Home() {
  const meId = useAuth((state) => state.user?.id ?? -1);
  const view = useUi((state) => state.view);
  const dialog = useUi((state) => state.dialog);
  const active = useConversations((state) =>
    state.activeId !== null ? state.byId[state.activeId] : undefined,
  );

  return (
    <div className="flex h-full min-w-[900px]">
      <NavRail />

      {view === "chats" && (
        <>
          <ConversationList />
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
    </div>
  );
}
