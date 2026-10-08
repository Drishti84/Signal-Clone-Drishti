"use client";

import {
  Check, LogOut, MoreHorizontal, Pencil, ShieldCheck, ShieldOff, UserMinus, UserPlus, X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { PeoplePicker } from "@/components/dialogs/PeoplePicker";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Menu } from "@/components/ui/Menu";
import { Modal } from "@/components/ui/Modal";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { openDirectChat, selectConversation } from "@/lib/actions";
import { api, errorMessage } from "@/lib/api";
import { NAME_MAX_LENGTH } from "@/lib/constants";
import { displayName, formatPhone, lastSeen, otherMember } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { Conversation, Member, User } from "@/lib/types";
import { useContacts } from "@/store/contacts";
import { leaving, useConversations } from "@/store/conversations";
import { usePresence } from "@/store/presence";
import { useUi } from "@/store/ui";

type Props = { conversation: Conversation; meId: number };

/** The panel on the right of a chat: who you are talking to, or the group's
 * members and, for admins, the controls to manage them. */
export function DetailsPanel({ conversation, meId }: Props) {
  const setDetailsOpen = useUi((state) => state.setDetailsOpen);
  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-border bg-bg max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:shadow-pop max-md:w-full">
      <header className="flex h-14 shrink-0 items-center border-b border-border px-3">
        <h2 className="flex-1 pl-1 text-[15px] font-semibold">
          {conversation.type === "group" ? "Group details" : "Contact details"}
        </h2>
        <IconButton label="Close details" onClick={() => setDetailsOpen(false)}>
          <X size={19} />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversation.type === "group" ? (
          <GroupDetails conversation={conversation} meId={meId} />
        ) : (
          <ContactDetails conversation={conversation} meId={meId} />
        )}
      </div>
    </aside>
  );
}

function ContactDetails({ conversation, meId }: Props) {
  const users = usePresence((state) => state.users);
  const contactIds = useContacts((state) => state.ids);
  const toast = useUi((state) => state.toast);
  const now = useNow();
  const stored = otherMember(conversation, meId);
  const other = stored ? (users[stored.id] ?? stored) : null;

  useEffect(() => {
    useContacts.getState().load().catch(() => undefined);
  }, []);

  if (!other) return null;
  const isContact = contactIds?.includes(other.id) ?? false;

  const toggleContact = async () => {
    try {
      if (isContact) {
        await useContacts.getState().remove(other.id);
        toast(`${displayName(other)} removed from contacts`);
      } else {
        await useContacts.getState().add({ user_id: other.id });
        toast(`${displayName(other)} added to contacts`);
      }
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  return (
    <div className="flex flex-col items-center gap-1 px-5 py-6 text-center">
      <UserAvatar user={other} size={96} />
      <h3 className="mt-3 text-lg font-semibold">{displayName(other)}</h3>
      <p className="text-fg-2">{formatPhone(other.phone)}</p>
      <p className="text-[13px] text-fg-2">
        {other.is_online ? "Online" : lastSeen(other.last_seen_at, now)}
      </p>
      {other.about && <p className="mt-3 rounded-xl bg-pane px-4 py-2.5 text-[13px]">{other.about}</p>}
      {contactIds !== null && (
        <Button variant="secondary" className="mt-5 gap-2" onClick={() => void toggleContact()}>
          {isContact ? <UserMinus size={16} /> : <UserPlus size={16} />}
          {isContact ? "Remove from contacts" : "Add to contacts"}
        </Button>
      )}
    </div>
  );
}

type Pending =
  | { kind: "remove"; member: Member }
  | { kind: "leave" }
  | null;

function GroupDetails({ conversation, meId }: Props) {
  const users = usePresence((state) => state.users);
  const toast = useUi((state) => state.toast);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(conversation.name ?? "");
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  const base = `/api/conversations/${conversation.id}`;
  const iAmAdmin = conversation.members.some((m) => m.user.id === meId && m.role === "admin");

  /** Run a group change. The reply is the updated group, or null if we left. */
  const change = async (request: Promise<Conversation | null>, done?: string) => {
    try {
      const updated = await request;
      if (updated) useConversations.getState().upsert(updated, { keepUnread: true });
      if (done) toast(done);
      return true;
    } catch (error) {
      toast(errorMessage(error), "error");
      return false;
    }
  };

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    if (await change(api.patch<Conversation>(base, { name }))) setEditingName(false);
  };

  const confirmPending = async () => {
    const action = pending;
    setPending(null);
    if (!action) return;
    if (action.kind === "leave") {
      leaving.add(conversation.id);
      const left = await change(api.del<Conversation | null>(`${base}/members/${meId}`));
      // Cleared by the socket event; this covers the event never arriving.
      setTimeout(() => leaving.delete(conversation.id), left ? 10_000 : 0);
      if (left) {
        useConversations.getState().remove(conversation.id);
        selectConversation(null);
        toast(`You left ${conversation.name ?? "the group"}`);
      }
    } else {
      await change(
        api.del<Conversation | null>(`${base}/members/${action.member.user.id}`),
        `${displayName(action.member.user)} removed`,
      );
    }
  };

  return (
    <div className="pb-4">
      <div className="flex flex-col items-center gap-1 px-5 pb-4 pt-6 text-center">
        <Avatar name={conversation.name} color={conversation.avatar_color} size={96} />
        {editingName ? (
          <form onSubmit={rename} className="mt-3 flex w-full items-center gap-1">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && setEditingName(false)}
              maxLength={NAME_MAX_LENGTH}
              autoFocus
              aria-label="Group name"
              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 outline-none focus:border-accent"
            />
            <IconButton label="Save name" type="submit" disabled={!name.trim()}><Check size={18} /></IconButton>
            <IconButton label="Cancel" onClick={() => setEditingName(false)}><X size={18} /></IconButton>
          </form>
        ) : (
          <div className="mt-3 flex items-center gap-1">
            <h3 className="text-lg font-semibold [overflow-wrap:anywhere]">{conversation.name}</h3>
            {iAmAdmin && (
              <IconButton
                label="Rename group"
                size={28}
                onClick={() => {
                  setName(conversation.name ?? "");
                  setEditingName(true);
                }}
              >
                <Pencil size={15} />
              </IconButton>
            )}
          </div>
        )}
        <p className="text-fg-2">
          Group · {conversation.members.length} member{conversation.members.length === 1 ? "" : "s"}
        </p>
      </div>

      <h4 className="px-5 pb-1 pt-2 text-[13px] font-semibold text-fg-2">Members</h4>
      {iAmAdmin && (
        <div className="px-3">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-hover"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-hover"><UserPlus size={17} /></span>
            <span className="font-medium">Add members</span>
          </button>
        </div>
      )}

      <ul className="px-3">
        {conversation.members.map((member) => {
          const user: User = users[member.user.id] ?? member.user;
          const isMe = user.id === meId;
          return (
            <li key={user.id} className="flex items-center gap-1">
              <button
                type="button"
                disabled={isMe}
                onClick={() => void openDirectChat(user.id)}
                title={isMe ? undefined : `Message ${displayName(user)}`}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left enabled:hover:bg-hover"
              >
                <UserAvatar user={user} size={36} showOnline={!isMe} ringClass="border-bg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{isMe ? "You" : displayName(user)}</span>
                  <span className="block truncate text-xs text-fg-2">{user.about || formatPhone(user.phone)}</span>
                </span>
                {member.role === "admin" && (
                  <span className="shrink-0 rounded-full bg-hover px-2 py-0.5 text-[11px] font-semibold text-fg-2">
                    Admin
                  </span>
                )}
              </button>
              {iAmAdmin && !isMe && (
                <Menu
                  trigger={(toggle, open) => (
                    <IconButton label={`Manage ${displayName(user)}`} active={open} onClick={toggle}>
                      <MoreHorizontal size={18} />
                    </IconButton>
                  )}
                  items={[
                    member.role === "admin"
                      ? {
                          label: "Remove admin",
                          icon: <ShieldOff size={15} />,
                          onSelect: () =>
                            void change(api.patch<Conversation>(`${base}/members/${user.id}`, { role: "member" })),
                        }
                      : {
                          label: "Make admin",
                          icon: <ShieldCheck size={15} />,
                          onSelect: () =>
                            void change(api.patch<Conversation>(`${base}/members/${user.id}`, { role: "admin" })),
                        },
                    {
                      label: "Remove from group",
                      icon: <UserMinus size={15} />,
                      danger: true,
                      onSelect: () => setPending({ kind: "remove", member }),
                    },
                  ]}
                />
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 border-t border-border px-3 pt-3">
        <button
          type="button"
          onClick={() => setPending({ kind: "leave" })}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left font-medium text-danger hover:bg-hover"
        >
          <LogOut size={18} /> Leave group
        </button>
      </div>

      {adding && (
        <AddMembersDialog
          conversation={conversation}
          onClose={() => setAdding(false)}
          onAdd={async (ids) => {
            const added = await change(
              api.post<Conversation>(`${base}/members`, { user_ids: ids }),
              ids.length === 1 ? "Member added" : `${ids.length} members added`,
            );
            if (added) setAdding(false);
          }}
        />
      )}

      {pending && (
        <ConfirmDialog
          title={pending.kind === "leave" ? "Leave group?" : "Remove member?"}
          message={
            pending.kind === "leave"
              ? `You will stop receiving messages from ${conversation.name ?? "this group"}.`
              : `${displayName(pending.member.user)} will no longer be able to see this group.`
          }
          confirmLabel={pending.kind === "leave" ? "Leave" : "Remove"}
          danger
          onConfirm={() => void confirmPending()}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

function AddMembersDialog({
  conversation, onClose, onAdd,
}: { conversation: Conversation; onClose: () => void; onAdd: (ids: number[]) => Promise<void> }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      title="Add members"
      onClose={onClose}
      footer={
        <Button
          disabled={busy || selected.length === 0}
          onClick={() => {
            setBusy(true);
            void onAdd(selected).finally(() => setBusy(false));
          }}
        >
          Add{selected.length > 0 ? ` (${selected.length})` : ""}
        </Button>
      }
    >
      <PeoplePicker
        selected={selected}
        excludeIds={conversation.members.map((member) => member.user.id)}
        onToggle={(user) =>
          setSelected((current) =>
            current.includes(user.id) ? current.filter((id) => id !== user.id) : [...current, user.id],
          )
        }
      />
    </Modal>
  );
}
