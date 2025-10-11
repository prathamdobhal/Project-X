// src/pages/WelcomePage.tsx
import React from "react";
import { useNavigate } from "react-router-dom";

export default function WelcomePage() {
  const navigate = useNavigate();

  return (
    <div className="welcome">
      <div className="orb orb1" />
      <div className="orb orb2" />
      <div className="orb orb3" />
      <div className="welcome-inner">
        <h1 className="welcome-title">
          <span className="gradient-text">Ops</span>{" "}
          <span style={{ color: "white" }}>CoPilot</span>
        </h1>
        <p className="welcome-sub">
          A lightweight operations co-pilot built to help you visualise, ask and act on your plant dataset.
        </p>

        <div style={{ marginTop: 36 }}>
          <button
            className="get-started btn-accent"
            onClick={() => {
              // navigate to the authenticator page
              navigate("/auth");
            }}
            aria-label="Get started"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}
