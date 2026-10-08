"use client";

import { Camera, Trash2, Type } from "lucide-react";
import { useRef } from "react";

import { Avatar, PRESET_ICONS } from "@/components/ui/Avatar";
import { errorMessage } from "@/lib/api";
import { AVATAR_COLORS, AVATAR_COLOR_KEYS, AVATAR_PRESETS } from "@/lib/constants";
import { resizeToSquare } from "@/lib/image";
import type { AvatarDraft } from "@/lib/profile";
import { useUi } from "@/store/ui";

type Props = {
  draft: AvatarDraft;
  name: string;
  onChange: (draft: AvatarDraft) => void;
};

/** Signal-style avatar picker: a photo, a preset icon or initials, on one
 * of the avatar colours. Nothing is saved here; the parent saves the draft. */
export function AvatarEditor({ draft, name, onChange }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useUi((state) => state.toast);
  const palette = AVATAR_COLORS[draft.color] ?? AVATAR_COLORS.A100;

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const photo = await resizeToSquare(file);
      onChange({ ...draft, photo, photoUrl: URL.createObjectURL(photo), removePhoto: false });
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  const clearPhoto = { photo: null, photoUrl: null, removePhoto: true };

  return (
    <div className="flex flex-col items-center gap-4">
      <Avatar
        name={name} color={draft.color} preset={draft.preset} imageUrl={draft.photoUrl} size={96}
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-hover px-3 text-[13px] font-medium hover:bg-selected"
        >
          <Camera size={15} /> {draft.photoUrl ? "Change photo" : "Upload photo"}
        </button>
        {draft.photoUrl && (
          <button
            type="button"
            onClick={() => onChange({ ...draft, ...clearPhoto })}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-hover px-3 text-[13px] font-medium hover:bg-selected"
          >
            <Trash2 size={15} /> Remove
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            void pickPhoto(event.target.files?.[0]);
            event.target.value = ""; // allow picking the same file again
          }}
        />
      </div>

      <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Avatar colour">
        {AVATAR_COLOR_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={draft.color === key}
            aria-label={`Colour ${key}`}
            onClick={() => onChange({ ...draft, color: key })}
            className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${draft.color === key ? "border-fg" : "border-transparent"}`}
            style={{ background: AVATAR_COLORS[key].bg, boxShadow: `inset 0 0 0 2px ${AVATAR_COLORS[key].fg}22` }}
          />
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2" role="radiogroup" aria-label="Avatar icon">
        <button
          type="button"
          role="radio"
          aria-checked={!draft.photoUrl && draft.preset === null}
          aria-label="Initials"
          title="Initials"
          onClick={() => onChange({ ...draft, ...clearPhoto, preset: null })}
          className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${!draft.photoUrl && draft.preset === null ? "border-accent" : "border-transparent"}`}
          style={{ background: palette.bg, color: palette.fg }}
        >
          <Type size={18} />
        </button>
        {AVATAR_PRESETS.map((preset) => {
          const Icon = PRESET_ICONS[preset];
          const selected = !draft.photoUrl && draft.preset === preset;
          return (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={preset}
              title={preset}
              onClick={() => onChange({ ...draft, ...clearPhoto, preset })}
              className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${selected ? "border-accent" : "border-transparent"}`}
              style={{ background: palette.bg, color: palette.fg }}
            >
              <Icon size={20} strokeWidth={1.75} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
