import React, { useState } from "react";
import { OnboardingValidators } from "@/schemas/onboarding.schemas";

export const StorytellerStepper: React.FC = () => {
  const [currentFrame, setCurrentFrame] = useState<number>(1);
  const [promptText, setPromptText] = useState<string>(
    "A cinematic journey through an abandoned cybernetic metropolis under perpetual neon rain.",
  );
  const [artStyle, setArtStyle] = useState<"CYBERPUNK_ANIME" | "CINEMATIC_PHOTOREALISTIC" | "PIXAR_3D" | "DARK_FANTASY">(
    "CINEMATIC_PHOTOREALISTIC",
  );
  const [voiceId, setVoiceId] = useState<string>("voice-nova-deep");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderProgress, setRenderProgress] = useState<number>(0);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleNext = () => {
    setValidationError(null);
    if (currentFrame === 1) {
      const val = OnboardingValidators.validateStorytellerPrompt({
        narrativeText: promptText,
        artStyle,
        voiceId,
        aspectRatio,
        hitlCheckpointEnabled: true,
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

  const handleStartRender = () => {
    setIsRendering(true);
    let prog = 0;
    const interval = setInterval(() => {
      prog += 25;
      setRenderProgress(prog);
      if (prog >= 100) {
        clearInterval(interval);
        setIsRendering(false);
      }
    }, 200);
  };

  return (
    <div className="stepper-view-container glass-card">
      <div className="stepper-header">
        <div className="stepper-badge">Storyteller Studio</div>
        <div className="stepper-indicator">
          Step {currentFrame} of 5:{" "}
          {currentFrame === 1 && "Narrative Script & Style Ingestion"}
          {currentFrame === 2 && "Voice Synthesis & Phoneme Alignment"}
          {currentFrame === 3 && "Scene Keyframes & HITL Review"}
          {currentFrame === 4 && "ComfyUI Diffusion DAG Execution"}
          {currentFrame === 5 && "Final Video Player & Distribution"}
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
            <h4>Narrative Script & Visual Style Selection</h4>
            <div className="form-group">
              <label>Story Script Prompt:</label>
              <textarea
                className="glass-textarea"
                rows={4}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
              />
            </div>
            <div className="auth-options-grid" style={{ marginTop: "1rem" }}>
              {[
                { id: "CINEMATIC_PHOTOREALISTIC", label: "Cinematic Photorealistic" },
                { id: "CYBERPUNK_ANIME", label: "Cyberpunk Anime" },
                { id: "PIXAR_3D", label: "Pixar 3D Stylized" },
                { id: "DARK_FANTASY", label: "Dark Fantasy Oil" },
              ].map((style) => (
                <div
                  key={style.id}
                  className={`auth-card ${artStyle === style.id ? "selected" : ""}`}
                  onClick={() => setArtStyle(style.id as any)}
                >
                  <div className="auth-title">{style.label}</div>
                </div>
              ))}
            </div>

            <div className="form-group" style={{ marginTop: "1rem" }}>
              <label>Target Aspect Ratio:</label>
              <div className="auth-options-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                {(["16:9", "9:16", "1:1"] as const).map((ratio) => (
                  <div
                    key={ratio}
                    className={`auth-card ${aspectRatio === ratio ? "selected" : ""}`}
                    onClick={() => setAspectRatio(ratio)}
                  >
                    <div className="auth-title">{ratio}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {currentFrame === 2 && (
          <div className="frame-body">
            <h4>Voice Narration & Phoneme Synchronization</h4>
            <div className="form-group">
              <label>Select Narrator Voice:</label>
              <select className="glass-select" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                <option value="voice-nova-deep">Nova Deep (Dramatic Baritone)</option>
                <option value="voice-aria-clarity">Aria Clarity (Neutral Documentary)</option>
                <option value="voice-echo-whisper">Echo Whisper (Atmospheric Cinematic)</option>
              </select>
            </div>
            <div className="waveform-box glass-card" style={{ marginTop: "1rem", padding: "1rem", textAlign: "center" }}>
              <div style={{ color: "#38bdf8", fontSize: "1.2rem", letterSpacing: "2px" }}>
                 ▂▃▅▆▇▆▅▃▂ ▂▃▅▆▇▆▅▃▂ ▂▃▅▆▇▆▅▃▂ 
              </div>
              <div style={{ color: "#94a3b8", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                Phoneme Alignment: 48 timecodes synchronized with scene cue marks
              </div>
            </div>
          </div>
        )}

        {currentFrame === 3 && (
          <div className="frame-body">
            <h4>Scene Keyframes & HITL Review</h4>
            <div className="keyframes-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="glass-card" style={{ padding: "0.75rem", textAlign: "center" }}>
                <div style={{ fontSize: "2rem" }}>🌆</div>
                <strong>Scene 1: Neon Skyline</strong>
                <p style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Status: Approved by HITL</p>
              </div>
              <div className="glass-card" style={{ padding: "0.75rem", textAlign: "center" }}>
                <div style={{ fontSize: "2rem" }}>🤖</div>
                <strong>Scene 2: Cybernetic Pilgrim</strong>
                <p style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Status: Approved by HITL</p>
              </div>
            </div>
          </div>
        )}

        {currentFrame === 4 && (
          <div className="frame-body">
            <h4>ComfyUI Diffusion DAG Execution</h4>
            <button className="primary-button" disabled={isRendering} onClick={handleStartRender}>
              {isRendering ? `Rendering Frames (${renderProgress}%)...` : "⚡ Dispatch Diffusion DAG to ComfyUI"}
            </button>
            <div className="render-progress-bar glass-card" style={{ marginTop: "1rem", padding: "1rem" }}>
              <div style={{ width: "100%", background: "#1f2937", height: "10px", borderRadius: "5px", overflow: "hidden" }}>
                <div style={{ width: `${renderProgress}%`, background: "#06b6d4", height: "100%", transition: "width 0.2s" }} />
              </div>
              <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: "0.5rem" }}>
                VRAM: 8.4 GB / 16 GB • Hardware: NVIDIA RTX 5080 Laptop GPU • Sampling: EulerAncestral 30 steps
              </div>
            </div>
          </div>
        )}

        {currentFrame === 5 && (
          <div className="frame-body">
            <h4>Final Video Assembly & 4K Player</h4>
            <div className="submission-success-card glass-card">
              <div className="success-icon">🎬</div>
              <h5>Video Render Complete!</h5>
              <div className="receipt-meta">
                <div><strong>Resolution:</strong> 3840x2160 (4K 60fps)</div>
                <div><strong>Codec:</strong> H.265 / HEVC • Audio: 24-bit FLAC</div>
                <div><strong>Output File:</strong> <code>story_neon_rain_4k.mp4</code> (242 MB)</div>
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
          {currentFrame === 4 ? "View Final Video →" : "Next Step →"}
        </button>
      </div>
    </div>
  );
};
