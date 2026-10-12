// ============================================================================
// Centralized Constants for Playwright MCP Engine (Single Source of Truth)
// ============================================================================

export const NETWORK_DEFAULTS = {
  HOST: '0.0.0.0',
  PORT: 8940,
  MCP_PORT: 8941,
  OLLAMA_DEFAULT_PORT: 11434,
  COMFYUI_DEFAULT_PORT: 8188,
} as const;

export const HTTP_STATUS = {
  OK: 200,
  NO_CONTENT: 204,
  FOUND: 302,
  TEMPORARY_REDIRECT: 307,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const HTTP_CONTENT_TYPES = {
  JSON: 'application/json',
  TEXT_PLAIN: 'text/plain',
  SSE: 'text/event-stream',
} as const;

export const HTTP_HEADERS = {
  CONTENT_TYPE: 'Content-Type',
  AUTHORIZATION: 'Authorization',
  COOKIE: 'Cookie',
  LOCATION: 'Location',
  LOCATION_LOWER: 'location',
  MCP_SESSION_ID: 'mcp-session-id',
  ACCESS_CONTROL_ALLOW_ORIGIN: 'Access-Control-Allow-Origin',
  ACCESS_CONTROL_ALLOW_METHODS: 'Access-Control-Allow-Methods',
  ACCESS_CONTROL_ALLOW_HEADERS: 'Access-Control-Allow-Headers',
} as const;

export const BROWSER_DEFAULTS = {
  BROWSER_TYPE: 'chromium' as const,
  HEADLESS: true,
  VIEWPORT: { width: 1280, height: 720 },
  MAX_CONCURRENCY: 25,
  MAX_PAGES_PER_CONTEXT: 5,
  SLOT_CHECK_INTERVAL_MS: 50,
  BROWSER_CLOSE_TIMEOUT_MS: 2000,
  LAUNCH_ARGS: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-breakpad',
    '--disable-component-extensions-with-background-pages',
    '--disable-features=Translate,BackForwardCache,AcceptCHFrame,AvoidUnnecessaryBeforeUnloadCheckSync',
    '--disable-ipc-flooding-protection',
    '--disable-renderer-backgrounding',
    '--force-color-profile=srgb',
    '--metrics-recording-only',
    '--mute-audio',
  ] as const,
} as const;

export const TIMEOUT_DEFAULTS = {
  STEP_WATCHDOG_MS: 30000,
  WORKFLOW_WATCHDOG_MS: 180000,
  STUCK_GRACE_PERIOD_MS: 3000,
  DEFAULT_STEP_ACTION_TIMEOUT_MS: 15000,
  NAVIGATION_TIMEOUT_MS: 30000,
  RESPONSE_WAIT_TIMEOUT_MS: 20000,
  WAIT_TIMEOUT_MS: 1000,
  OLLAMA_TIMEOUT_MS: 180000,
  COMFYUI_TIMEOUT_MS: 90000,
} as const;

export const CIRCUIT_BREAKER_DEFAULTS = {
  FAILURE_THRESHOLD: 3,
  RESET_TIMEOUT_MS: 30000,
  HALF_OPEN_MAX_PROBES: 2,
} as const;

export const CIRCUIT_BREAKER_STATES = {
  CLOSED: 'CLOSED' as const,
  OPEN: 'OPEN' as const,
  HALF_OPEN: 'HALF_OPEN' as const,
} as const;

export const RETRY_DEFAULTS = {
  MAX_RETRIES: 3,
  INITIAL_DELAY_MS: 1000,
  MAX_DELAY_MS: 15000,
  BACKOFF_FACTOR: 2,
  JITTER: true,
  JITTER_FACTOR: 0.3,
} as const;

export const EXECUTION_STATUS_NAMES = {
  SUCCESS: 'SUCCESS' as const,
  RETRIED_SUCCESS: 'RETRIED_SUCCESS' as const,
  FAILED: 'FAILED' as const,
  STUCK_PROCESS_KILLED: 'STUCK_PROCESS_KILLED' as const,
  CIRCUIT_BROKEN: 'CIRCUIT_BROKEN' as const,
} as const;

export const AUTH_DETECTION = {
  HEADER_NAMES: [
    'authorization',
    'proxy-authorization',
    'x-api-key',
    'api-key',
    'apikey',
    'x-auth-token',
    'x-access-token',
    'x-jwt-assertion',
    'x-token',
    'authentication',
    'session-token',
  ] as const,

  COOKIE_PATTERNS: [
    /session/i,
    /token/i,
    /jwt/i,
    /auth/i,
    /login/i,
    /sid/i,
    /id_token/i,
    /xsrf/i,
    /csrf/i,
    /connect\.sid/i,
  ] as const,

  QUERY_PARAMS: [
    'access_token',
    'api_key',
    'apikey',
    'token',
    'auth_token',
    'key',
    'signature',
    'sig',
  ] as const,

  URL_PATTERNS: [
    /\/auth\b/i,
    /\/oauth\b/i,
    /\/login\b/i,
    /\/signin\b/i,
    /\/token\b/i,
    /\/v\d+\/user/i,
    /\/v\d+\/account/i,
    /\/me\b/i,
    /\/admin\b/i,
  ] as const,

  TOKEN_EXPIRED_MESSAGES: [
    'invalid_token',
    'token_expired',
    'unauthorized',
    'jwt expired',
  ] as const,
} as const;

export const AI_DEFAULTS = {
  OLLAMA_MODEL: 'qwen3:latest',
  OLLAMA_BASE_URL: 'http://ollama-model-service-gpu:11434',
  COMFYUI_BASE_URL: 'http://comfyui-model-service-gpu:8188',
  RECOMMENDED_MODELS: {
    RESUME_REASONING_MATCH: 'deepseek-r1:7b',
    RESUME_TAILORING_CUSTOMIZE: 'llama3.1:8b',
    CODEGEN_FORM_AUTOFILL: 'qwen3-coder:latest',
    FAST_EXTRACTION: 'llama3.2:latest',
  },
} as const;

export const SYSTEM_SIGNALS = {
  SIGKILL: 'SIGKILL' as const,
  ZERO: 0 as const,
  ERR_EPERM: 'EPERM' as const,
} as const;

export const GOOGLE_XRAY_CONSTANTS = {
  SEARCH_BASE_URL: 'https://www.google.com/search',
  DEFAULT_RESULTS_LIMIT: 10,
  MAX_RESULTS_LIMIT: 50,
  DEFAULT_TIMEOUT_MS: 30000,
  CIRCUIT_BREAKER_DOMAIN: 'google.com',
  OPERATORS: {
    SITE: 'site:',
    INTITLE: 'intitle:',
    INURL: 'inurl:',
    FILETYPE: 'filetype:',
    OR: 'OR',
    AND: 'AND',
    NOT: '-',
    QUOTE: '"',
  },
  TARGET_PLATFORMS: {
    LINKEDIN: 'linkedin' as const,
    GITHUB: 'github' as const,
    STACKOVERFLOW: 'stackoverflow' as const,
    DOCUMENT: 'document' as const,
    CUSTOM: 'custom' as const,
  },
  DOMAINS: {
    LINKEDIN_PROFILE: 'linkedin.com/in',
    GITHUB_USER: 'github.com',
    STACKOVERFLOW_USER: 'stackoverflow.com/users',
  },
  SELECTORS: {
    SEARCH_INPUT: 'textarea[name="q"], input[name="q"]',
    CONSENT_BUTTON: 'button:has-text("Accept all"), button:has-text("I agree"), #L2AGLb',
    RESULT_CONTAINERS: 'div.g, div[data-hveid]',
    RESULT_TITLE: 'h3',
    RESULT_LINK: 'a[href^="http"]',
    RESULT_SNIPPET: 'div[style*="-webkit-line-clamp"], div.VwiC3b, .IsZvec',
  },
  REST_ENDPOINTS: {
    SEARCH: '/api/xray/search',
    TEMPLATES: '/api/xray/templates',
    PREVIEW: '/api/xray/preview',
  },
} as const;

export const WORKFLOW_RECORDING_CONSTANTS = {
  WORKFLOW_DIR_NAME: 'workflows',
  DEFAULT_WORKFLOWS_PATH: process.env.WORKFLOWS_DIR || 'workflows',
  DEFAULT_VERSION: '1.0.0',
  DEFAULT_TIMEOUT_MS: 180000,
  DEFAULT_STEP_TIMEOUT_MS: 30000,
  DEFAULT_ACTION_TIMEOUT_MS: 10000,
  DEFAULT_RETRY_CONFIG: {
    MAX_RETRIES: 3,
    INITIAL_DELAY_MS: 1000,
    BACKOFF_FACTOR: 2,
  },
  NAME_PATTERNS: {
    PREFIX: 'wf',
    EXTENSION: '.json',
    SEPARATOR: '_',
    DEFAULT_DOMAIN: 'web',
    DEFAULT_ACTION: 'workflow',
  },
  RECORD_EVENTS: {
    CLICK: 'click',
    INPUT: 'input',
    CHANGE: 'change',
    SUBMIT: 'submit',
    KEYDOWN: 'keydown',
    NAVIGATION: 'navigation',
  },
  DOM_LISTENER_FUNCTION: '__recordAction',
  REST_ENDPOINTS: {
    RECORD_START: '/api/workflow/record/start',
    RECORD_STOP: '/api/workflow/record/stop',
    RECORD_STATUS: '/api/workflow/record/status',
    DESCRIBE_AND_GENERATE: '/api/workflow/describe-and-generate',
    REVALIDATE_WITH_OLLAMA: '/api/workflow/revalidate',
    LIST_WORKFLOWS: '/api/workflows',
    SAVE_JOB_REQUIREMENT: '/api/workflow/job-requirement',
    LIST_JOB_REQUIREMENTS: '/api/workflow/job-requirements',
    MATCH_RESUME: '/api/workflow/resume/match',
    CUSTOMIZE_RESUME: '/api/workflow/resume/customize',
    FETCH_GOOGLE_DOC_PROFILE: '/api/workflow/google-docs/fetch-profile',
    AUTOFILL_FORM: '/api/workflow/form/autofill',
    COOKIES_STATUS: '/api/workflow/auth/cookies',
    COOKIES_IMPORT: '/api/workflow/auth/cookies/import',
    COOKIES_EXPORT: '/api/workflow/auth/cookies/export',
  },
} as const;


