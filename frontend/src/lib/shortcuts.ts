"use client";

import { useEffect } from "react";

import { selectConversation } from "@/lib/actions";
import { sortConversations, useConversations } from "@/store/conversations";
import { useUi } from "@/store/ui";

/** Shown in the shortcuts dialog, in this order. `mod` is Ctrl, or ⌘ on a Mac. */
export const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ["mod", "/"], action: "Show keyboard shortcuts" },
  { keys: ["mod", "K"], action: "Search chats and people" },
  { keys: ["Alt", "N"], action: "New chat" },
  { keys: ["Alt", "G"], action: "New group" },
  { keys: ["Alt", "↓"], action: "Next chat" },
  { keys: ["Alt", "↑"], action: "Previous chat" },
  { keys: ["Alt", "I"], action: "Show or hide chat details" },
  { keys: ["mod", ","], action: "Open settings" },
  { keys: ["mod", "Shift", "L"], action: "Switch between light and dark" },
  { keys: ["Esc"], action: "Close a dialog, cancel a reply, or leave the chat" },
  { keys: ["Enter"], action: "Send message" },
  { keys: ["Shift", "Enter"], action: "New line in a message" },
];

/** Step to the chat above or below the open one, in list order. */
function stepConversation(direction: 1 | -1): void {
  const { byId, activeId } = useConversations.getState();
  const list = sortConversations(byId);
  if (list.length === 0) return;
  const index = list.findIndex((conversation) => conversation.id === activeId);
  const next =
    index === -1
      ? direction === 1 ? 0 : list.length - 1
      : (index + direction + list.length) % list.length;
  selectConversation(list[next].id);
}

/** Global keyboard shortcuts. The combinations avoid ones the browser keeps
 * for itself (Ctrl+N, Ctrl+T and so on), which a web page cannot override. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const ui = useUi.getState();
      const mod = event.ctrlKey || event.metaKey;
      // event.code names the physical key, so Alt+N works even where Alt
      // turns the letter into another character.
      const code = event.code;
      let handled = true;

      if (mod && !event.altKey && event.shiftKey && code === "KeyL") {
        const dark = document.documentElement.dataset.theme === "dark";
        ui.setTheme(dark ? "light" : "dark");
      } else if (mod && !event.altKey && !event.shiftKey && code === "Slash") {
        ui.openDialog(ui.dialog === "shortcuts" ? null : "shortcuts");
      } else if (mod && !event.altKey && !event.shiftKey && (code === "KeyK" || code === "KeyF")) {
        ui.openDialog(null);
        ui.setView("chats");
        if (window.matchMedia("(max-width: 767px)").matches) selectConversation(null);
        ui.focusSearch();
      } else if (mod && !event.altKey && !event.shiftKey && code === "Comma") {
        ui.openDialog("settings");
      } else if (event.altKey && !mod && code === "KeyN") {
        ui.openDialog("new-chat");
      } else if (event.altKey && !mod && code === "KeyG") {
        ui.openDialog("new-group");
      } else if (event.altKey && !mod && code === "KeyI") {
        if (useConversations.getState().activeId !== null) ui.setDetailsOpen(!ui.detailsOpen);
      } else if (event.altKey && !mod && code === "ArrowDown") {
        stepConversation(1);
      } else if (event.altKey && !mod && code === "ArrowUp") {
        stepConversation(-1);
      } else if (event.key === "Escape" && !event.defaultPrevented) {
        // Dialogs, menus, pickers and the reply bar handle Escape themselves:
        // if one is open, this press belongs to it. What is left: close the
        // details panel, then leave the chat.
        if (ui.dialog !== null || ui.replyTo !== null) return;
        if (document.querySelector('[role="dialog"], [role="menu"], [data-popover]')) return;
        const target = event.target as HTMLElement | null;
        const typed = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
        if (typed && target.value !== "") return;
        if (ui.detailsOpen) ui.setDetailsOpen(false);
        else if (useConversations.getState().activeId !== null) selectConversation(null);
        else handled = false;
      } else {
        handled = false;
      }

      if (handled) event.preventDefault();
    };

    // Capture phase: this runs before the menus' own Escape handlers, so the
    // check above still sees a menu that this same key press is about to close.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}
