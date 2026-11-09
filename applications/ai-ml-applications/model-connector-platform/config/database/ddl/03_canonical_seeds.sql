-- ==============================================================================
-- ModelConnector Platform Enterprise DML Seed Script (Canonical Categories)
-- Automatically executed on PostgreSQL container initialization
-- ==============================================================================

INSERT INTO MODEL_CATEGORIES (CATEGORY_ID, LABEL, ICON, ACCENT_COLOR, DESCRIPTION, SORT_ORDER, CREATED_TIMESTAMP)
VALUES 
    ('google', 'Google Gemini', '✨', '#4285F4', 'Google DeepMind Gemini 3.8 & 3.5 multimodal reasoning models', 1, CURRENT_TIMESTAMP),
    ('anthropic', 'Anthropic Claude', '🎭', '#D97757', 'Anthropic Claude 3.7 & 3.5 Sonnet / Haiku models', 2, CURRENT_TIMESTAMP),
    ('microsoft', 'GitHub Copilot', '🐙', '#6E40C9', 'GitHub Copilot & Microsoft enterprise coding models', 3, CURRENT_TIMESTAMP),
    ('openai', 'OpenAI GPT', '🧠', '#10A37F', 'OpenAI GPT-4o, o3-mini, and Codex models', 4, CURRENT_TIMESTAMP),
    ('xai', 'xAI Grok', '🚀', '#1DA1F2', 'xAI Grok-3 and Grok-2 real-time reasoning models', 5, CURRENT_TIMESTAMP),
    ('ollama', 'Local Ollama', '🦙', '#F59E0B', 'Local open-weights models (lfm3-omni, LLaMA 3.2, Qwen, Phi-4, Gemma)', 6, CURRENT_TIMESTAMP)
ON CONFLICT (CATEGORY_ID) DO NOTHING;
