import { api, errorMessage } from "@/lib/api";
import type { Conversation } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { useConversations } from "@/store/conversations";
import { resetStores } from "@/store/events";
import { useUi } from "@/store/ui";

/** Show a conversation in the chat pane. */
export function selectConversation(id: number | null): void {
  useConversations.getState().setActive(id);
  const ui = useUi.getState();
  ui.setView("chats");
  ui.setReplyTo(null);
  useUi.setState({ jumpTo: null });
  if (id === null) ui.setDetailsOpen(false);
}

/** Open (creating if needed) the direct chat with a user. */
export async function openDirectChat(userId: number): Promise<void> {
  try {
    const conversation = await api.post<Conversation>("/api/conversations/direct", {
      user_id: userId,
    });
    useConversations.getState().upsert(conversation);
    selectConversation(conversation.id);
    useUi.getState().openDialog(null);
  } catch (error) {
    useUi.getState().toast(errorMessage(error), "error");
  }
}

export async function logout(): Promise<void> {
  // The server session is deleted on a best-effort basis; the local one always is.
  await api.post("/api/auth/logout").catch(() => undefined);
  useAuth.getState().clear();
  resetStores();
}
