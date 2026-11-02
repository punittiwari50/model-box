/**
 * Configuration Options for Playwright Sanity Verification Suite
 */
export interface ISanityConfig {
  readonly uiBaseUrl: string;
  readonly edgeCdpUrl?: string;
  readonly useMsEdgeChannel: boolean;
  readonly chromiumExecutablePath?: string;
  readonly headless: boolean;
  readonly defaultTimeoutMs?: number;
}

