import React, { useEffect, useCallback } from "react";
import type { UiModelAccount, UiSession } from "@/types/ui.types";

export interface DeleteRecordModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => Promise<void>;
  readonly account?: UiModelAccount | null;
  readonly session?: UiSession | null;
  readonly title?: string;
  readonly description?: string;
  readonly isDeleting?: boolean;
}

export const DeleteRecordModal: React.FC<DeleteRecordModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  account,
  session,
  title = "Delete Credential Record",
  description,
  isDeleting = false,
}) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDeleting) {
        onClose();
      }
    },
    [onClose, isDeleting],
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen || (!account && !session)) return null;

  return (
    <div
      className="delete-modal-backdrop"
      onClick={() => {
        if (!isDeleting) onClose();
      }}
      role="presentation"
    >
      <div
        className="delete-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="delete-modal-header">
          <div className="header-icon-badge">
            <span className="danger-icon">🗑️</span>
          </div>
          <div className="header-text-block">
            <h3 id="delete-modal-title">{title}</h3>
            <p className="header-subtitle">
              Permanent Deletion & Revocation Notice
            </p>
          </div>
          <button
            type="button"
            className="btn-modal-close"
            onClick={onClose}
            disabled={isDeleting}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="delete-modal-body">
          <p className="delete-warning-message">
            {description || (account
              ? `Are you sure you want to permanently delete the credential record for ${account.accountName}? This action cannot be undone.`
              : `Are you sure you want to permanently delete session ${session?.sessionId}? All cookies and multi-turn message history will be removed.`)}
          </p>

          {account && (
            <div className="delete-record-card">
              <div className="record-grid">
                <div className="record-field">
                  <span className="field-label">Account Label:</span>
                  <span className="field-value" title={account.accountName}>
                    {account.accountName}
                  </span>
                </div>
                <div className="record-field">
                  <span className="field-label">Target Model:</span>
                  <span className="field-value code-accent">{account.modelId}</span>
                </div>
                <div className="record-field">
                  <span className="field-label">Auth Protocol:</span>
                  <span className="field-value auth-tag">
                    {account.authType === "api" || account.authType === "api_key"
                      ? "REST API Key"
                      : account.authType === "cli" || account.authType === "cli_oauth"
                      ? "CLI Authentication"
                      : account.authType === "oauth"
                      ? "OAuth 2.0 Web"
                      : "Cookie Vault"}
                  </span>
                </div>
                <div className="record-field">
                  <span className="field-label">Owner Email:</span>
                  <span className="field-value">{account.userEmail}</span>
                </div>
                <div className="record-field full-width">
                  <span className="field-label">Credential Vault Fingerprint:</span>
                  <code className="field-credential-code">
                    {account.maskedCredential || "No token provided"}
                  </code>
                </div>
                <div className="record-field full-width">
                  <span className="field-label">Active Status:</span>
                  <span
                    className={`status-pill ${
                      account.isActive ? "pill-active" : "pill-inactive"
                    }`}
                  >
                    {account.isActive ? "Active Credential ✔" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {session && (
            <div className="delete-record-card">
              <div className="record-grid">
                <div className="record-field full-width">
                  <span className="field-label">Session ID:</span>
                  <code className="field-credential-code" style={{ color: "#38bdf8" }}>
                    {session.sessionId}
                  </code>
                </div>
                <div className="record-field">
                  <span className="field-label">Bound Model:</span>
                  <span className="field-value code-accent">{session.model}</span>
                </div>
                <div className="record-field">
                  <span className="field-label">Strategy Mode:</span>
                  <span className="field-value auth-tag">{session.strategy?.toUpperCase() || "API"}</span>
                </div>
                <div className="record-field">
                  <span className="field-label">Turns Count:</span>
                  <span className="field-value">{session.turnCount} turns</span>
                </div>
                <div className="record-field">
                  <span className="field-label">Cookie Fingerprint:</span>
                  <span className="field-value">{session.cookies?.length || 0} active cookies</span>
                </div>
              </div>
            </div>
          )}

          <div className="delete-impact-callout">
            <span className="callout-icon">⚠️</span>
            <span className="callout-text">
              Deleting this record completely wipes the entry from the database and terminates active lineage tracking.
            </span>
          </div>
        </div>

        <div className="delete-modal-footer">
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-modal-confirm-delete"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <span className="btn-spinner">⏳</span>
                <span>Deleting Record...</span>
              </>
            ) : (
              <>
                <span className="btn-icon">🗑️</span>
                <span>Confirm & Delete</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

