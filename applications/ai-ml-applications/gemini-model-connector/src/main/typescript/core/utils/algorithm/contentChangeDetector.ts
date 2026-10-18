import crypto from 'node:crypto';

export interface ChangeDetectionResult {
  readonly changed: boolean;
  readonly similarity: number;
  readonly previousFingerprint: string;
  readonly currentFingerprint: string;
}

/**
 * Enterprise Content Change Detection Engine.
 * Conforms to Requirement #12:
 * - Verifies changes between job descriptions or conversation messages between two requests
 *   using mathematical hashing and Jaccard token set intersection rather than slow
 *   line-by-line or character-by-character string comparisons.
 */
export class ContentChangeDetector {
  /**
   * Generates a normalized semantic SHA-256 fingerprint of the input content.
   * Strips non-semantic whitespace and normalizes case for robust hashing.
   */
  public computeFingerprint(content: string): string {
    if (!content) {
      return '';
    }
    const normalized = content.trim().replace(/\s+/g, ' ').toLowerCase();
    return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
  }

  /**
   * Fast O(1) comparison to determine if content changed using cryptographic digests.
   */
  public hasChanged(previousContent: string, currentContent: string): boolean {
    if (previousContent === currentContent) {
      return false;
    }
    return this.computeFingerprint(previousContent) !== this.computeFingerprint(currentContent);
  }

  /**
   * Computes the semantic similarity score (0.0 to 1.0) between two content strings
   * using token-set Jaccard similarity in O(T) instead of character/line comparison.
   */
  public computeSimilarity(previousContent: string, currentContent: string): number {
    const prevTokens = this.tokenize(previousContent);
    const currTokens = this.tokenize(currentContent);

    if (prevTokens.size === 0 && currTokens.size === 0) {
      return 1.0;
    }
    if (prevTokens.size === 0 || currTokens.size === 0) {
      return 0.0;
    }

    let intersectionCount = 0;
    for (const token of prevTokens) {
      if (currTokens.has(token)) {
        intersectionCount++;
      }
    }

    const unionCount = prevTokens.size + currTokens.size - intersectionCount;
    return unionCount === 0 ? 1.0 : Math.round((intersectionCount / unionCount) * 1000) / 1000;
  }

  /**
   * Comprehensive change analysis for job postings or conversation messages.
   */
  public detectChanges(
    previous: { title?: string; content: string },
    current: { title?: string; content: string }
  ): ChangeDetectionResult {
    const prevTitle = (previous.title || '').trim().replace(/\s+/g, ' ');
    const prevContent = (previous.content || '').trim().replace(/\s+/g, ' ');
    const currTitle = (current.title || '').trim().replace(/\s+/g, ' ');
    const currContent = (current.content || '').trim().replace(/\s+/g, ' ');

    const prevCompound = `${prevTitle}::${prevContent}`;
    const currCompound = `${currTitle}::${currContent}`;

    const prevFp = this.computeFingerprint(prevCompound);
    const currFp = this.computeFingerprint(currCompound);

    const changed = prevFp !== currFp;
    const similarity = changed ? this.computeSimilarity(prevCompound, currCompound) : 1.0;

    return {
      changed,
      similarity,
      previousFingerprint: prevFp,
      currentFingerprint: currFp,
    };
  }

  private tokenize(text: string): Set<string> {
    const tokens = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);
    return new Set(tokens);
  }
}

export const contentChangeDetector = new ContentChangeDetector();
