"use client";

import { Timer } from "lucide-react";
import { useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { DISAPPEARING_OPTIONS } from "@/lib/constants";
import type { Conversation } from "@/lib/types";
import { useConversations } from "@/store/conversations";
import { useUi } from "@/store/ui";

/** The disappearing-messages timer for a chat. Any member can change it;
 * it applies to messages sent from then on. */
export function DisappearingSetting({ conversation }: { conversation: Conversation }) {
  const [saving, setSaving] = useState(false);
  const current = conversation.disappearing_seconds;

  const change = async (value: string) => {
    const seconds = value === "" ? null : Number(value);
    setSaving(true);
    try {
      const updated = await api.patch<Conversation>(
        `/api/conversations/${conversation.id}/disappearing`,
        { seconds },
      );
      useConversations.getState().upsert(updated, { keepUnread: true });
    } catch (error) {
      useUi.getState().toast(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-3 mt-3 rounded-xl bg-pane px-3 py-3 text-left">
      <label className="flex items-center gap-3">
        <Timer size={18} className="shrink-0 text-fg-2" />
        <span className="min-w-0 flex-1 font-medium">Disappearing messages</span>
        <select
          value={current ?? ""}
          disabled={saving}
          onChange={(event) => void change(event.target.value)}
          aria-label="Disappearing messages timer"
          className="h-8 rounded-lg border border-border bg-bg px-1.5 text-[13px] outline-none focus:border-accent disabled:opacity-60"
        >
          {DISAPPEARING_OPTIONS.map((option) => (
            <option key={option.label} value={option.seconds ?? ""}>{option.label}</option>
          ))}
        </select>
      </label>
      <p className="mt-1.5 pl-[30px] text-xs text-fg-2">
        {current
          ? "New messages are removed for everyone once the timer runs out."
          : "When on, new messages in this chat are removed after the time you choose."}
      </p>
    </div>
  );
}
