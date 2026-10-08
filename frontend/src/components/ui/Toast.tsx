"use client";

import { useUi } from "@/store/ui";

/** Signal-style toasts: dark pills at the bottom centre that fade on their own. */
export function ToastHost() {
  const toasts = useUi((state) => state.toasts);
  const dismiss = useUi((state) => state.dismiss);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          onClick={() => dismiss(toast.id)}
          className="animate-pop-in pointer-events-auto max-w-[420px] rounded-lg bg-toast px-4 py-2.5 text-left text-sm text-white shadow-pop"
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
