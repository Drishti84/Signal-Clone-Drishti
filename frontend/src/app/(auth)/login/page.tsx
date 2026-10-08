"use client";

import { ArrowLeft, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { OtpInput } from "@/components/auth/OtpInput";
import { AvatarEditor } from "@/components/profile/AvatarEditor";
import { Button } from "@/components/ui/Button";
import { SignalLogo } from "@/components/ui/SignalLogo";
import { Spinner } from "@/components/ui/Spinner";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { api, errorMessage } from "@/lib/api";
import { COUNTRIES, DEMO_OTP, NAME_MAX_LENGTH } from "@/lib/constants";
import { cleanPhoneInput, composePhone, formatPhone, phoneProblem } from "@/lib/format";
import { draftFromUser, saveProfile, type AvatarDraft } from "@/lib/profile";
import type { User, VerifyResponse } from "@/lib/types";
import { useAuth } from "@/store/auth";

// The free hosting tier sleeps when idle; tell people why the first tap is slow.
const SLOW_AFTER_MS = 3000;

type Step = "phone" | "code" | "profile";

export default function LoginPage() {
  const router = useRouter();
  const { token, user, hydrated, setSession } = useAuth();

  const [step, setStep] = useState<Step>("phone");
  const [countryCode, setCountryCode] = useState("+91");
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<AvatarDraft>(() => draftFromUser(null));
  const [error, setError] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [demoUsers, setDemoUsers] = useState<User[] | null>(null);

  const country = COUNTRIES.find((entry) => entry.code === countryCode) ?? COUNTRIES[0];
  const phone = composePhone(countryCode, number);
  const signedIn = hydrated && !!token && !!user;
  const needsProfile = signedIn && !user.display_name;

  // Someone already signed in has no business on this page, unless they
  // still owe us a display name.
  useEffect(() => {
    if (signedIn && !needsProfile) router.replace("/");
  }, [signedIn, needsProfile, router]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => !cancelled && setSlow(true), SLOW_AFTER_MS);
    api
      .get<User[]>("/api/auth/demo-users")
      .then((users) => !cancelled && setDemoUsers(users))
      .catch(() => !cancelled && setDemoUsers([]))
      .finally(() => {
        clearTimeout(timer);
        if (!cancelled) setSlow(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  /** Run a request with the busy state and the "server is waking" hint. */
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError("");
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    try {
      await task();
    } catch (failure) {
      setError(errorMessage(failure));
      throw failure;
    } finally {
      clearTimeout(timer);
      setSlow(false);
      setBusy(false);
    }
  };

  const verify = (phoneNumber: string, otp: string) =>
    run(async () => {
      const result = await api.post<VerifyResponse>("/api/auth/verify-otp", {
        phone: phoneNumber,
        otp,
      });
      setSession(result.token, result.user);
      if (result.needs_profile) {
        setDraft(draftFromUser(result.user));
        setStep("profile");
      }
    });

  const submitPhone = (event: FormEvent) => {
    event.preventDefault();
    // Catch a wrong-length number here, before any code is "sent".
    const problem = phoneProblem(countryCode, number, country.digits);
    if (problem) {
      setError(problem);
      return;
    }
    void run(async () => {
      await api.post("/api/auth/request-otp", { phone });
      setCode("");
      setStep("code");
    }).catch(() => undefined);
  };

  const submitCode = (otp: string) => {
    void verify(phone, otp).catch(() => {
      setCode("");
      setShakeKey((key) => key + 1);
    });
  };

  const submitProfile = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await saveProfile({ display_name: name }, draft);
      router.replace("/");
    }).catch(() => undefined);
  };

  const showProfile = step === "profile" || needsProfile;

  return (
    <main className="flex h-full flex-col items-center overflow-y-auto bg-pane px-4 py-10">
      <div className="my-auto w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <SignalLogo size={64} />
          <h1 className="text-2xl font-semibold">
            {showProfile ? "Set up your profile" : step === "code" ? "Enter your code" : "Welcome to Signal"}
          </h1>
          <p className="max-w-[320px] text-fg-2">
            {showProfile
              ? "Profiles are visible to people you message."
              : step === "code"
                ? `Enter the code we sent to ${formatPhone(phone)}.`
                : "Enter your phone number to get started."}
          </p>
        </div>

        <div className="rounded-2xl bg-surface p-6 shadow-pop">
          {showProfile ? (
            <form onSubmit={submitProfile} className="flex flex-col gap-5">
              <AvatarEditor draft={draft} name={name} onChange={setDraft} />
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-fg-2">Your name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={NAME_MAX_LENGTH}
                  autoFocus
                  placeholder="First name and surname"
                  className="h-10 rounded-lg border border-border bg-bg px-3 outline-none focus:border-accent"
                />
              </label>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? <Spinner size={16} /> : "Finish"}
              </Button>
            </form>
          ) : step === "code" ? (
            <div className="flex flex-col gap-5">
              <OtpInput
                value={code} onChange={setCode} onComplete={submitCode}
                shakeKey={shakeKey} disabled={busy}
              />
              <p className="rounded-lg bg-hover px-3 py-2 text-center text-[13px] text-fg-2">
                Demo code: <span className="font-semibold tracking-widest text-fg">{DEMO_OTP}</span>
                <br />No SMS is sent in this demo.
              </p>
              <button
                type="button"
                onClick={() => { setStep("phone"); setError(""); }}
                className="inline-flex items-center justify-center gap-1 text-[13px] font-medium text-accent hover:underline"
              >
                <ArrowLeft size={14} /> Use a different number
              </button>
            </div>
          ) : (
            <form onSubmit={submitPhone} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-fg-2">Country</span>
                <select
                  value={countryCode}
                  onChange={(event) => {
                    const next = COUNTRIES.find((entry) => entry.code === event.target.value) ?? country;
                    setCountryCode(next.code);
                    // A different country may allow fewer digits.
                    setNumber((current) => cleanPhoneInput(next.code, current, next.digits));
                    setError("");
                  }}
                  className="h-10 rounded-lg border border-border bg-bg px-2 outline-none focus:border-accent"
                >
                  {COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>{country.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-fg-2">Phone number</span>
                <div className="flex h-10 items-center rounded-lg border border-border bg-bg focus-within:border-accent">
                  <span className="border-r border-border px-3 text-fg-2">{countryCode}</span>
                  <input
                    value={number}
                    onChange={(event) => {
                      // Letters, symbols and extra digits never make it into the box.
                      setNumber(cleanPhoneInput(countryCode, event.target.value, country.digits));
                      setError("");
                    }}
                    type="tel"
                    inputMode="numeric"
                    aria-describedby="phone-hint"
                    autoComplete="tel-national"
                    autoFocus
                    placeholder="98765 43210"
                    className="h-full min-w-0 flex-1 bg-transparent px-3 outline-none"
                  />
                </div>
                <span id="phone-hint" className="text-xs text-fg-3">
                  {number.length} of {country.digits} digits
                </span>
              </label>
              <Button type="submit" disabled={busy || number.length !== country.digits}>
                {busy ? <Spinner size={16} /> : "Next"}
              </Button>
            </form>
          )}

          {error && <p role="alert" className="mt-4 text-center text-[13px] text-danger">{error}</p>}
          {slow && (
            <p className="mt-4 text-center text-[13px] text-fg-2">
              Waking the server… this can take up to a minute on the free tier.
            </p>
          )}
        </div>

        {!showProfile && step === "phone" && (
          <section className="mt-6">
            <h2 className="mb-1 text-center text-[13px] font-semibold uppercase tracking-wide text-fg-2">
              Demo accounts
            </h2>
            <p className="mb-3 text-center text-[13px] text-fg-2">
              Sign in with one click. Open a second browser as someone else to chat live.
            </p>
            {demoUsers === null ? (
              <div className="flex justify-center py-4 text-fg-2"><Spinner /></div>
            ) : demoUsers.length === 0 ? (
              <p className="text-center text-[13px] text-fg-3">No demo accounts available.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {demoUsers.map((demo) => (
                  <button
                    key={demo.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void verify(demo.phone, DEMO_OTP).catch(() => undefined)}
                    className="flex items-center gap-2.5 rounded-xl bg-surface p-2.5 text-left transition-colors hover:bg-hover disabled:opacity-60"
                  >
                    <UserAvatar user={demo} size={36} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{demo.display_name}</span>
                      <span className="block truncate text-xs text-fg-2">{formatPhone(demo.phone)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-fg-3">
          <Lock size={12} /> A Signal clone built for an assignment. Encryption is simulated.
        </p>
      </div>
    </main>
  );
}
