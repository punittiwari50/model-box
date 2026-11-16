import type { Browser } from "playwright";
import type { ISanityConfig } from "@/contracts/ISanityConfig.js";

/**
 * Factory Contract for Browser Connection Lifecycle
 */
export interface IBrowserFactory {
  createBrowser(config: ISanityConfig): Promise<Browser>;
}

