"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title"> & {
  /** Read by screen readers and shown as the tooltip. */
  label: string;
  active?: boolean;
  size?: number;
  children: ReactNode;
};

export function IconButton({ label, active, size = 32, className = "", children, ...rest }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg text-fg transition-colors hover:bg-hover disabled:opacity-40 disabled:hover:bg-transparent ${active ? "bg-selected" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
