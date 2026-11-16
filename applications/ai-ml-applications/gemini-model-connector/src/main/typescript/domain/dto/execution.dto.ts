export interface CliExecutionResult {
  readonly content: string;
  readonly raw_output: string;
  readonly stderr: string;
  readonly exit_code: number;
  readonly latency_ms: number;
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly total_tokens?: number;
  readonly max_tokens?: number;
  readonly token_consumed_percentage?: number;
  readonly token_remaining_percentage?: number;
  readonly model: string;
  readonly runner_type: "cli" | "mock" | "api" | "websocket";
  readonly session_id?: string;
  readonly is_fallback?: boolean;
  readonly fallback_reason?: string;
  readonly switched_model?: string;
  readonly tier?: "paid" | "freeware";
  readonly switched_tier?: boolean;
  readonly subscription_policy?: string;
  readonly account_email?: string;
  readonly account_name?: string;
}
