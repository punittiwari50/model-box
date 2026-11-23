import React from "react";

export interface PageHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly badge?: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  badge,
  actions,
  className = "",
}) => {
  return (
    <header className={`ui-page-header ${className}`.trim()}>
      <div className="ui-page-header-text">
        <div className="ui-page-title-row">
          <h1 className="ui-page-title">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="ui-page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ui-page-header-actions">{actions}</div>}
    </header>
  );
};

