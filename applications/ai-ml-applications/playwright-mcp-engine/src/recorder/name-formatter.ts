import { WORKFLOW_RECORDING_CONSTANTS } from '@/constants/index.js';

// ============================================================================
// Professional Workflow Name Formatter (SOLID: SRP, OCP, LSP, Zero Branching)
// Pattern: wf_{domain}_{primary_action}_{YYYYMMDD_HHMMSS}.json
// ============================================================================

export interface IWorkflowNameFormatter {
  formatFileName(targetUrl?: string, primaryAction?: string, customName?: string): string;
  formatWorkflowId(targetUrl?: string, primaryAction?: string): string;
}

export class ProfessionalWorkflowNameFormatter implements IWorkflowNameFormatter {
  formatFileName(targetUrl?: string, primaryAction?: string, customName?: string): string {
    const hasCustomName = Boolean(customName && customName.trim());
    const customActions: Record<string, () => string> = {
      true: () => {
        const sanitized = this.sanitizeSlug(customName!);
        return [sanitized, WORKFLOW_RECORDING_CONSTANTS.NAME_PATTERNS.EXTENSION].join('');
      },
      false: () => {
        const domain = this.extractDomain(targetUrl);
        const action = this.sanitizeSlug(primaryAction || WORKFLOW_RECORDING_CONSTANTS.NAME_PATTERNS.DEFAULT_ACTION);
        const timestamp = this.generateTimestampSlug();

        const parts = [
          WORKFLOW_RECORDING_CONSTANTS.NAME_PATTERNS.PREFIX,
          domain,
          action,
          timestamp,
        ];
        return [parts.join(WORKFLOW_RECORDING_CONSTANTS.NAME_PATTERNS.SEPARATOR), WORKFLOW_RECORDING_CONSTANTS.NAME_PATTERNS.EXTENSION].join('');
      },
    };

    return customActions[String(hasCustomName)]();
  }

  formatWorkflowId(targetUrl?: string, primaryAction?: string): string {
    const domain = this.extractDomain(targetUrl);
    const action = this.sanitizeSlug(primaryAction || WORKFLOW_RECORDING_CONSTANTS.NAME_PATTERNS.DEFAULT_ACTION);
    const timestamp = Date.now().toString(36);

    return [
      WORKFLOW_RECORDING_CONSTANTS.NAME_PATTERNS.PREFIX,
      domain,
      action,
      timestamp,
    ].join('-');
  }

  private extractDomain(urlStr?: string): string {
    const hasUrl = Boolean(urlStr);
    const domainExtractors: Record<string, () => string> = {
      true: () => {
        try {
          const parsed = new URL(urlStr!);
          const host = parsed.hostname.replace(/^www\./, '');
          const cleanHost = host.split('.')[0] || WORKFLOW_RECORDING_CONSTANTS.NAME_PATTERNS.DEFAULT_DOMAIN;
          return this.sanitizeSlug(cleanHost);
        } catch {
          return this.sanitizeSlug(urlStr!);
        }
      },
      false: () => WORKFLOW_RECORDING_CONSTANTS.NAME_PATTERNS.DEFAULT_DOMAIN,
    };

    return domainExtractors[String(hasUrl)]();
  }

  private sanitizeSlug(raw: string): string {
    return raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 32);
  }

  private generateTimestampSlug(): string {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');

    const datePart = [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
    ].join('');

    const timePart = [
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join('');

    return [datePart, timePart].join('_');
  }
}
