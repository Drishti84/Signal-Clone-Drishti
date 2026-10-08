"use client";

import { useSyncExternalStore } from "react";

import { Modal } from "@/components/ui/Modal";
import { SHORTCUTS } from "@/lib/shortcuts";
import { useUi } from "@/store/ui";

const noSubscription = () => () => undefined;

/** True on Apple devices, where the modifier key is ⌘ instead of Ctrl. */
function useIsMac(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );
}

export function ShortcutsDialog() {
  const openDialog = useUi((state) => state.openDialog);
  const isMac = useIsMac();

  return (
    <Modal title="Keyboard shortcuts" onClose={() => openDialog(null)} width={460}>
      <ul className="px-4 pb-4">
        {SHORTCUTS.map(({ keys, action }) => (
          <li key={action} className="flex items-center gap-3 border-b border-border py-2 last:border-b-0">
            <span className="min-w-0 flex-1">{action}</span>
            <span className="flex shrink-0 gap-1">
              {keys.map((key) => (
                <kbd
                  key={key}
                  className="min-w-6 rounded-md border border-border bg-pane px-1.5 py-0.5 text-center font-sans text-xs font-medium"
                >
                  {key === "mod" ? (isMac ? "⌘" : "Ctrl") : key}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
