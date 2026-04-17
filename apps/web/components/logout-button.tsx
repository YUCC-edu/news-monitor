"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      style={{
        width: "100%",
        padding: "6px 12px",
        background: "transparent",
        border: "1px solid #2a2f3d",
        borderRadius: 6,
        color: "#cdd2dc",
        cursor: "pointer",
      }}
    >
      退出
    </button>
  );
}
