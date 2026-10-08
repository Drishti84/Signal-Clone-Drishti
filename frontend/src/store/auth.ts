import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { User } from "@/lib/types";

type AuthState = {
  token: string | null;
  user: User | null;
  /** False until the saved session has been read from localStorage. */
  hydrated: boolean;
  setSession: (token: string, user: User) => void;
  setUser: (user: User) => void;
  clear: () => void;
};

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      hydrated: false,
      setSession: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      clear: () => set({ token: null, user: null }),
    }),
    {
      name: "signal-clone-auth",
      partialize: ({ token, user }) => ({ token, user }),
      // Read storage after mount, so the server-rendered HTML and the first
      // client render agree.
      skipHydration: true,
    },
  ),
);

export async function hydrateAuth(): Promise<void> {
  if (useAuth.getState().hydrated) return;
  await useAuth.persist.rehydrate();
  useAuth.setState({ hydrated: true });
}
