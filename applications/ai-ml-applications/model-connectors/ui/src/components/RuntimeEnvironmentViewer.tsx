import React, { useEffect, useState } from 'react';
import { apiClient, EnvironmentInfo } from '@/services/api';

export const RuntimeEnvironmentViewer: React.FC = () => {
  const [envInfo, setEnvInfo] = useState<EnvironmentInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .getEnvironment()
      .then(setEnvInfo)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: 'var(--text-muted)' }}>Loading Runtime Environment...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🌐 Runtime Environment & Profile Configuration
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Hierarchical configuration precedence: [System Environment] &rarr; [application.yml] &rarr; [application-&#123;profile&#125;.yml] &rarr; [CLI Arguments].
          Single point of access via <code>SystemEnvironmentPropertySource</code>.
        </p>

        {/* Active Profiles Pills */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '0.8125rem', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '0.5rem', fontWeight: 600 }}>
            Active Profiles
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {envInfo?.active_profiles?.map((profile) => (
              <span
                key={profile}
                style={{
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: 'var(--accent-indigo)',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  padding: '0.25rem 0.75rem',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                }}
              >
                profile: {profile}
              </span>
            ))}
          </div>
        </div>

        {/* Hierarchical Property Sources */}
        <div>
          <h3 style={{ fontSize: '0.8125rem', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '0.75rem', fontWeight: 600 }}>
            Layered Property Sources (Precedence Order)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {envInfo?.property_sources?.map((source, idx) => (
              <div
                key={source.name}
                style={{
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    #{idx + 1} {source.name}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
                    {source.properties_count} properties
                  </span>
                </div>
                <div style={{ background: '#030508', borderRadius: 'var(--radius-sm)', padding: '0.5rem', maxHeight: '120px', overflowY: 'auto' }}>
                  <pre style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {JSON.stringify(source.sample, null, 2)}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
