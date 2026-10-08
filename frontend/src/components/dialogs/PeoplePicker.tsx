"use client";

import { Check, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Spinner } from "@/components/ui/Spinner";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { api } from "@/lib/api";
import { displayName, formatPhone } from "@/lib/format";
import type { User } from "@/lib/types";
import { useContacts } from "@/store/contacts";
import { usePresence } from "@/store/presence";

/** Everyone I could message, split into my contacts and everybody else. */
export function usePeople(): { contacts: User[]; others: User[]; loading: boolean } {
  const contactIds = useContacts((state) => state.ids);
  const users = usePresence((state) => state.users);
  const [everyone, setEveryone] = useState<User[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    useContacts.getState().load().catch(() => undefined);
    api
      .get<User[]>("/api/users")
      .then((list) => {
        if (cancelled) return;
        usePresence.getState().upsertUsers(list);
        setEveryone(list);
      })
      .catch(() => !cancelled && setEveryone([]));
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    const saved = new Set(contactIds ?? []);
    const live = (everyone ?? []).map((user) => users[user.id] ?? user);
    return {
      contacts: live.filter((user) => saved.has(user.id)),
      others: live.filter((user) => !saved.has(user.id)),
      loading: everyone === null || contactIds === null,
    };
  }, [contactIds, everyone, users]);
}

export function matches(user: User, term: string): boolean {
  if (!term) return true;
  const digits = term.replace(/\D/g, "");
  return (
    displayName(user).toLowerCase().includes(term) || (digits.length > 0 && user.phone.includes(digits))
  );
}

export function SearchField({
  value, onChange, placeholder = "Search",
}: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="mx-4 mb-2 flex h-9 items-center gap-2 rounded-full bg-input px-3 focus-within:ring-2 focus-within:ring-accent">
      <Search size={15} className="shrink-0 text-fg-2" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-2"
      />
    </label>
  );
}

export function PersonRow({
  user, onClick, selected, trailing, disabled,
}: {
  user: User;
  onClick?: () => void;
  /** When defined, the row shows a checkbox in this state. */
  selected?: boolean;
  trailing?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1 px-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        role={selected === undefined ? undefined : "checkbox"}
        aria-checked={selected}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-hover disabled:opacity-50"
      >
        <UserAvatar user={user} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{displayName(user)}</span>
          <span className="block truncate text-xs text-fg-2">{user.about || formatPhone(user.phone)}</span>
        </span>
        {selected !== undefined && (
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-accent bg-accent text-white" : "border-fg-3"}`}
          >
            {selected && <Check size={13} strokeWidth={3} />}
          </span>
        )}
      </button>
      {trailing}
    </div>
  );
}

/** A searchable checklist of people, used to pick group members. */
export function PeoplePicker({
  selected, onToggle, excludeIds = [],
}: { selected: number[]; onToggle: (user: User) => void; excludeIds?: number[] }) {
  const { contacts, others, loading } = usePeople();
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const visible = (list: User[]) =>
    list.filter((user) => !excludeIds.includes(user.id) && matches(user, term));
  const shownContacts = visible(contacts);
  const shownOthers = visible(others);

  return (
    <>
      <SearchField value={query} onChange={setQuery} placeholder="Search by name or number" />
      {loading ? (
        <div className="flex justify-center py-8 text-fg-2"><Spinner /></div>
      ) : shownContacts.length + shownOthers.length === 0 ? (
        <p className="px-6 py-8 text-center text-[13px] text-fg-2">Nobody to show.</p>
      ) : (
        <div className="pb-2">
          {shownContacts.length > 0 && <ListLabel>Contacts</ListLabel>}
          {shownContacts.map((user) => (
            <PersonRow key={user.id} user={user} selected={selected.includes(user.id)} onClick={() => onToggle(user)} />
          ))}
          {shownOthers.length > 0 && <ListLabel>Other people on Signal</ListLabel>}
          {shownOthers.map((user) => (
            <PersonRow key={user.id} user={user} selected={selected.includes(user.id)} onClick={() => onToggle(user)} />
          ))}
        </div>
      )}
    </>
  );
}

export function ListLabel({ children }: { children: string }) {
  return <h3 className="px-4 pb-1 pt-3 text-[13px] font-semibold text-fg-2">{children}</h3>;
}
