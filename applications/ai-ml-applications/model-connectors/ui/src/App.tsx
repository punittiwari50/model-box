import React, { useEffect, useState } from 'react';
import { apiClient, ModelConnection } from '@/services/api';
import { UniversalConsole } from '@/components/UniversalConsole';
import { MediaGallery } from '@/components/MediaGallery';
import { RuntimeEnvironmentViewer } from '@/components/RuntimeEnvironmentViewer';
import { StorageDashboard } from '@/components/StorageDashboard';
import { PlaywrightMcpAutomation } from '@/components/PlaywrightMcpAutomation';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'console' | 'media' | 'env' | 'storage' | 'mcp'>('console');
  const [connections, setConnections] = useState<ModelConnection[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<ModelConnection | null>(null);
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [routingMode, setRoutingMode] = useState<string>(apiClient.getRoutingMode());

  useEffect(() => {
    const unsubscribe = apiClient.subscribeRoutingMode((mode) => setRoutingMode(mode));

    // Initial fetch of connections and health
    apiClient.getConnections()
      .then((data) => {
        setConnections(data);
        if (data.length > 0) setSelectedConnection(data[0]);
      })
      .catch(console.error);

    apiClient.getHealth()
      .then(setHealthStatus)
      .catch(console.error);

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="navbar">
        <div className="nav-brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span>ModelBox | Connectors</span>
        </div>

        {/* Tab Navigation */}
        <div className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === 'console' ? 'active' : ''}`}
            onClick={() => setActiveTab('console')}
          >
            ⚡ Universal Client
          </button>
          <button
            className={`nav-tab ${activeTab === 'media' ? 'active' : ''}`}
            onClick={() => setActiveTab('media')}
          >
            🎥 Multimedia
          </button>
          <button
            className={`nav-tab ${activeTab === 'env' ? 'active' : ''}`}
            onClick={() => setActiveTab('env')}
          >
            🌐 Runtime Environment
          </button>
          <button
            className={`nav-tab ${activeTab === 'storage' ? 'active' : ''}`}
            onClick={() => setActiveTab('storage')}
          >
            💾 Storage
          </button>
          <button
            className={`nav-tab ${activeTab === 'mcp' ? 'active' : ''}`}
            onClick={() => setActiveTab('mcp')}
          >
            🧪 Playwright MCP
          </button>
        </div>

        {/* Health status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8125rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--accent-emerald)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-emerald)', boxShadow: '0 0 8px var(--accent-emerald)' }} />
            {healthStatus?.status || 'Online'}
          </span>
          <span style={{ color: 'var(--text-dim)' }}>|</span>
          <span style={{ color: 'var(--text-muted)' }}>Profiles: {healthStatus?.active_profiles?.join(', ') || 'dev'}</span>
        </div>
      </header>

      {/* Main Grid Layout */}
      <main className="content-grid">
        {/* Left Sidebar Status */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="glass-card">
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              Service Runtime
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Microservice:</span>
                <span style={{ fontWeight: 500 }}>model-connectors</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Storage Backend:</span>
                <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{healthStatus?.storage_backend || 'IN_MEMORY'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Universal Client:</span>
                <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>Active</span>
              </div>
            </div>
          </div>

          <div className="glass-card">
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              Circuit Breakers & Resilience
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Ollama State:</span>
                <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>CLOSED (Healthy)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>ComfyUI State:</span>
                <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>CLOSED (Healthy)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Kafka Stream:</span>
                <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>CLOSED (Healthy)</span>
              </div>
            </div>
          </div>

          {/* Security Feature Flag & Execution Routing Flow Strategy */}
          <div className="glass-card" style={{ border: routingMode === 'DIRECT_CONTAINER_MESH' ? '1px solid var(--accent-amber)' : '1px solid var(--accent-cyan)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', margin: 0 }}>
                Execution Flow Flag
              </h3>
              <button
                id="toggle-routing-feature-flag"
                onClick={() => {
                  const next = apiClient.toggleRoutingMode();
                  setRoutingMode(next);
                }}
                style={{
                  background: routingMode === 'DIRECT_CONTAINER_MESH' ? 'var(--accent-amber)' : 'var(--accent-cyan)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.2rem 0.6rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {routingMode === 'DIRECT_CONTAINER_MESH' ? '⚡ Direct Mesh ON' : '🔒 Gateway (BFF) Flow'}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Active Flow:</span>
                <span style={{ fontWeight: 600, color: routingMode === 'DIRECT_CONTAINER_MESH' ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>
                  {routingMode === 'DIRECT_CONTAINER_MESH' ? 'Direct Container Mesh' : 'UI → Service (BFF)'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Security Level:</span>
                <span style={{ color: routingMode === 'DIRECT_CONTAINER_MESH' ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>
                  {routingMode === 'DIRECT_CONTAINER_MESH' ? 'Debug / Direct Mesh' : 'Hardened (Least Privilege)'}
                </span>
              </div>
              {routingMode === 'DIRECT_CONTAINER_MESH' && (
                <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.75rem' }}>
                  <div style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Active Mesh Endpoints:</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Vault:</span>
                    <code>:8200</code>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>PostgreSQL:</span>
                    <code>:5432</code>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Ollama:</span>
                    <code>:11434</code>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>ComfyUI:</span>
                    <code>:8188</code>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Playwright MCP:</span>
                    <code>:8931</code>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="glass-card">
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              Supported Protocols
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              <span className="badge badge-rest">REST / HTTP</span>
              <span className="badge badge-grpc">gRPC Protobuf</span>
              <span className="badge badge-ws">WebSocket</span>
              <span className="badge badge-kafka">Kafka PubSub</span>
            </div>
          </div>
        </aside>

        {/* Center Panel View */}
        <section>
          {activeTab === 'console' && (
            <UniversalConsole
              connections={connections}
              selectedConnection={selectedConnection}
              onSelectConnection={setSelectedConnection}
            />
          )}

          {activeTab === 'media' && <MediaGallery />}

          {activeTab === 'env' && <RuntimeEnvironmentViewer />}

          {activeTab === 'storage' && <StorageDashboard connections={connections} />}

          {activeTab === 'mcp' && <PlaywrightMcpAutomation />}
        </section>
      </main>
    </div>
  );
};
