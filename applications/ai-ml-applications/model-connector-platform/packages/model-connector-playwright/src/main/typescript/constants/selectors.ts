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
  OAUTH_LAUNCH_BROWSER_BTN: '[data-testid="btn-oauth-launch-browser"], .btn-launch-primary',
  COMPUTED_AUTH_URL_INPUT: ".url-preview-input",
  OAUTH_WAITING_INDICATOR: '[data-testid="oauth-waiting-indicator"], .oauth-waiting-banner',
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

export const OdooSelectors = Object.freeze({
  CONTROL_PANEL: '[data-testid="odoo-control-panel"], .odoo-control-panel',
  BTN_CREATE: '[data-testid="odoo-btn-create"], .btn-create-primary',
  BTN_SAVE: '[data-testid="odoo-btn-save"], .btn-save-primary',
  BTN_DISCARD: '[data-testid="odoo-btn-discard"], .btn-discard-secondary',
  BTN_DELETE: '[data-testid="odoo-btn-delete"], .btn-delete-danger',
  VIEW_CARD: '[data-testid="odoo-view-card"], .view-mode-btn[title*="Card" i]',
  VIEW_LIST: '[data-testid="odoo-view-list"], .view-mode-btn[title*="List" i]',
  CARD_GRID: '[data-testid="odoo-card-grid"], .odoo-card-grid',
  GROUPED_LIST: '[data-testid="odoo-grouped-list"], .odoo-grouped-list-view',
  FORM_VIEW: '[data-testid="odoo-form-view"], .odoo-form-view-container',
  CREATE_BANNER: '[data-testid="odoo-create-banner"], .odoo-form-create-banner',
  SELECT_TARGET_MODEL: '[data-testid="odoo-select-target-model"], .model-select-dropdown',
});


