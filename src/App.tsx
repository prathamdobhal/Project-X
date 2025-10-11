import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";

import Sidebar from "./components/Sidebar";
import useResizableFont from "./hooks/useResizableFont";

// Pages
import WelcomePage from "./pages/WelcomePage";
import UploadPage from "./pages/UploadPage";
import ChatPage from "./pages/ChatPage";
import VisualsPage from "./pages/VisualsPage";
import SettingsPage from "./pages/SettingsPage";
import AuthPage from "./pages/AuthPage";
import UserDetails from "./pages/UserDetails";

import "./index.css";

// --- PROTECTED ROUTE ---
function ProtectedRoute({ children }: { children: JSX.Element }) {
  const session = localStorage.getItem("ops_user");
  if (!session) {
    return <Navigate to="/auth" replace />;
  }
  return children;
}

function LayoutWrapper() {
  const location = useLocation();
  useResizableFont();

  const [light, setLight] = useState<boolean>(() => localStorage.getItem("app-theme") === "light");

  useEffect(() => {
    document.body.style.background = light ? "#fff" : "var(--bg)";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    localStorage.setItem("app-theme", light ? "light" : "dark");
  }, [light]);

  // Hide sidebar/header on welcome and auth screens
  const hideUI = location.pathname === "/" || location.pathname === "/auth";

  function onDataReady(rows: any[]) {
    fetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    }).catch(() => {});
  }

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden" }}>
      {!hideUI && <Sidebar />}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        {!hideUI && (
          <header className="header" style={{ flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="brand">OpsCoPilot</div>
              <div className="subtle">AI Operations Center</div>
            </div>
          </header>
        )}

        <main style={{ flex: 1, display: "flex", minHeight: 0, minWidth: 0, overflow: "hidden" }}>
          <Routes>
            <Route path="/" element={<WelcomePage />} />
            <Route path="/auth" element={<AuthPage />} />

            {/* Protected /home */}
            <Route
              path="/home"
              element={
                <ProtectedRoute>
                  <UserDetails />
                </ProtectedRoute>
              }
            />

            {/* Protected App routes */}
            <Route
              path="/upload"
              element={
                <ProtectedRoute>
                  <UploadPage onDataReady={onDataReady} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <ChatPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/visuals"
              element={
                <ProtectedRoute>
                  <VisualsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <SettingsPage setTheme={setLight} theme={light} />
                </ProtectedRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <LayoutWrapper />
    </BrowserRouter>
  );
}
