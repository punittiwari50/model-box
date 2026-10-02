<#
.SYNOPSIS
    Automated Downloader for ComfyUI Pixar 3D Models and Weights.

.DESCRIPTION
    Provisions and downloads checkpoints, LoRAs, VAE, ControlNet, audio, and video diffusion models
    (Wan 2.1/2.2, HunyuanVideo, LTX-Video, LivePortrait) required for the Pixar Cinematic Studio pipeline
    into host volume: .\volumes\comfyui

.PARAMETER TargetRoot
    Root host volume path mounted into ComfyUI (/data/comfyui). Default: .\volumes\comfyui

.PARAMETER Tier
    Which model subset to download: 'Essential', 'Image', 'Audio', 'ControlNet', 'Video', 'All'. Default: 'All'

.PARAMETER VideoEngine
    Specific video engine when Tier is 'Video' or 'All': 'All', 'Wan', 'Hunyuan', 'LTX', 'LivePortrait'. Default: 'All'

.PARAMETER SkipExisting
    Skip downloads if file exists and has size > 1MB. Default: $true
#>

[CmdletBinding()]
param(
    [Parameter()]
    [string]$TargetRoot = "$PSScriptRoot\..\..\volumes\comfyui",

    [Parameter()]
    [ValidateSet('Essential', 'Image', 'Audio', 'ControlNet', 'Video', 'All')]
    [string]$Tier = 'All',

    [Parameter()]
    [ValidateSet('All', 'Wan', 'Hunyuan', 'LTX', 'LivePortrait')]
    [string]$VideoEngine = 'All',

    [Parameter()]
    [switch]$SkipExisting = $true
)

Set-StrictMode -Off
$ErrorActionPreference = "Continue"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   ModelBox ComfyUI Pixar 3D Model Download Orchestrator   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Target Directory : $TargetRoot" -ForegroundColor Yellow
Write-Host "Download Tier    : $Tier" -ForegroundColor Yellow
if ($Tier -in @('Video', 'All')) {
    Write-Host "Video Engine     : $VideoEngine (Wan / Hunyuan / LTX / LivePortrait)" -ForegroundColor Yellow
}
Write-Host ""

# 1. Ensure required directory topology
$Directories = @(
    "checkpoints",
    "diffusion_models",
    "loras",
    "vae",
    "text_encoders",
    "controlnet",
    "audio_encoders\F5-TTS",
    "audio_encoders\musicgen-medium",
    "models\liveportrait",
    "workflows",
    "input",
    "output"
)

Write-Host "[1/3] Verifying and creating directory structure..." -ForegroundColor Green
foreach ($dir in $Directories) {
    $fullPath = Join-Path $TargetRoot $dir
    if (-not (Test-Path $fullPath)) {
        New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
        Write-Host "  + Created: $dir" -ForegroundColor DarkGray
    } else {
        Write-Host "  = Ready:   $dir" -ForegroundColor DarkGray
    }
}
Write-Host ""

# 2. Model Catalog Definitions (100% Verified Direct HuggingFace URLs)
$ModelCatalog = @(
    # --- VAE & Essential Helpers ---
    @{
        Name        = "SDXL VAE (Official StabilityAI)"
        Category    = "vae"
        Relative    = "vae\sdxl_vae.safetensors"
        Url         = "https://huggingface.co/stabilityai/sdxl-vae/resolve/main/sdxl_vae.safetensors"
        MinBytes    = 300MB
        Tiers       = @('Essential', 'Image', 'All')
        VideoEngine = $null
    },

    # --- LoRA: Pixar 3D Cartoon ---
    @{
        Name        = "Canopus Pixar 3D Art SDXL LoRA (prithivMLmods)"
        Category    = "loras"
        Relative    = "loras\Canopus-Pixar-Art.safetensors"
        Url         = "https://huggingface.co/prithivMLmods/Canopus-Pixar-Art/resolve/main/Canopus-Pixar-Art.safetensors"
        MinBytes    = 400MB
        Tiers       = @('Essential', 'Image', 'All')
        VideoEngine = $null
    },

    # --- Checkpoint: RealCartoon 3D (Pixar/Disney Feature Style) ---
    @{
        Name        = "RealCartoon 3D SDXL Checkpoint v17 (EvilEngine)"
        Category    = "checkpoints"
        Relative    = "checkpoints\realcartoon3d_v17.safetensors"
        Url         = "https://huggingface.co/EvilEngine/realcartoon3d_v17/resolve/main/realcartoon3d_v17.safetensors"
        MinBytes    = 4GB
        Tiers       = @('Essential', 'Image', 'All')
        VideoEngine = $null
    },

    # --- ControlNet: Depth SDXL ---
    @{
        Name        = "ControlNet Depth SDXL 1.0 (Diffusers)"
        Category    = "controlnet"
        Relative    = "controlnet\controlnet-depth-sdxl-1.0.safetensors"
        Url         = "https://huggingface.co/diffusers/controlnet-depth-sdxl-1.0/resolve/main/diffusion_pytorch_model.safetensors"
        MinBytes    = 2GB
        Tiers       = @('ControlNet', 'Image', 'All')
        VideoEngine = $null
    },

    # --- ControlNet: OpenPose SDXL ---
    @{
        Name        = "ControlNet OpenPose SDXL (thibaud)"
        Category    = "controlnet"
        Relative    = "controlnet\OpenPoseXL2.safetensors"
        Url         = "https://huggingface.co/thibaud/controlnet-openpose-sdxl-1.0/resolve/main/OpenPoseXL2.safetensors"
        MinBytes    = 2GB
        Tiers       = @('ControlNet', 'Image', 'All')
        VideoEngine = $null
    },

    # --- Audio: F5-TTS Base Model ---
    @{
        Name        = "F5-TTS Character Voice Model (SWivid)"
        Category    = "audio"
        Relative    = "audio_encoders\F5-TTS\model_1200000.safetensors"
        Url         = "https://huggingface.co/SWivid/F5-TTS/resolve/main/F5TTS_Base/model_1200000.safetensors"
        MinBytes    = 500MB
        Tiers       = @('Essential', 'Audio', 'All')
        VideoEngine = $null
    },

    # --- Audio: Meta MusicGen Medium (Orchestral Score) ---
    @{
        Name        = "Meta MusicGen Medium Orchestral Score Model"
        Category    = "audio"
        Relative    = "audio_encoders\musicgen-medium\state_dict.bin"
        Url         = "https://huggingface.co/facebook/musicgen-medium/resolve/main/state_dict.bin"
        MinBytes    = 3GB
        Tiers       = @('Audio', 'All')
        VideoEngine = $null
    },

    # ==========================================
    # VIDEO DIFFUSION ENGINES (Wan vs Hunyuan vs LTX)
    # ==========================================

    # --- Video Engine 1: LTX-Video (Latest v0.9.5 - Fast Prototyping) ---
    @{
        Name        = "LTX-Video v0.9.5 DiT 2B (Lightricks - Ultra-Fast)"
        Category    = "video"
        Relative    = "diffusion_models\ltx-video-2b-v0.9.5.safetensors"
        Url         = "https://huggingface.co/Lightricks/LTX-Video/resolve/main/ltx-video-2b-v0.9.5.safetensors"
        MinBytes    = 5GB
        Tiers       = @('Video', 'All')
        VideoEngine = 'LTX'
    },

    # --- Video Engine 2: Wan 2.1 / 2.2 I2V (Kijai FP8 - Best Cartoon Physics) ---
    @{
        Name        = "Wan 2.1/2.2 I2V 14B 480P FP8 (Wan-AI / Kijai - Top Pixar Dynamics)"
        Category    = "video"
        Relative    = "diffusion_models\Wan2_1-I2V-14B-480P_fp8_e4m3fn.safetensors"
        Url         = "https://huggingface.co/Kijai/WanVideo_comfy/resolve/main/Wan2_1-I2V-14B-480P_fp8_e4m3fn.safetensors"
        MinBytes    = 15GB
        Tiers       = @('Video', 'All')
        VideoEngine = 'Wan'
    },
    @{
        Name        = "Wan 2.1/2.2 Video VAE (Kijai BF16)"
        Category    = "video"
        Relative    = "vae\Wan2_1_VAE_bf16.safetensors"
        Url         = "https://huggingface.co/Kijai/WanVideo_comfy/resolve/main/Wan2_1_VAE_bf16.safetensors"
        MinBytes    = 200MB
        Tiers       = @('Video', 'All')
        VideoEngine = 'Wan'
    },

    # --- Video Engine 3: Tencent HunyuanVideo (Kijai FP8 Distill - High Res & Multi-Char) ---
    @{
        Name        = "HunyuanVideo 720p CFG-Distill FP8 (Tencent / Kijai - Cinematic Sweeps)"
        Category    = "video"
        Relative    = "diffusion_models\hunyuan_video_720_cfgdistill_fp8_e4m3fn.safetensors"
        Url         = "https://huggingface.co/Kijai/HunyuanVideo_comfy/resolve/main/hunyuan_video_720_cfgdistill_fp8_e4m3fn.safetensors"
        MinBytes    = 12GB
        Tiers       = @('Video', 'All')
        VideoEngine = 'Hunyuan'
    },
    @{
        Name        = "HunyuanVideo VAE (Kijai BF16)"
        Category    = "video"
        Relative    = "vae\hunyuan_video_vae_bf16.safetensors"
        Url         = "https://huggingface.co/Kijai/HunyuanVideo_comfy/resolve/main/hunyuan_video_vae_bf16.safetensors"
        MinBytes    = 400MB
        Tiers       = @('Video', 'All')
        VideoEngine = 'Hunyuan'
    },

    # --- Video Engine 4: LivePortrait Puppetry & Lip-Sync ---
    @{
        Name        = "LivePortrait Appearance Feature Extractor"
        Category    = "video"
        Relative    = "models\liveportrait\appearance_feature_extractor.safetensors"
        Url         = "https://huggingface.co/kijai/LivePortrait_safetensors/resolve/main/appearance_feature_extractor.safetensors"
        MinBytes    = 3MB
        Tiers       = @('Video', 'All')
        VideoEngine = 'LivePortrait'
    },
    @{
        Name        = "LivePortrait Motion Extractor"
        Category    = "video"
        Relative    = "models\liveportrait\motion_extractor.safetensors"
        Url         = "https://huggingface.co/kijai/LivePortrait_safetensors/resolve/main/motion_extractor.safetensors"
        MinBytes    = 30MB
        Tiers       = @('Video', 'All')
        VideoEngine = 'LivePortrait'
    },
    @{
        Name        = "LivePortrait Spade Generator"
        Category    = "video"
        Relative    = "models\liveportrait\spade_generator.safetensors"
        Url         = "https://huggingface.co/kijai/LivePortrait_safetensors/resolve/main/spade_generator.safetensors"
        MinBytes    = 50MB
        Tiers       = @('Video', 'All')
        VideoEngine = 'LivePortrait'
    },
    @{
        Name        = "LivePortrait Warping Module"
        Category    = "video"
        Relative    = "models\liveportrait\warping_module.safetensors"
        Url         = "https://huggingface.co/kijai/LivePortrait_safetensors/resolve/main/warping_module.safetensors"
        MinBytes    = 50MB
        Tiers       = @('Video', 'All')
        VideoEngine = 'LivePortrait'
    },
    @{
        Name        = "LivePortrait Stitching Retargeting Module"
        Category    = "video"
        Relative    = "models\liveportrait\stitching_retargeting_module.safetensors"
        Url         = "https://huggingface.co/kijai/LivePortrait_safetensors/resolve/main/stitching_retargeting_module.safetensors"
        MinBytes    = 500KB
        Tiers       = @('Video', 'All')
        VideoEngine = 'LivePortrait'
    }
)

# 3. Execution Function
function Download-FileWithCurl {
    param(
        [string]$Url,
        [string]$DestinationPath,
        [string]$DisplayName,
        [long]$MinBytes
    )

    if ($SkipExisting -and (Test-Path $DestinationPath)) {
        $item = Get-Item $DestinationPath
        if ($item.Length -ge $MinBytes) {
            $sizeMB = [math]::Round($item.Length / 1MB, 2)
            Write-Host "  [ALREADY EXISTS] $DisplayName ($sizeMB MB)" -ForegroundColor Yellow
            return
        } else {
            Write-Host "  [INCOMPLETE FILE DETECTED] Size: $($item.Length) bytes (Expected >= $MinBytes). Resuming..." -ForegroundColor Yellow
        }
    }

    $destDir = Split-Path -Path $DestinationPath -Parent
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    Write-Host "  -> Downloading: $DisplayName" -ForegroundColor Cyan
    Write-Host "     Destination: $DestinationPath" -ForegroundColor DarkGray
    Write-Host "     Source URL : $Url" -ForegroundColor DarkGray

    # Use curl.exe for resumable, fast transfer
    $curlArgs = @(
        "-L",                   # Follow redirects
        "-C", "-",              # Resume transfer
        "--retry", "5",         # Retry up to 5 times on network glitch
        "--retry-delay", "3",   # Wait 3s between retries
        "-o", $DestinationPath, # Output file
        $Url
    )

    $process = Start-Process -FilePath "curl.exe" -ArgumentList $curlArgs -NoNewWindow -PassThru -Wait
    if ($process.ExitCode -eq 0) {
        if (Test-Path $DestinationPath) {
            $downloadedItem = Get-Item $DestinationPath
            $finalMB = [math]::Round($downloadedItem.Length / 1MB, 2)
            Write-Host "  [SUCCESS] $DisplayName ($finalMB MB)" -ForegroundColor Green
        }
    } else {
        Write-Warning "  [FAILED] Failed downloading $DisplayName (ExitCode: $($process.ExitCode))."
    }
    Write-Host ""
}

# 4. Filter and execute downloads
Write-Host "[2/3] Filtering models matching tier: '$Tier' and engine: '$VideoEngine'..." -ForegroundColor Green

$SelectedModels = $ModelCatalog | Where-Object {
    $tierMatch = $_.Tiers -contains $Tier
    $engineMatch = $true
    if ($_.Category -eq 'video' -and $VideoEngine -ne 'All') {
        $engineMatch = ($_.VideoEngine -eq $VideoEngine)
    }
    return ($tierMatch -and $engineMatch)
}

$totalCount = $SelectedModels.Count
$counter = 0

Write-Host "Found $totalCount models scheduled for verification / download." -ForegroundColor Cyan
Write-Host ""

foreach ($model in $SelectedModels) {
    $counter++
    $destFile = Join-Path $TargetRoot $model.Relative
    Write-Host "[$counter/$totalCount] Checking: $($model.Name)" -ForegroundColor White
    Download-FileWithCurl -Url $model.Url -DestinationPath $destFile -DisplayName $model.Name -MinBytes $model.MinBytes
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "   Pixar 3D Model Download Pass Complete!                 " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

# 5. Summary inspection
Write-Host "[3/3] Inspecting installed weights under ${TargetRoot}:" -ForegroundColor Green
Get-ChildItem -Path $TargetRoot -Recurse -File | Where-Object { $_.Extension -in '.safetensors', '.pt', '.bin' } | 
    Select-Object @{Name="Category"; Expression={$_.Directory.Name}}, Name, @{Name="SizeMB"; Expression={[math]::Round($_.Length/1MB, 2)}} | 
    Format-Table -AutoSize
