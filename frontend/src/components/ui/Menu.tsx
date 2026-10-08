"use client";

import { useRef, useState, type ReactNode } from "react";

import { useDismiss } from "@/lib/hooks";

export type MenuItem = {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
};

type Props = {
  /** Renders the button that opens the menu. */
  trigger: (toggle: () => void, open: boolean) => ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
  /** Open upwards, for triggers near the bottom of the window. */
  up?: boolean;
};

/** A small popover menu that closes on Escape, outside click or selection. */
export function Menu({ trigger, items, align = "right", up = false }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useDismiss(root, open, () => setOpen(false));

  return (
    <div ref={root} className="relative inline-flex">
      {trigger(() => setOpen((value) => !value), open)}
      {open && (
        <div
          role="menu"
          className={`animate-pop-in absolute z-30 min-w-[190px] rounded-lg bg-surface p-1 shadow-pop ring-1 ring-border ${align === "right" ? "right-0" : "left-0"} ${up ? "bottom-full mb-1" : "top-full mt-1"}`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-hover ${item.danger ? "text-danger" : ""}`}
            >
              {item.icon}
              <span className="flex-1 whitespace-nowrap">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
