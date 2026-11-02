import type { MessageEntity } from "@/entities/message.entity.js";

export interface CompactedAstResult {
  readonly compactedAst: Record<string, unknown>;
  readonly originalBytes: number;
  readonly compactedBytes: number;
  readonly compressionRatio: number;
}

export interface CompactedDialogResult {
  readonly messages: ReadonlyArray<MessageEntity>;
  readonly prunedTurnsCount: number;
  readonly estimatedTokens: number;
}

/**
 * Enterprise Token Exhaustion & AST Pruning Compactor.
 * Conforms to:
 * - HLD §14.2 & LLD §13: Lossless AST pruning and dialog turn compaction
 * - STD-COD-007: Clean Code, Immutability & Resilient Transformations
 */
export class TokenCompactor {
  private static readonly CHARS_PER_TOKEN = 4;

  public static estimateTokens(text: string): number {
    if (!text || text.length === 0) {
      return 0;
    }
    return Math.ceil(text.length / this.CHARS_PER_TOKEN);
  }

  public static pruneAstLossless(ast: Record<string, unknown>): CompactedAstResult {
    const originalJson = JSON.stringify(ast);
    const originalBytes = Buffer.byteLength(originalJson, "utf-8");
    const pruned = this.stripEmptyAndNullFields(ast);
    const compactedJson = JSON.stringify(pruned);
    const compactedBytes = Buffer.byteLength(compactedJson, "utf-8");
    const compressionRatio = originalBytes > 0 ? compactedBytes / originalBytes : 1.0;

    return Object.freeze({
      compactedAst: pruned,
      originalBytes,
      compactedBytes,
      compressionRatio,
    });
  }

  public static compactDialogHistory(
    messages: ReadonlyArray<MessageEntity>,
    maxTokenBudget: number,
  ): CompactedDialogResult {
    const reversed = [...messages].reverse();
    const retained: MessageEntity[] = [];
    let currentTokens = 0;
    let prunedTurns = 0;

    for (const msg of reversed) {
      const msgTokens = msg.TOKEN_COUNT || this.estimateTokens(msg.MESSAGE_CONTENT);
      if (currentTokens + msgTokens <= maxTokenBudget || msg.MESSAGE_ROLE === "system") {
        retained.unshift(msg);
        currentTokens += msgTokens;
      } else {
        prunedTurns++;
      }
    }

    return Object.freeze({
      messages: Object.freeze(retained),
      prunedTurnsCount: prunedTurns,
      estimatedTokens: currentTokens,
    });
  }

  private static stripEmptyAndNullFields(obj: Record<string, unknown>): Record<string, unknown> {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined || value === "") {
        continue;
      }
      if (typeof value === "object" && !Array.isArray(value)) {
        cleaned[key] = this.stripEmptyAndNullFields(value as Record<string, unknown>);
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }
}
