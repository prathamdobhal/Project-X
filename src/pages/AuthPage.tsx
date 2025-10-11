// src/pages/AuthPage.tsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

/**
 * AuthPage
 *
 * Prefers Firebase if configured; otherwise uses localStorage-based auth.
 */

const LOCAL_USERS_KEY = "ops_users";
const SESSION_KEY = "ops_user";
const SIGNUP_TIMEOUT_MS = 8000; // protection against hanging helpers

/** Local storage multi-user helpers (dev only) */
type LocalUser = {
  name: string;
  email: string;
  password: string;
  joined: string;
  uid?: string;
};

function loadLocalUsers(): LocalUser[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}
function saveLocalUsers(users: LocalUser[]) {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {
    // ignore
  }
}

/** Feature-detect whether Firebase is configured in env */
function firebaseConfigured() {
  try {
    return Boolean(
      (import.meta as any)?.env?.VITE_FIREBASE_API_KEY &&
        (import.meta as any)?.VITE_FIREBASE_PROJECT_ID
    );
  } catch {
    return false;
  }
}

type FirebaseHelpers = {
  registerWithEmail: (displayName: string, email: string, password: string) => Promise<any>;
  signInWithEmail: (email: string, password: string) => Promise<any>;
  onAuthState?: (cb: (u: any) => void) => (() => void) | undefined;
};

export default function AuthPage() {
  const nav = useNavigate();

  const [mode, setMode] = useState<"signup" | "login">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [animKey, setAnimKey] = useState<number>(0);
  const [fb, setFb] = useState<FirebaseHelpers | null>(null);
  const [useFirebase, setUseFirebase] = useState(false);

  // Suppress Firebase auth-state mirroring during signup so success UI can show
  const suppressAuthSync = useRef(false);

  // If a session already exists, go to home (guard localStorage in case it's unavailable)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        nav("/home", { replace: true });
        return;
      }
    } catch {
      // ignore
    }
  }, [nav]);

  useEffect(() => {
    setAnimKey((k) => k + 1);
  }, [mode]);

  // Initialize Firebase helpers if configured; ensure proper subscription cleanup
  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      const configured = firebaseConfigured();
      if (!configured) {
        setUseFirebase(false);
        setFb(null);
        return;
      }

      try {
        const mod = await import("../lib/firebase");
        const helpers: FirebaseHelpers = {
          registerWithEmail: (mod as any).registerWithEmail,
          signInWithEmail: (mod as any).signInWithEmail,
          onAuthState: (mod as any).onAuthState,
        };
        setFb(helpers);
        setUseFirebase(true);

        if (helpers.onAuthState) {
          unsub = helpers.onAuthState((u: any) => {
            if (!u) {
              try {
                localStorage.removeItem(SESSION_KEY);
              } catch {
                // ignore
              }
            } else {
              // During signup we don't want to create a session that could trigger a redirect.
              if (suppressAuthSync.current) return;
              const session = {
                name: u.displayName ?? "",
                email: u.email,
                uid: u.uid,
                provider: "firebase",
                joined: new Date().toISOString(),
              };
              try {
                localStorage.setItem(SESSION_KEY, JSON.stringify(session));
              } catch {
                // ignore
              }
            }
          });
        }
      } catch (e) {
        console.warn("Firebase not available, falling back to localStorage auth", e);
        setFb(null);
        setUseFirebase(false);
      }
    })();

    return () => {
      try {
        unsub && unsub();
      } catch {
        // noop
      }
    };
  }, []);

  function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
    let timer: any;
    const t = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        try {
          onTimeout();
        } catch {}
        reject(new Error("Signup request timed out"));
      }, ms);
    });
    return Promise.race([p, t]).finally(() => clearTimeout(timer)) as Promise<T>;
  }

  // SIGN-UP
  async function onSignUp(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    setSuccess(null);

    if (!name.trim() || !email.trim() || !password.trim()) {
      setErr("Please fill all fields.");
      return;
    }

    setLoading(true);

    // Firebase path
    if (useFirebase && fb?.registerWithEmail) {
      console.log("[Auth] signup: firebase path");
      suppressAuthSync.current = true;

      let timedOut = false;
      try {
        const created = await withTimeout(
          fb.registerWithEmail(name.trim(), email.trim().toLowerCase(), password),
          SIGNUP_TIMEOUT_MS,
          () => {
            timedOut = true;
            console.warn("[Auth] signup timed out — helper may be hanging");
          }
        );

        // If register resolves (or even if backend created but helper hung), proceed to user-facing success
        const createdEmail = (created as any)?.email ?? email.trim().toLowerCase();

        setSuccess(
          timedOut
            ? "✅ Signup likely succeeded, but response timed out. Please try logging in below."
            : "✅ Signup complete! Please login below."
        );
        console.log("[Auth] signup success; switching to login UI");

        try {
          localStorage.removeItem(SESSION_KEY);
        } catch {
          // ignore
        }

        setMode("login");
        setEmail(createdEmail);
        setPassword("");

        // Fire signOut in the background to avoid auto-login races
        (async () => {
          try {
            const mod = await import("../lib/firebase");
            const fn = (mod as any).signOut ?? (mod as any).logout;
            if (typeof fn === "function") {
              await fn();
            }
          } catch {
            // ignore
          } finally {
            setTimeout(() => {
              suppressAuthSync.current = false;
            }, 0);
          }
        })();

        return;
      } catch (errAny: any) {
        console.error("[Auth] signup error:", errAny);
        const msg = (errAny?.message || "").toString();
        if (msg.includes("auth/email-already-in-use")) setErr("Email already in use.");
        else if (msg.includes("auth/invalid-email")) setErr("Invalid email address.");
        else if (msg.includes("auth/weak-password")) setErr("Password is too weak (min 6 chars).");
        else if (msg.includes("timed out"))
          setErr(
            "Signup request timed out. If you see 'email already in use' on retry, your account was created — try logging in."
          );
        else setErr("Sign up failed. " + (errAny?.message ?? ""));
        suppressAuthSync.current = false;
        return;
      } finally {
        setLoading(false);
      }
    }

    // Local storage path (dev fallback)
    console.log("[Auth] signup: local path");
    try {
      const users = loadLocalUsers();
      const lower = email.trim().toLowerCase();
      const exists = users.find((u) => u.email === lower);
      if (exists) {
        setErr("An account already exists with that email. Please login or use a different email.");
        return;
      }
      const newUser: LocalUser = {
        name: name.trim(),
        email: lower,
        password,
        joined: new Date().toISOString(),
        uid: `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      };
      users.push(newUser);
      saveLocalUsers(users);

      setSuccess("✅ Signup complete! Please login below.");
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {}
      setMode("login");
      setEmail(lower);
      setPassword("");
    } finally {
      setLoading(false);
    }
  }

  async function onLogin(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    setSuccess(null);
    setLoading(true);

    if (useFirebase && fb?.signInWithEmail) {
      console.log("[Auth] login: firebase path");
      try {
        const result = await fb.signInWithEmail(email.trim().toLowerCase(), password);
        const session = {
          name: result?.displayName ?? "",
          email: result?.email ?? email.trim().toLowerCase(),
          uid: result?.uid ?? "",
          provider: "firebase",
          joined: new Date().toISOString(),
        };
        try {
          localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        } catch {
          // ignore
        }
        nav("/home", { replace: true });
        return;
      } catch (errAny: any) {
        console.error("[Auth] login error:", errAny);
        const msg = (errAny?.message || "").toString();
        if (msg.includes("auth/wrong-password")) setErr("Incorrect password.");
        else if (msg.includes("auth/user-not-found")) setErr("No account found for this email.");
        else setErr("Login failed. " + (errAny?.message ?? ""));
        return;
      } finally {
        setLoading(false);
      }
    }

    console.log("[Auth] login: local path");
    try {
      const users = loadLocalUsers();
      const lower = email.trim().toLowerCase();
      const user = users.find((u) => u.email === lower);
      if (!user) {
        setErr("No account found with that email. Please sign up first.");
        return;
      }
      if (user.password !== password) {
        setErr("Invalid email or password.");
        return;
      }
      const session = {
        name: user.name,
        email: user.email,
        uid: user.uid,
        provider: "local",
        joined: user.joined,
      };
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } catch {}
      nav("/home", { replace: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "linear-gradient(135deg, #0b1220 60%, #13223a)",
        color: "white",
        overflow: "hidden",
        padding: "20px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "rgba(255, 255, 255, 0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "18px",
          padding: "32px 36px",
          boxShadow: "0 10px 40px rgba(0,0,0,0.45)",
          backdropFilter: "blur(12px)",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "2.2rem",
            fontWeight: 900,
            marginBottom: "6px",
            display: "inline-block",
          }}
        >
          Ops <span style={{ color: "#22d3ee" }}>CoPilot</span>
        </h1>
        <p style={{ color: "#94a3b8", marginBottom: "22px" }}>
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </p>

        <style>{`
          .auth-card-content {
            will-change: transform, opacity;
            animation-duration: 360ms;
            animation-timing-function: cubic-bezier(.2,.9,.3,1);
            animation-fill-mode: both;
          }
          @keyframes slideInFromRight {
            0% { transform: translateX(18px); opacity: 0; }
            100% { transform: translateX(0); opacity: 1; }
          }
          @keyframes slideInFromLeft {
            0% { transform: translateX(-18px); opacity: 0; }
            100% { transform: translateX(0); opacity: 1; }
          }
        `}</style>

        <div
          key={animKey}
          className="auth-card-content"
          style={{
            animationName: mode === "signup" ? "slideInFromRight" : "slideInFromLeft",
            textAlign: "left",
          }}
        >
          <form onSubmit={(e) => (mode === "signup" ? onSignUp(e) : onLogin(e))}>
            {mode === "signup" && (
              <div style={{ marginBottom: "14px" }}>
                <label style={labelStyle}>Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  style={inputStyle}
                />
              </div>
            )}

            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={inputStyle}
              />
            </div>

            {/* Show success in green and errors in red */}
            {success && (
              <div style={{ color: "#4ade80", fontSize: "14px", marginBottom: "12px" }}>
                {success}
              </div>
            )}
            {err && (
              <div style={{ color: "#f87171", fontSize: "14px", marginBottom: "12px" }}>
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                background: loading ? "rgba(34,211,238,0.6)" : "#22d3ee",
                border: "none",
                borderRadius: "10px",
                color: "#0b1220",
                fontWeight: 700,
                fontSize: "15px",
                padding: "10px 0",
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 4px 12px rgba(34,211,238,0.4)",
                transition: "transform 0.15s ease",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.transform = loading ? "translateY(0)" : "translateY(-1px)")
              }
              onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
            >
              {loading ? (mode === "signup" ? "Signing Up..." : "Logging In...") : mode === "signup" ? "Sign Up" : "Login"}
            </button>
          </form>
        </div>

        <div
          style={{
            textAlign: "center",
            fontSize: "14px",
            marginTop: "18px",
            color: "#94a3b8",
          }}
        >
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <span
                style={{ color: "#22d3ee", cursor: "pointer" }}
                onClick={() => {
                  setMode("login");
                  setErr(null);
                  setSuccess(null);
                }}
              >
                Login
              </span>
            </>
          ) : (
            <>
              New user?{" "}
              <button
                type="button"
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  margin: 0,
                  color: "#22d3ee",
                  cursor: "pointer",
                  font: "inherit",
                }}
                onClick={() => {
                  setMode("signup");
                  setErr(null);
                  setSuccess(null);
                }}
              >
                Sign up
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#cbd5e1",
  display: "block",
  marginBottom: "6px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "white",
  outline: "none",
  fontSize: "15px",
  boxSizing: "border-box",
};
