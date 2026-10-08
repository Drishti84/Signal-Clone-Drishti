"use client";

import { Hash, UserPlus, Users } from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  ListLabel, PersonRow, SearchField, matches, usePeople,
} from "@/components/dialogs/PeoplePicker";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { openDirectChat } from "@/lib/actions";
import { api, errorMessage } from "@/lib/api";
import { displayName } from "@/lib/format";
import type { User } from "@/lib/types";
import { useContacts } from "@/store/contacts";
import { useUi } from "@/store/ui";

/** Start a chat: pick a contact, pick anyone registered, or look someone
 * up by phone number. */
export function NewChatDialog() {
  const openDialog = useUi((state) => state.openDialog);
  const toast = useUi((state) => state.toast);
  const { contacts, others, loading } = usePeople();
  const [query, setQuery] = useState("");
  const [byPhone, setByPhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [busy, setBusy] = useState(false);
  const term = query.trim().toLowerCase();

  const addContact = async (user: User) => {
    try {
      await useContacts.getState().add({ user_id: user.id });
      toast(`${displayName(user)} added to contacts`);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  const findByPhone = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setPhoneError("");
    try {
      const found = await api.get<User>(`/api/users/lookup?phone=${encodeURIComponent(phone)}`);
      await openDirectChat(found.id);
    } catch (error) {
      setPhoneError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  if (byPhone) {
    return (
      <Modal title="Find by phone number" onClose={() => openDialog(null)} onBack={() => setByPhone(false)}>
        <form onSubmit={findByPhone} className="flex flex-col gap-3 px-4 pb-5">
          <p className="text-[13px] text-fg-2">
            Enter the number with its country code, or a 10-digit Indian number.
          </p>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            autoFocus
            placeholder="+91 90000 00002"
            aria-label="Phone number"
            className="h-10 rounded-lg border border-border bg-bg px-3 outline-none focus:border-accent"
          />
          {phoneError && <p role="alert" className="text-[13px] text-danger">{phoneError}</p>}
          <Button type="submit" disabled={busy || !phone.trim()}>
            {busy ? <Spinner size={16} /> : "Find"}
          </Button>
        </form>
      </Modal>
    );
  }

  const shownContacts = contacts.filter((user) => matches(user, term));
  const shownOthers = others.filter((user) => matches(user, term));

  return (
    <Modal title="New chat" onClose={() => openDialog(null)}>
      <SearchField value={query} onChange={setQuery} placeholder="Search by name or number" />
      <div className="pb-3">
        {!term && (
          <>
            <ActionRow icon={<Users size={18} />} label="New group" onClick={() => openDialog("new-group")} />
            <ActionRow icon={<Hash size={18} />} label="Find by phone number" onClick={() => setByPhone(true)} />
          </>
        )}

        {loading ? (
          <div className="flex justify-center py-8 text-fg-2"><Spinner /></div>
        ) : (
          <>
            {shownContacts.length > 0 && <ListLabel>Contacts</ListLabel>}
            {shownContacts.map((user) => (
              <PersonRow key={user.id} user={user} onClick={() => void openDirectChat(user.id)} />
            ))}
            {shownOthers.length > 0 && <ListLabel>Other people on Signal</ListLabel>}
            {shownOthers.map((user) => (
              <PersonRow
                key={user.id}
                user={user}
                onClick={() => void openDirectChat(user.id)}
                trailing={
                  <IconButton label={`Add ${displayName(user)} to contacts`} onClick={() => void addContact(user)}>
                    <UserPlus size={17} />
                  </IconButton>
                }
              />
            ))}
            {shownContacts.length + shownOthers.length === 0 && (
              <p className="px-6 py-8 text-center text-[13px] text-fg-2">
                {term ? `No one matches "${query.trim()}". Try finding them by phone number.` : "No one else has signed up yet."}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function ActionRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <div className="px-2">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-hover"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-hover">{icon}</span>
        <span className="font-medium">{label}</span>
      </button>
    </div>
  );
}
