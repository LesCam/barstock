"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") ?? "");
    setReady(true);
  }, []);

  const mutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      router.push("/login?reset=success");
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

    mutation.mutate({ token, password });
  }

  if (!ready) return null;

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
            This password reset link is invalid or has expired.
          </p>
          <Link
            href="/forgot-password"
            className="text-sm transition-opacity hover:opacity-80"
            style={{ color: "var(--gold)" }}
          >
            Request a new reset link
          </Link>
        </section>
      </div>
    );
  }

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
          Reset Password
        </h1>
        <p className="mb-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Enter your new password below.
        </p>

        {(validationError || mutation.error) && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {validationError || mutation.error?.message || "Something went wrong. Please try again."}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
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
              placeholder="New password (min 8 characters)"
              className="block w-full border bg-white/5 py-2.5 pl-10 pr-3 text-sm placeholder-gray-500 focus:outline-none focus:ring-1"
              style={{
                borderRadius: "var(--radius-input)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
                "--tw-ring-color": "var(--gold)",
              } as React.CSSProperties}
            />
          </div>

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

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full px-4 py-2.5 text-sm font-semibold disabled:opacity-50 transition-colors"
            style={{
              borderRadius: "var(--radius-button)",
              backgroundColor: "var(--gold)",
              color: "var(--navy-bg)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--gold-dark)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--gold)")}
          >
            {mutation.isPending ? "Resetting..." : "Reset Password"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link
            href="/login"
            className="text-sm transition-opacity hover:opacity-80"
            style={{ color: "var(--gold)" }}
          >
            Back to sign in
          </Link>
        </div>
      </section>
    </div>
  );
}
