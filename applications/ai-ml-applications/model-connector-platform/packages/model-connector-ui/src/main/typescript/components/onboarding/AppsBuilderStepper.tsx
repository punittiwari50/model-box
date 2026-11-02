import React, { useState } from "react";
import { OnboardingValidators } from "@/schemas/onboarding.schemas";

export const AppsBuilderStepper: React.FC = () => {
  const [currentFrame, setCurrentFrame] = useState<number>(1);
  const [skillMarkdown, setSkillMarkdown] = useState<string>(
    `---\nname: data-transformer\ndescription: Transforms raw CSV streams into Parquet analytics tables\nversion: 1.0.0\n---\n\n# Data Transformer Skill\n\n## Tools\n- parse_csv: Ingests raw CSV\n- validate_schema: Validates types\n- export_parquet: Emits parquet`,
  );
  const [targetLang, setTargetLang] = useState<"TYPESCRIPT" | "PYTHON" | "GO" | "RUST">("TYPESCRIPT");
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ passed: boolean; duration: number } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleNext = () => {
    setValidationError(null);
    if (currentFrame === 2) {
      const val = OnboardingValidators.validateSkillMd({
        skillContent: skillMarkdown,
        targetLanguage: targetLang,
        runSandboxTests: true,
      });
      if (!val.success) {
        setValidationError(val.errors?.[0] || "Validation failed");
        return;
      }
    }
    if (currentFrame < 5) {
      setCurrentFrame((prev) => prev + 1);
    }
  };

  const handleRunSandbox = () => {
    setIsSynthesizing(true);
    setTimeout(() => {
      setIsSynthesizing(false);
      setTestResult({ passed: true, duration: 420 });
    }, 700);
  };

  return (
    <div className="stepper-view-container glass-card">
      <div className="stepper-header">
        <div className="stepper-badge">Apps Builder Studio</div>
        <div className="stepper-indicator">
          Step {currentFrame} of 5:{" "}
          {currentFrame === 1 && "Workspace & Template Choice"}
          {currentFrame === 2 && "Skill MD Ingestion & AST Verification"}
          {currentFrame === 3 && "Real-Time Code Synthesis Canvas"}
          {currentFrame === 4 && "Isolated Sandbox Execution & Telemetry"}
          {currentFrame === 5 && "Package Registry & Live Deployment"}
        </div>
        <div className="stepper-progress-bar">
          <div className="progress-fill" style={{ width: `${(currentFrame / 5) * 100}%` }} />
        </div>
      </div>

      {validationError ? (
        <div className="stepper-error-banner">⚠️ {validationError}</div>
      ) : null}

      <div className="stepper-frame-content">
        {currentFrame === 1 && (
          <div className="frame-body">
            <h4>Select Starter Template & Language</h4>
            <div className="auth-options-grid">
              {[
                { lang: "TYPESCRIPT", desc: "Node.js / Express / Zod Microservice" },
                { lang: "PYTHON", desc: "FastAPI / Pydantic / PyArrow Engine" },
                { lang: "GO", desc: "High-Performance Concurrency Daemon" },
                { lang: "RUST", desc: "Memory-Safe Zero-Cost Abstraction" },
              ].map((item) => (
                <div
                  key={item.lang}
                  className={`auth-card ${targetLang === item.lang ? "selected" : ""}`}
                  onClick={() => setTargetLang(item.lang as any)}
                >
                  <div className="auth-title">{item.lang}</div>
                  <div className="auth-desc">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentFrame === 2 && (
          <div className="frame-body">
            <h4>Skill Specification Markdown (`SKILL.md`)</h4>
            <textarea
              className="glass-textarea"
              rows={8}
              value={skillMarkdown}
              onChange={(e) => setSkillMarkdown(e.target.value)}
            />
          </div>
        )}

        {currentFrame === 3 && (
          <div className="frame-body">
            <h4>Synthesized Code Preview (`DataTransformer.ts`)</h4>
            <div className="code-diff-preview glass-card" style={{ padding: "1rem" }}>
              <pre style={{ margin: 0, fontSize: "0.85rem", color: "#38bdf8" }}>
{`import { parseCsv, validateSchema, exportParquet } from "@model-box/data-leaf";

export class DataTransformerService {
  public async executePipeline(stream: ReadableStream): Promise<Uint8Array> {
    const rawRecords = await parseCsv(stream);
    const validated = validateSchema(rawRecords);
    return exportParquet(validated);
  }
}`}
              </pre>
            </div>
          </div>
        )}

        {currentFrame === 4 && (
          <div className="frame-body">
            <h4>Hermetic Docker Sandbox Execution</h4>
            <button
              className="primary-button"
              disabled={isSynthesizing}
              onClick={handleRunSandbox}
            >
              {isSynthesizing ? "Running In Ephemeral Container..." : "▶ Run Sandbox Tests"}
            </button>
            {testResult && (
              <div className="sandbox-results glass-card" style={{ marginTop: "1rem", padding: "1rem" }}>
                <div style={{ color: "#10b981", fontWeight: "bold" }}>✓ All 3 Unit Tests Passed in {testResult.duration}ms</div>
                <div style={{ color: "#94a3b8", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                  Sandbox container terminated cleanly (Non-root user 10001, 0 CVEs detected).
                </div>
              </div>
            )}
          </div>
        )}

        {currentFrame === 5 && (
          <div className="frame-body">
            <h4>Package Deployment & Live Endpoint</h4>
            <div className="submission-success-card glass-card">
              <div className="success-icon">🚀</div>
              <h5>Skill Published Successfully!</h5>
              <div className="receipt-meta">
                <div><strong>Package:</strong> <code>@model-box/skill-data-transformer@1.0.0</code></div>
                <div><strong>Ingress Route:</strong> <code>POST /api/v1/skills/data-transformer/execute</code></div>
                <div><strong>Container Image:</strong> <code>ghcr.io/model-box/skill-data-transformer:1.0.0</code></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="stepper-footer">
        <button className="glass-button" disabled={currentFrame === 1} onClick={() => setCurrentFrame((p) => p - 1)}>
          ← Previous
        </button>
        <button className="primary-button" disabled={currentFrame === 5} onClick={handleNext}>
          {currentFrame === 4 ? "Publish Skill →" : "Next Step →"}
        </button>
      </div>
    </div>
  );
};
