export interface AgentExecution {
  readonly id: string;
  readonly agent_name: string;
  readonly project?: string;
  readonly task: string;
  readonly model: string;
  readonly approval_mode: 'default' | 'auto_edit' | 'yolo' | 'plan';
  readonly sandbox: boolean;
  readonly status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  readonly skills: readonly string[];
  readonly result?: string;
  readonly error_message?: string;
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly total_tokens?: number;
  readonly latency_ms?: number;
  readonly subscription_tier: 'paid' | 'freeware';
  readonly metadata?: Readonly<Record<string, any>>;
  readonly created_timestamp: string;
  readonly update_timestamp: string;
}

export interface AgentStep {
  readonly id: string;
  readonly agent_id: string;
  readonly step_number: number;
  readonly step_type: 'THOUGHT' | 'TOOL_CALL' | 'TOOL_RESULT' | 'OUTPUT';
  readonly content: string;
  readonly tool_name?: string;
  readonly status: 'SUCCESS' | 'ERROR';
  readonly metadata?: Readonly<Record<string, any>>;
  readonly created_timestamp: string;
  readonly update_timestamp: string;
}

export interface CreateAgentExecutionRequest {
  readonly agent_name?: string;
  readonly project?: string;
  readonly task: string;
  readonly model?: string;
  readonly approval_mode?: 'default' | 'auto_edit' | 'yolo' | 'plan';
  readonly sandbox?: boolean;
  readonly skills?: readonly string[];
  readonly metadata?: Readonly<Record<string, any>>;
  readonly subscription_policy?: string;
}
