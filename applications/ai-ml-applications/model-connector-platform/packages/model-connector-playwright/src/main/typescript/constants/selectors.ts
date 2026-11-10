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
  ADD_INTEGRATION_BTN: '[data-testid="btn-add-integration"]',
  ONBOARDING_PAGE: '[data-testid="integration-onboarding-page"]',
  ONBOARD_TAB_IDENTITY: '[data-testid="tab-onboard-identity"]',
  ONBOARD_TAB_PROTOCOLS: '[data-testid="tab-onboard-protocols"]',
  ONBOARD_TAB_CAPABILITIES: '[data-testid="tab-onboard-capabilities"]',
  ONBOARD_PROVIDER_NAME: "#onb-provider-name",
  ONBOARD_INTEGRATION_ID: "#onb-integration-id",
  ONBOARD_CATEGORY: "#onb-category",
  ONBOARD_SCOPE: "#onb-scope",
  ONBOARD_STATUS: "#onb-status",
  ONBOARD_CUSTOM_CAP: "#onb-custom-cap",
  ONBOARD_OAUTH_BTN: '[data-testid="btn-oauth-redirect"]',
  ONBOARD_OAUTH_STATUS: '[data-testid="oauth-redirect-status"]',
  ONBOARD_CLI_CMD: "#onb-cli-cmd",
  ONBOARD_CLI_ANTIGRAVITY_BTN: '[data-testid="btn-cli-tool-antigravity"]',
  ONBOARD_CLI_GEMINI_BTN: '[data-testid="btn-cli-tool-gemini"]',
  ONBOARD_AUTHCODE_INPUT: '[data-testid="input-oauth-code"]',
  ONBOARD_AUTHCODE_VERIFY_BTN: '[data-testid="btn-verify-authcode"]',
  ONBOARD_ACCOUNT_ACTIVE_YES: '[data-testid="btn-account-active-yes"]',
  ONBOARD_TAG_CHIPS: '[data-testid="tag-chip-input"] .tag-chip-item',
  ONBOARD_TAG_ADD_BTN: '[data-testid="panel-onboard-capabilities"] .tag-add-btn',
  DETAIL_VIEW: '[data-testid="integration-detail-view"]',
  DETAIL_TAB_BTN: ".integration-detail-tabs .detail-tab-btn",
  DETAIL_SELECTED_PROTOCOLS: ".info-detail-cell .detail-proto-pill",
  ADD_ACCOUNT_BTN: '[data-testid="btn-add-account"]',
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
  STEPPER_TAB: ".stepper-tab-pills .ui-segment-btn, .view-mode-pill",
  FLOW_HOST: ".onboarding-flow-host",
});

export const RbacSelectors = Object.freeze({
  PAGE: ".desktop-rbac-page",
  TABS: ".rbac-tabs-bar .ui-segment-btn",
  CARDS: ".rbac-card",
  MATRIX_TABLE: "table.matrix-table",
});

export const MobileLayoutSelectors = Object.freeze({
  LAYOUT: ".mobile-layout",
  BOTTOM_NAV: ".mobile-bottom-nav",
  TAB_BUTTONS: ".mobile-bottom-nav .mobile-tab-btn",
  SWITCH_TO_DESKTOP_BTN: '.app-header .mobile-desktop-toggle, button[aria-label="Switch to Desktop"]',
});

export const EnterpriseViewSelectors = Object.freeze({
  CONTROL_PANEL: '[data-testid="control-panel"], [data-testid="odoo-control-panel"], .control-panel, .odoo-control-panel',
  BTN_CREATE: '[data-testid="btn-create"], [data-testid="odoo-btn-create"], .btn-create-primary',
  BTN_SAVE: '[data-testid="btn-save"], [data-testid="odoo-btn-save"], .btn-save-primary',
  BTN_DISCARD: '[data-testid="btn-discard"], [data-testid="odoo-btn-discard"], .btn-discard-secondary',
  BTN_DELETE: '[data-testid="btn-delete"], [data-testid="odoo-btn-delete"], .btn-delete-danger',
  VIEW_CARD: '[data-testid="view-card"], [data-testid="odoo-view-card"], .view-mode-btn[title*="Card" i]',
  VIEW_LIST: '[data-testid="view-list"], [data-testid="odoo-view-list"], .view-mode-btn[title*="List" i]',
  CARD_GRID: '[data-testid="model-card-grid"], [data-testid="odoo-card-grid"], .model-card-grid, .odoo-card-grid',
  GROUPED_LIST: '[data-testid="grouped-list"], [data-testid="odoo-grouped-list"], .grouped-list-view, .odoo-grouped-list-view',
  FORM_VIEW: '[data-testid="form-view"], [data-testid="odoo-form-view"], .form-view-container, .odoo-form-view-container',
  CREATE_BANNER: '[data-testid="create-banner"], [data-testid="odoo-create-banner"], .form-create-banner, .odoo-form-create-banner',
  SELECT_TARGET_MODEL: '[data-testid="select-target-model"], [data-testid="odoo-select-target-model"], .model-select-dropdown',
  MODEL_ROW: '[data-testid^="model-card-"], tr.model-list-row, [data-testid="model-row"], .resource-card',
});

export const OdooSelectors = EnterpriseViewSelectors;


