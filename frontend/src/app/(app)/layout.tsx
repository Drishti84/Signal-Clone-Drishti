"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { SocketProvider } from "@/components/providers/SocketProvider";
import { SignalLogo } from "@/components/ui/SignalLogo";
import { useAuth } from "@/store/auth";
import { resetStores } from "@/store/events";

/** Everything under here needs a signed-in user with a finished profile.
 * Anyone else is sent to /login. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const token = useAuth((state) => state.token);
  const hasProfile = useAuth((state) => !!state.user?.display_name);
  const hydrated = useAuth((state) => state.hydrated);
  const ready = hydrated && !!token && hasProfile;

  useEffect(() => {
    if (hydrated && !ready) {
      resetStores();
      router.replace("/login");
    }
  }, [hydrated, ready, router]);

  if (!ready || !token) {
    return (
      <div className="flex h-full items-center justify-center bg-pane">
        <SignalLogo size={72} />
      </div>
    );
  }
  return <SocketProvider token={token}>{children}</SocketProvider>;
}
