import React, { useState } from "react";
import { OnboardingValidators } from "@/schemas/onboarding.schemas";

export const JobOnboardingStepper: React.FC = () => {
  const [currentFrame, setCurrentFrame] = useState<number>(1);
  const [selectedAuth, setSelectedAuth] = useState<string>("GOOGLE_GIS");
  const [targetRole, setTargetRole] = useState<string>("Senior Cloud Architect");
  const [jobDescription, setJobDescription] = useState<string>(
    "Looking for Senior Cloud Architect with expertise in TypeScript, Docker, Kubernetes, Distributed Systems, and Microservices.",
  );
  const [autoMutate, setAutoMutate] = useState<boolean>(true);
  const [scorecard] = useState<{ score: number; matched: string[]; missing: string[] }>({
    score: 92,
    matched: ["TypeScript", "Docker", "Kubernetes", "Microservices"],
    missing: ["GraphQL", "Kafka"],
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleNext = () => {
    setValidationError(null);
    if (currentFrame === 2) {
      const val = OnboardingValidators.validateResumeUpload({
        fileName: "resume_jane_doe.pdf",
        fileSize: 1024 * 500,
        fileType: "application/pdf",
        targetJobDescription: jobDescription,
        autoMutateMissingSkills: autoMutate,
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

  const handlePrev = () => {
    setValidationError(null);
    if (currentFrame > 1) {
      setCurrentFrame((prev) => prev - 1);
    }
  };

  const handleSimulatedSubmit = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmissionSuccess(true);
    }, 800);
  };

  return (
    <div className="stepper-view-container glass-card">
      <div className="stepper-header">
        <div className="stepper-badge">Job Application Onboarding</div>
        <div className="stepper-indicator">
          Step {currentFrame} of 5:{" "}
          {currentFrame === 1 && "Authentication & Portal Scope"}
          {currentFrame === 2 && "Resume Ingestion & Target JD"}
          {currentFrame === 3 && "Semantic AST Verification & Scorecard"}
          {currentFrame === 4 && "Target Portal & Autofill Preview"}
          {currentFrame === 5 && "Automated Playwright Submission"}
        </div>
        <div className="stepper-progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${(currentFrame / 5) * 100}%` }}
          />
        </div>
      </div>

      {validationError ? (
        <div className="stepper-error-banner">⚠️ {validationError}</div>
      ) : null}

      <div className="stepper-frame-content">
        {/* Frame 1: Auth & Scope */}
        {currentFrame === 1 && (
          <div className="frame-body">
            <h4>Select Authentication & Portal Scope</h4>
            <div className="auth-options-grid">
              {[
                { id: "GOOGLE_GIS", label: "Google OAuth (GIS)", desc: "1-Click PKCE Login" },
                { id: "ENTERPRISE_SSO", label: "Enterprise SSO", desc: "Okta / SAML 2.0" },
                { id: "API_KEY", label: "Developer API Key", desc: "Live Secret Key" },
                { id: "DEVELOPER_MOCK", label: "Local Sandbox Mock", desc: "Offline Dev Mode" },
              ].map((opt) => (
                <div
                  key={opt.id}
                  className={`auth-card ${selectedAuth === opt.id ? "selected" : ""}`}
                  onClick={() => setSelectedAuth(opt.id)}
                >
                  <div className="auth-title">{opt.label}</div>
                  <div className="auth-desc">{opt.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Frame 2: Resume Dropzone */}
        {currentFrame === 2 && (
          <div className="frame-body">
            <h4>Resume Ingestion & Target Job Description</h4>
            <div className="file-dropzone">
              <div className="dropzone-icon">📄</div>
              <div className="dropzone-text"><strong>resume_jane_doe.pdf</strong> (480 KB)</div>
              <div className="dropzone-subtext">Pre-flight client scanner: Verified PDF magic bytes</div>
            </div>

            <div className="form-group" style={{ marginTop: "1rem" }}>
              <label>Target Job Role:</label>
              <input
                type="text"
                className="glass-input"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginTop: "1rem" }}>
              <label>Target Job Description:</label>
              <textarea
                className="glass-textarea"
                rows={4}
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Frame 3: AST Verification & Scorecard */}
        {currentFrame === 3 && (
          <div className="frame-body">
            <h4>Semantic AST Verification & Match Scorecard</h4>
            <div className="scorecard-container">
              <div className="score-circle">
                <span className="score-number">{scorecard.score}%</span>
                <span className="score-label">ATS Match</span>
              </div>
              <div className="scorecard-details">
                <div className="matched-chips">
                  <strong>Matched Skills:</strong>
                  {scorecard.matched.map((s) => (
                    <span key={s} className="skill-chip matched">✓ {s}</span>
                  ))}
                </div>
                <div className="missing-chips" style={{ marginTop: "0.5rem" }}>
                  <strong>Missing Skills:</strong>
                  {scorecard.missing.map((s) => (
                    <span key={s} className="skill-chip missing">⚠ {s}</span>
                  ))}
                </div>
                <label className="checkbox-container" style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={autoMutate}
                    onChange={(e) => setAutoMutate(e.target.checked)}
                  />
                  <span>Auto-synthesize tailored experience bullets for missing skills based on project AST</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Frame 4: Portal Target & Autofill */}
        {currentFrame === 4 && (
          <div className="frame-body">
            <h4>Target Portal Selection & Normalized Autofill Data</h4>
            <div className="form-group">
              <label>Target ATS System:</label>
              <select className="glass-select">
                <option value="workday">Workday Enterprise Portal</option>
                <option value="greenhouse">Greenhouse Candidate Pipeline</option>
                <option value="lever">Lever Interactive Board</option>
                <option value="linkedin">LinkedIn Easy Apply (MCP)</option>
              </select>
            </div>
            <div className="autofill-preview glass-card" style={{ marginTop: "1rem", padding: "0.75rem" }}>
              <h5>Extracted Form Fields:</h5>
              <ul>
                <li><strong>Candidate:</strong> Jane Doe</li>
                <li><strong>Contact:</strong> jane.doe@enterprise.io • +1-555-0199</li>
                <li><strong>Experience:</strong> Senior Cloud Architect (Global Tech Inc, 2020-Present)</li>
                <li><strong>Tailored Bullets:</strong> Synthesized 3 impact points aligning with job description</li>
              </ul>
            </div>
          </div>
        )}

        {/* Frame 5: Live Execution Receipt */}
        {currentFrame === 5 && (
          <div className="frame-body">
            <h4>Automated Playwright Submission & Audit Receipt</h4>
            {!submissionSuccess ? (
              <div className="submission-action">
                <p>Click below to dispatch Playwright MCP headless worker to populate and submit form:</p>
                <button
                  className="primary-button"
                  disabled={isSubmitting}
                  onClick={handleSimulatedSubmit}
                >
                  {isSubmitting ? "Executing Playwright Worker..." : "🚀 Launch Automated Submission"}
                </button>
              </div>
            ) : (
              <div className="submission-success-card glass-card">
                <div className="success-icon">🎉</div>
                <h5>Application Successfully Submitted!</h5>
                <div className="receipt-meta">
                  <div><strong>Confirmation ID:</strong> <code>APP-88219-XF</code></div>
                  <div><strong>Status:</strong> SUBMISSION_ACCEPTED</div>
                  <div><strong>Audit Hash:</strong> <code>sha256:7f4a0b92e...</code></div>
                  <div><strong>HMAC Sequential Chain:</strong> Validated (5/5 steps intact)</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="stepper-footer">
        <button
          className="glass-button"
          disabled={currentFrame === 1}
          onClick={handlePrev}
        >
          ← Previous
        </button>
        <button
          className="primary-button"
          disabled={currentFrame === 5}
          onClick={handleNext}
        >
          {currentFrame === 4 ? "Proceed to Submission →" : "Next Step →"}
        </button>
      </div>
    </div>
  );
};
