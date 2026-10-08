import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { usePresence } from "@/store/presence";

/** What the avatar editor is editing, before anything is saved. */
export type AvatarDraft = {
  color: string;
  preset: string | null;
  /** A newly chosen photo, already cropped and compressed. */
  photo: Blob | null;
  /** What to show in the preview: an object URL for a new photo, or the saved path. */
  photoUrl: string | null;
  removePhoto: boolean;
};

export function draftFromUser(user: User | null): AvatarDraft {
  return {
    color: user?.avatar.color ?? "A100",
    preset: user?.avatar.preset ?? null,
    photo: null,
    photoUrl: user?.avatar.image_url ?? null,
    removePhoto: false,
  };
}

/** Save profile fields and the avatar draft, then refresh the signed-in user. */
export async function saveProfile(
  fields: { display_name?: string; about?: string },
  draft: AvatarDraft,
): Promise<User> {
  let user = await api.patch<User>("/api/users/me", {
    ...fields,
    avatar_color: draft.color,
    avatar_preset: draft.preset,
  });
  if (draft.photo) {
    user = await api.upload<User>("/api/users/me/avatar", draft.photo);
  } else if (draft.removePhoto) {
    user = await api.del<User>("/api/users/me/avatar");
  }
  useAuth.getState().setUser(user);
  usePresence.getState().upsertUsers([user]);
  return user;
}
