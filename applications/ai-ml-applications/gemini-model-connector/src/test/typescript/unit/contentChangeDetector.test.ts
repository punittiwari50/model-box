import { describe, it } from "node:test";
import assert from "node:assert";
import {
  contentChangeDetector,
  ContentChangeDetector,
} from "@/core/utils/algorithm/contentChangeDetector.js";

describe("Content Change Detector Algorithm (Requirement #12 - Non-line-by-line Diffing)", () => {
  it("should detect identical job payloads with O(1) hash comparison", () => {
    const jobA = {
      title: "Senior AI Engineer",
      content: "Design distributed agent networks using TypeScript and Python.",
    };
    const jobB = {
      title: "Senior AI Engineer",
      content:
        "  Design distributed agent networks using TypeScript and Python.  ",
    };

    const result = contentChangeDetector.detectChanges(jobA, jobB);
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.similarity, 1.0);
    assert.strictEqual(result.previousFingerprint, result.currentFingerprint);
  });

  it("should detect changed conversation or job payloads and compute Jaccard similarity", () => {
    const jobA = {
      title: "Senior AI Engineer",
      content: "Design distributed agent networks using TypeScript and Python.",
    };
    const jobB = {
      title: "Lead AI Engineer",
      content:
        "Design distributed agent networks using Golang and Rust with Kubernetes.",
    };

    const result = contentChangeDetector.detectChanges(jobA, jobB);
    assert.strictEqual(result.changed, true);
    assert.ok(result.similarity > 0.0 && result.similarity < 1.0);
    assert.notStrictEqual(
      result.previousFingerprint,
      result.currentFingerprint,
    );
  });

  it("should return 1.0 similarity for empty contents", () => {
    const detector = new ContentChangeDetector();
    assert.strictEqual(detector.computeSimilarity("", ""), 1.0);
  });
});
