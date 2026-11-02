/**
 * UI Selectors Catalog for Desktop & Mobile Views
 * Conforms to STD-COD-002: Zero Magic Literals
 */

export const DesktopNavigationSelectors = Object.freeze({
  NAV_ITEM: ".desktop-nav-item",
  NAV_BY_ROUTE: (route: string) => `.desktop-nav-item[data-route="${route}"]`,
  VIEW_MODE_TOGGLE: ".view-mode-toggle",
});

export const ChatViewSelectors = Object.freeze({
  CONTAINER: ".desktop-chat-view, .chat-panel, .desktop-view-container",
  TEXTAREA: "textarea, .chat-input-textarea",
  SEND_BUTTON: ".desktop-send-btn, .chat-send-btn, button[title*='Send' i]",
  STRATEGY_PILL: ".strategy-pill",
});

export const ModelCatalogSelectors = Object.freeze({
  CONTAINER: ".desktop-model-catalog",
  SEARCH_INPUT: ".desktop-search-input",
  FILTER_PILLS: ".family-filter-pills .filter-pill",
  ALL_FILTER: ".family-filter-pills .filter-pill[data-family='ALL'], .family-filter-pills .filter-pill:has-text('ALL')",
});

export const ModelConfigSelectors = Object.freeze({
  CONTAINER: ".desktop-model-config-page, .desktop-model-config",
  PROTOCOL_TAB_BTN: ".protocol-tab-btn",
});

export const SessionHistorySelectors = Object.freeze({
  CONTAINER: ".desktop-sessions-view",
  NEW_SESSION_BTN: ".desktop-new-session-btn",
  SESSIONS_TABLE: ".sessions-table-wrapper, table.desktop-table",
});

export const TelemetrySelectors = Object.freeze({
  CONTAINER: ".desktop-telemetry-view",
  METRIC_CARDS: ".telemetry-card",
  AUDIT_TABLE: ".audit-table-card",
});

export const WorkflowsSelectors = Object.freeze({
  PAGE: ".desktop-workflow-page",
  CANVAS_CONTAINER: ".workflow-canvas-container, .canvas-viewport, .desktop-workflow-page",
  VIEW_MODE_PILL: ".workflow-canvas-container button.view-mode-pill",
  VERIFY_INTEGRITY_BTN: "button:has-text('Verify Resumption Integrity')",
  ALERT_BANNER: ".alert-banner",
  SUMMARY_WIDGET: ".executive-summary-widget, .summary-card, h3:has-text('Executive Summary')",
});

export const OnboardingSelectors = Object.freeze({
  PAGE: ".desktop-onboarding-page",
  STEPPER_TAB: ".view-mode-pill",
  FLOW_HOST: ".onboarding-flow-host",
});

export const RbacSelectors = Object.freeze({
  PAGE: ".desktop-rbac-page",
  CARDS: ".rbac-card",
  MATRIX_TABLE: "table.matrix-table",
});

export const MobileLayoutSelectors = Object.freeze({
  LAYOUT: ".mobile-layout",
  BOTTOM_NAV: ".mobile-bottom-nav",
  TAB_BUTTONS: ".mobile-bottom-nav .mobile-tab-btn",
  SWITCH_TO_DESKTOP_BTN: "button:has-text('Switch to Desktop')",
});

