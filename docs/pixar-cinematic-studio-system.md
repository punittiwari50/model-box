# Pixar Cinematic Studio: System Architecture & Collaboration Specification

## 1. Executive Purpose

This document specifies the enterprise architecture for **Pixar Cinematic Studio**, a collaborative multimodal platform enabling single creators or distributed creative teams to brainstorm, script, direct, and produce complete 3D Pixar-style animated short films and episodic stories.

The system combines:
1. An **Android Client** with continuous voice talk, screenplay review, storyboard viewing, multi-track audio playback, and synchronized video playback.
2. A **Collaborative Story Flow Engine** supporting single-user and team workflows via a directed acyclic graph (DAG) structure.
3. A **Studio Prompt Portal** for managing, versioning, and testing backstage system prompts and dynamic user prompt composition.
4. An **Aggregated Multi-Agent Backend** backed by local Ollama LLMs and ComfyUI diffusion/audio/video engines.

---

## 2. High-Level System Architecture

```mermaid
flowchart TB
    subgraph Clients["Client Layer"]
        AND_APP["Android Studio App\n(Kotlin / Jetpack Compose)\nVoice Talk | Storyboard | Audio | Video"]
        WEB_PORTAL["Prompt & Studio Portal\n(Next.js / Vite + React)\nPrompt Admin | Flow Graph | Team Management"]
    end

    subgraph Gateway["API Gateway & Real-Time Collaboration"]
        WS_HUB["WebSocket Hub & Event Bus\n(Presence, Live Audio Stream, Chat)"]
        REST_API["FastAPI REST & Streaming Engine\n(Project CRUD, Manifests, CDN Delivery)"]
        DAG_ENGINE["Story Flow Graph Engine (DAG)\n(State Machine, Node Locks & Branches)"]
    end

    subgraph MultiAgentCore["Multi-Agent Directorial Core"]
        DIR_AGENT["Screenplay Director Agent\n(Ollama: Qwen 2.5 / DeepSeek-R1)"]
        LORE_AGENT["Character Bible & Consistency Auditor"]
        MANIFEST_AGENT["Multimodal Manifest Compiler"]
    end

    subgraph GenerationEngines["Local AI Infrastructure (Docker Compose)"]
        OLLAMA["Ollama GPU Stack (:11434)\nScreenwriting, Logic, JSON Generation"]
        COMFYUI["ComfyUI GPU Stack (:8188)\nPixar 3D Stills, Audio Stems, I2V Video"]
    end

    Clients <-->|WebSockets & HTTPS| Gateway
    Gateway --> MultiAgentCore
    MultiAgentCore <--> OLLAMA
    MultiAgentCore <--> COMFYUI
```

---

## 3. Team & Single-User Collaborative Story Flow (DAG)

The platform models every film or episodic project as a **Story Flow Graph (DAG)** inspired by node-based creative production pipelines (similar to Google Flow / workflow graphs).

### 3.1 Flow Graph Node Hierarchy

```mermaid
flowchart LR
    PREMISE["1. Premise & Theme Node\n(Audio/Chat Brainstorm)"] --> BEATS["2. Beat Sheet & Outline Node\n(Act I, II, III Pacing)"]
    BEATS --> SCENE["3. Scene Script Node\n(Actor Notes & Dialogue)"]
    SCENE --> APPROVE{"4. Review Gate Node\n(Official Approval Lock)"}
    APPROVE -->|Approved| ASSETS["5. Parallel Asset Gen\n- Character Stills\n- Scene Background\n- Audio Tracks (TTS/Score/SFX)"]
    ASSETS --> MERGE["6. Master Composite Node\n('Merge-to-1' Image)"]
    MERGE --> SHOTS["7. Video Shot Generation\n(Wan 2.1 / CogVideoX / LivePortrait)"]
    SHOTS --> MASTER["8. Final Mux & Assembly\n(Complete Film Review)"]
```

### 3.2 Single-User vs. Team Collaboration Modes

| Mode | Capability | Access Control & Concurrency |
|---|---|---|
| **Solo Creator** | Full ownership of all stages; autonomous voice/chat iteration from idea to final muxed video. | Single session lock; instant autosave; non-blocking background AI queues. |
| **Team Production** | Multi-user room with distinct creative roles: *Executive Producer*, *Director / Screenwriter*, *Art Director*, *Sound Designer*. | Real-time presence; node-level granular locking (pessimistic lock on active node edit, optimistic on branches); live cursor/typing indicators. |

### 3.3 Collaboration Primitives
1. **Live Presence & Voice Rooms**: Team members can join the project's audio room to brainstorm simultaneously while the Director Agent listens and responds.
2. **Branching Story Exploration**: Creators can branch off any Beat or Script Node (e.g., `Scene 1 - Alternate Ending: Pip takes flight early`) to render alternative visual and audio cuts without modifying the canonical master timeline.
3. **Approval Gating**: Script nodes transition through `DRAFT` $\rightarrow$ `IN_REVIEW` $\rightarrow$ `OFFICIALLY_APPROVED`. Only approved nodes can trigger downstream ComfyUI rendering pipelines.

---

## 4. Backstage Prompt Management Portal

The **Prompt Studio Portal** empowers prompt engineers and directors to modify, test, and version backstage system and user prompts without redeploying code.

### 4.1 Architecture & Capabilities

```mermaid
flowchart TD
    PORTAL_UI["Portal UI (Web-based)"] --> PROMPT_REG["Prompt Registry & Versioning Engine"]
    PROMPT_REG --> TEMPLATE_COMPOSER["Dynamic Prompt Composer"]
    TEMPLATE_COMPOSER --> OLLAMA_TEST["Ollama Sandbox Playground"]
    PROMPT_REG --> DB[(PostgreSQL / SQLite Storage)]
```

1. **System Prompt Customization**:
   - Live editing of the Director System Prompt, Emotional Modulation Matrices, Actor Directorial Guidelines, and Audio Scoring instructions.
   - Temperature, Top-P, presence penalties, and stop tokens configured per model tier (`qwen2.5:32b`, `deepseek-r1:14b`, `llama3.1:8b`).
2. **Dynamic Prompt Variable Interpolation**:
   Prompts leverage mustache-style templating combining user inputs and context:
   ```jinja2
   {{system_persona_preamble}}
   CURRENT PROJECT: {{project_title}} (Genre: {{genre_style}})
   CHARACTER BIBLE:
   {% for char in characters %}
   - {{char.name}}: {{char.visual_traits}}, Voice Profile: {{char.voice_preset}}
   {% endfor %}
   
   USER INPUT / THEME:
   "{{user_voice_or_text_prompt}}"
   ```
3. **Pixar 3D Stylization Preset Management**:
   - Checkpoint mappings (`pixarXL_v10.safetensors`, `flux1-dev-fp8.safetensors`).
   - LoRA trigger injections (`FLUX.1-dev-LoRA-Pixar-Cartoon`, weight `0.85`).
   - Default negative prompt presets (`photorealistic, realistic, 2d, sketch, deformed, bad anatomy, flat lighting`).
4. **Audit Trail & A/B Testing**:
   - Full semantic versioning (`v1.0.0`, `v1.1.0-director-pacing`).
   - Side-by-side prompt output diffing directly with Ollama endpoints before promoting to production.

---

## 5. Android Client Specification

The Android client is designed for continuous creative immersion, built with **Kotlin** and **Jetpack Compose** (Material 3).

### 5.1 Core Modules & Responsibilities

| Module | Technical Implementation | Functional Role |
|---|---|---|
| **Voice & Chat Engine** | Android `SpeechRecognizer` / `AudioRecord` + WebSocket bidirectional streaming. | Hands-free continuous conversational brainstorming; streaming speech-to-text; real-time LLM token streaming. |
| **Review Gate Modal** | Custom Compose bottom sheet with Fountain screenplay rendering. | Visual diffing of director's notes and dialogue beats; one-tap official approval or voice-driven revisions. |
| **Storyboard & Image Viewer** | Coil 3 + Subsampling Scale ImageView with gesture navigation. | Displays isolated Character Cards, Scene Background Plates, and the **Merged Master Keyframe**. |
| **Multi-Track Audio Studio** | AndroidX Media3 (`ExoPlayer`) multi-track session controller. | Solo/mute sliders for Voice Dialogue (F5-TTS), Score (MusicGen), and Foley SFX (Stable Audio). |
| **Cinematic Theater** | AndroidX Media3 PlayerView with fullscreen immersive landscape mode. | Seamless 24/60fps video playback with synchronized subtitle overlays, scene bookmarks, and export controls. |

### 5.2 Mobile Offline & Streaming Caching Policy
- **Image Pipeline**: WebP image caching via Coil's disk cache layer (`max_size = 500MB`).
- **Media Streaming**: Progressive HTTP streaming for development; HLS / DASH adaptive streaming with ExoPlayer `SimpleCache` for video clips.
- **Network Resilience**: Automatic WebSocket reconnection with exponential backoff and offline draft queueing.
