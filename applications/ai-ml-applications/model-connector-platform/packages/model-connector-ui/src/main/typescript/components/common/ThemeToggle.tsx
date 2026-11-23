import React from "react";
import type { UiTheme } from "@/utils/hooks/useTheme";

export interface ThemeToggleProps {
  readonly theme: UiTheme;
  readonly onToggle: () => void;
  readonly compact?: boolean;
  readonly className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  theme,
  onToggle,
  compact = true,
  className = "",
}) => {
  const isLight = theme === "light";
  const label = isLight ? "Dark" : "Light";

  return (
    <button
      type="button"
      className={`ui-theme-toggle ${className}`.trim()}
      onClick={onToggle}
      title={`Switch to ${label} theme`}
      aria-label={`Switch to ${label} theme`}
    >
      <span className="theme-icon" aria-hidden="true">
        {isLight ? "🌙" : "☀️"}
      </span>
      {!compact && <span className="theme-label">{label} Mode</span>}
    </button>
  );
};

