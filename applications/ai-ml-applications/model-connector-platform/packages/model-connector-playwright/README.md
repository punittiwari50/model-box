# @model-box/model-connector-playwright

Enterprise Playwright Sanity and E2E Verification Module for Model Connector Platform.

## Architecture
- **Page Object Model (POM)**: Encapsulated view representations (`ChatPage`, `CatalogPage`, `ConfigStudioPage`, `SessionsPage`, `TelemetryPage`, `WorkflowsPage`, `OnboardingPage`, `RbacPage`, `MobileNavPage`).
- **Strategy & DI**: Pluggable `ISanityVerifier` implementations orchestrated by `MenuSanityTestSuite`.
- **Zero Magic Literals**: Centralized selectors and configuration constants in `src/main/typescript/constants/`.
- **Hermetic Runtime**: Executes inside Docker with Chromium headless or locally against Microsoft Edge / Chrome CDP.

## Commands
```bash
# Build TypeScript
npm run build

# Run menu sanity check
npm run test:sanity
```

