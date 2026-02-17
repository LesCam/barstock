"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "success") {
      setResetSuccess(true);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError("Invalid email or password");
    } else {
      router.push("/");
    }
  }

  return (
    <div className="flex flex-col items-center justify-center px-4 py-12">
      {/* Card */}
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
        <header className="mb-4 flex flex-col items-center text-center">
          <div className="mb-2 h-24 w-40 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/brand/barstock-master.png"
              alt="Barstock"
              className="h-full w-full object-contain"
              style={{ transform: "scale(1.76)" }}
            />
          </div>
          <h1
            className="text-xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Welcome Back
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Login to manage your bar inventory.
          </p>
        </header>

        {resetSuccess && (
          <div className="mb-4 rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-400">
            Password reset successfully. Please sign in with your new password.
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Email */}
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

          {/* Password */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <svg className="h-4 w-4" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              className="block w-full border bg-white/5 py-2.5 pl-10 pr-28 text-sm placeholder-gray-500 focus:outline-none focus:ring-1"
              style={{
                borderRadius: "var(--radius-input)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
                "--tw-ring-color": "var(--gold)",
              } as React.CSSProperties}
            />
            <Link
              href="/forgot-password"
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs transition-opacity hover:opacity-80"
              style={{ color: "var(--gold)" }}
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2.5 text-sm font-semibold disabled:opacity-50 transition-colors"
            style={{
              borderRadius: "var(--radius-button)",
              backgroundColor: "var(--gold)",
              color: "var(--navy-bg)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--gold-dark)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--gold)")}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {/* Badges */}
        <div className="mt-5 flex items-center justify-center gap-3">
          <a href="#" aria-label="Download on the App Store">
{/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/badges/appstore.svg" alt="App Store" width={90} height={28} />
          </a>
          <a href="#" aria-label="Get it on Google Play">
{/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/badges/googleplay.svg" alt="Google Play" width={90} height={28} />
          </a>
        </div>

        {/* Footer links */}
        <footer
          className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          <span>Help Center</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <span>Contact Us</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <span>Privacy Policy</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <span>Terms &amp; Conditions</span>
        </footer>
      </section>
    </div>
  );
}
