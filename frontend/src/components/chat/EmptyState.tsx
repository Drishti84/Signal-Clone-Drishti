import type { LucideIcon } from "lucide-react";

import { SignalLogo } from "@/components/ui/SignalLogo";

/** What the chat pane shows before a conversation is picked. */
export function EmptyState() {
  return (
    <section className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 bg-bg px-8 text-center max-md:hidden">
      <span className="text-fg-3"><SignalLogo size={88} mono /></span>
      <h2 className="text-xl font-semibold">Welcome to Signal</h2>
      <p className="max-w-[340px] text-fg-2">
        Pick a chat on the left, or start a new one with the pencil button.
      </p>
    </section>
  );
}

/** Stand-in for sections the assignment lists as placeholders. */
export function ComingSoon({
  Icon, title, text,
}: { Icon: LucideIcon; title: string; text: string }) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-bg px-8 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-pane text-fg-2">
        <Icon size={36} strokeWidth={1.6} />
      </span>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="max-w-[340px] text-fg-2">{text}</p>
      <span className="rounded-full bg-hover px-3 py-1 text-xs font-semibold uppercase tracking-wide text-fg-2">
        Coming soon
      </span>
    </section>
  );
}
