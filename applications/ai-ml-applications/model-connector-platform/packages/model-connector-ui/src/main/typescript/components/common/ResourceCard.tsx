import React from "react";

export interface ResourceCardProps {
  readonly icon?: React.ReactNode;
  readonly iconTone?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly topRightSlot?: React.ReactNode;
  readonly description?: string;
  readonly statusSlot?: React.ReactNode;
  readonly metaText?: React.ReactNode;
  readonly footerLeft?: React.ReactNode;
  readonly footerActions?: React.ReactNode;
  readonly accentClass?: string;
  readonly selected?: boolean;
  readonly onClick?: () => void;
  readonly testId?: string;
  readonly titleTooltip?: string;
  readonly className?: string;
}

export const ResourceCard: React.FC<ResourceCardProps> = ({
  icon,
  iconTone = "neutral",
  title,
  subtitle,
  topRightSlot,
  description,
  statusSlot,
  metaText,
  footerLeft,
  footerActions,
  accentClass = "",
  selected = false,
  onClick,
  testId,
  titleTooltip,
  className = "",
}) => {
  return (
    <article
      className={`ui-resource-card model-card-item ${accentClass} ${selected ? "selected" : ""} ${onClick ? "clickable" : ""} ${className}`.trim()}
      onClick={onClick}
      data-testid={testId}
      title={titleTooltip}
    >
      <div className="resource-card-header">
        <div className="resource-identity">
          {icon && (
            <div className={`resource-avatar tone-${iconTone}`} aria-hidden="true">
              {icon}
            </div>
          )}
          <div className="resource-title-block">
            <h4 className="resource-title model-name">{title}</h4>
            {subtitle && <span className="resource-subtitle model-slug">{subtitle}</span>}
          </div>
        </div>
        {topRightSlot && (
          <div className="resource-top-right" onClick={(e) => e.stopPropagation()}>
            {topRightSlot}
          </div>
        )}
      </div>

      {description && <p className="resource-description card-description">{description}</p>}

      {(statusSlot || metaText) && (
        <div className="resource-status-row">
          {statusSlot && <div className="resource-status-slot">{statusSlot}</div>}
          {metaText && <div className="resource-meta-text">{metaText}</div>}
        </div>
      )}

      {(footerLeft || footerActions) && (
        <div className="resource-card-footer">
          {footerLeft && <div className="resource-footer-left">{footerLeft}</div>}
          {footerActions && (
            <div className="resource-footer-actions" onClick={(e) => e.stopPropagation()}>
              {footerActions}
            </div>
          )}
        </div>
      )}
    </article>
  );
};

