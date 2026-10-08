"use client";

import { ListFilter, MoreHorizontal, Search, Settings, SquarePen, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ConversationRow } from "@/components/conversations/ConversationRow";
import { IconButton } from "@/components/ui/IconButton";
import { Menu } from "@/components/ui/Menu";
import { Spinner } from "@/components/ui/Spinner";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { openDirectChat, selectConversation } from "@/lib/actions";
import { api } from "@/lib/api";
import { conversationTitle, displayName, formatPhone, previewText } from "@/lib/format";
import { useDebounced, useNow } from "@/lib/hooks";
import type { Conversation, User } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { sortConversations, useConversations } from "@/store/conversations";
import { typingUserIds, usePresence } from "@/store/presence";
import { useUi } from "@/store/ui";

function typingText(conversation: Conversation, ids: number[], users: Record<number, User>) {
  if (ids.length === 0) return null;
  if (conversation.type === "direct") return "typing…";
  if (ids.length > 1) return "Several people are typing…";
  return `${displayName(users[ids[0]]).split(" ")[0]} is typing…`;
}

/** The left pane: header, search, unread filter and the list of chats. */
export function ConversationList() {
  const byId = useConversations((state) => state.byId);
  const activeId = useConversations((state) => state.activeId);
  const loaded = useConversations((state) => state.loaded);
  const meId = useAuth((state) => state.user?.id ?? -1);
  const users = usePresence((state) => state.users);
  const typing = usePresence((state) => state.typing);
  const socketState = useUi((state) => state.socketState);
  const searchFocus = useUi((state) => state.searchFocus);
  const openDialog = useUi((state) => state.openDialog);
  const now = useNow();

  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [people, setPeople] = useState<{ query: string; users: User[] } | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const term = query.trim().toLowerCase();
  const debouncedTerm = useDebounced(term);

  useEffect(() => {
    if (searchFocus > 0) searchInput.current?.focus();
  }, [searchFocus]);

  // People matching the search, so a chat can be started from the search box.
  useEffect(() => {
    if (!debouncedTerm) return;
    let cancelled = false;
    api
      .get<User[]>(`/api/users?q=${encodeURIComponent(debouncedTerm)}`)
      .then((found) => !cancelled && setPeople({ query: debouncedTerm, users: found }))
      .catch(() => !cancelled && setPeople({ query: debouncedTerm, users: [] }));
    return () => {
      cancelled = true;
    };
  }, [debouncedTerm]);

  const rows = useMemo(() => {
    return sortConversations(byId)
      .map((conversation) => ({
        conversation,
        title: conversationTitle(conversation, meId, users),
        preview: previewText(conversation.last_message, conversation, meId, users),
      }))
      .filter(({ conversation, title, preview }) => {
        if (unreadOnly && conversation.unread_count === 0 && conversation.id !== activeId) return false;
        if (!term) return true;
        return title.toLowerCase().includes(term) || preview.toLowerCase().includes(term);
      });
  }, [byId, meId, users, unreadOnly, term, activeId]);

  const matchedPeople = term && people?.query === term ? people.users : null;

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-r border-border bg-pane">
      <header className="flex h-14 shrink-0 items-center gap-1 px-4">
        <h1 className="flex-1 text-xl font-semibold">Chats</h1>
        <IconButton label="New chat" onClick={() => openDialog("new-chat")}>
          <SquarePen size={19} />
        </IconButton>
        <Menu
          trigger={(toggle, open) => (
            <IconButton label="More" active={open} onClick={toggle}>
              <MoreHorizontal size={19} />
            </IconButton>
          )}
          items={[
            { label: "New group", icon: <Users size={16} />, onSelect: () => openDialog("new-group") },
            { label: "Settings", icon: <Settings size={16} />, onSelect: () => openDialog("settings") },
          ]}
        />
      </header>

      <div className="flex shrink-0 items-center gap-1.5 px-4 pb-2">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full bg-input px-3 focus-within:ring-2 focus-within:ring-accent">
          <Search size={15} className="shrink-0 text-fg-2" />
          <input
            ref={searchInput}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && setQuery("")}
            placeholder="Search"
            aria-label="Search chats and contacts"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-2"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="text-fg-2 hover:text-fg">
              <X size={15} />
            </button>
          )}
        </label>
        <IconButton
          label={unreadOnly ? "Show all chats" : "Filter by unread"}
          active={unreadOnly}
          onClick={() => setUnreadOnly((value) => !value)}
          className={unreadOnly ? "text-accent" : ""}
        >
          <ListFilter size={18} />
        </IconButton>
      </div>

      {socketState === "reconnecting" && (
        <div className="mx-4 mb-2 flex shrink-0 items-center gap-2 rounded-lg bg-hover px-3 py-2 text-[13px] text-fg-2">
          <Spinner size={14} /> Connecting…
        </div>
      )}

      {unreadOnly && (
        <div className="mx-4 mb-2 flex shrink-0 items-center justify-between rounded-lg bg-hover px-3 py-1.5 text-[13px]">
          <span className="text-fg-2">Filtered by unread</span>
          <button type="button" className="font-medium text-accent hover:underline" onClick={() => setUnreadOnly(false)}>
            Clear
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!loaded ? (
          <div className="flex justify-center py-8 text-fg-2"><Spinner /></div>
        ) : (
          <>
            {term && rows.length > 0 && <SectionLabel>Chats</SectionLabel>}
            {rows.map(({ conversation, title, preview }) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                meId={meId}
                title={title}
                preview={preview}
                typingText={typingText(conversation, typingUserIds(typing, conversation.id), users)}
                active={conversation.id === activeId}
                now={now}
                onSelect={selectConversation}
              />
            ))}

            {matchedPeople && matchedPeople.length > 0 && (
              <>
                <SectionLabel>Contacts</SectionLabel>
                {matchedPeople.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => {
                      setQuery("");
                      void openDirectChat(person.id);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-hover"
                  >
                    <UserAvatar user={person} size={40} showOnline />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{displayName(person)}</span>
                      <span className="block truncate text-[13px] text-fg-2">{formatPhone(person.phone)}</span>
                    </span>
                  </button>
                ))}
              </>
            )}

            {rows.length === 0 && !(matchedPeople && matchedPeople.length > 0) && (
              <p className="px-4 py-10 text-center text-[13px] text-fg-2">
                {term
                  ? `No results for "${query.trim()}"`
                  : unreadOnly
                    ? "No unread chats"
                    : "No chats yet. Start one with the pencil button above."}
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <h2 className="px-3 pb-1 pt-3 text-[13px] font-semibold text-fg-2">{children}</h2>;
}
