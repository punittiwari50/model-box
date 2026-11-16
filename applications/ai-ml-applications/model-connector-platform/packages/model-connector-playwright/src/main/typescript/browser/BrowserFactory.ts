import { chromium, type Browser } from "playwright";
import type { IBrowserFactory } from "@/contracts/IBrowserFactory.js";
import type { ISanityConfig } from "@/contracts/ISanityConfig.js";

/**
 * Enterprise Browser Connection Factory.
 * Supports Edge CDP, Microsoft Edge Channel, Custom Chromium, and Default Headless Shell.
 * Conforms to STD-COD-005 (Factory Pattern) and STD-COD-007 (SLAP <= 20 lines).
 */
export class BrowserFactory implements IBrowserFactory {
  public async createBrowser(config: ISanityConfig): Promise<Browser> {
    if (config.edgeCdpUrl) {
      return this.connectCdpSafely(config.edgeCdpUrl, config);
    }
    if (config.useMsEdgeChannel) {
      return chromium.launch({ channel: "msedge", headless: config.headless });
    }
    return this.launchChromium(config);
  }

  private async connectCdpSafely(cdpUrl: string, fallbackConfig: ISanityConfig): Promise<Browser> {
    try {
      return await chromium.connectOverCDP(cdpUrl);
    } catch {
      return this.launchChromium(fallbackConfig);
    }
  }

  private async launchChromium(config: ISanityConfig): Promise<Browser> {
    const launchOptions = {
      headless: config.headless,
      executablePath: config.chromiumExecutablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    };
    return chromium.launch(launchOptions);
  }
}

