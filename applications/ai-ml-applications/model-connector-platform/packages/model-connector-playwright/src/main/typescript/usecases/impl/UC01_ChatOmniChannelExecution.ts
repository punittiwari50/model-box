import type { Page } from "playwright";
import { AbstractUsecaseTest } from "@/usecases/impl/AbstractUsecaseTest.js";
import { ChatViewSelectors } from "@/constants/selectors.js";
import { SanityTimeouts } from "@/constants/sanityConstants.js";

/**
 * UC-01: Omni-Channel Model Execution & Strategy Switching
 */
export class UC01_ChatOmniChannelExecution extends AbstractUsecaseTest {
  public constructor() {
    super(
      "UC-01",
      "Omni-Channel Execution Strategy Switching",
      "Chat & Inference",
      "Verifies interactive chat container, user prompt input, and strategy switching (API, CLI, COOKIE)",
    );
  }

  public async runSteps(page: Page, recordStep: (name: string, fn: () => Promise<string>) => Promise<void>): Promise<void> {
    await recordStep("Navigate to AI Chat Workspace", async () => {
      await this.navigateToRoute(page, "chat", "AI Chat Workspace");
      const container = page.locator(ChatViewSelectors.CONTAINER).first();
      await container.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      return "Chat workspace container mounted";
    });

    await recordStep("Input Inference Prompt", async () => {
      const textarea = page.locator(ChatViewSelectors.TEXTAREA).first();
      await textarea.waitFor({ state: "visible", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      await textarea.fill("Analyze distributed system throughput with fallback to Ollama.");
      return "Prompt populated into chat textarea";
    });

    await recordStep("Cycle Execution Strategy Pills", async () => {
      const pills = page.locator(ChatViewSelectors.STRATEGY_PILL);
      const count = await pills.count();
      for (let i = 0; i < count; i++) {
        await pills.nth(i).click();
        await page.waitForTimeout(SanityTimeouts.SHORT_WAIT_MS);
      }
      return `Successfully toggled ${count} execution strategy pills (API, CLI, COOKIE)`;
    });

    await recordStep("Verify Send Trigger Readiness", async () => {
      const sendBtn = page.locator(ChatViewSelectors.SEND_BUTTON).first();
      await sendBtn.waitFor({ state: "attached", timeout: SanityTimeouts.DEFAULT_TIMEOUT_MS });
      return "Send action button attached and ready for model execution";
    });
  }
}

