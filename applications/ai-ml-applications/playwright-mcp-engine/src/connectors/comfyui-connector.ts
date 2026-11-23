import axios, { type AxiosInstance } from 'axios';
import { logger } from '@/core/logger.js';
import { config } from '@/core/config.js';
import { AI_DEFAULTS, HTTP_CONTENT_TYPES, HTTP_HEADERS, HTTP_STATUS } from '@/constants/index.js';

export interface ComfyPromptRequest {
  client_id?: string;
  prompt: Record<string, unknown>;
  extra_data?: Record<string, unknown>;
}

export interface ComfyPromptResponse {
  prompt_id: string;
  number: number;
  node_errors?: Record<string, unknown>;
}

export interface ComfyHistoryOutput {
  images?: Array<{
    filename: string;
    subfolder: string;
    type: string;
  }>;
}

export class ComfyUiConnector {
  private activeBaseUrl: string;
  private candidateUrls: string[];
  private client: AxiosInstance;
  private timeoutMs: number;

  constructor(baseUrl?: string, candidateUrls?: string[], timeoutMs?: number) {
    this.activeBaseUrl = baseUrl || config.comfyui.baseUrl;
    this.candidateUrls = candidateUrls || config.comfyui.candidateUrls;
    this.timeoutMs = timeoutMs || config.comfyui.timeoutMs;
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
          logger.warn(`Could not reach any ComfyUI candidate URLs. Keeping default: ${this.activeBaseUrl}`);
          return this.activeBaseUrl;
        },
        false: async () => {
          const url = this.candidateUrls[index];
          try {
            const res = await axios.get(`${url}/system_stats`, { timeout: 3000 });
            const isOk = res.status === HTTP_STATUS.OK;
            const okActions: Record<string, () => Promise<string>> = {
              true: async () => {
                this.activeBaseUrl = url;
                this.client.defaults.baseURL = url;
                logger.info(`ComfyUiConnector connected to endpoint: ${url}`);
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

  async checkHealth(): Promise<boolean> {
    try {
      const res = await this.client.get('/system_stats');
      return res.status === HTTP_STATUS.OK;
    } catch {
      return false;
    }
  }

  async queuePrompt(promptWorkflow: Record<string, unknown>): Promise<ComfyPromptResponse> {
    const clientId = `playwright-mcp-${Date.now()}`;
    const payload: ComfyPromptRequest = {
      client_id: clientId,
      prompt: promptWorkflow,
    };

    try {
      const res = await this.client.post<ComfyPromptResponse>('/prompt', payload);
      logger.info(`ComfyUI prompt queued. PromptId: ${res.data.prompt_id}`);
      return res.data;
    } catch {
      logger.warn('ComfyUI queue failed on primary, retrying failover endpoint...');
      await this.findWorkingEndpoint();
      const res = await this.client.post<ComfyPromptResponse>('/prompt', payload);
      return res.data;
    }
  }

  async waitForCompletion(
    promptId: string,
    maxWaitMs = 60000,
    intervalMs = 2000
  ): Promise<ComfyHistoryOutput> {
    const startTime = Date.now();

    return this.pollCompletion(promptId, startTime, maxWaitMs, intervalMs);
  }

  private async pollCompletion(
    promptId: string,
    startTime: number,
    maxWaitMs: number,
    intervalMs: number
  ): Promise<ComfyHistoryOutput> {
    const isTimedOut = Date.now() - startTime >= maxWaitMs;
    const timeoutActions: Record<string, () => never> = {
      true: () => {
        throw new Error(`ComfyUI prompt ${promptId} timed out after ${maxWaitMs}ms`);
      },
      false: () => {
        throw new Error('ContinuePoll');
      },
    };

    try {
      timeoutActions[String(isTimedOut)]();
    } catch (signal) {
      const isAbort = (signal as Error).message.includes('timed out');
      const abortActions: Record<string, () => never> = {
        true: () => {
          throw signal;
        },
        false: () => {
          throw new Error('ProceedWithRequest');
        },
      };
      try {
        abortActions[String(isAbort)]();
      } catch (proceedSignal) {
        const shouldProceed = (proceedSignal as Error).message === 'ProceedWithRequest';
        const proceedActions: Record<string, () => void> = {
          true: () => {},
          false: () => { throw proceedSignal; },
        };
        proceedActions[String(shouldProceed)]();
      }
    }

    try {
      const res = await this.client.get(`/history/${promptId}`);
      const data = res.data as Record<string, { outputs?: Record<string, ComfyHistoryOutput> }>;

      const promptData = data?.[promptId];
      const hasPromptData = Boolean(promptData);

      const completionActions: Record<string, () => ComfyHistoryOutput> = {
        true: () => {
          const outputs = promptData!.outputs || {};
          const allImages: ComfyHistoryOutput['images'] = [];

          for (const nodeOutput of Object.values(outputs)) {
            const hasImages = Boolean(nodeOutput.images);
            const imageCollectors: Record<string, () => void> = {
              true: () => allImages.push(...nodeOutput.images!),
              false: () => {},
            };
            imageCollectors[String(hasImages)]();
          }

          logger.info(`ComfyUI prompt ${promptId} finished! Generated ${allImages.length} image(s).`);
          return { images: allImages };
        },
        false: () => {
          throw new Error('NotFinishedYet');
        },
      };

      try {
        return completionActions[String(hasPromptData)]();
      } catch {
        // Not finished yet
      }
    } catch (err) {
      logger.debug(`Polling ComfyUI prompt ${promptId} yielded error`, { error: String(err) });
    }

    await new Promise((r) => setTimeout(r, intervalMs));
    return this.pollCompletion(promptId, startTime, maxWaitMs, intervalMs);
  }

  async getImageDataUrl(filename: string, subfolder = '', type = 'output'): Promise<string> {
    const res = await this.client.get('/view', {
      params: { filename, subfolder, type },
      responseType: 'arraybuffer',
    });

    const base64 = Buffer.from(res.data).toString('base64');
    return `data:image/png;base64,${base64}`;
  }
}

export const comfyUiConnector = new ComfyUiConnector();
