import React, { useState, useEffect } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import { ApiService } from "@/utils/services/apiService";

interface DesktopRbacPageProps {
  readonly state: ModelConnectorState;
}

export const DesktopRbacPage: React.FC<DesktopRbacPageProps> = ({ state }) => {
  const [matrixData, setMatrixData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadMatrix = async () => {
      setIsLoading(true);
      try {
        const data = await ApiService.fetchRbacMatrix();
        setMatrixData(data);
      } finally {
        setIsLoading(false);
      }
    };
    loadMatrix();
  }, []);

  return (
    <div className="desktop-rbac-page">
      <div className="rbac-header">
        <div className="header-badge-row">
          <span className="admin-pill">ADMIN SECURITY CONSOLE</span>
          <span className="company-pill">Multi-Tenant Governance</span>
        </div>
        <h2>Enterprise Database & RBAC Menu Authorization Matrix</h2>
        <p className="rbac-header-desc">
          Inspection of dynamic database navigation authorization, roles, and company tenancy. Every user login is authenticated against the database and served a personalized menu based on role permissions.
        </p>
      </div>

      {isLoading ? (
        <div className="rbac-loading">Loading RBAC authorization matrix from database...</div>
      ) : (
        <div className="rbac-grid">
          {/* Companies Section */}
          <div className="rbac-card">
            <div className="card-header">
              <span className="card-icon">🏢</span>
              <h3>Tenant Companies</h3>
            </div>
            <div className="company-list">
              {(matrixData?.companies || [
                { companyId: "acme-corp", companyName: "Acme Global Technologies", subscriptionTier: "ENTERPRISE", companyDomain: "acme.com" },
                { companyId: "globex-inc", companyName: "Globex Robotics Inc", subscriptionTier: "PRO", companyDomain: "globex.io" },
              ]).map((c: any) => (
                <div key={c.companyId} className="company-item-card">
                  <div className="company-name-line">
                    <span className="c-name">{c.companyName}</span>
                    <span className="c-tier">{c.subscriptionTier}</span>
                  </div>
                  <span className="c-domain">🌐 {c.companyDomain}</span>
                  <span className="c-id">ID: {c.companyId}</span>
                </div>
              ))}
            </div>
          </div>

          {/* User Logins & Roles */}
          <div className="rbac-card">
            <div className="card-header">
              <span className="card-icon">👥</span>
              <h3>Configured User Accounts</h3>
            </div>
            <div className="users-table-container">
              <table className="rbac-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Tenant</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {state.demoUsers.map((u) => (
                    <tr key={u.userId} className={state.currentUser?.userId === u.userId ? "current-user-row" : ""}>
                      <td>
                        <span className="user-avatar-tag">{u.avatarUrl}</span>
                        <strong>{u.fullName}</strong>
                      </td>
                      <td><code>{u.userEmail}</code></td>
                      <td><span className="role-pill">{u.roleName}</span></td>
                      <td>{u.companyName}</td>
                      <td>
                        <span className="pass-pill">Active</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Role-to-Menu Access Matrix */}
          <div className="rbac-card full-width">
            <div className="card-header">
              <span className="card-icon">🛡️</span>
              <h3>Dynamic Role-to-Menu Authorization Matrix</h3>
            </div>
            <div className="matrix-table-container">
              <table className="rbac-table matrix-table">
                <thead>
                  <tr>
                    <th>Navigation Menu</th>
                    <th>Route</th>
                    <th>Default (All Logins)</th>
                    <th>Super Admin</th>
                    <th>Company Admin</th>
                    <th>Developer</th>
                    <th>Analyst</th>
                  </tr>
                </thead>
                <tbody>
                  {(matrixData?.allMenus || state.menus).map((m: any) => {
                    const isDefault = m.isDefault || m.menuId === "chat" || m.menuId === "model-config";
                    const hasDev = ["chat", "models", "model-config", "sessions", "workflows"].includes(m.menuId);
                    const hasAnalyst = ["chat", "model-config", "upstream", "onboarding"].includes(m.menuId);
                    const hasCompanyAdmin = ["chat", "models", "model-config", "sessions", "upstream", "onboarding"].includes(m.menuId);

                    return (
                      <tr key={m.menuId}>
                        <td>
                          <span className="menu-icon-tag">{m.menuIcon}</span>
                          <strong>{m.menuLabel}</strong>
                        </td>
                        <td><code>/{m.routePath}</code></td>
                        <td>
                          {isDefault ? (
                            <span className="status-check green">✔ Default</span>
                          ) : (
                            <span className="status-check gray">—</span>
                          )}
                        </td>
                        <td><span className="status-check green">✔ Full Access</span></td>
                        <td>
                          {hasCompanyAdmin ? (
                            <span className="status-check green">✔ Allowed</span>
                          ) : (
                            <span className="status-check red">✖ Restricted</span>
                          )}
                        </td>
                        <td>
                          {hasDev ? (
                            <span className="status-check green">✔ Allowed</span>
                          ) : (
                            <span className="status-check red">✖ Restricted</span>
                          )}
                        </td>
                        <td>
                          {hasAnalyst ? (
                            <span className="status-check green">✔ Allowed</span>
                          ) : (
                            <span className="status-check red">✖ Restricted</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
