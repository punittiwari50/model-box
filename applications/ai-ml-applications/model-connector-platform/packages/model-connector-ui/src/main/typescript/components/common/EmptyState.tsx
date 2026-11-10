import React from "react";

export interface EmptyStateProps {
  readonly icon?: React.ReactNode;
  readonly title: string;
  readonly description?: string;
  readonly action?: React.ReactNode;
  readonly className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = "📂",
  title,
  description,
  action,
  className = "",
}) => {
  return (
    <div className={`ui-empty-state view-empty-state ${className}`.trim()}>
      <span className="empty-icon" aria-hidden="true">
        {icon}
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
};

