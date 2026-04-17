"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const res = await signIn("credentials", {
      username,
      password,
      redirect: false,
      callbackUrl,
    });
    setLoading(false);
    if (res?.error) {
      setErr("用户名或密码错误");
      return;
    }
    router.push(callbackUrl);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: 320,
          background: "#141823",
          padding: 24,
          borderRadius: 12,
          boxShadow: "0 6px 24px rgba(0,0,0,0.3)",
        }}
      >
        <h1 style={{ margin: "0 0 16px", fontSize: 18 }}>news-monitor</h1>
        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ marginBottom: 4, opacity: 0.7 }}>用户名</div>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            style={inputStyle}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          <div style={{ marginBottom: 4, opacity: 0.7 }}>密码</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </label>
        {err && (
          <div style={{ color: "#ff6b6b", marginBottom: 12 }}>{err}</div>
        )}
        <button type="submit" disabled={loading} style={btnStyle}>
          {loading ? "登录中…" : "登录"}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "#0b0e14",
  border: "1px solid #2a2f3d",
  borderRadius: 6,
  outline: "none",
};

const btnStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "#3b82f6",
  border: 0,
  borderRadius: 6,
  cursor: "pointer",
  color: "#fff",
};
