"use client";

import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

const STYLES = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary: "bg-hover text-fg hover:bg-selected",
  danger: "bg-danger text-white hover:opacity-90",
};

export function Button({ variant = "primary", className = "", type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      className={`inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-50 ${STYLES[variant]} ${className}`}
      {...rest}
    />
  );
}
