import React, { useEffect, useState } from 'react';
import { apiClient } from '@/services/api';

export const PlaywrightMcpTesting: React.FC = () => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [workflowJson, setWorkflowJson] = useState<string>('');
  const [schema, setSchema] = useState<any | null>(null);
  const [showSchema, setShowSchema] = useState<boolean>(false);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [tools, setTools] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load schema, templates, and tools
    apiClient.getPlaywrightTemplates()
      .then((data) => {
        setTemplates(data);
        if (data.length > 0) {
          setSelectedTemplateId(data[0].workflow_id);
          setWorkflowJson(JSON.stringify(data[0], null, 2));
        }
      })
      .catch((err) => setError(`Failed to load templates: ${err.message}`));

    apiClient.getPlaywrightSchema()
      .then(setSchema)
      .catch((err) => console.warn('Schema fetch notice:', err));

    apiClient.getPlaywrightTools()
      .then((res) => setTools(res.tools || []))
      .catch((err) => console.warn('Tools fetch notice:', err));
  }, []);

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const found = templates.find((t) => t.workflow_id === templateId);
    if (found) {
      setWorkflowJson(JSON.stringify(found, null, 2));
      setTestResult(null);
      setError(null);
    }
  };

  const handleRunTest = async () => {
    setIsRunning(true);
    setError(null);
    setTestResult(null);
    try {
      const parsedWorkflow = JSON.parse(workflowJson);
      const result = await apiClient.executePlaywrightTest(parsedWorkflow);
      setTestResult(result);
    } catch (err: any) {
      setError(err.message || 'Workflow execution error');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Banner */}
      <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🎭</span>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Model Context Protocol (MCP) Playwright Testing Console
            </h2>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Execute automated browser testing workflows defined entirely in standard JSON format against containerized Playwright MCP.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            className="secondary-button"
            onClick={() => setShowSchema(!showSchema)}
            style={{ fontSize: '0.8125rem', padding: '0.45rem 0.9rem' }}
          >
            📋 {showSchema ? 'Hide JSON Schema' : 'View JSON Schema'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-emerald)', padding: '0.35rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-emerald)' }} />
            {tools.length} Playwright Tools Active
          </div>
        </div>
      </div>

      {/* JSON Schema Viewer Modal / Section */}
      {showSchema && schema && (
        <div className="glass-card" style={{ borderLeft: '4px solid var(--accent-cyan)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
              📐 Official JSON Schema Definition (Draft-07 Compatible)
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Validates Workflow ID, Steps, Action Enums, and Assertions</span>
          </div>
          <pre style={{ maxHeight: '250px', overflowY: 'auto', background: '#0a0d14', padding: '1rem', borderRadius: '6px', fontSize: '0.75rem', color: '#38bdf8', lineHeight: 1.4 }}>
            {JSON.stringify(schema, null, 2)}
          </pre>
        </div>
      )}

      {/* Workflow Controls & JSON Editor */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.25rem' }}>
        {/* Left Column: Workflow JSON Editor */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Workflow Template:</span>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                style={{
                  background: '#151923',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '6px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8125rem',
                  outline: 'none',
                }}
              >
                {templates.map((t) => (
                  <option key={t.workflow_id} value={t.workflow_id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleRunTest}
              disabled={isRunning}
              style={{
                background: isRunning ? 'rgba(99, 102, 241, 0.4)' : 'linear-gradient(135deg, #6366f1, #3b82f6)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '0.5rem 1.25rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: isRunning ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: isRunning ? 'none' : '0 4px 14px rgba(99, 102, 241, 0.4)',
                transition: 'all 0.2s',
              }}
            >
              {isRunning ? (
                <>
                  <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Executing Browser Automation...
                </>
              ) : (
                <>▶ Execute Test Workflow (JSON)</>
              )}
            </button>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              <span>Test Workflow JSON Specification:</span>
              <span>Must comply with TestWorkflow schema</span>
            </div>
            <textarea
              value={workflowJson}
              onChange={(e) => setWorkflowJson(e.target.value)}
              rows={18}
              style={{
                width: '100%',
                background: '#090c13',
                color: '#a5f3fc',
                fontFamily: 'Consolas, monospace',
                fontSize: '0.8125rem',
                padding: '0.875rem',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.08)',
                outline: 'none',
                resize: 'vertical',
                lineHeight: 1.45,
              }}
            />
          </div>

          {error && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '0.75rem', borderRadius: '6px', fontSize: '0.8125rem' }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Right Column: Execution Telemetry & Results */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            📊 Real-Time Test Results & Telemetry
          </h3>

          {!testResult && !isRunning && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--text-dim)', textAlign: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '2.5rem', opacity: 0.5 }}>🧪</span>
              <p style={{ fontSize: '0.875rem', maxWidth: '280px' }}>
                Select or edit a testing workflow in JSON form, then click <strong>Execute Test Workflow</strong> to run headless verification via Playwright MCP.
              </p>
            </div>
          )}

          {isRunning && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', gap: '1rem' }}>
              <div style={{ width: 36, height: 36, border: '3px solid rgba(99, 102, 241, 0.2)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Connecting to Playwright MCP... Dispatching JSON-RPC steps...
              </p>
            </div>
          )}

          {testResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {/* Summary Card */}
              <div style={{
                background: testResult.status === 'PASSED' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                border: `1px solid ${testResult.status === 'PASSED' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                padding: '0.875rem 1rem',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                      background: testResult.status === 'PASSED' ? '#10b981' : '#ef4444',
                      color: '#fff',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      letterSpacing: '0.04em',
                    }}>
                      {testResult.status}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{testResult.name}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    {testResult.report_summary}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                    {testResult.duration_ms} ms
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    {testResult.passed_steps} / {testResult.total_steps} Passed
                  </div>
                </div>
              </div>

              {/* Step By Step Breakdown */}
              <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {testResult.step_results?.map((step: any, idx: number) => (
                  <div
                    key={step.step_id || idx}
                    style={{
                      background: '#111520',
                      border: '1px solid rgba(255,255,255,0.06)',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                      fontSize: '0.8125rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{
                          color: step.status === 'PASSED' ? '#10b981' : step.status === 'FAILED' ? '#ef4444' : '#9ca3af',
                          fontWeight: 700,
                        }}>
                          {step.status === 'PASSED' ? '✓' : step.status === 'FAILED' ? '✗' : '○'}
                        </span>
                        <span style={{ fontWeight: 600 }}>{step.step_id}</span>
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>[{step.action}]</span>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{step.duration_ms} ms</span>
                    </div>

                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {step.description}
                    </div>

                    {step.error && (
                      <div style={{ color: '#f87171', fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.25rem 0.5rem', borderRadius: '4px', marginTop: '0.25rem' }}>
                        {step.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Raw JSON Result Expander */}
              <details style={{ fontSize: '0.75rem', color: 'var(--text-dim)', cursor: 'pointer' }}>
                <summary style={{ outline: 'none' }}>View Raw JSON Result Payload</summary>
                <pre style={{ maxHeight: '180px', overflowY: 'auto', background: '#0a0d14', padding: '0.75rem', borderRadius: '6px', marginTop: '0.5rem', color: '#93c5fd' }}>
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
