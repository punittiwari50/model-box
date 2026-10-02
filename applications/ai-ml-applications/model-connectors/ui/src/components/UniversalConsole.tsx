import React, { useState } from 'react';
import { apiClient, ModelConnection, InferenceResponse } from '@/services/api';

interface Props {
  connections: ModelConnection[];
  selectedConnection: ModelConnection | null;
  onSelectConnection: (conn: ModelConnection) => void;
}

export const UniversalConsole: React.FC<Props> = ({
  connections,
  selectedConnection,
  onSelectConnection,
}: Props) => {
  const [prompt, setPrompt] = useState('Analyze system latency and optimize distributed token consumption.');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<InferenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExecute = async () => {
    if (!selectedConnection) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.executeInference({
        session_id: 'session-console-live',
        prompt,
        connection_id: selectedConnection.connection_id,
        model_name: selectedConnection.model_name,
        user_id: 'architect-01',
        cookie_id: 'cookie-auth-token-live',
      });
      setResponse(res);
    } catch (err: any) {
      setError(err.message || 'Execution failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          ⚡ Universal Connector Client (Single Facade)
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
          Execute inference across REST, gRPC, WebSocket, and Kafka through a unified Strategy & Security Pipeline.
        </p>

        {/* Protocol Selector Chips */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          {connections.map((c) => {
            const isSelected = selectedConnection?.connection_id === c.connection_id;
            return (
              <button
                key={c.connection_id}
                onClick={() => onSelectConnection(c)}
                style={{
                  background: isSelected ? 'var(--accent-indigo)' : 'rgba(255, 255, 255, 0.05)',
                  color: isSelected ? '#fff' : 'var(--text-main)',
                  border: isSelected ? '1px solid var(--accent-indigo)' : '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.6rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem',
                }}
              >
                <span className={`badge badge-${c.protocol.toLowerCase().slice(0, 4)}`}>{c.protocol}</span>
                <span>{c.name}</span>
              </button>
            );
          })}
        </div>

        {/* Selected Endpoint Card */}
        {selectedConnection && (
          <div style={{ background: 'rgba(0,0,0,0.25)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', fontSize: '0.8125rem' }}>
              <div>
                <span style={{ color: 'var(--text-dim)' }}>Endpoint:</span>
                <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{selectedConnection.endpoint_url}</p>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)' }}>Model:</span>
                <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{selectedConnection.model_name}</p>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)' }}>Capacity:</span>
                <p style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>{selectedConnection.token_capacity.toLocaleString()} tokens</p>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)' }}>Storage:</span>
                <p style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{selectedConnection.storage_backend}</p>
              </div>
            </div>
          </div>
        )}

        {/* Prompt Input */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
            Prompt / Event Payload:
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              background: '#070a10',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem',
              color: 'var(--text-main)',
              fontSize: '0.875rem',
              resize: 'vertical',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button
            onClick={handleExecute}
            disabled={loading || !selectedConnection}
            style={{
              background: 'var(--gradient-brand)',
              color: '#ffffff',
              padding: '0.65rem 1.5rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '0.875rem',
              boxShadow: 'var(--shadow-glow)',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Executing Inference...' : '🚀 Dispatch Request'}
          </button>
        </div>
      </div>

      {/* Response Display */}
      {error && (
        <div style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid var(--accent-rose)', padding: '1rem', borderRadius: 'var(--radius-md)', color: '#fecdd3' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {response && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Response Artifact ({response.execution_duration_ms.toFixed(1)} ms)</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>ID: {response.response_id}</span>
          </div>

          <div className="console-output" style={{ marginBottom: '1rem' }}>
            {response.content}
          </div>

          {/* Token Metrics summary */}
          <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            <div>Tokens Consumed: <strong style={{ color: 'var(--accent-amber)' }}>{response.token_metrics.tokens_consumed_total}</strong></div>
            <div>Remaining Pool: <strong style={{ color: 'var(--accent-emerald)' }}>{response.token_metrics.tokens_available}</strong></div>
            <div>Refill Rate: <strong>{response.token_metrics.refill_rate_per_second}/s</strong></div>
          </div>
        </div>
      )}
    </div>
  );
};
