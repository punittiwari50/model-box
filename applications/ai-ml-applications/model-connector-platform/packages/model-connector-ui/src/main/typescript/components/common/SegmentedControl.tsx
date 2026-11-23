import React from "react";

export interface SegmentedOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly title?: string;
}

export interface SegmentedControlProps<T extends string = string> {
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly size?: "sm" | "md";
  readonly className?: string;
  readonly ariaLabel?: string;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  size = "sm",
  className = "",
  ariaLabel,
}: SegmentedControlProps<T>): React.ReactElement {
  return (
    <div
      className={`ui-segmented-control size-${size} ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`ui-segment-btn ${isActive ? "active" : ""}`}
            onClick={() => onChange(opt.value)}
            title={opt.title || opt.label}
          >
            {opt.icon && <span className="segment-icon" aria-hidden="true">{opt.icon}</span>}
            <span className="segment-label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

