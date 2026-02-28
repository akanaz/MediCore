import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { signup, login } from "../services/api";
import "../styles/AuthScreen.css";

function AuthScreen({ onLogin }) {
  const { t } = useTranslation();
  const [showAuth, setShowAuth] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleAuth = async (type) => {
    setError("");
    setLoading(true);

    if (!email || !password) {
      setError(t("auth.fillAllFields"));
      setLoading(false);
      return;
    }

    if (!validateEmail(email)) {
      setError(t("auth.validEmail"));
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError(t("auth.passwordLength"));
      setLoading(false);
      return;
    }

    if (type === "register" && !name) {
      setError(t("auth.enterName"));
      setLoading(false);
      return;
    }

    try {
      let data;
      if (type === "login") {
        data = await login(email, password);
      } else {
        data = await signup(email, password, name);
      }

      if (data && data.user) {
        onLogin(data.user);
      } else {
        throw new Error("No user data received");
      }
    } catch (err) {
      setError(err.message || t("auth.authFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      {/* LEFT PANEL */}
      <div className="auth-panel-left" aria-hidden="true">
        <div className="auth-panel-orb auth-panel-orb--cyan" />
        <div className="auth-panel-orb auth-panel-orb--purple" />
        <div className="auth-panel-brand">
          <div className="auth-panel-icon">⚕</div>
          <h2 className="auth-panel-title">{t("auth.brandTitle")}</h2>
          <p className="auth-panel-subtitle">{t("auth.brandSubtitle")}</p>
          <ul className="auth-panel-features">
            <li>{t("auth.feature1")}</li>
            <li>{t("auth.feature2")}</li>
            <li>{t("auth.feature3")}</li>
          </ul>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="auth-panel-right">
        <div className="auth-card">
          <div className="logo">
            <div className="logo-icon">⚕</div>
            <h1>{t("auth.logoTitle")}</h1>
            <p>{t("auth.logoSubtitle")}</p>
          </div>

          {error && (
            <div className="error-message">⚠️ {error}</div>
          )}

          {showAuth === "login" ? (
            <div>
              <div className="input-group">
                <label>{t("auth.email")}</label>
                <input
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && !loading && handleAuth("login")}
                  disabled={loading}
                  autoComplete="email"
                />
              </div>
              <div className="input-group">
                <label>{t("auth.password")}</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && !loading && handleAuth("login")}
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>
              <button className="btn" onClick={() => handleAuth("login")} disabled={loading}>
                {loading ? t("auth.signingIn") : t("auth.signIn")}
              </button>
              <div className="switch-auth">
                {t("auth.dontHaveAccount")}{" "}
                <button onClick={() => { setShowAuth("register"); setError(""); }} disabled={loading}>
                  {t("auth.signUp")}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="input-group">
                <label>{t("auth.name")}</label>
                <input
                  type="text"
                  placeholder={t("auth.namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  autoComplete="name"
                />
              </div>
              <div className="input-group">
                <label>{t("auth.email")}</label>
                <input
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  autoComplete="email"
                />
              </div>
              <div className="input-group">
                <label>{t("auth.password")}</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && !loading && handleAuth("register")}
                  disabled={loading}
                  autoComplete="new-password"
                />
              </div>
              <button className="btn" onClick={() => handleAuth("register")} disabled={loading}>
                {loading ? t("auth.creatingAccount") : t("auth.createAccount")}
              </button>
              <div className="switch-auth">
                {t("auth.alreadyHaveAccount")}{" "}
                <button onClick={() => { setShowAuth("login"); setError(""); }} disabled={loading}>
                  {t("auth.signInLink")}
                </button>
              </div>
            </div>
          )}

          <p className="disclaimer">{t("auth.disclaimer")}</p>
        </div>
      </div>
    </div>
  );
}

export default AuthScreen;
