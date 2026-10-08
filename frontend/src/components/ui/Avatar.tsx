"use client";

import {
  Bird, Cat, Dog, Fish, Flower2, Leaf, Music, Rabbit, Rocket, Squirrel, Star, Turtle,
  type LucideIcon,
} from "lucide-react";

import { assetUrl } from "@/lib/api";
import { AVATAR_COLORS } from "@/lib/constants";
import { initials } from "@/lib/format";

export const PRESET_ICONS: Record<string, LucideIcon> = {
  cat: Cat, dog: Dog, bird: Bird, fish: Fish, rabbit: Rabbit, squirrel: Squirrel,
  turtle: Turtle, flower: Flower2, leaf: Leaf, star: Star, rocket: Rocket, music: Music,
};

type Props = {
  name: string | null | undefined;
  color: string | null | undefined;
  preset?: string | null;
  /** A full URL, or an API-relative path such as "/api/users/3/avatar?v=2". */
  imageUrl?: string | null;
  size?: number;
  /** Shows the green dot. Omit for groups and for your own avatar. */
  online?: boolean;
  /** Background behind the avatar, so the dot's ring blends in. */
  ringClass?: string;
};

/** A photo if there is one, else a preset icon, else initials, always on the
 * user's colour. */
export function Avatar({
  name, color, preset, imageUrl, size = 48, online, ringClass = "border-pane",
}: Props) {
  const palette = AVATAR_COLORS[color ?? ""] ?? AVATAR_COLORS.A100;
  const Icon = preset ? PRESET_ICONS[preset] : undefined;
  const src = imageUrl?.startsWith("/api/") ? assetUrl(imageUrl) : imageUrl;
  const dot = Math.max(10, Math.round(size * 0.26));

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="flex h-full w-full select-none items-center justify-center overflow-hidden rounded-full font-medium"
        style={{ background: palette.bg, color: palette.fg, fontSize: Math.round(size * 0.4) }}
        aria-hidden
      >
        {src ? (
          // Avatars come from our own API at a fixed small size; next/image adds nothing here.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : Icon ? (
          <Icon size={Math.round(size * 0.52)} strokeWidth={1.75} />
        ) : (
          initials(name)
        )}
      </span>
      {online && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 bg-online ${ringClass}`}
          style={{ width: dot, height: dot }}
          title="Online"
        />
      )}
    </span>
  );
}
