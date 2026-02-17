"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const mutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => setSubmitted(true),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({ email });
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

        {submitted ? (
          <>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
            </div>
            <h1 className="mb-1 text-xl font-bold" style={{ color: "var(--text-primary)" }}>
              Check Your Email
            </h1>
            <p className="mb-6 text-sm" style={{ color: "var(--text-muted)" }}>
              If an account exists with that email, we&apos;ve sent a password reset link. Check your inbox and follow the instructions.
            </p>
            <Link
              href="/login"
              className="inline-flex text-sm transition-opacity hover:opacity-80"
              style={{ color: "var(--gold)" }}
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-center text-xl font-bold" style={{ color: "var(--text-primary)" }}>
              Forgot Password
            </h1>
            <p className="mb-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>

            {mutation.error && (
              <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                Something went wrong. Please try again.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <svg className="h-4 w-4" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                  </svg>
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email Address"
                  autoComplete="email"
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
                {mutation.isPending ? "Sending..." : "Send Reset Link"}
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
          </>
        )}
      </section>
    </div>
  );
}
