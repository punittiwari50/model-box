#!/bin/bash
set -e

# Ensure comfyui data directories exist with proper permissions for mounted volumes
mkdir -p /data/comfyui/input
mkdir -p /data/comfyui/output
mkdir -p /data/comfyui/user/default

# Do not recurse chmod bind mounts because host filesystem semantics can reject it.
safe_set_dir_perms() {
    local target_dir="$1"
    if [ -d "$target_dir" ] && [ -w "$target_dir" ]; then
        chmod u+rwx "$target_dir" 2>/dev/null || true
    fi
}

safe_set_dir_perms /data/comfyui
safe_set_dir_perms /data/comfyui/input
safe_set_dir_perms /data/comfyui/output
safe_set_dir_perms /data/comfyui/user
safe_set_dir_perms /data/comfyui/user/default

EXTRA_ARGS=()
if [ -n "${COMFYUI_DATABASE_URL:-}" ]; then
    EXTRA_ARGS+=(--database-url "${COMFYUI_DATABASE_URL}")
fi
if [ "${COMFYUI_ENABLE_ASSETS:-0}" = "1" ]; then
    EXTRA_ARGS+=(--enable-assets)
fi

# Ensure Wan 2.1 compatibility for text conditioning dimensions and input channels
python3 -c '
wan_path = "/opt/comfyui/comfy/ldm/wan/model.py"
try:
    with open(wan_path, "r") as f:
        src = f.read()
    changed = False
    old_p = "x = self.patch_embedding(x.float()).to(x.dtype)"
    new_p = "if hasattr(self.patch_embedding, \"weight\") and x.shape[1] != self.patch_embedding.weight.shape[1]:\n            if x.shape[1] < self.patch_embedding.weight.shape[1]:\n                x = torch.nn.functional.pad(x, (0, 0, 0, 0, 0, 0, 0, self.patch_embedding.weight.shape[1] - x.shape[1]))\n            else:\n                x = x[:, :self.patch_embedding.weight.shape[1]]\n        x = self.patch_embedding(x.float()).to(x.dtype)"
    if old_p in src and "hasattr(self.patch_embedding" not in src:
        src = src.replace(old_p, new_p, 1)
        changed = True
    old_c = "context = self.text_embedding(context)"
    new_c = "if context.shape[-1] != 4096:\n            if context.shape[-1] < 4096:\n                context = torch.nn.functional.pad(context, (0, 4096 - context.shape[-1]))\n            else:\n                context = context[..., :4096]\n        context = self.text_embedding(context)"
    if old_c in src and "context.shape[-1] != 4096" not in src:
        src = src.replace(old_c, new_c, 1)
        changed = True
    if changed:
        with open(wan_path, "w") as f:
            f.write(src)
except Exception:
    pass

hy_path = "/opt/comfyui/comfy/ldm/hunyuan_video/model.py"
try:
    with open(hy_path, "r") as f:
        src = f.read()
    changed = False
    old_target = "    def forward(\n        self,\n        x,\n        timesteps,\n        mask,\n        transformer_options={},\n    ):"
    new_target = "    def forward(\n        self,\n        x,\n        timesteps,\n        mask,\n        transformer_options={},\n    ):\n        if x.shape[-1] < 4096:\n            x = torch.nn.functional.pad(x, (0, 4096 - x.shape[-1]))"
    if old_target in src and "x.shape[-1] < 4096" not in src:
        src = src.replace(old_target, new_target, 1)
        changed = True
    if changed:
        with open(hy_path, "w") as f:
            f.write(src)
except Exception:
    pass

ltx_path = "/opt/comfyui/comfy/ldm/lightricks/model.py"
try:
    with open(ltx_path, "r") as f:
        src = f.read()
    changed = False
    old_fwd = "    def forward(\n        self, x, timestep, context, attention_mask, frame_rate=25,"
    new_fwd = "    def forward(\n        self, x, timestep, context, attention_mask=None, frame_rate=25,"
    if old_fwd in src:
        src = src.replace(old_fwd, new_fwd, 1)
        changed = True
    old_infwd = "    def _forward(\n        self, x, timestep, context, attention_mask, frame_rate=25,"
    new_infwd = "    def _forward(\n        self, x, timestep, context, attention_mask=None, frame_rate=25,"
    if old_infwd in src:
        src = src.replace(old_infwd, new_infwd, 1)
        changed = True
    old_proc = "        # Process input\n        merged_args = {**transformer_options, **kwargs}"
    new_proc = "        if context is not None and context.shape[-1] == 2048:\n            context = torch.nn.functional.pad(context, (0, 2048))\n        # Process input\n        merged_args = {**transformer_options, **kwargs}"
    if old_proc in src and "context.shape[-1] == 2048" not in src:
        src = src.replace(old_proc, new_proc, 1)
        changed = True
    if changed:
        with open(ltx_path, "w") as f:
            f.write(src)
except Exception:
    pass

fa_path = "/opt/venv/lib/python3.12/site-packages/insightface/utils/face_align.py"
try:
    with open(fa_path, "r") as f:
        fa_src = f.read()
    old_est = "    tform = trans.SimilarityTransform()\n    tform.estimate(lmk, dst)"
    new_est = "    try:\n        tform = trans.SimilarityTransform.from_estimate(lmk, dst)\n    except Exception:\n        tform = trans.SimilarityTransform()\n        tform.estimate(lmk, dst)"
    if old_est in fa_src:
        fa_src = fa_src.replace(old_est, new_est, 1)
        with open(fa_path, "w") as f:
            f.write(fa_src)
except Exception:
    pass
' 2>/dev/null || true

# Activate venv if it exists (GPU build), otherwise run as-is (CPU)
if [ -f "/opt/venv/bin/activate" ]; then
    source /opt/venv/bin/activate
    exec python main.py "${EXTRA_ARGS[@]}" "$@"
else
    # Detect which python to use (python3 for GPU/Ubuntu, python for CPU)
    PYTHON_CMD=python
    if ! command -v python &> /dev/null && command -v python3 &> /dev/null; then
        PYTHON_CMD=python3
    fi
    exec $PYTHON_CMD main.py "${EXTRA_ARGS[@]}" "$@"
fi
