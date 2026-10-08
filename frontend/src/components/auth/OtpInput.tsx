"use client";

import { useRef } from "react";

const LENGTH = 6;

type Props = {
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  /** Change this to replay the "wrong code" shake. */
  shakeKey: number;
  disabled?: boolean;
};

/** Six single-digit boxes that behave like one field: typing advances,
 * backspace goes back, and a pasted code fills every box. */
export function OtpInput({ value, onChange, onComplete, shakeKey, disabled }: Props) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  const update = (next: string, focusIndex: number) => {
    const digits = next.replace(/\D/g, "").slice(0, LENGTH);
    onChange(digits);
    boxes.current[Math.min(focusIndex, LENGTH - 1)]?.focus();
    if (digits.length === LENGTH) onComplete(digits);
  };

  return (
    <div
      key={shakeKey}
      className={`flex justify-center gap-2 ${shakeKey > 0 ? "animate-shake" : ""}`}
      onPaste={(event) => {
        event.preventDefault();
        const pasted = event.clipboardData.getData("text");
        update(pasted, pasted.replace(/\D/g, "").length);
      }}
    >
      {Array.from({ length: LENGTH }, (_, index) => (
        <input
          key={index}
          ref={(element) => { boxes.current[index] = element; }}
          value={value[index] ?? ""}
          disabled={disabled}
          autoFocus={index === 0}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1}`}
          maxLength={1}
          onChange={(event) => {
            const digit = event.target.value.replace(/\D/g, "").slice(-1);
            if (!digit) return;
            update(value.slice(0, index) + digit + value.slice(index + 1), index + 1);
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace") {
              event.preventDefault();
              // Clear this box, or the previous one when this box is already empty.
              const target = value[index] ? index : index - 1;
              if (target < 0) return;
              onChange(value.slice(0, target));
              boxes.current[target]?.focus();
            } else if (event.key === "ArrowLeft") {
              boxes.current[index - 1]?.focus();
            } else if (event.key === "ArrowRight") {
              boxes.current[index + 1]?.focus();
            }
          }}
          className="h-12 w-10 rounded-lg border border-border bg-bg text-center text-xl font-medium outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      ))}
    </div>
  );
}
