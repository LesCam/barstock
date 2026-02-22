"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

export default function AcceptInvitePage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pin, setPin] = useState("");
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") ?? "");
    setReady(true);
  }, []);

  const { data: inviteInfo, isLoading: infoLoading } = trpc.auth.getInviteInfo.useQuery(
    { token },
    { enabled: !!token }
  );

  // Pre-fill name from invite
  const [namesPrefilled, setNamesPrefilled] = useState(false);
  useEffect(() => {
    if (inviteInfo?.valid && !namesPrefilled) {
      setFirstName(inviteInfo.firstName ?? "");
      setLastName(inviteInfo.lastName ?? "");
      setNamesPrefilled(true);
    }
  }, [inviteInfo, namesPrefilled]);

  const acceptMutation = trpc.auth.acceptInvite.useMutation({
    onSuccess: async () => {
      // Auto-login via next-auth using the credentials just set
      const email = inviteInfo?.valid ? inviteInfo.email : "";
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
        // Fallback: redirect to login if auto-sign-in fails
        router.push("/login?invite=accepted");
      } else {
        router.push("/");
      }
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError("");

    if (password !== confirmPassword) {
      setValidationError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setValidationError("Password must be at least 8 characters");
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setValidationError("PIN must be exactly 4 digits");
      return;
    }

    acceptMutation.mutate({
      token,
      password,
      pin,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
    });
  }

  if (!ready || infoLoading) return null;

  // No token in URL
  if (!token) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12">
        <section
          className="w-full max-w-sm p-8 backdrop-blur-xl"
          style={{
            backgroundColor: "var(--navy-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <h1 className="mb-2 text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            Invalid Link
          </h1>
          <p className="mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
            This invite link is invalid or missing.
          </p>
          <Link
            href="/login"
            className="text-sm transition-opacity hover:opacity-80"
            style={{ color: "var(--gold)" }}
          >
            Go to sign in
          </Link>
        </section>
      </div>
    );
  }

  // Invalid invite (expired, accepted, cancelled, not found)
  if (inviteInfo && !inviteInfo.valid) {
    const messages: Record<string, string> = {
      expired: "This invite link has expired. Please ask your administrator to send a new one.",
      accepted: "This invite has already been accepted.",
      cancelled: "This invite has been cancelled.",
      not_found: "This invite link is invalid.",
    };
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12">
        <section
          className="w-full max-w-sm p-8 backdrop-blur-xl"
          style={{
            backgroundColor: "var(--navy-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <h1 className="mb-2 text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            Invite Unavailable
          </h1>
          <p className="mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
            {(inviteInfo.reason && messages[inviteInfo.reason]) ?? "This invite is no longer valid."}
          </p>
          <Link
            href="/login"
            className="text-sm transition-opacity hover:opacity-80"
            style={{ color: "var(--gold)" }}
          >
            Go to sign in
          </Link>
        </section>
      </div>
    );
  }

  // Valid invite — show accept form
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12">
      <section
        className="w-full max-w-sm p-8 backdrop-blur-xl"
        style={{
          backgroundColor: "var(--navy-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/brand/barstock-master.png" alt="Barstock" width={80} height={80} />
        </div>

        <h1 className="mb-1 text-center text-xl font-bold" style={{ color: "var(--text-primary)" }}>
          Join {inviteInfo?.businessName}
        </h1>
        <p className="mb-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Set up your account to get started.
        </p>

        {(validationError || acceptMutation.error) && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {validationError || acceptMutation.error?.message || "Something went wrong. Please try again."}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Email (read-only) */}
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Email
            </label>
            <input
              type="email"
              value={inviteInfo?.email ?? ""}
              disabled
              className="block w-full border bg-white/5 py-2.5 px-3 text-sm opacity-60"
              style={{
                borderRadius: "var(--radius-input)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* Name fields */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                First Name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                className="block w-full border bg-white/5 py-2.5 px-3 text-sm placeholder-gray-500 focus:outline-none focus:ring-1"
                style={{
                  borderRadius: "var(--radius-input)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                  "--tw-ring-color": "var(--gold)",
                } as React.CSSProperties}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
                className="block w-full border bg-white/5 py-2.5 px-3 text-sm placeholder-gray-500 focus:outline-none focus:ring-1"
                style={{
                  borderRadius: "var(--radius-input)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                  "--tw-ring-color": "var(--gold)",
                } as React.CSSProperties}
              />
            </div>
          </div>

          {/* Password */}
          <div className="relative">
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Password
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <svg className="h-4 w-4" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              </div>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="block w-full border bg-white/5 py-2.5 pl-10 pr-3 text-sm placeholder-gray-500 focus:outline-none focus:ring-1"
                style={{
                  borderRadius: "var(--radius-input)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                  "--tw-ring-color": "var(--gold)",
                } as React.CSSProperties}
              />
            </div>
          </div>

          {/* Confirm Password */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <svg className="h-4 w-4" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className="block w-full border bg-white/5 py-2.5 pl-10 pr-3 text-sm placeholder-gray-500 focus:outline-none focus:ring-1"
              style={{
                borderRadius: "var(--radius-input)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
                "--tw-ring-color": "var(--gold)",
              } as React.CSSProperties}
            />
          </div>

          {/* PIN */}
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Mobile PIN (4 digits)
            </label>
            <input
              type="text"
              inputMode="numeric"
              required
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              maxLength={4}
              placeholder="0000"
              className="block w-full border bg-white/5 py-2.5 px-3 text-sm tracking-widest placeholder-gray-500 focus:outline-none focus:ring-1"
              style={{
                borderRadius: "var(--radius-input)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
                "--tw-ring-color": "var(--gold)",
              } as React.CSSProperties}
            />
          </div>

          <button
            type="submit"
            disabled={acceptMutation.isPending}
            className="w-full px-4 py-2.5 text-sm font-semibold disabled:opacity-50 transition-colors"
            style={{
              borderRadius: "var(--radius-button)",
              backgroundColor: "var(--gold)",
              color: "var(--navy-bg)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--gold-dark)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--gold)")}
          >
            {acceptMutation.isPending ? "Setting up..." : "Accept Invite"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link
            href="/login"
            className="text-sm transition-opacity hover:opacity-80"
            style={{ color: "var(--gold)" }}
          >
            Already have an account? Sign in
          </Link>
        </div>
      </section>
    </div>
  );
}
