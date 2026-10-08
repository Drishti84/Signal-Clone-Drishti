import { create } from "zustand";

import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { usePresence } from "@/store/presence";

type ContactsState = {
  /** Ids of the people I have saved; null until first loaded. */
  ids: number[] | null;
  load: () => Promise<void>;
  add: (target: { user_id: number } | { phone: string }) => Promise<User>;
  remove: (userId: number) => Promise<void>;
  reset: () => void;
};

export const useContacts = create<ContactsState>((set, get) => ({
  ids: null,

  load: async () => {
    const contacts = await api.get<User[]>("/api/contacts");
    usePresence.getState().upsertUsers(contacts);
    set({ ids: contacts.map((contact) => contact.id) });
  },

  add: async (target) => {
    const user = await api.post<User>("/api/contacts", target);
    usePresence.getState().upsertUsers([user]);
    set({ ids: [...new Set([...(get().ids ?? []), user.id])] });
    return user;
  },

  remove: async (userId) => {
    await api.del(`/api/contacts/${userId}`);
    set({ ids: (get().ids ?? []).filter((id) => id !== userId) });
  },

  reset: () => set({ ids: null }),
}));
