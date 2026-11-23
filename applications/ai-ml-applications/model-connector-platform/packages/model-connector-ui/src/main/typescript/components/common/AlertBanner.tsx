import React from "react";

export type AlertTone = "info" | "success" | "warning" | "danger";

export interface AlertBannerProps {
  readonly message: React.ReactNode;
  readonly tone?: AlertTone;
  readonly icon?: React.ReactNode;
  readonly action?: React.ReactNode;
  readonly onDismiss?: () => void;
  readonly className?: string;
}

const DEFAULT_ICONS: Record<AlertTone, string> = {
  info: "ℹ️",
  success: "✔",
  warning: "⚠️",
  danger: "✕",
};

export const AlertBanner: React.FC<AlertBannerProps> = ({
  message,
  tone = "info",
  icon,
  action,
  onDismiss,
  className = "",
}) => {
  return (
    <div className={`ui-alert-banner alert-banner tone-${tone} ${className}`.trim()} role="status">
      <span className="ui-alert-icon" aria-hidden="true">
        {icon ?? DEFAULT_ICONS[tone]}
      </span>
      <div className="ui-alert-body">{message}</div>
      {action && <div className="ui-alert-action">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          className="ui-alert-close"
          onClick={onDismiss}
          aria-label="Dismiss notification"
        >
          ✕
        </button>
      )}
    </div>
  );
};

