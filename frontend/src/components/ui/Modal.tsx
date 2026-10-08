"use client";

import { ArrowLeft, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { IconButton } from "@/components/ui/IconButton";

type Props = {
  title: string;
  onClose: () => void;
  /** Shows a back arrow in place of nothing on the left of the title. */
  onBack?: () => void;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
};

/** A centred dialog. Closes on Escape and on a click outside it. */
export function Modal({ title, onClose, onBack, width = 400, children, footer }: Props) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-overlay p-6"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="animate-pop-in flex max-h-[calc(100vh-48px)] w-full flex-col overflow-hidden rounded-xl bg-surface shadow-pop outline-none"
        style={{ maxWidth: width }}
      >
        <header className="flex h-14 shrink-0 items-center gap-1 px-3">
          {onBack ? (
            <IconButton label="Back" onClick={onBack}><ArrowLeft size={20} /></IconButton>
          ) : (
            <span className="w-2" />
          )}
          <h2 className="flex-1 truncate text-base font-semibold">{title}</h2>
          <IconButton label="Close" onClick={onClose}><X size={20} /></IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <footer className="flex shrink-0 justify-end gap-2 px-4 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
