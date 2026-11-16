# ComfyUI Pixar 3D Operational Runbook & Deployment

## 1. Purpose

This runbook defines operational procedures for provisioning models, installing required custom nodes, and executing the multimodal 3D Pixar production pipeline within the ModelBox ComfyUI Docker stack.

---

## 2. Prerequisites & Volume Topology

Host Volume Root: `./volumes/comfyui`
Mounted Container Target: `/data/comfyui`

Ensure the target directory hierarchy is present before downloading weights:

```powershell
$BaseVolume = ".\volumes\comfyui"
@(
    "checkpoints",
    "diffusion_models",
    "loras",
    "vae",
    "text_encoders",
    "controlnet",
    "audio_encoders",
    "workflows",
    "input",
    "output"
) | ForEach-Object {
    $dir = Join-Path $BaseVolume $_
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force }
}
```

---

## 3. Required Custom Nodes Installation

Navigate to `repo_comfyui/custom_nodes/` and clone the required production node suites:

```bash
cd /opt/comfyui/custom_nodes # Inside container OR host path:
# applications/ai-ml-applications/repo_comfyui/custom_nodes

# 1. ComfyUI Manager (for dependency tracking & UI updates)
git clone https://github.com/ltdrdata/ComfyUI-Manager.git

# 2. Video Processing & Muxing Suite
git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git

# 3. Facial Expression & Driving
git clone https://github.com/KwaiVGI/LivePortrait.git
git clone https://github.com/kijai/ComfyUI-LivePortraitKJ.git

# 4. Video Diffusion Engines
git clone https://github.com/kijai/ComfyUI-WanVideoWrapper.git
git clone https://github.com/kijai/ComfyUI-CogVideoXWrapper.git

# 5. Frame Interpolation
git clone https://github.com/Fannovel16/ComfyUI-Frame-Interpolation.git

# 6. Audio, Score & Voice Acting
git clone https://github.com/StartHua/ComfyUI_AudioCraft.git
git clone https://github.com/FLYFLY-D/ComfyUI-F5-TTS.git
```

---

## 4. Automated Model Weights Download Registry

Model provisioning is fully automated via [`infra/scripts/Download-Pixar-Models.ps1`](../infra/scripts/Download-Pixar-Models.ps1). The script features auto-resuming (`curl -C -`), retry guards, tier filtering, and automatically populates `./volumes/comfyui`.

### 4.1 Automated Execution by Production Tier

```powershell
# 1. Essential Baseline: RealCartoon 3D Checkpoint, Pixar LoRA, SDXL VAE & F5-TTS Voice (~7.5 GB)
powershell.exe -ExecutionPolicy Bypass -File "./infra/scripts/Download-Pixar-Models.ps1" -Tier "Essential"

# 2. ControlNet Spatial Tier: Depth SDXL & OpenPose SDXL for character staging (~10 GB)
powershell.exe -ExecutionPolicy Bypass -File "./infra/scripts/Download-Pixar-Models.ps1" -Tier "ControlNet"

# 3. Audio & Music Tier: Meta MusicGen Medium Orchestral Score & F5-TTS (~4.9 GB)
powershell.exe -ExecutionPolicy Bypass -File "./infra/scripts/Download-Pixar-Models.ps1" -Tier "Audio"

# 4. Video & Face Motion Tier: LivePortrait Feature & Motion Extractors (~150 MB)
powershell.exe -ExecutionPolicy Bypass -File "./infra/scripts/Download-Pixar-Models.ps1" -Tier "Video"

# 5. Full Studio Suite (All Models)
powershell.exe -ExecutionPolicy Bypass -File "./infra/scripts/Download-Pixar-Models.ps1" -Tier "All"
```

### 4.2 Verified Weight Mapping & Installed Inventory

| Category | Model Name | Source / Hub | Volume Relative Destination | Status |
|---|---|---|---|---|
| **Base Checkpoint** | RealCartoon 3D v17 | `EvilEngine/realcartoon3d_v17` | `checkpoints/realcartoon3d_v17.safetensors` | **Ready (5.47 GB)** |
| **Pixar 3D LoRA** | Canopus Pixar 3D Art | `prithivMLmods/Canopus-Pixar-Art` | `loras/Canopus-Pixar-Art.safetensors` | **Ready (435 MB)** |
| **SDXL VAE** | SDXL VAE Official | `stabilityai/sdxl-vae` | `vae/sdxl_vae.safetensors` | **Ready (319 MB)** |
| **Voice Acting** | F5-TTS Base Model | `SWivid/F5-TTS` | `audio_encoders/F5-TTS/model_1200000.safetensors` | **Ready (1.28 GB)** |
| **ControlNet Depth** | ControlNet Depth SDXL 1.0 | `diffusers/controlnet-depth-sdxl-1.0` | `controlnet/controlnet-depth-sdxl-1.0.safetensors` | Available (Tier: ControlNet) |
| **ControlNet Pose** | OpenPose XL2 | `thibaud/controlnet-openpose-sdxl-1.0` | `controlnet/OpenPoseXL2.safetensors` | Available (Tier: ControlNet) |
| **Orchestral Score** | MusicGen Medium | `facebook/musicgen-medium` | `audio_encoders/musicgen-medium/state_dict.bin` | Available (Tier: Audio) |
| **Facial Puppetry** | LivePortrait Suite | `kijai/LivePortrait_safetensors` | `models/liveportrait/*.safetensors` | Available (Tier: Video) |


---

## 5. Verification & Smoke Testing Checklist

Validate each pipeline stage in isolation before assembling the full composite:

| Stage | Smoke Test Target | Validation Criteria |
|---|---|---|
| **1. Image** | Generate 1024x1024 test keyframe with `pixarXL_v10` | Render finishes < 15s; characteristic rounded eyes and SSS lighting visible. |
| **2. Video** | Animate 49 frames with Wan 2.1 I2V or CogVideoX | Character anatomy holds consistency across frames without jitter. |
| **3. Face** | Retarget keyframe using LivePortrait driving video | Blink and lip mesh follows driving video with high responsiveness. |
| **4. Audio** | Synthesize 10s whimsical score + 5s dialogue clip | Clear stereo separation; clean WAV file generated in `/output/`. |
| **5. Mux** | Assemble composite using `VHS_VideoCombine` | Audio and video play in sync within standard MP4 container. |

---

## 6. ModelBox Runtime Operations

To start the GPU runtime with these configurations loaded:

```bash
docker compose --env-file infra/compose/comfyui-gpu.env -f infra/compose/compose.comfyui.gpu.yaml up -d --build --wait --wait-timeout 240
```

Access the UI at `http://localhost:8189/` to inspect loaded checkpoints and workflows.
