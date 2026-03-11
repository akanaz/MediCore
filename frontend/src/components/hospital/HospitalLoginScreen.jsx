import React, { useState } from "react";
import { hospitalLogin } from "../../services/hospitalApi";
import "../../styles/Hospital.css";

export default function HospitalLoginScreen({ onHospitalLogin, onBack }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Please enter your username and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await hospitalLogin(username.trim(), password);
      onHospitalLogin(data.user);
    } catch (err) {
      const msg = err.response?.data?.detail || "Invalid username or password.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hosp-login-overlay">
      <div className="hosp-login-card">
        <button className="hosp-login-back" onClick={onBack}>
          ← Back to Patient Login
        </button>

        <div className="hosp-login-brand">
          <span className="hosp-login-brand-icon">🏥</span>
          <span className="hosp-login-brand-name">MEDICORE</span>
          <span className="hosp-login-brand-tag">HOSPITAL</span>
        </div>

        <h1 className="hosp-login-title">Staff Portal</h1>
        <p className="hosp-login-sub">Enter your credentials to continue</p>

        {error && <div className="hosp-login-error">⚠ {error}</div>}

        <form onSubmit={handleSubmit} className="hosp-login-fields">
          <div className="hosp-login-field">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. dr_sharma"
              autoComplete="username"
              autoFocus
            />
          </div>
          <div className="hosp-login-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="hosp-login-btn" disabled={loading}>
            {loading ? "Signing in…" : "Sign in as Staff →"}
          </button>
        </form>
      </div>
    </div>
  );
}
