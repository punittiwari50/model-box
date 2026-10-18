# Available Models Catalog

This document provides a comprehensive catalog of all verified models available in the ModelBox runtime environment, categorized across **Image**, **Video**, and **Audio** modalities, as well as multimodal director LLMs.

---

## 1. Unified Model Catalog (Image, Video, Audio)

| Category | Model Name | Relative File Path | Size | Architecture / Format | Primary Role & Description | Service / Loader |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Image** | **JuggernautXL v9 (Rdphoto2)** | `checkpoints/juggernautXL_v9Rdphoto2.safetensors` | 6.62 GB | SDXL 1.0 UNet (`fp16`) | Native SDXL high-fidelity image engine; photorealistic bounce lighting, volumetric depth, crisp 3D character meshes | ComfyUI (`CheckpointLoaderSimple`) |
| **Image** | **RealCartoon3D v17** | `checkpoints/realcartoon3d_v17.safetensors` | 5.28 GB | SD 1.5 UNet + Embedded VAE | Dedicated Pixar & Disney 3D animation character stylization; rounded facial geometry, glassy irises, soft clay skin | ComfyUI (`CheckpointLoaderSimple`) |
| **Image** | **Canopus Pixar 3D Art** | `loras/Canopus-Pixar-Art.safetensors` | 435.3 MB | SDXL LoRA Adapter | Injects authentic Pixar/Disney feature-film aesthetic, rich subsurface scattering, and stylized character proportions | ComfyUI (`LoraLoader`) |
| **Image** | **ControlNet Depth SDXL 1.0** | `controlnet/controlnet-depth-sdxl-1.0.safetensors` | 4.66 GB | SDXL ControlNet (`fp16`) | Preserves 3D spatial depth maps, room perspective, and object volume during generation | ComfyUI (`ControlNetLoader`) |
| **Image** | **ControlNet OpenPose XL 2** | `controlnet/OpenPoseXL2.safetensors` | 4.66 GB | SDXL ControlNet (`fp16`) | Locks character anatomy, full-body poses, head angles, and hand/finger positions | ComfyUI (`ControlNetLoader`) |
| **Image** | **SDXL VAE** | `vae/sdxl_vae.safetensors` | 319.1 MB | SDXL Latent Autoencoder | High-fidelity latent decoding and encoding for SDXL pipelines | ComfyUI (`VAELoader`) |
| **Video** | **Wan 2.1 14B I2V (480P)** | `diffusion_models/Wan2_1-I2V-14B-480P_fp8_e4m3fn.safetensors` | 15.83 GB | 14B Flow-Matching DiT (`fp8_e4m3fn`) | State-of-the-art Image-to-Video character animation, natural cloth/hair dynamics, and fluid temporal physics | ComfyUI (`UNETLoader` / `ModelSamplingSD3`) |
| **Video** | **Wan 2.1 Video VAE** | `vae/Wan2_1_VAE_bf16.safetensors` | 242.1 MB | 3D Causal Video VAE (`bf16`) | Spatial-temporal video latent decoding and encoding for Wan 2.1 frames | ComfyUI (`VAELoader`) |
| **Video** | **HunyuanVideo 720p (CFG-Distill)** | `diffusion_models/hunyuan_video_720_cfgdistill_fp8_e4m3fn.safetensors` | 12.28 GB | 13B Video DiT (`fp8_e4m3fn`) | Cinematic environment fly-throughs, camera sweeps, and high-definition scene transitions | ComfyUI (`UNETLoader`) |
| **Video** | **HunyuanVideo VAE** | `vae/hunyuan_video_vae_bf16.safetensors` | 470.2 MB | 3D Video VAE (`bf16`) | Video frame autoencoding for HunyuanVideo latent stream | ComfyUI (`VAELoader`) |
| **Video** | **LTX-Video 2B (v0.9.5)** | `diffusion_models/ltx-video-2b-v0.9.5.safetensors` | 5.91 GB | 2B Video DiT (`bfloat16`) | Ultra-fast video generation (10–18s) for rapid scene prototyping and motion blocking | ComfyUI (`UNETLoader`) |
| **Video** | **LivePortrait Appearance Extractor** | `models/liveportrait/appearance_feature_extractor.safetensors` | 3.2 MB | 2D/3D Feature Backbone | Extracts facial appearance features for real-time animated character puppetry | ComfyUI (`LivePortrait`) |
| **Video** | **LivePortrait Motion Extractor** | `models/liveportrait/motion_extractor.safetensors` | 107.3 MB | Motion Keypoint Network | Extracts head rotation, eye gaze, and expression deltas from driving video or webcam | ComfyUI (`LivePortrait`) |
| **Video** | **LivePortrait SPADE Generator** | `models/liveportrait/spade_generator.safetensors` | 211.5 MB | SPADE Synthesis Generator | Synthesizes expression-warped frames maintaining stylized character identity | ComfyUI (`LivePortrait`) |
| **Video** | **LivePortrait Stitching & Retargeting** | `models/liveportrait/stitching_retargeting_module.safetensors` | 0.87 MB | Retargeting Module | Eye-gaze alignment and mouth boundary stitching | ComfyUI (`LivePortrait`) |
| **Video** | **LivePortrait Warping Module** | `models/liveportrait/warping_module.safetensors` | 173.7 MB | Dense Motion Field Warper | Deforms 3D character mesh smoothly according to actor performance | ComfyUI (`LivePortrait`) |
| **Audio** | **F5-TTS Character Voice Engine** | `audio_encoders/F5-TTS/model_1200000.safetensors` | 1.26 GB | Flow-Matching Speech DiT | Expressive zero-shot character dialogue, comedic timing, emotional laughter, and voice acting | ComfyUI (`ComfyUI-F5-TTS`) |
| **Audio** | **Meta MusicGen Medium** | `audio_encoders/musicgen-medium/state_dict.bin` | 3.43 GB | Auto-regressive Transformer | Synthesizes authentic Disney/Pixar orchestral soundtracks, whimsical brass, strings, and film score melodies | ComfyUI (`ComfyUI-AudioCraft`) |

---

## 2. Accompanying Multimodal & Language Models (Ollama Service)

The local Ollama inference service (`ollama-model-service-gpu`) provides companion models for screenplay directing, prompt expansion, and visual inspection:

| Category | Model Name | Model Tag | Size | Architecture | Primary Role |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Vision / Multimodal** | **Llama 3.2 Vision** | `llama3.2-vision:latest` | 7.8 GB | Vision-Language (11B) | Visual quality auditing, shot composition inspection, character consistency verification |
| **Vision / Multimodal** | **MiniCPM-V** | `minicpm-v:latest` | 5.5 GB | Multimodal Vision (8B) | Real-time scene detail extraction and visual captioning |
| **Vision / Multimodal** | **Qwen 2.5 VL** | `qwen2.5vl:3b` | 3.2 GB | Lightweight Vision-Language (3B) | Fast edge-level visual verification |
| **Text / Scripting** | **Qwen 2.5 Coder** | `qwen3-coder:latest` | 18 GB | Code LLM (32B) | API workflow generation, JSON payload scripting, automation pipelines |
| **Text / Scripting** | **Nemotron 3** | `nemotron3:33b` | 27 GB | High-Capacity LLM (33B) | Cinematic narrative directing, dialogue generation, storyboard generation |
| **Text / Scripting** | **Phi-4** | `phi4:latest` | 9.1 GB | Reasoning SLM (14B) | Precise logical structuring of multi-shot animation prompts |
| **Text / Scripting** | **DeepSeek-R1** | `deepseek-r1:7b` | 4.7 GB | Reasoning Distill (7B) | Step-by-step reasoning for scene continuity and story logic |
| **Text / Scripting** | **Gemma 2** | `gemma4:latest` / `gemma4:e4b` | 9.6 GB | Google LLM (9B/27B) | Creative character backstories and script adaptation |
| **Text / Scripting** | **Llama 3.1 / 3.2** | `llama3.1:latest`, `llama3.2:latest` | 4.9 GB / 2.0 GB | Meta LLM (8B / 3B) | General directorial scripting and prompt engineering |
