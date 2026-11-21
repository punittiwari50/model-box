import type { Request, Response } from "express";
import { accountRepository, type AuthType } from "@/repositories/accountRepository";
import { HttpStatus } from "@/constants/index";
import { modelAuthenticationFlowCoordinator } from "@model-box/model-connector-client";

export class AccountController {
  public listAccountsByModel(req: Request, res: Response): void {
    const { modelId } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const accounts = accountRepository.listAccountsByModel(modelId, limit, offset);
    res.status(HttpStatus.OK).json({
      success: true,
      modelId,
      count: accounts.length,
      accounts: accounts.map(this.maskCredential),
      correlationId: req.correlationId,
    });
  }

  public listAllAccounts(req: Request, res: Response): void {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const accounts = accountRepository.listAllAccounts(limit, offset);
    res.status(HttpStatus.OK).json({
      success: true,
      count: accounts.length,
      accounts: accounts.map(this.maskCredential),
      correlationId: req.correlationId,
    });
  }

  public createAccount(req: Request, res: Response): void {
    const { modelId } = req.params;
    const { accountName, userEmail, authType, credentialValue, isActive, authCode } = req.body || {};

    if (!accountName || !userEmail || !authType || !credentialValue) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: "Missing required fields: accountName, userEmail, authType, credentialValue",
        correlationId: req.correlationId,
      });
      return;
    }

    const resolvedConfigJson = this.resolveConfigPayload(req.body);

    const created = accountRepository.createAccount({
      modelId,
      accountName,
      userEmail,
      authType: authType as AuthType,
      credentialValue,
      isActive: Boolean(isActive ?? false),
      authCode,
      configJson: resolvedConfigJson,
    });

    res.status(HttpStatus.CREATED).json({
      success: true,
      account: this.maskCredential(created),
      correlationId: req.correlationId,
    });
  }

  public updateAccount(req: Request, res: Response): void {
    const { accountId } = req.params;
    const { accountName, userEmail, authType, credentialValue, isActive, authCode } = req.body || {};

    const resolvedConfigJson = this.resolveConfigPayload(req.body);

    const updated = accountRepository.updateAccount(accountId, {
      accountName,
      userEmail,
      authType,
      credentialValue,
      isActive,
      authCode,
      configJson: resolvedConfigJson,
    });

    if (!updated) {
      res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        message: `Account '${accountId}' not found.`,
        correlationId: req.correlationId,
      });
      return;
    }

    res.status(HttpStatus.OK).json({
      success: true,
      account: this.maskCredential(updated),
      correlationId: req.correlationId,
    });
  }

  private resolveConfigPayload(body: any): string | undefined {
    const { config, configJson, customLocation, credentialsFileContent, tokens, authMethod } = body || {};
    let configObj: Record<string, unknown> = {};
    if (config && typeof config === "object") configObj = { ...config };
    else if (configJson) {
      try { configObj = JSON.parse(configJson); } catch { }
    }
    if (customLocation) configObj.customLocation = customLocation;
    if (credentialsFileContent) configObj.credentialsFileContent = credentialsFileContent;
    if (tokens) configObj.tokens = tokens;
    if (authMethod) configObj.authMethod = authMethod;
    return Object.keys(configObj).length > 0 ? JSON.stringify(configObj) : undefined;
  }

  public async activateAccount(req: Request, res: Response): Promise<void> {
    const { modelId, accountId } = req.params;
    const account = accountRepository.getAccount(accountId);
    if (!account || account.modelId.toLowerCase() !== modelId.toLowerCase()) {
      res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        message: `Account '${accountId}' for model '${modelId}' not found.`,
        correlationId: req.correlationId,
      });
      return;
    }

    if (!account.credentialValue && !account.authCode) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: `Cannot activate unverified account without valid credentials. Run connection test first.`,
        correlationId: req.correlationId,
      });
      return;
    }

    const testResult = await modelAuthenticationFlowCoordinator.verifyConnection(account.authType, {
      modelId,
      credentialValue: account.credentialValue || account.authCode || "",
      userPrompt: "Hi , whats date time now ?",
      startTime: Date.now(),
      correlationId: req.correlationId,
      userEmail: account.userEmail,
    });

    if (testResult.status !== "VERIFIED") {
      accountRepository.deactivateAccount(modelId, accountId);
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: testResult.errorMessage || `Connection verification failed with status ${testResult.status}. Account cannot enter active stage without verified 2xx response.`,
        details: testResult.details,
        correlationId: req.correlationId,
      });
      return;
    }

    const activated = accountRepository.setActiveAccount(modelId, accountId);
    if (!activated) {
      res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        message: `Account '${accountId}' for model '${modelId}' could not be activated.`,
        correlationId: req.correlationId,
      });
      return;
    }

    res.status(HttpStatus.OK).json({
      success: true,
      message: `Account '${accountId}' set as active for '${modelId}' (Verified & Tested with 2xx response).`,
      correlationId: req.correlationId,
    });
  }

  public deactivateAccount(req: Request, res: Response): void {
    const { modelId, accountId } = req.params;
    const deactivated = accountRepository.deactivateAccount(modelId, accountId);

    if (!deactivated) {
      res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        message: `Account '${accountId}' for model '${modelId}' not found.`,
        correlationId: req.correlationId,
      });
      return;
    }

    res.status(HttpStatus.OK).json({
      success: true,
      message: `Account '${accountId}' set as inactive for '${modelId}'.`,
      correlationId: req.correlationId,
    });
  }

  public deleteAccount(req: Request, res: Response): void {
    const { accountId } = req.params;
    const deleted = accountRepository.deleteAccount(accountId);

    res.status(HttpStatus.OK).json({
      success: deleted,
      message: deleted ? `Account '${accountId}' deleted.` : `Account '${accountId}' not found.`,
      correlationId: req.correlationId,
    });
  }

  private maskCredential(acc: any): any {
    const val = acc.credentialValue || "";
    const masked =
      val.length > 8
        ? `${val.slice(0, 4)}...${val.slice(-4)}`
        : "••••••••";

    let parsedConfig = undefined;
    if (acc.configJson) {
      try {
        parsedConfig = typeof acc.configJson === "string" ? JSON.parse(acc.configJson) : acc.configJson;
      } catch {
        parsedConfig = undefined;
      }
    }

    const resolvedStatus =
      acc.status ||
      parsedConfig?.verificationStatus ||
      parsedConfig?.status ||
      (acc.isActive ? (parsedConfig?.status === "VERIFIED" ? "VERIFIED" : "UNVERIFIED") : "UNVERIFIED");

    return {
      ...acc,
      status: resolvedStatus,
      maskedCredential: masked,
      credentialValue: val,
      config: parsedConfig,
    };
  }
}

export const accountController = new AccountController();
