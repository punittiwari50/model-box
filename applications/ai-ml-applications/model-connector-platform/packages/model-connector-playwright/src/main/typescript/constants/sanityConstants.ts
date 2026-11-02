/**
 * Centralized Sanity & Verification Constants
 * Conforms to STD-COD-002: Zero Magic Literals
 */

export interface IViewportDimension {
  readonly width: number;
  readonly height: number;
}

export const SanityTimeouts = Object.freeze({
  DEFAULT_TIMEOUT_MS: 10000,
  NAVIGATION_TIMEOUT_MS: 15000,
  FAST_ACTION_DELAY_MS: 300,
  SHORT_WAIT_MS: 150,
  TRANSITION_WAIT_MS: 200,
  ALERT_TIMEOUT_MS: 5000,
});

export const SanityViewports = Object.freeze({
  DESKTOP: Object.freeze<IViewportDimension>({ width: 1440, height: 900 }),
  MOBILE: Object.freeze<IViewportDimension>({ width: 390, height: 844 }),
});

export const SanityDefaults = Object.freeze({
  DEFAULT_UI_URL: "http://localhost:3005",
  HEADLESS_DEFAULT: true,
  MAX_PREVIEW_TABS: 4,
  MAX_FILTER_PILLS: 6,
  MIN_TELEMETRY_CARDS: 4,
  MIN_RBAC_CARDS: 3,
});

