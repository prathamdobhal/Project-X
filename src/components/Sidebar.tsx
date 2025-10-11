import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Home,
  UploadCloud,
  BarChart3,
  MessageSquare,
  Settings,
} from "lucide-react";

type IconLinkProps = {
  to: string;
  label: string;
  children: React.ReactNode;
};

function IconLink({ to, label, children }: IconLinkProps) {
  return (
    <NavLink
      to={to}
      aria-label={label}
      title={label}
      style={({ isActive }) => ({
        display: "grid",
        placeItems: "center",
        width: 48,
        height: 48,
        borderRadius: 12,
        color: "white",
        textDecoration: "none",
        background: isActive ? "rgba(59,130,246,0.18)" : "transparent",
        border: isActive
          ? "1px solid rgba(59,130,246,0.35)"
          : "1px solid transparent",
        transition:
          "transform .15s ease, background .15s ease, border .15s ease",
      })}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
      }}
    >
      {children}
    </NavLink>
  );
}

export default function Sidebar() {
  const navigate = useNavigate();

  return (
    <aside
      style={{
        width: 80,
        borderRight: "1px solid #1e293b",
        background: "var(--bg, #0b1220)",
        color: "white",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        alignItems: "center",
      }}
    >
      {/* Logo / Brand dot */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background:
            "linear-gradient(135deg, rgba(34,197,94,.25), rgba(56,189,248,.25))",
          border: "1px solid #334155",
          display: "grid",
          placeItems: "center",
          fontWeight: 800,
          marginBottom: 8,
          userSelect: "none",
        }}
        title="OpsCoPilot"
        aria-label="OpsCoPilot"
      >
        OC
      </div>

      <nav
        aria-label="Primary"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "center",
        }}
      >
        {/* Home → User Details */}
        <button
          aria-label="Home"
          title="Home"
          onClick={() => navigate("/home")}
          style={{
            display: "grid",
            placeItems: "center",
            width: 48,
            height: 48,
            borderRadius: 12,
            color: "white",
            background: "transparent",
            border: "1px solid transparent",
            cursor: "pointer",
            transition:
              "transform .15s ease, background .15s ease, border .15s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "rgba(59,130,246,0.18)";
            (e.currentTarget as HTMLButtonElement).style.border =
              "1px solid rgba(59,130,246,0.35)";
            (e.currentTarget as HTMLButtonElement).style.transform =
              "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "transparent";
            (e.currentTarget as HTMLButtonElement).style.border =
              "1px solid transparent";
            (e.currentTarget as HTMLButtonElement).style.transform =
              "translateY(0)";
          }}
        >
          <Home size={22} />
        </button>

        <IconLink to="/upload" label="Upload">
          <UploadCloud size={22} />
        </IconLink>

        <IconLink to="/visuals" label="Data Viz">
          <BarChart3 size={22} />
        </IconLink>

        <IconLink to="/chat" label="Chat">
          <MessageSquare size={22} />
        </IconLink>
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Settings pinned at bottom */}
      <nav aria-label="Settings">
        <IconLink to="/settings" label="Settings">
          <Settings size={22} />
        </IconLink>
      </nav>
    </aside>
  );
}
