import { Lock } from "lucide-react";

export function DateDivider({ label }: { label: string }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="rounded-full bg-pane px-3 py-1 text-xs font-medium text-fg-2">{label}</span>
    </div>
  );
}

export function UnreadDivider() {
  return (
    <div data-unread-divider className="my-3 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="rounded-full bg-hover px-3 py-1 text-xs font-medium">Unread messages</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Group events such as "Asha added Rohan". */
export function SystemMessage({ body }: { body: string }) {
  return <p className="my-2 px-8 text-center text-xs text-fg-2">{body}</p>;
}

/** Shown once at the top of every chat. The encryption itself is simulated. */
export function EncryptionNotice() {
  return (
    <p className="mx-auto mb-2 mt-4 flex max-w-[360px] items-start justify-center gap-1.5 text-center text-xs text-fg-2">
      <Lock size={12} className="mt-0.5 shrink-0" />
      Messages and calls in this chat are end-to-end encrypted.
    </p>
  );
}

export function TypingBubble() {
  return (
    <div className="mt-3 flex" aria-label="Typing">
      <div className="flex h-9 items-center gap-1 rounded-[18px] bg-bubble-in px-3.5">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="h-1.5 w-1.5 rounded-full bg-fg-2"
            style={{ animation: "typing-dot 1.2s infinite", animationDelay: `${dot * 0.18}s` }}
          />
        ))}
      </div>
    </div>
  );
}
