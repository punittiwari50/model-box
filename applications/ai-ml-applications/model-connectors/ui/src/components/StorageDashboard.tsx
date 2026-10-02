import React from 'react';
import { ModelConnection } from '@/services/api';

interface Props {
  connections: ModelConnection[];
}

export const StorageDashboard: React.FC<Props> = ({ connections }: Props) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          💾 Persistence & Storage Strategy Engines
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Polymorphic persistence bundles supporting High-Speed In-Memory SQLite, Enterprise PostgreSQL, and YAML config backends.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem', marginBottom: '2rem' }}>
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 600 }}>In-Memory SQLite</span>
              <span className="badge badge-grpc">Active (Dev)</span>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Thread-safe transient storage with microsecond query latency. Ideal for local development and unit tests.
            </p>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              DSN: :memory:
            </div>
          </div>

          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 600 }}>Enterprise PostgreSQL</span>
              <span className="badge badge-rest">Ready (Prod)</span>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              ACID-compliant relational store with connection pooling and JSONB conversation compaction indexing.
            </p>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              DSN: postgresql://postgres:***@5432
            </div>
          </div>

          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 600 }}>YAML Config Store</span>
              <span className="badge badge-kafka">Sync Mode</span>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Declarative file-based model profiles stored under <code>./config/connections</code>.
            </p>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              Dir: ./config/connections
            </div>
          </div>
        </div>

        {/* Registered Connection Profiles Table */}
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Registered Model Profiles in Storage</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-dim)' }}>
                <th style={{ padding: '0.75rem 0.5rem' }}>ID</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Name</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Protocol</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Backend</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Token Capacity</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.connection_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{c.connection_id}</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>{c.name}</td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <span className={`badge badge-${c.protocol.toLowerCase().slice(0, 4)}`}>{c.protocol}</span>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>{c.storage_backend}</td>
                  <td style={{ padding: '0.75rem 0.5rem', color: 'var(--accent-emerald)', fontWeight: 600 }}>{c.token_capacity.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
