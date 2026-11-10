import React from "react";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "gemini"
  | "grok"
  | "claude"
  | "chatgpt"
  | "openai"
  | "copilot"
  | "ollama";

export interface StatusBadgeProps {
  readonly label: string;
  readonly tone?: BadgeTone;
  readonly icon?: React.ReactNode;
  readonly showDot?: boolean;
  readonly size?: "sm" | "md";
  readonly className?: string;
  readonly title?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  tone = "neutral",
  icon,
  showDot = false,
  size = "sm",
  className = "",
  title,
}) => {
  return (
    <span
      className={`ui-badge tone-${tone} size-${size} ${className}`.trim()}
      title={title}
    >
      {showDot && <span className="ui-badge-dot" aria-hidden="true" />}
      {icon && <span className="ui-badge-icon" aria-hidden="true">{icon}</span>}
      <span className="ui-badge-label">{label}</span>
    </span>
  );
};

