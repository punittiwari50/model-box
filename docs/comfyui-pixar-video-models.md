# ComfyUI Pixar 3D Video & Animation Generation Models

## 1. Purpose

This document catalogs video diffusion architectures, character motion frameworks, and facial animation tools inside ComfyUI for producing cinematic Pixar- and Disney-style 3D animated video clips.

---

## 2. Video Diffusion Model Ecosystem

For 3D cartoon characters, **Image-to-Video (I2V)** is the standard industry practice: generate a pristine 3D stylized keyframe in Stage 1, then pass it as conditioning to preserve character consistency and facial structure.

| Model | Model Family | Key Strengths for 3D Animation | ComfyUI Custom Node | VRAM Footprint |
|---|---|---|---|---|
| **Wan 2.1 (14B)** | Wan2.1-I2V-14B-720P / 480P | State-of-the-art temporal consistency, smooth cartoon physics, realistic cloth & hair dynamics | `ComfyUI-WanVideoWrapper` | 14 GB (FP8) / 24 GB (BF16) |
| **Wan 2.1 (1.3B)** | Wan2.1-T2V-1.3B | Rapid prototyping of scene dynamics and camera sweeps | `ComfyUI-WanVideoWrapper` | 6 - 8 GB |
| **CogVideoX-5B** | CogVideoX-5B-I2V / Fun | Cinematic camera trajectories, strong character weight and momentum | `ComfyUI-CogVideoXWrapper` | 12 GB (FP8) |
| **LTX-Video** | LTX-Video 0.9.1 / 0.9.5 | Ultra-fast rendering, low latency, great facial stability | `ComfyUI-LTXVideo` | 8 - 12 GB |
| **HunyuanVideo** | HunyuanVideo (13B) | High resolution rendering, intricate multi-character motion | `ComfyUI-HunyuanVideoWrapper` | 16 GB (GGUF/FP8) |
| **AnimateDiff-Evolved** | SDXL / SD 1.5 Motion Modules | Extensive library of camera LoRAs (Pan, Zoom, Tilt, Roll) | `ComfyUI-AnimateDiff-Evolved` | 8 - 12 GB |

---

## 3. Facial Performance Driving & Puppetry

Full 3D character dialogue and acting require precise facial landmark control:

### 3.1 LivePortrait (`ComfyUI-LivePortrait`)
- **Mechanism**: Extracts 3D facial mesh coordinates from a driving video (or webcam recording) and warps the Pixar keyframe without retraining.
- **Features**: Eye gaze tracking, eyebrow raising, smile/smirk control, and micro-expressions tailored for stylized animated faces.
- **Performance**: Real-time inference (30+ fps on modern GPUs).

### 3.2 EchoMimic & SadTalker
- **EchoMimic v2**: Audio-driven and landmark-driven speech portrait generation; aligns mouth phonemes with speech audio.
- **SadTalker**: Lightweight head pose and audio-to-speech synchronization for conversational character scenes.

---

## 4. Camera & Motion Control Mechanics

```text
[Pixar 3D Image Keyframe]
           │
           ├──> [Wan 2.1 / CogVideoX I2V Sampler]
           │         ├── Prompt: "Pixar character looks up in surprise, blinking, smiling"
           │         ├── Motion Scale / Motion Bucket: 127
           │         └── Latent Frames: 49 - 81 frames (~2 to 3.5 seconds @ 24fps)
           │
           └──> [LivePortrait Expression Retargeting]
                     ├── Driving Video: Expressive human actor performance
                     └── Retargeting Factor: 1.2 (exaggerated cartoon expressions)
```

---

## 5. Temporal Smoothing & Frame Interpolation

Raw diffusion video generation typically outputs between 12 and 24 frames per second. To achieve fluid Disney/Pixar cinematic framerates (60 fps), run the output through frame interpolation:

1. **RIFE v4.6 / v4.7** (`ComfyUI-Frame-Interpolation`):
   - Fast neural optical flow interpolation.
   - Interpolation multiplier: `2x` (24 fps -> 48 fps) or `4x` (15 fps -> 60 fps).
2. **FILM (Frame Interpolation for Large Motion)**:
   - Excels at large cartoon movements, jump actions, and dramatic gesture transitions without tearing artifacts.

---

## 6. VRAM Optimization & Memory Management

Running multi-gigabyte video models inside the ModelBox Docker environment requires strict memory budgeting:

1. **Quantization Formats**:
   - Utilize `fp8_e4m3fn` weights for Wan 2.1 and CogVideoX to run within the RTX 5080 (16 GB) envelope.
   - For 12 GB or 16 GB GPUs, use GGUF (`Q4_K_M` or `Q8_0`) with the `ComfyUI-GGUF` loader.
2. **CPU Offloading**:
   - Enable `--lowvram` or `--gpu-only` block offloading in wrapper nodes so text encoders (T5-XXL) are purged from VRAM before diffusion sampling begins.
3. **Sequential Processing**:
   - Avoid executing Stage 1 (Flux image generation) and Stage 2 (Wan 2.1 video generation) concurrently; pipeline them sequentially so VRAM is garbage-collected between runs.

---

## 7. Comparative Benchmark: Wan 2.1/2.2 vs. HunyuanVideo vs. LTX-Video

| Feature / Metric | **Wan 2.1 / 2.2 I2V** (Wan-AI / Kijai) | **HunyuanVideo** (Tencent / Kijai) | **LTX-Video v0.9.5** (Lightricks) |
|---|---|---|---|
| **Base Architecture** | 14B Diffusion Transformer (DiT) | 13B Diffusion Transformer (DiT) | 2B Diffusion Transformer (DiT) |
| **Quantization & Weight** | `Wan2_1-I2V-14B-480P_fp8_e4m3fn` (~16.9 GB) | `hunyuan_video_720_cfgdistill_fp8` (~13.1 GB) | `ltx-video-2b-v0.9.5.safetensors` (~6.3 GB) |
| **Pixar Character Physics** | **Exceptional**: Superior cartoon physics, cloth/feather motion, and zero morphing. | **Very Good**: Clean high-res detailing; requires high-contrast keyframes. | **Good**: Fast head/eye turns; can distort complex cartoon topology during fast pans. |
| **Resolution & Aspect** | 480p / 720p native | 720p native with CFG Distillation | 768x512 / 720p |
| **Inference Latency** | ~45-60s on modern RTX (FP8) | ~35-50s on modern RTX (Distilled) | **Ultra-Fast (~10-18s)** |
| **VRAM Footprint** | ~14 - 16 GB | ~12 - 14 GB | **~8 - 11 GB** |
| **Production Role** | **Master Hero Shots**: Final animation of approved Pixar characters and emotional scenes. | **Cinematic Environment Sweeps**: Wide camera fly-throughs, lighting shifts, and crowd motion. | **Real-Time Storyboard Prototyping**: Instant draft previews for mobile talk sessions. |

### 7.1 Automated Video Engine Download Commands

Download individual video engines using [`infra/scripts/Download-Pixar-Models.ps1`](../infra/scripts/Download-Pixar-Models.ps1):

```powershell
# 1. Download LTX-Video v0.9.5 (~6.3 GB) - Recommended for rapid prototyping
powershell.exe -ExecutionPolicy Bypass -File "./infra/scripts/Download-Pixar-Models.ps1" -Tier "Video" -VideoEngine "LTX"

# 2. Download Wan 2.1/2.2 I2V 14B FP8 + VAE (~17.2 GB) - Recommended for master Pixar character shots
powershell.exe -ExecutionPolicy Bypass -File "./infra/scripts/Download-Pixar-Models.ps1" -Tier "Video" -VideoEngine "Wan"

# 3. Download HunyuanVideo 720p CFG-Distill FP8 + VAE (~13.6 GB) - Recommended for cinematic sweeps
powershell.exe -ExecutionPolicy Bypass -File "./infra/scripts/Download-Pixar-Models.ps1" -Tier "Video" -VideoEngine "Hunyuan"

# 4. Download LivePortrait Puppetry Pack (~150 MB - Installed & Ready)
powershell.exe -ExecutionPolicy Bypass -File "./infra/scripts/Download-Pixar-Models.ps1" -Tier "Video" -VideoEngine "LivePortrait"
```

