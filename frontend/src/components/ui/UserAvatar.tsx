"use client";

import { Avatar } from "@/components/ui/Avatar";
import type { User } from "@/lib/types";
import { usePresence } from "@/store/presence";

type Props = {
  user: User | null | undefined;
  size?: number;
  showOnline?: boolean;
  ringClass?: string;
};

/** Avatar for a person. Reads the freshest copy of the user from the
 * presence store, so a changed photo or online state shows up everywhere. */
export function UserAvatar({ user, size, showOnline, ringClass }: Props) {
  const live = usePresence((state) => (user ? state.users[user.id] : undefined)) ?? user;
  return (
    <Avatar
      name={live?.display_name}
      color={live?.avatar.color}
      preset={live?.avatar.preset}
      imageUrl={live?.avatar.image_url}
      size={size}
      online={showOnline && !!live?.is_online}
      ringClass={ringClass}
    />
  );
}
