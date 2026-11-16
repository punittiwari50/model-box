import { processUtils } from "@model-box/model-connector-core";
import { BrowserFactory } from "@/browser/BrowserFactory.js";
import { MenuSanityTestSuite } from "@/runner/MenuSanityTestSuite.js";
import { ChatPage } from "@/pages/ChatPage.js";
import { CatalogPage } from "@/pages/CatalogPage.js";
import { ConfigStudioPage } from "@/pages/ConfigStudioPage.js";
import { SessionsPage } from "@/pages/SessionsPage.js";
import { TelemetryPage } from "@/pages/TelemetryPage.js";
import { WorkflowsPage } from "@/pages/WorkflowsPage.js";
import { OnboardingPage } from "@/pages/OnboardingPage.js";
import { RbacPage } from "@/pages/RbacPage.js";
import { MobileNavPage } from "@/pages/MobileNavPage.js";
import { SanityDefaults } from "@/constants/sanityConstants.js";
import type { ISanityConfig } from "@/contracts/ISanityConfig.js";
import type { ISanityVerifier } from "@/contracts/ISanityVerifier.js";

/**
 * Sanity Test Suite Factory
 * Conforms to STD-COD-005 (Factory Pattern & Dependency Injection)
 */
export class SanityFactory {
  public static resolveConfig(): ISanityConfig {
    return Object.freeze({
      uiBaseUrl: processUtils.getEnv("UI_BASE_URL", SanityDefaults.DEFAULT_UI_URL),
      edgeCdpUrl: processUtils.getEnv("EDGE_CDP_URL", ""),
      useMsEdgeChannel: processUtils.getEnv("USE_MSEDGE_CHANNEL", "false") === "true",
      chromiumExecutablePath: processUtils.getEnv("CHROMIUM_PATH", ""),
      headless: processUtils.getEnv("HEADLESS", "true") !== "false",
    });
  }

  public static createDefaultVerifiers(): readonly ISanityVerifier[] {
    return Object.freeze([
      new ChatPage(),
      new CatalogPage(),
      new ConfigStudioPage(),
      new SessionsPage(),
      new TelemetryPage(),
      new WorkflowsPage(),
      new OnboardingPage(),
      new RbacPage(),
      new MobileNavPage(),
    ]);
  }

  public static createDefaultSuite(config?: ISanityConfig): MenuSanityTestSuite {
    const resolvedConfig = config ?? SanityFactory.resolveConfig();
    const verifiers = SanityFactory.createDefaultVerifiers();
    const browserFactory = new BrowserFactory();
    return new MenuSanityTestSuite(browserFactory, verifiers, resolvedConfig);
  }
}

