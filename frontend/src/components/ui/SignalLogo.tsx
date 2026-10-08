/** A hand-drawn mark in the spirit of Signal's: a speech bubble with a
 * dashed outline. Drawn from scratch, not copied from Signal's artwork. */
export function SignalLogo({ size = 64, mono = false }: { size?: number; mono?: boolean }) {
  const colour = mono ? "currentColor" : "#2c6bed";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <circle
        cx="32" cy="31" r="26"
        stroke={colour} strokeWidth="3.2" strokeDasharray="6.2 3.9" strokeLinecap="round"
      />
      <path
        d="M32 12.5c-10.5 0-19 8.3-19 18.5 0 3.5 1 6.8 2.8 9.6L13.6 50l9.8-2.5c2.6 1.3 5.5 2 8.6 2 10.5 0 19-8.3 19-18.5S42.5 12.5 32 12.5Z"
        fill={colour}
      />
    </svg>
  );
}
