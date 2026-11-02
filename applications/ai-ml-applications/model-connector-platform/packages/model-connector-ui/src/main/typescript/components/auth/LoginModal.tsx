import React, { useState } from "react";
import type { UiDemoUser } from "@/types/ui.types";

interface LoginModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onLogin: (email: string, pass: string) => Promise<boolean>;
  readonly onSwitchUser: (userId: string) => Promise<void>;
  readonly demoUsers: readonly UiDemoUser[];
  readonly currentUserId?: string;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  onSwitchUser,
  demoUsers,
  currentUserId,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg("Please provide both email and password.");
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      await onLogin(email, password);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (user: UiDemoUser) => {
    setEmail(user.userEmail);
    await onSwitchUser(user.userId);
  };

  return (
    <div className="login-modal-backdrop" onClick={onClose}>
      <div className="login-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="login-modal-header">
          <div className="header-title-group">
            <span className="login-badge-icon">🔐</span>
            <div>
              <h3>Enterprise RBAC Authentication</h3>
              <p className="login-subtitle">Multi-Tenant Identity & Dynamic Menu Authorization</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close Modal">
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="login-error-alert">
            <span className="error-icon">⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="login-email">Enterprise Work Email</label>
            <input
              id="login-email"
              type="email"
              className="form-input"
              placeholder="e.g. admin@enterprise.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              className="form-input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="login-submit-btn" disabled={isLoading}>
            {isLoading ? "Authenticating..." : "Sign In & Authorize Menus"}
          </button>
        </form>

        <div className="login-divider">
          <span>OR QUICK-SIGN-IN WITH PRE-SEEDED ACCOUNTS</span>
        </div>

        <div className="demo-accounts-grid">
          {demoUsers.map((u) => {
            const isCurrent = currentUserId === u.userId;
            return (
              <button
                key={u.userId}
                type="button"
                className={`demo-user-card ${isCurrent ? "active-user-card" : ""}`}
                onClick={() => handleQuickLogin(u)}
              >
                <div className="demo-avatar">{u.avatarUrl || "👤"}</div>
                <div className="demo-user-details">
                  <div className="demo-name-row">
                    <span className="demo-name">{u.fullName}</span>
                    {isCurrent && <span className="active-pill">ACTIVE</span>}
                  </div>
                  <span className="demo-email">{u.userEmail}</span>
                  <div className="demo-meta">
                    <span className="demo-role-badge">{u.roleName}</span>
                    <span className="demo-company-badge">{u.companyName}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="login-footer-notice">
          <span>ℹ️ Dynamic Menu Authorization: Upon login, navigation is loaded from SQLite RBAC based on your Company and Role.</span>
        </div>
      </div>
    </div>
  );
};
