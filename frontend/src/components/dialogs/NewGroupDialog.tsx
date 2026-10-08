"use client";

import { X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { PeoplePicker } from "@/components/dialogs/PeoplePicker";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { selectConversation } from "@/lib/actions";
import { api, errorMessage } from "@/lib/api";
import { NAME_MAX_LENGTH } from "@/lib/constants";
import { displayName } from "@/lib/format";
import type { Conversation, User } from "@/lib/types";
import { useConversations } from "@/store/conversations";
import { useUi } from "@/store/ui";

/** Two steps, like Signal: choose members, then name the group. */
export function NewGroupDialog() {
  const openDialog = useUi((state) => state.openDialog);
  const toast = useUi((state) => state.toast);
  const [members, setMembers] = useState<User[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (user: User) =>
    setMembers((current) =>
      current.some((member) => member.id === user.id)
        ? current.filter((member) => member.id !== user.id)
        : [...current, user],
    );

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const group = await api.post<Conversation>("/api/conversations/group", {
        name,
        member_ids: members.map((member) => member.id),
      });
      useConversations.getState().upsert(group);
      selectConversation(group.id);
      openDialog(null);
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  if (naming) {
    return (
      <Modal title="Name this group" onClose={() => openDialog(null)} onBack={() => setNaming(false)}>
        <form onSubmit={create} className="flex flex-col gap-4 px-4 pb-5">
          <div className="flex items-center gap-3">
            <Avatar name={name || "Group"} color="A120" size={56} />
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={NAME_MAX_LENGTH}
              autoFocus
              placeholder="Group name (required)"
              aria-label="Group name"
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 outline-none focus:border-accent"
            />
          </div>
          <p className="text-[13px] text-fg-2">
            {members.length} member{members.length === 1 ? "" : "s"}:{" "}
            {members.map((member) => displayName(member)).join(", ")}
          </p>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? <Spinner size={16} /> : "Create"}
          </Button>
        </form>
      </Modal>
    );
  }

  return (
    <Modal
      title="Choose members"
      onClose={() => openDialog(null)}
      onBack={() => openDialog("new-chat")}
      footer={
        <Button disabled={members.length === 0} onClick={() => setNaming(true)}>
          Next
        </Button>
      }
    >
      {members.length > 0 && (
        <div className="mx-4 mb-2 flex flex-wrap gap-1.5">
          {members.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => toggle(member)}
              aria-label={`Remove ${displayName(member)}`}
              className="flex h-7 items-center gap-1 rounded-full bg-accent/15 pl-2.5 pr-1.5 text-[13px] font-medium text-accent"
            >
              {displayName(member)} <X size={14} />
            </button>
          ))}
        </div>
      )}
      <PeoplePicker selected={members.map((member) => member.id)} onToggle={toggle} />
    </Modal>
  );
}
