import React from "react";
import { getAuth, signOut } from "firebase/auth";

type Props = { theme: boolean; setTheme: (v: boolean) => void };

export default function SettingsPage({ theme, setTheme }: Props) {
  const handleSignOut = async () => {
    try {
      const auth = getAuth();
      await signOut(auth);
      console.log("Signed out successfully");
      // Optional: redirect or refresh after sign out
      window.location.href = "/login"; 
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <div style={{ flex: 1, padding: 24, color: "white" }}>
      <h2>Settings</h2>

      <div
        style={{
          marginTop: 16,
          padding: 16,
          border: "1px solid #1e293b",
          borderRadius: 12,
          background: "rgba(15,23,42,.6)",
        }}
      >
        <button
          onClick={handleSignOut}
          style={{
            background: "#ef4444",
            border: "none",
            color: "white",
            padding: "10px 16px",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
