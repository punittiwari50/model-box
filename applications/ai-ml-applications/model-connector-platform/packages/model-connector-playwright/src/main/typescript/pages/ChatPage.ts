import type { Page } from "playwright";
import { BasePage } from "@/pages/BasePage.js";
import type { ISanityCheckResult } from "@/contracts/ISanityCheckResult.js";
import { SanityTimeouts } from "@/constants/sanityConstants.js";
import { ChatViewSelectors } from "@/constants/selectors.js";

/**
 * 1. AI Chat Workspace Page Verifier
 */
export class ChatPage extends BasePage {
  public constructor() {
    super("chat", "AI Chat Workspace");
  }

  public async verifyView(page: Page): Promise<Omit<ISanityCheckResult, "latencyMs">> {
    await this.navigateToMenu(page);
    await this.verifyLayoutElements(page);
    await this.verifyStrategyPills(page);

    return {
      menu: this.menuTitle,
      route: this.menuRoute,
      status: "PASSED",
      details: "Chat container, textarea, send button, and strategy pills verified",
    };
  }

  private async verifyLayoutElements(page: Page): Promise<void> {
    const container = page.locator(ChatViewSelectors.CONTAINER).first();
    await container.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

    const textarea = page.locator(ChatViewSelectors.TEXTAREA).first();
    await textarea.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });

    const sendBtn = page.locator(ChatViewSelectors.SEND_BUTTON).first();
    await sendBtn.waitFor({ state: "attached", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
  }

  private async verifyStrategyPills(page: Page): Promise<void> {
    const pills = page.locator(ChatViewSelectors.STRATEGY_PILL);
    const count = await pills.count();
    for (let i = 0; i < count; i++) {
      const pill = pills.nth(i);
      await pill.click();
      await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);
    }
  }
}

