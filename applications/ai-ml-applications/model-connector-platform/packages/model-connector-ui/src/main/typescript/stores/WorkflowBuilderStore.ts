import type {
  BaseWorkflowNodeData,
  CanvasCustomEdge,
  WorkflowStepStatus,
} from "@/types/workflowCanvas";

export interface WorkflowBuilderState {
  readonly workflowId: string;
  readonly workflowName: string;
  readonly nodes: readonly BaseWorkflowNodeData[];
  readonly edges: readonly CanvasCustomEdge[];
  readonly selectedNodeId: string | null;
  readonly isExecuting: boolean;
  readonly executionLogs: readonly string[];
}

type WorkflowListener = (state: WorkflowBuilderState) => void;

class WorkflowBuilderStoreImpl {
  private state: WorkflowBuilderState = {
    workflowId: "wf-default",
    workflowName: "Enterprise Multi-Model DAG",
    nodes: [
      {
        stepId: "step-1",
        stepName: "Input Ingestion & Validation",
        nodeType: "TOOL",
        isMandatory: true,
        status: "SUCCESS",
        progressPercent: 100,
        executionDurationMs: 45,
        outputSummary: "Input payload normalized and validated against schema",
        x: 100,
        y: 150,
      },
      {
        stepId: "step-2",
        stepName: "Token Compaction (AST)",
        nodeType: "TOOL",
        isMandatory: true,
        status: "SUCCESS",
        progressPercent: 100,
        executionDurationMs: 120,
        outputSummary: "Reduced tokens by 58% via lossless AST pruning",
        x: 320,
        y: 150,
      },
      {
        stepId: "step-3",
        stepName: "Primary Model Inference (Gemini 3.8)",
        nodeType: "MODEL",
        isMandatory: true,
        status: "RUNNING",
        progressPercent: 65,
        executionDurationMs: 310,
        outputSummary: "Streaming synthesis with Google Search grounding",
        x: 540,
        y: 100,
      },
      {
        stepId: "step-4",
        stepName: "Fallback Cascade Model",
        nodeType: "CONDITION",
        isMandatory: false,
        status: "PENDING",
        outputSummary: "Awaiting primary model SLA watchdog threshold",
        x: 540,
        y: 260,
      },
      {
        stepId: "step-5",
        stepName: "Output Aggregation & Audit Seal",
        nodeType: "ACTION",
        isMandatory: true,
        status: "PENDING",
        outputSummary: "Calculates sequential HMAC hash and emits response",
        x: 760,
        y: 180,
      },
    ],
    edges: [
      { id: "e1-2", source: "step-1", target: "step-2", isAnimated: true, latencyMs: 5 },
      { id: "e2-3", source: "step-2", target: "step-3", isAnimated: true, latencyMs: 12 },
      { id: "e2-4", source: "step-2", target: "step-4", isAnimated: false, latencyMs: 0 },
      { id: "e3-5", source: "step-3", target: "step-5", isAnimated: true, latencyMs: 8 },
      { id: "e4-5", source: "step-4", target: "step-5", isAnimated: false, latencyMs: 0 },
    ],
    selectedNodeId: "step-3",
    isExecuting: true,
    executionLogs: [
      "[00:00.045] Step 1 complete: Input Ingestion & Validation",
      "[00:00.165] Step 2 complete: Lossless AST pruning finished",
      "[00:00.210] Step 3 running: Inbound SSE stream established with Gemini 3.8",
    ],
  };

  private readonly listeners = new Set<WorkflowListener>();

  public getState(): WorkflowBuilderState {
    return this.state;
  }

  public subscribe(listener: WorkflowListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public selectNode(stepId: string | null): void {
    this.state = {
      ...this.state,
      selectedNodeId: stepId,
    };
    this.notify();
  }

  public updateNodeStatus(
    stepId: string,
    status: WorkflowStepStatus,
    progressPercent?: number,
    outputSummary?: string,
  ): void {
    const updatedNodes = this.state.nodes.map((node) => {
      if (node.stepId === stepId) {
        return {
          ...node,
          status,
          progressPercent: progressPercent ?? node.progressPercent,
          outputSummary: outputSummary ?? node.outputSummary,
        };
      }
      return node;
    });

    this.state = {
      ...this.state,
      nodes: updatedNodes,
    };
    this.notify();
  }

  public addLog(entry: string): void {
    this.state = {
      ...this.state,
      executionLogs: [...this.state.executionLogs, entry],
    };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

export const workflowBuilderStore = new WorkflowBuilderStoreImpl();
