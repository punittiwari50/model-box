import axios, { type AxiosInstance } from 'axios';
import { logger } from '@/core/logger.js';
import { config } from '@/core/config.js';
import { AI_DEFAULTS, HTTP_CONTENT_TYPES, HTTP_HEADERS, HTTP_STATUS } from '@/constants/index.js';

export interface OllamaGenerateRequest {
  model?: string;
  prompt: string;
  system?: string;
  images?: string[]; // Base64 encoded screenshots
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
  };
}

export interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  totalDurationNs?: number;
  evalCount?: number;
}

export class OllamaConnector {
  private activeBaseUrl: string;
  private candidateUrls: string[];
  private client: AxiosInstance;
  private timeoutMs: number;

  constructor(baseUrl?: string, candidateUrls?: string[], timeoutMs?: number) {
    this.activeBaseUrl = baseUrl || config.ollama.baseUrl;
    this.candidateUrls = candidateUrls || config.ollama.candidateUrls;
    this.timeoutMs = timeoutMs || config.ollama.timeoutMs;
    this.client = axios.create({
      baseURL: this.activeBaseUrl,
      timeout: this.timeoutMs,
      headers: { [HTTP_HEADERS.CONTENT_TYPE]: HTTP_CONTENT_TYPES.JSON },
    });
  }

  async findWorkingEndpoint(): Promise<string> {
    const probeCandidates = async (index: number): Promise<string> => {
      const isExhausted = index >= this.candidateUrls.length;
      const exhaustedActions: Record<string, () => Promise<string>> = {
        true: async () => {
          logger.warn(`Could not reach any Ollama candidate URLs. Keeping default: ${this.activeBaseUrl}`);
          return this.activeBaseUrl;
        },
        false: async () => {
          const url = this.candidateUrls[index];
          try {
            const res = await axios.get(`${url}/api/tags`, { timeout: 3000 });
            const isOk = res.status === HTTP_STATUS.OK;
            const okActions: Record<string, () => Promise<string>> = {
              true: async () => {
                this.activeBaseUrl = url;
                this.client.defaults.baseURL = url;
                logger.info(`OllamaConnector connected to endpoint: ${url}`);
                return url;
              },
              false: () => probeCandidates(index + 1),
            };
            return (okActions[String(isOk)] ?? okActions.false)();
          } catch {
            return probeCandidates(index + 1);
          }
        },
      };
      return (exhaustedActions[String(isExhausted)] ?? exhaustedActions.false)();
    };

    return probeCandidates(0);
  }

  async generate(req: OllamaGenerateRequest): Promise<OllamaGenerateResponse> {
    const model = req.model || config.ollama.defaultModel || AI_DEFAULTS.OLLAMA_MODEL;
    const payload = {
      model,
      prompt: req.prompt,
      system: req.system,
      images: req.images,
      stream: false,
      options: req.options,
    };

    try {
      const res = await this.client.post<OllamaGenerateResponse>('/api/generate', payload);
      return res.data;
    } catch {
      logger.warn(`Primary Ollama endpoint failed, trying candidate endpoints...`);
      await this.findWorkingEndpoint();
      const res = await this.client.post<OllamaGenerateResponse>('/api/generate', payload);
      return res.data;
    }
  }

  async synthesizeSelectors(options: {
    targetDescription: string;
    domSnippet?: string;
    screenshotBase64?: string;
  }): Promise<{ primary: string; fallbacks: string[]; reasoning: string }> {
    const prompt = `You are a Playwright automation expert. Given the target element description and DOM snippet:
Target: "${options.targetDescription}"
DOM:
${options.domSnippet?.substring(0, 3000) || 'N/A'}

Provide resilient Playwright selectors in JSON format:
{
  "primary": "css or role selector",
  "fallbacks": ["fallback selector 1", "text selector 2"],
  "reasoning": "brief explanation"
}
Output ONLY valid JSON.`;

    const response = await this.generate({
      prompt,
      images: options.screenshotBase64 ? [options.screenshotBase64] : undefined,
    });

    try {
      const cleaned = response.response.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return {
        primary: `text="${options.targetDescription}"`,
        fallbacks: [
          `button:has-text("${options.targetDescription}")`,
          `a:has-text("${options.targetDescription}")`,
        ],
        reasoning: 'Fallback heuristic selector synthesized',
      };
    }
  }

  async generateWorkflowJson(instruction: string, targetUrl: string): Promise<Record<string, unknown>> {
    const prompt = `You are a JSON workflow generator for Playwright MCP Engine.
Target URL: ${targetUrl}
User Instruction: ${instruction}

Generate a dynamic JSON workflow matching this specification:
{
  "id": "wf-generated",
  "name": "Generated Automation",
  "baseUrl": "${targetUrl}",
  "steps": [
    { "id": "step-1", "action": "navigate", "targetUrl": "{{baseUrl}}" },
    { "id": "step-2", "action": "wait_for_selector", "selector": "body" }
  ]
}
Output ONLY valid JSON.`;

    const res = await this.generate({ prompt });
    const cleaned = res.response.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  }
}

export const ollamaConnector = new OllamaConnector();
