import React, { useState } from "react";
import type { BaseWorkflowNodeData, CanvasCustomEdge } from "@/types/workflowCanvas";

interface WorkflowCanvasProps {
  readonly nodes: readonly BaseWorkflowNodeData[];
  readonly edges: readonly CanvasCustomEdge[];
  readonly selectedNodeId: string | null;
  readonly onSelectNode: (nodeId: string | null) => void;
  readonly isExecuting?: boolean;
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  isExecuting = false,
}) => {
  const [viewMode, setViewMode] = useState<"canvas" | "tabular">("canvas");

  const selectedNode = nodes.find((n) => n.stepId === selectedNodeId);

  const getNodeColor = (type: string): string => {
    switch (type) {
      case "MODEL":
        return "#6366f1"; // Primary Indigo
      case "TOOL":
        return "#06b6d4"; // Cyan
      case "CONDITION":
        return "#f59e0b"; // Amber
      case "ACTION":
        return "#10b981"; // Emerald
      default:
        return "#94a3b8";
    }
  };

  const getStatusBadge = (status: string): { label: string; className: string } => {
    switch (status) {
      case "SUCCESS":
        return { label: "✓ Complete", className: "status-success" };
      case "RUNNING":
        return { label: "⚡ In Progress", className: "status-running" };
      case "FAILED":
        return { label: "✕ Failed", className: "status-failed" };
      case "SKIPPED":
        return { label: "⊘ Skipped", className: "status-skipped" };
      default:
        return { label: "⏳ Pending", className: "status-pending" };
    }
  };

  return (
    <div className="workflow-canvas-container glass-card">
      <div className="canvas-header">
        <div className="canvas-title-group">
          <h3>Interactive Workflow Execution DAG</h3>
          <span className="live-indicator">
            <span className={`pulse-dot ${isExecuting ? "green" : "gray"}`} />
            {isExecuting ? "Live Execution SSE" : "Idle"}
          </span>
        </div>
        <div className="canvas-actions">
          <button
            className={`view-mode-pill ${viewMode === "canvas" ? "active" : ""}`}
            onClick={() => setViewMode("canvas")}
          >
            DAG Graph
          </button>
          <button
            className={`view-mode-pill ${viewMode === "tabular" ? "active" : ""}`}
            onClick={() => setViewMode("tabular")}
          >
            Tabular Steps
          </button>
        </div>
      </div>

      {viewMode === "canvas" ? (
        <div className="canvas-viewport">
          <svg className="dag-svg-layer" width="100%" height="400" viewBox="0 0 950 400">
            <defs>
              <linearGradient id="edgeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* Render Edges */}
            {(edges || []).map((edge) => {
              const srcNode = (nodes || []).find((n) => n.stepId === edge.source);
              const tgtNode = (nodes || []).find((n) => n.stepId === edge.target);
              if (!srcNode || !tgtNode) return null;

              const x1 = (srcNode.x ?? 100) + 90;
              const y1 = (srcNode.y ?? 100) + 40;
              const x2 = (tgtNode.x ?? 300);
              const y2 = (tgtNode.y ?? 100) + 40;
              const mx = (x1 + x2) / 2;

              return (
                <g key={edge.id} className="dag-edge-group">
                  <path
                    d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke="url(#edgeGradient)"
                    strokeWidth="2.5"
                    strokeDasharray={edge.isAnimated ? "6,4" : undefined}
                    className={edge.isAnimated ? "animated-edge-path" : ""}
                  />
                  {edge.latencyMs ? (
                    <text x={mx} y={(y1 + y2) / 2 - 8} fill="#94a3b8" fontSize="10" textAnchor="middle">
                      {edge.latencyMs}ms
                    </text>
                  ) : null}
                </g>
              );
            })}

            {/* Render Nodes */}
            {(nodes || []).map((node) => {
              const isSelected = node.stepId === selectedNodeId;
              const badge = getStatusBadge(node.status);
              const accentColor = getNodeColor(node.nodeType);
              const nx = node.x ?? 100;
              const ny = node.y ?? 100;
              const stepName = node.stepName || "Unnamed Step";

              return (
                <g
                  key={node.stepId}
                  transform={`translate(${nx}, ${ny})`}
                  className={`dag-node ${isSelected ? "selected" : ""}`}
                  onClick={() => onSelectNode(node.stepId)}
                  style={{ cursor: "pointer" }}
                >
                  <rect
                    width="180"
                    height="80"
                    rx="10"
                    fill="rgba(17, 24, 39, 0.85)"
                    stroke={isSelected ? "#00f2fe" : accentColor}
                    strokeWidth={isSelected ? "2.5" : "1.5"}
                    filter="drop-shadow(0 4px 10px rgba(0,0,0,0.5))"
                  />
                  <rect x="0" y="0" width="6" height="80" rx="3" fill={accentColor} />
                  <text x="14" y="24" fill="#f8fafc" fontSize="12" fontWeight="bold">
                    {stepName.length > 20 ? `${stepName.substring(0, 19)}…` : stepName}
                  </text>
                  <text x="14" y="42" fill="#94a3b8" fontSize="10">
                    Type: {node.nodeType}
                  </text>
                  <rect x="14" y="52" width="75" height="18" rx="4" fill="rgba(30, 41, 59, 0.8)" />
                  <text x="20" y="65" fill="#38bdf8" fontSize="10" fontWeight="600">
                    {badge.label}
                  </text>
                  {node.executionDurationMs ? (
                    <text x="166" y="65" fill="#64748b" fontSize="10" textAnchor="end">
                      {node.executionDurationMs}ms
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="tabular-viewport">
          <table className="step-table">
            <thead>
              <tr>
                <th>Step ID</th>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Mandatory</th>
                <th>Duration</th>
                <th>Output Summary</th>
              </tr>
            </thead>
            <tbody>
              {(nodes || []).map((node) => (
                <tr
                  key={node.stepId}
                  className={node.stepId === selectedNodeId ? "row-selected" : ""}
                  onClick={() => onSelectNode(node.stepId)}
                >
                  <td><code>{node.stepId}</code></td>
                  <td><strong>{node.stepName}</strong></td>
                  <td><span className="type-badge">{node.nodeType}</span></td>
                  <td><span className={`status-pill ${node.status.toLowerCase()}`}>{node.status}</span></td>
                  <td>{node.isMandatory ? "Yes" : "No (Skippable)"}</td>
                  <td>{node.executionDurationMs ? `${node.executionDurationMs}ms` : "-"}</td>
                  <td className="summary-cell">{node.outputSummary || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedNode ? (
        <div className="node-detail-panel">
          <div className="detail-header">
            <h4>Node Inspector: {selectedNode.stepName}</h4>
            <span className="node-type-pill">{selectedNode.nodeType}</span>
          </div>
          <div className="detail-grid">
            <div><strong>Step ID:</strong> <code>{selectedNode.stepId}</code></div>
            <div><strong>Status:</strong> {selectedNode.status}</div>
            <div><strong>Execution Time:</strong> {selectedNode.executionDurationMs ?? 0} ms</div>
            <div><strong>Mandatory:</strong> {selectedNode.isMandatory ? "True" : "False"}</div>
          </div>
          <div className="detail-summary">
            <strong>Payload Summary:</strong>
            <p>{selectedNode.outputSummary || "No output generated yet."}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
};
