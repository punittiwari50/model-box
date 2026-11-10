import React from "react";

export type StatTone = "primary" | "success" | "warning" | "danger" | "info" | "neutral";

export interface StatCardProps {
  readonly label: string;
  readonly value: string | number;
  readonly subtitle?: string;
  readonly icon?: React.ReactNode;
  readonly tone?: StatTone;
  readonly active?: boolean;
  readonly onClick?: () => void;
  readonly className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtitle,
  icon,
  tone = "neutral",
  active = false,
  onClick,
  className = "",
}) => {
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`ui-stat-card telemetry-card tone-${tone} ${active ? "active" : ""} ${onClick ? "interactive" : ""} ${className}`.trim()}
    >
      <div className="stat-card-top">
        {icon && <span className="stat-card-icon">{icon}</span>}
        {onClick && (
          <span className="stat-card-arrow" aria-hidden="true">
            ↗
          </span>
        )}
      </div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
      {subtitle && <div className="stat-card-sub">{subtitle}</div>}
    </Tag>
  );
};

export interface StatCardGridProps {
  readonly children: React.ReactNode;
  readonly className?: string;
}

export const StatCardGrid: React.FC<StatCardGridProps> = ({ children, className = "" }) => {
  return <div className={`ui-stat-grid ${className}`.trim()}>{children}</div>;
};

