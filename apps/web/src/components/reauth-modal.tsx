"use client";

import { createContext, useContext, useState, useRef, useCallback } from "react";
import { signIn, useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";

type ReAuthContextValue = {
  withReAuth: <T>(fn: () => Promise<T>) => Promise<T>;
};

const ReAuthContext = createContext<ReAuthContextValue>({
  withReAuth: (fn) => fn(),
});

export function useReAuth() {
  return useContext(ReAuthContext);
}

type PendingRetry = {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  fn: () => Promise<any>;
};

export function ReAuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [showMfa, setShowMfa] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pendingRef = useRef<PendingRetry | null>(null);

  const reAuthMutation = trpc.auth.reAuthenticate.useMutation();

  const reset = useCallback(() => {
    setOpen(false);
    setPassword("");
    setMfaCode("");
    setShowMfa(false);
    setError("");
    setLoading(false);
  }, []);

  const withReAuth = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (err: any) {
        if (err?.message === "RE_AUTH_REQUIRED") {
          return new Promise<T>((resolve, reject) => {
            pendingRef.current = { resolve, reject, fn };
            setOpen(true);
          });
        }
        throw err;
      }
    },
    [],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await reAuthMutation.mutateAsync({
        password,
        mfaCode: showMfa ? mfaCode : undefined,
      });

      // If server says MFA required and we haven't shown it yet
      if (result.requiresMfa && !showMfa) {
        setShowMfa(true);
        setLoading(false);
        return;
      }

      // Credentials verified — refresh NextAuth session to update authAt
      const email = session?.user?.email;
      if (email) {
        await signIn("credentials", { email, password, redirect: false });
      }

      // Retry the original mutation
      const pending = pendingRef.current;
      if (pending) {
        pendingRef.current = null;
        reset();
        try {
          const result = await pending.fn();
          pending.resolve(result);
        } catch (retryErr) {
          pending.reject(retryErr);
        }
      } else {
        reset();
      }
    } catch (err: any) {
      setLoading(false);
      if (err?.message === "MFA code required") {
        setShowMfa(true);
        setError("");
      } else {
        setError(err?.message || "Authentication failed");
      }
    }
  }

  function handleCancel() {
    const pending = pendingRef.current;
    if (pending) {
      pendingRef.current = null;
      pending.reject(new Error("RE_AUTH_REQUIRED"));
    }
    reset();
  }

  return (
    <ReAuthContext.Provider value={{ withReAuth }}>
      {children}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1623]/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#16283F] p-6 shadow-2xl">
            <h2
              className="mb-1 text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Confirm Your Identity
            </h2>
            <p className="mb-4 text-sm" style={{ color: "var(--text-muted)" }}>
              This action requires recent authentication.
            </p>

            {error && (
              <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 text-sm text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label
                  className="mb-1 block text-xs font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Password
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="block w-full border bg-white/5 px-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:ring-1"
                  style={{
                    borderRadius: "var(--radius-input)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                    "--tw-ring-color": "var(--gold)",
                  } as React.CSSProperties}
                />
              </div>

              {showMfa && (
                <div>
                  <label
                    className="mb-1 block text-xs font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    MFA Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    autoFocus
                    value={mfaCode}
                    onChange={(e) =>
                      setMfaCode(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder="000000"
                    className="block w-full border bg-white/5 px-3 py-2 text-center text-sm font-mono tracking-[0.3em] placeholder-gray-500 focus:outline-none focus:ring-1"
                    style={{
                      borderRadius: "var(--radius-input)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-primary)",
                      "--tw-ring-color": "var(--gold)",
                    } as React.CSSProperties}
                  />
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-sm transition-colors hover:bg-white/5"
                  style={{ color: "var(--text-muted)" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    loading || !password || (showMfa && mfaCode.length !== 6)
                  }
                  className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 transition-colors"
                  style={{
                    backgroundColor: "var(--gold)",
                    color: "var(--navy-bg)",
                  }}
                >
                  {loading ? "Verifying..." : "Confirm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ReAuthContext.Provider>
  );
}
