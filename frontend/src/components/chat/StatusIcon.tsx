import type { MessageStatus } from "@/lib/types";

const LABELS: Record<MessageStatus, string> = {
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Not sent",
};

/** One circled check: outlined, or filled with the check cut out. */
function Check({ x, filled }: { x: number; filled: boolean }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <circle
        cx="6" cy="6" r="5.25"
        fill={filled ? "currentColor" : "var(--status-gap, transparent)"}
        stroke="currentColor" strokeWidth="1.1"
      />
      <path
        d="M3.6 6.2 5.3 7.9 8.5 4.4"
        fill="none"
        stroke={filled ? "var(--status-gap, #2c6bed)" : "currentColor"}
        strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
      />
    </g>
  );
}

/** Signal's delivery marks: a dashed circle while sending, one check when
 * sent, two outlined checks when delivered, two filled checks when read.
 * Set `--status-gap` to the colour behind the icon. */
export function StatusIcon({ status }: { status: MessageStatus }) {
  const label = LABELS[status];
  if (status === "sending") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" role="img" aria-label={label}>
        <title>{label}</title>
        <circle
          cx="6" cy="6" r="5.25" fill="none" stroke="currentColor"
          strokeWidth="1.1" strokeDasharray="2.2 1.9"
        />
      </svg>
    );
  }
  if (status === "failed") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" role="img" aria-label={label}>
        <title>{label}</title>
        <circle cx="6" cy="6" r="5.5" fill="var(--danger)" />
        <path d="M6 3v3.6M6 8.6v.2" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }
  const double = status !== "sent";
  return (
    <svg
      width={double ? 18 : 12} height="12" viewBox={double ? "0 0 18 12" : "0 0 12 12"}
      role="img" aria-label={label}
    >
      <title>{label}</title>
      <Check x={0} filled={status === "read"} />
      {double && <Check x={6} filled={status === "read"} />}
    </svg>
  );
}
