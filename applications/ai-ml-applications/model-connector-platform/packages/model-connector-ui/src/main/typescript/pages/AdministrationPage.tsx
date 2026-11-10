import React, { useState, useEffect } from "react";
import type { ModelConnectorState } from "@/utils/hooks/useModelConnectorState";
import type { UiDemoUser } from "@/types/ui.types";
import { ApiService } from "@/utils/services/apiService";
import {
  PageHeader,
  SegmentedControl,
  AlertBanner,
  StatusBadge,
  ResourceCard,
} from "@/components/common";

interface AdministrationPageProps {
  readonly state: ModelConnectorState;
}

interface RbacRole {
  readonly roleId: string;
  readonly roleName: string;
  readonly description: string;
  readonly allowedMenus: readonly string[];
}

const DEFAULT_ROLES: readonly RbacRole[] = [
  {
    roleId: "super-admin",
    roleName: "Super Administrator",
    description: "Full access across all models, configuration, and tenant databases",
    allowedMenus: [
      "chat",
      "models",
      "model-config",
      "sessions",
      "upstream",
      "onboarding",
      "admin-rbac",
      "workflows",
    ],
  },
  {
    roleId: "company-admin",
    roleName: "Company Administrator",
    description: "Manage models and sessions within the company tenancy",
    allowedMenus: ["chat", "models", "model-config", "sessions", "upstream", "onboarding"],
  },
  {
    roleId: "developer",
    roleName: "Developer / Engineer",
    description: "Build and execute prompts and workflows",
    allowedMenus: ["chat", "models", "model-config", "sessions", "workflows"],
  },
  {
    roleId: "analyst",
    roleName: "Telemetry Analyst",
    description: "Inspect inference metrics, tokens, and distributed telemetry",
    allowedMenus: ["chat", "model-config", "upstream", "onboarding"],
  },
];

export const AdministrationPage: React.FC<AdministrationPageProps> = ({ state }) => {
  const [activeTab, setActiveTab] = useState<"users" | "roles" | "matrix" | "companies">("users");
  const [users, setUsers] = useState<UiDemoUser[]>([]);
  const [roles, setRoles] = useState<RbacRole[]>([...DEFAULT_ROLES]);
  const [matrixData, setMatrixData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const [userViewMode, setUserViewMode] = useState<"list" | "create" | "edit" | "detail">("list");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [selectedUserDetail, setSelectedUserDetail] = useState<UiDemoUser | null>(null);
  const [userFullName, setUserFullName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userRoleName, setUserRoleName] = useState("Developer");
  const [userCompanyName, setUserCompanyName] = useState("Acme Global Technologies");
  const [userToDelete, setUserToDelete] = useState<UiDemoUser | null>(null);

  const [roleViewMode, setRoleViewMode] = useState<"list" | "create" | "edit">("list");
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDesc, setRoleDesc] = useState("");
  const [roleToDelete, setRoleToDelete] = useState<RbacRole | null>(null);

  useEffect(() => {
    if (state.demoUsers.length > 0) {
      setUsers(state.demoUsers);
    }
  }, [state.demoUsers]);

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
    void loadMatrix();
  }, []);

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3000);
  };

  const handleOpenCreateUser = () => {
    setUserViewMode("create");
    setEditingUserId(null);
    setUserFullName("");
    setUserEmail("");
    setUserRoleName("Developer");
    setUserCompanyName("Acme Global Technologies");
  };

  const handleOpenEditUser = (u: UiDemoUser) => {
    setUserViewMode("edit");
    setEditingUserId(u.userId);
    setUserFullName(u.fullName);
    setUserEmail(u.userEmail);
    setUserRoleName(u.roleName);
    setUserCompanyName(u.companyName);
  };

  const handleOpenDetailUser = (u: UiDemoUser) => {
    setSelectedUserDetail(u);
    setUserViewMode("detail");
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFullName.trim() || !userEmail.trim()) return;

    const roleObj = roles.find((r) => r.roleName === userRoleName);
    if (userViewMode === "create") {
      const newUser: UiDemoUser = {
        userId: `usr-${Date.now().toString(36)}`,
        fullName: userFullName.trim(),
        userEmail: userEmail.trim(),
        roleId: roleObj?.roleId || "developer",
        roleName: userRoleName,
        companyId: "acme-corp",
        companyName: userCompanyName,
        avatarUrl: "👤",
      };
      setUsers((prev) => [newUser, ...prev]);
      showNotice(`User '${newUser.fullName}' created successfully.`);
    } else if (editingUserId) {
      setUsers((prev) =>
        prev.map((u) =>
          u.userId === editingUserId
            ? {
                ...u,
                fullName: userFullName.trim(),
                userEmail: userEmail.trim(),
                roleId: roleObj?.roleId || u.roleId,
                roleName: userRoleName,
                companyName: userCompanyName,
              }
            : u,
        ),
      );
      showNotice(`User '${userFullName}' updated.`);
    }
    setUserViewMode("list");
  };

  const handleConfirmDeleteUser = () => {
    if (!userToDelete) return;
    setUsers((prev) => prev.filter((u) => u.userId !== userToDelete.userId));
    showNotice(`User '${userToDelete.fullName}' deleted.`);
    setUserToDelete(null);
    if (selectedUserDetail?.userId === userToDelete.userId) {
      setUserViewMode("list");
      setSelectedUserDetail(null);
    }
  };

  const handleOpenCreateRole = () => {
    setRoleViewMode("create");
    setEditingRoleId(null);
    setRoleName("");
    setRoleDesc("");
  };

  const handleOpenEditRole = (r: RbacRole) => {
    setRoleViewMode("edit");
    setEditingRoleId(r.roleId);
    setRoleName(r.roleName);
    setRoleDesc(r.description);
  };

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName.trim()) return;

    if (roleViewMode === "create") {
      const newRole: RbacRole = {
        roleId: `role-${Date.now().toString(36)}`,
        roleName: roleName.trim(),
        description: roleDesc.trim(),
        allowedMenus: ["chat", "models"],
      };
      setRoles((prev) => [...prev, newRole]);
      showNotice(`Role '${newRole.roleName}' created.`);
    } else if (editingRoleId) {
      setRoles((prev) =>
        prev.map((r) =>
          r.roleId === editingRoleId
            ? { ...r, roleName: roleName.trim(), description: roleDesc.trim() }
            : r,
        ),
      );
      showNotice(`Role '${roleName}' updated.`);
    }
    setRoleViewMode("list");
  };

  const handleConfirmDeleteRole = () => {
    if (!roleToDelete) return;
    setRoles((prev) => prev.filter((r) => r.roleId !== roleToDelete.roleId));
    showNotice(`Role '${roleToDelete.roleName}' deleted.`);
    setRoleToDelete(null);
  };

  const companies = matrixData?.companies || [
    {
      companyId: "acme-corp",
      companyName: "Acme Global Technologies",
      subscriptionTier: "ENTERPRISE",
      companyDomain: "acme.com",
    },
    {
      companyId: "globex-inc",
      companyName: "Globex Robotics Inc",
      subscriptionTier: "PRO",
      companyDomain: "globex.io",
    },
  ];

  return (
    <div className="desktop-rbac-page page-stack">
      <PageHeader
        title="Enterprise Access & RBAC Matrix"
        subtitle="Full CRUD administration for users, enterprise roles, tenant companies, and dynamic database navigation menus."
      />

      {isLoading && <AlertBanner message="Loading database authorization matrix..." tone="info" icon="🔄" />}
      {actionNotice && (
        <AlertBanner
          message={actionNotice}
          tone="success"
          onDismiss={() => setActionNotice(null)}
        />
      )}

      <div className="rbac-tabs-bar">
        <SegmentedControl
          ariaLabel="RBAC Administration Sections"
          size="md"
          value={activeTab}
          onChange={(tab) => {
            setActiveTab(tab);
            setUserViewMode("list");
            setRoleViewMode("list");
          }}
          options={[
            { value: "users", label: `Users (${users.length})`, icon: "👥" },
            { value: "roles", label: `Roles (${roles.length})`, icon: "🛡️" },
            { value: "matrix", label: "Access Matrix", icon: "🗺️" },
            { value: "companies", label: "Companies", icon: "🏢" },
          ]}
        />
      </div>

      {activeTab === "users" && (
        <div className="rbac-card ui-surface-card full-width">
          {userToDelete && (
            <AlertBanner
              tone="danger"
              message={
                <span>
                  Confirm permanent deletion of <strong>{userToDelete.fullName}</strong> (
                  {userToDelete.userEmail})?
                </span>
              }
              action={
                <div className="inline-btn-group">
                  <button
                    type="button"
                    className="btn-ui-secondary btn-xs"
                    onClick={() => setUserToDelete(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-ui-danger btn-xs"
                    onClick={handleConfirmDeleteUser}
                  >
                    Delete User
                  </button>
                </div>
              }
            />
          )}

          {userViewMode === "list" && (
            <>
              <div className="section-card-header">
                <div>
                  <h3>Registered User Directory</h3>
                  <p className="section-subtitle">
                    Inspect and administer identity access credentials, assigned enterprise roles, and company tenancy.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-ui-primary"
                  onClick={handleOpenCreateUser}
                >
                  + Create User
                </button>
              </div>

              <div className="rbac-table-container">
                <table className="desktop-table rbac-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Tenant Company</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.userId}>
                        <td>
                          <button
                            type="button"
                            className="table-link-btn"
                            onClick={() => handleOpenDetailUser(u)}
                          >
                            <span>{u.avatarUrl}</span>
                            <span>{u.fullName}</span>
                          </button>
                        </td>
                        <td>
                          <code>{u.userEmail}</code>
                        </td>
                        <td>
                          <StatusBadge label={u.roleName} tone="primary" />
                        </td>
                        <td>{u.companyName}</td>
                        <td>
                          <StatusBadge label="Active" tone="success" showDot />
                        </td>
                        <td>
                          <div className="table-actions-cell">
                            <button
                              type="button"
                              className="btn-ui-secondary btn-xs"
                              onClick={() => handleOpenDetailUser(u)}
                            >
                              🔍 View
                            </button>
                            <button
                              type="button"
                              className="btn-ui-secondary btn-xs"
                              onClick={() => handleOpenEditUser(u)}
                            >
                              ✏️ Edit
                            </button>
                            <button
                              type="button"
                              className="btn-ui-danger btn-xs"
                              onClick={() => setUserToDelete(u)}
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {userViewMode === "detail" && selectedUserDetail && (
            <div className="on-page-subpanel">
              <div className="subpanel-header">
                <div className="subpanel-title-group">
                  <button
                    type="button"
                    className="btn-ui-secondary btn-sm"
                    onClick={() => setUserViewMode("list")}
                  >
                    ← Back
                  </button>
                  <h3>User Detail: {selectedUserDetail.fullName}</h3>
                </div>
                <div className="inline-btn-group">
                  <button
                    type="button"
                    className="btn-ui-primary btn-sm"
                    onClick={() => handleOpenEditUser(selectedUserDetail)}
                  >
                    ✏️ Edit User
                  </button>
                  <button
                    type="button"
                    className="btn-ui-danger btn-sm"
                    onClick={() => setUserToDelete(selectedUserDetail)}
                  >
                    🗑️ Delete User
                  </button>
                </div>
              </div>

              <div className="detail-metrics-grid">
                <div className="detail-metric-box">
                  <span className="metric-key">Full Name</span>
                  <span className="metric-val">
                    {selectedUserDetail.avatarUrl} {selectedUserDetail.fullName}
                  </span>
                </div>
                <div className="detail-metric-box">
                  <span className="metric-key">Email Address</span>
                  <code className="metric-val">{selectedUserDetail.userEmail}</code>
                </div>
                <div className="detail-metric-box">
                  <span className="metric-key">Assigned Role</span>
                  <StatusBadge label={selectedUserDetail.roleName} tone="primary" />
                </div>
                <div className="detail-metric-box">
                  <span className="metric-key">Tenant Company</span>
                  <span className="metric-val">{selectedUserDetail.companyName}</span>
                </div>
              </div>
            </div>
          )}

          {(userViewMode === "create" || userViewMode === "edit") && (
            <div className="on-page-subpanel">
              <div className="subpanel-header">
                <div className="subpanel-title-group">
                  <button
                    type="button"
                    className="btn-ui-secondary btn-sm"
                    onClick={() => setUserViewMode("list")}
                  >
                    ← Back
                  </button>
                  <h3>
                    {userViewMode === "create"
                      ? "Create New Enterprise User"
                      : `Edit User: ${userFullName}`}
                  </h3>
                </div>
              </div>

              <form onSubmit={handleSaveUser} className="rbac-form-grid">
                <div className="ui-form-field">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    required
                    className="ui-input"
                    value={userFullName}
                    onChange={(e) => setUserFullName(e.target.value)}
                    placeholder="e.g. Alice Smith"
                  />
                </div>
                <div className="ui-form-field">
                  <label>Email Address *</label>
                  <input
                    type="email"
                    required
                    className="ui-input"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="e.g. alice@example.com"
                  />
                </div>
                <div className="ui-form-field">
                  <label>Assigned Security Role</label>
                  <select
                    className="ui-select"
                    value={userRoleName}
                    onChange={(e) => setUserRoleName(e.target.value)}
                  >
                    <option value="Super Administrator">Super Administrator</option>
                    <option value="Company Administrator">Company Administrator</option>
                    <option value="Developer">Developer</option>
                    <option value="Telemetry Analyst">Telemetry Analyst</option>
                  </select>
                </div>
                <div className="ui-form-field">
                  <label>Tenant Company</label>
                  <input
                    type="text"
                    className="ui-input"
                    value={userCompanyName}
                    onChange={(e) => setUserCompanyName(e.target.value)}
                    placeholder="e.g. Acme Global Technologies"
                  />
                </div>
                <div className="form-actions-footer">
                  <button
                    type="button"
                    className="btn-ui-secondary"
                    onClick={() => setUserViewMode("list")}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-ui-primary">
                    Save User
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {activeTab === "roles" && (
        <div className="rbac-card ui-surface-card full-width">
          {roleToDelete && (
            <AlertBanner
              tone="danger"
              message={
                <span>
                  Confirm permanent deletion of role <strong>{roleToDelete.roleName}</strong>?
                </span>
              }
              action={
                <div className="inline-btn-group">
                  <button
                    type="button"
                    className="btn-ui-secondary btn-xs"
                    onClick={() => setRoleToDelete(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-ui-danger btn-xs"
                    onClick={handleConfirmDeleteRole}
                  >
                    Delete Role
                  </button>
                </div>
              }
            />
          )}

          {roleViewMode === "list" && (
            <>
              <div className="section-card-header">
                <div>
                  <h3>Enterprise Security Roles</h3>
                  <p className="section-subtitle">
                    Define authorization roles and manage granular permissions across platform endpoints.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-ui-primary"
                  onClick={handleOpenCreateRole}
                >
                  + Create Role
                </button>
              </div>

              <div className="rbac-table-container">
                <table className="desktop-table rbac-table">
                  <thead>
                    <tr>
                      <th>Role Identifier</th>
                      <th>Display Name</th>
                      <th>Description</th>
                      <th>Authorized Menus</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map((r) => (
                      <tr key={r.roleId}>
                        <td>
                          <code>{r.roleId}</code>
                        </td>
                        <td className="col-strong">{r.roleName}</td>
                        <td>{r.description}</td>
                        <td>
                          <div className="strategies-cell">
                            {r.allowedMenus.map((m) => (
                              <span key={m} className="strategy-micro-pill">
                                /{m}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div className="table-actions-cell">
                            <button
                              type="button"
                              className="btn-ui-secondary btn-xs"
                              onClick={() => handleOpenEditRole(r)}
                            >
                              ✏️ Edit
                            </button>
                            <button
                              type="button"
                              className="btn-ui-danger btn-xs"
                              onClick={() => setRoleToDelete(r)}
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {(roleViewMode === "create" || roleViewMode === "edit") && (
            <div className="on-page-subpanel">
              <div className="subpanel-header">
                <div className="subpanel-title-group">
                  <button
                    type="button"
                    className="btn-ui-secondary btn-sm"
                    onClick={() => setRoleViewMode("list")}
                  >
                    ← Back
                  </button>
                  <h3>
                    {roleViewMode === "create"
                      ? "Create Security Role"
                      : `Edit Role: ${roleName}`}
                  </h3>
                </div>
              </div>

              <form onSubmit={handleSaveRole} className="rbac-form-stack">
                <div className="ui-form-field">
                  <label>Role Name *</label>
                  <input
                    type="text"
                    required
                    className="ui-input"
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    placeholder="e.g. Compliance Auditor"
                  />
                </div>
                <div className="ui-form-field">
                  <label>Description</label>
                  <textarea
                    rows={3}
                    className="ui-textarea"
                    value={roleDesc}
                    onChange={(e) => setRoleDesc(e.target.value)}
                    placeholder="Describe the scope of access and authorizations..."
                  />
                </div>
                <div className="form-actions-footer">
                  <button
                    type="button"
                    className="btn-ui-secondary"
                    onClick={() => setRoleViewMode("list")}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-ui-primary">
                    Save Role
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {activeTab === "matrix" && (
        <div className="rbac-card ui-surface-card full-width">
          <div className="section-card-header">
            <div>
              <h3>Role-to-Menu Dynamic Access Matrix</h3>
              <p className="section-subtitle">
                Live authorization mapping across platform navigation routes.
              </p>
            </div>
          </div>

          <div className="rbac-table-container">
            <table className="desktop-table rbac-table matrix-table">
              <thead>
                <tr>
                  <th>Platform Menu</th>
                  <th>Route Path</th>
                  <th>Default (All)</th>
                  <th>Super Admin</th>
                  <th>Company Admin</th>
                  <th>Developer</th>
                  <th>Analyst</th>
                </tr>
              </thead>
              <tbody>
                {(matrixData?.allMenus || state.menus).map((m: any) => {
                  const isDefault =
                    m.isDefault || m.menuId === "chat" || m.menuId === "model-config";
                  const routeKey = m.routePath || m.menuId;
                  const hasDev = ["chat", "models", "model-config", "sessions", "workflows"].includes(
                    routeKey,
                  );
                  const hasAnalyst = ["chat", "model-config", "upstream", "onboarding"].includes(
                    routeKey,
                  );
                  const hasCompanyAdmin = [
                    "chat",
                    "models",
                    "model-config",
                    "sessions",
                    "upstream",
                    "onboarding",
                  ].includes(routeKey);

                  return (
                    <tr key={m.menuId}>
                      <td className="col-strong">
                        <span>{m.menuIcon}</span> {m.menuLabel}
                      </td>
                      <td>
                        <code>/{m.routePath}</code>
                      </td>
                      <td>
                        {isDefault ? (
                          <StatusBadge label="✔ Default" tone="success" />
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge label="✔ Full" tone="success" />
                      </td>
                      <td>
                        <StatusBadge
                          label={hasCompanyAdmin ? "✔ Allowed" : "✖ Restricted"}
                          tone={hasCompanyAdmin ? "success" : "danger"}
                        />
                      </td>
                      <td>
                        <StatusBadge
                          label={hasDev ? "✔ Allowed" : "✖ Restricted"}
                          tone={hasDev ? "success" : "danger"}
                        />
                      </td>
                      <td>
                        <StatusBadge
                          label={hasAnalyst ? "✔ Allowed" : "✖ Restricted"}
                          tone={hasAnalyst ? "success" : "danger"}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "companies" && (
        <div className="rbac-card ui-surface-card full-width">
          <div className="section-card-header">
            <div>
              <h3>Tenant Companies Directory</h3>
              <p className="section-subtitle">
                Multi-tenant isolation boundaries and subscription tiers.
              </p>
            </div>
          </div>

          <div className="model-card-grid">
            {companies.map((c: any) => (
              <ResourceCard
                key={c.companyId}
                icon="🏢"
                iconTone="gemini"
                title={c.companyName}
                subtitle={`ID: ${c.companyId}`}
                topRightSlot={<StatusBadge label={c.subscriptionTier} tone="success" />}
                statusSlot={<StatusBadge label="Tenant Active" tone="info" showDot />}
                metaText={`🌐 ${c.companyDomain}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
