import { create } from "zustand";

import type { SocketState } from "@/lib/socket";
import type { Message } from "@/lib/types";

export type Theme = "system" | "light" | "dark";
export type View = "chats" | "calls" | "stories";
export type Dialog = null | "new-chat" | "new-group" | "settings";
export type Toast = { id: number; message: string; kind: "info" | "error" };

export const THEME_KEY = "signal-clone-theme";
const TOAST_MS = 4000;

type UiState = {
  theme: Theme;
  view: View;
  dialog: Dialog;
  detailsOpen: boolean;
  toasts: Toast[];
  replyTo: Message | null;
  socketState: SocketState;
  /** A message to scroll to and briefly highlight. */
  jumpTo: { messageId: number; nonce: number } | null;
  /** Bumped to move keyboard focus into the chat-list search box. */
  searchFocus: number;
  setTheme: (theme: Theme) => void;
  setView: (view: View) => void;
  openDialog: (dialog: Dialog) => void;
  setDetailsOpen: (open: boolean) => void;
  toast: (message: string, kind?: Toast["kind"]) => void;
  dismiss: (id: number) => void;
  setReplyTo: (message: Message | null) => void;
  setSocketState: (state: SocketState) => void;
  jumpToMessage: (messageId: number) => void;
  focusSearch: () => void;
  reset: () => void;
};

/** Put the chosen theme on <html>. "system" follows the OS setting. */
export function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function readSavedTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

let toastId = 0;

export const useUi = create<UiState>((set, get) => ({
  theme: "system",
  view: "chats",
  dialog: null,
  detailsOpen: false,
  toasts: [],
  replyTo: null,
  socketState: "connecting",
  jumpTo: null,
  searchFocus: 0,

  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Private browsing: the theme still applies for this visit.
    }
    applyTheme(theme);
    set({ theme });
  },
  setView: (view) => set({ view }),
  openDialog: (dialog) => set({ dialog }),
  setDetailsOpen: (detailsOpen) => set({ detailsOpen }),

  toast: (message, kind = "info") => {
    const id = ++toastId;
    set((state) => ({ toasts: [...state.toasts.slice(-2), { id, message, kind }] }));
    setTimeout(() => get().dismiss(id), TOAST_MS);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  setReplyTo: (replyTo) => set({ replyTo }),
  setSocketState: (socketState) => set({ socketState }),
  jumpToMessage: (messageId) => set({ jumpTo: { messageId, nonce: Date.now() } }),
  focusSearch: () => set((state) => ({ searchFocus: state.searchFocus + 1 })),

  reset: () =>
    set({ view: "chats", dialog: null, detailsOpen: false, replyTo: null, jumpTo: null }),
}));
