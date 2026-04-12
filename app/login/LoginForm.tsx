"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

export default function LoginForm() {
  const searchParams = useSearchParams();
  // We always send the user through the server-side dispatcher at /post-login,
  // which resolves their role (admin vs client portal user) and picks the
  // right destination. Forwarding the optional `next` lets admins land where
  // they were trying to go before being bounced to /login.
  const rawNext = searchParams.get("next");
  const next = rawNext
    ? `/post-login?next=${encodeURIComponent(rawNext)}`
    : "/post-login";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f4f4f5",
        padding: 24,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          border: "1px solid #e4e4e7",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 28 }}>Admin login</h1>
        <p style={{ color: "#71717a", fontSize: 14, marginTop: 8 }}>
          Sign in to access the admin panel.
        </p>

        <div style={{ marginTop: 16 }}>
          <label style={labelStyle}>Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            style={inputStyle}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>Password</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            style={inputStyle}
          />
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              fontSize: 13,
              color: "#b91c1c",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 16,
            width: "100%",
            border: "none",
            borderRadius: 10,
            padding: "12px 14px",
            background: "#18181b",
            color: "#fff",
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#71717a",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  background: "#fff",
  color: "#18181b",
};
