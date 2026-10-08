"use client";

import {
  Bell, Laptop, Lock, LogOut, MonitorSmartphone, Moon, Palette, Sun, User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { AvatarEditor } from "@/components/profile/AvatarEditor";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { logout } from "@/lib/actions";
import { errorMessage } from "@/lib/api";
import { ABOUT_MAX_LENGTH, NAME_MAX_LENGTH } from "@/lib/constants";
import { formatPhone } from "@/lib/format";
import { draftFromUser, saveProfile, type AvatarDraft } from "@/lib/profile";
import { useAuth } from "@/store/auth";
import { useUi, type Theme } from "@/store/ui";

type Section = "profile" | "appearance" | "privacy" | "notifications" | "devices";

const SECTIONS: { id: Section; label: string; Icon: LucideIcon }[] = [
  { id: "profile", label: "Profile", Icon: UserIcon },
  { id: "appearance", label: "Appearance", Icon: Palette },
  { id: "privacy", label: "Privacy", Icon: Lock },
  { id: "notifications", label: "Notifications", Icon: Bell },
  { id: "devices", label: "Linked devices", Icon: MonitorSmartphone },
];

export function SettingsDialog() {
  const openDialog = useUi((state) => state.openDialog);
  const [section, setSection] = useState<Section>("profile");

  return (
    <Modal title="Settings" onClose={() => openDialog(null)} width={720}>
      <div className="flex h-[480px] border-t border-border max-md:h-[72dvh] max-md:flex-col">
        <nav className="flex shrink-0 gap-0.5 border-border p-2 max-md:overflow-x-auto max-md:border-b md:w-[200px] md:flex-col md:border-r">
          {SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              aria-current={section === id ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left ${section === id ? "bg-selected font-medium" : "hover:bg-hover"}`}
            >
              <Icon size={17} /> {label}
            </button>
          ))}
          <div className="flex-1 max-md:hidden" />
          <button
            type="button"
            onClick={() => void logout()}
            className="flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-danger hover:bg-hover"
          >
            <LogOut size={17} /> Log out
          </button>
        </nav>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-6 max-md:p-4">
          {section === "profile" && <ProfileSection />}
          {section === "appearance" && <AppearanceSection />}
          {section === "privacy" && (
            <Placeholder
              title="Privacy"
              rows={[
                ["Read receipts", "Let others see when you have read their messages.", true],
                ["Typing indicators", "Show others when you are typing.", true],
                ["Disappearing messages", "Default timer for new chats.", false],
                ["Screen security", "Hide Signal in the app switcher.", false],
              ]}
            />
          )}
          {section === "notifications" && (
            <Placeholder
              title="Notifications"
              rows={[
                ["Message notifications", "Show a notification for new messages.", true],
                ["Notification sounds", "Play a sound for incoming messages.", true],
                ["Show name and message", "Include the sender and text in notifications.", false],
              ]}
            />
          )}
          {section === "devices" && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-pane text-fg-2">
                <MonitorSmartphone size={30} strokeWidth={1.6} />
              </span>
              <h3 className="text-lg font-semibold">Linked devices</h3>
              <p className="max-w-[300px] text-fg-2">Use Signal on a desktop or tablet linked to your phone.</p>
              <ComingSoonBadge />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ProfileSection() {
  const user = useAuth((state) => state.user);
  const toast = useUi((state) => state.toast);
  const [name, setName] = useState(user?.display_name ?? "");
  const [about, setAbout] = useState(user?.about ?? "");
  const [draft, setDraft] = useState<AvatarDraft>(() => draftFromUser(user));
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await saveProfile({ display_name: name, about }, draft);
      setDraft(draftFromUser(saved));
      toast("Profile updated");
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <AvatarEditor draft={draft} name={name} onChange={setDraft} />
      <Field label="Name">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={NAME_MAX_LENGTH}
          className="h-10 rounded-lg border border-border bg-bg px-3 outline-none focus:border-accent"
        />
      </Field>
      <Field label="About">
        <input
          value={about}
          onChange={(event) => setAbout(event.target.value)}
          maxLength={ABOUT_MAX_LENGTH}
          placeholder="Write a few words about yourself"
          className="h-10 rounded-lg border border-border bg-bg px-3 outline-none focus:border-accent"
        />
      </Field>
      <Field label="Phone number">
        <p className="flex h-10 items-center rounded-lg bg-pane px-3 text-fg-2">
          {user ? formatPhone(user.phone) : ""}
        </p>
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? <Spinner size={16} /> : "Save"}
        </Button>
      </div>
    </form>
  );
}

const THEMES: { id: Theme; label: string; Icon: LucideIcon }[] = [
  { id: "system", label: "System", Icon: Laptop },
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
];

function AppearanceSection() {
  const theme = useUi((state) => state.theme);
  const setTheme = useUi((state) => state.setTheme);

  return (
    <div>
      <h3 className="text-lg font-semibold">Appearance</h3>
      <p className="mb-4 mt-1 text-fg-2">Choose how Signal looks on this device.</p>
      <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Theme">
        {THEMES.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={theme === id}
            onClick={() => setTheme(id)}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-5 ${theme === id ? "border-accent bg-accent/10" : "border-border hover:bg-hover"}`}
          >
            <Icon size={24} strokeWidth={1.7} />
            <span className="font-medium">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Placeholder({ title, rows }: { title: string; rows: [string, string, boolean][] }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        <ComingSoonBadge />
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {rows.map(([label, hint, on]) => (
          <li key={label} className="flex items-center gap-4 py-3 opacity-60">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{label}</span>
              <span className="block text-[13px] text-fg-2">{hint}</span>
            </span>
            <span
              role="switch"
              aria-checked={on}
              aria-disabled
              aria-label={label}
              className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 ${on ? "justify-end bg-accent" : "justify-start bg-fg-3"}`}
            >
              <span className="h-5 w-5 rounded-full bg-white" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComingSoonBadge() {
  return (
    <span className="rounded-full bg-hover px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-fg-2">
      Coming soon
    </span>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-fg-2">{label}</span>
      {children}
    </label>
  );
}
