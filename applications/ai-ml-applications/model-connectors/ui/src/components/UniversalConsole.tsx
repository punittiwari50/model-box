import React, { useState, useEffect, useRef } from 'react';
import { apiClient, ModelConnection, InferenceResponse, Project, ChatMessage } from '@/services/api';

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
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedUserTag, setSelectedUserTag] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMetrics, setLastMetrics] = useState<any>(null);

  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat window when new messages arrive
  const scrollToBottom = () => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load Projects from backend services
  useEffect(() => {
    apiClient.getProjects()
      .then((data) => {
        setProjects(data);
        if (data.length > 0) {
          const initialProject = data[0];
          setSelectedProject(initialProject);
          if (initialProject.assigned_users && initialProject.assigned_users.length > 0) {
            setSelectedUserTag(initialProject.assigned_users[0]);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load projects from service:', err);
        setError('Failed to fetch projects from backend service.');
      });
  }, []);

  // Fetch project messages whenever selected project changes
  useEffect(() => {
    if (!selectedProject) return;

    // Set default user tag if current tag not in project
    if (selectedProject.assigned_users?.length > 0 && !selectedProject.assigned_users.includes(selectedUserTag)) {
      setSelectedUserTag(selectedProject.assigned_users[0]);
    }

    // Set sample prompt relevant to project if empty
    if (!prompt) {
      if (selectedProject.project_id === 'linkedin-job-hunter') {
        setPrompt('Generate a tailored LinkedIn headline and cover letter targeting Senior AI Platform Architect positions.');
      } else if (selectedProject.project_id === 'animation-films-creation') {
        setPrompt('Develop a 3-act story arc with cinematic camera prompts for a cyberpunk animated short film.');
      }
    }

    apiClient.getProjectMessages(selectedProject.project_id)
      .then((msgs) => {
        setMessages(msgs);
      })
      .catch((err) => {
        console.error('Failed to load project messages:', err);
      });
  }, [selectedProject?.project_id]);

  const handleSelectProject = (proj: Project) => {
    setSelectedProject(proj);
    if (proj.assigned_users?.length > 0) {
      setSelectedUserTag(proj.assigned_users[0]);
    }
    if (proj.project_id === 'linkedin-job-hunter') {
      setPrompt('Generate a tailored LinkedIn headline and cover letter targeting Senior AI Platform Architect positions.');
    } else {
      setPrompt('Develop a 3-act story arc with cinematic camera prompts for a cyberpunk animated short film.');
    }
  };

  const handleExecute = async () => {
    if (!selectedConnection || !prompt.trim() || !selectedProject) return;
    setLoading(true);
    setError(null);

    const userPromptText = prompt.trim();
    // Optimistic user message addition
    const tempUserMsg: ChatMessage = {
      message_id: 'temp-' + Date.now(),
      session_id: `session-${selectedProject.project_id}`,
      project_id: selectedProject.project_id,
      user_tag: selectedUserTag,
      role: 'USER',
      content: userPromptText,
      token_count: Math.ceil(userPromptText.length / 4),
      timestamp: new Date().toISOString(),
      model_name: selectedConnection.model_name,
      connector_protocol: selectedConnection.protocol,
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setPrompt('');

    try {
      const res: InferenceResponse = await apiClient.executeInference({
        session_id: `session-${selectedProject.project_id}`,
        prompt: userPromptText,
        connection_id: selectedConnection.connection_id,
        model_name: selectedConnection.model_name,
        user_id: selectedUserTag,
        cookie_id: 'cookie-auth-token-live',
        project_id: selectedProject.project_id,
        user_tag: selectedUserTag,
      });

      setLastMetrics(res.token_metrics);

      // Refresh persisted messages directly from database to guarantee synchronization
      const updatedMessages = await apiClient.getProjectMessages(selectedProject.project_id);
      setMessages(updatedMessages);
    } catch (err: any) {
      setError(err.message || 'Execution failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Project Selection Section */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📂 Enterprise Projects & Workspaces
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
              Select a project workspace. Conversations and contexts are isolated and persisted in the database.
            </p>
          </div>
          <span className="badge badge-rest">Database Synced</span>
        </div>

        {/* Project Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          {projects.map((proj) => {
            const isSelected = selectedProject?.project_id === proj.project_id;
            return (
              <div
                key={proj.project_id}
                onClick={() => handleSelectProject(proj)}
                className={`project-card ${isSelected ? 'active' : ''}`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: isSelected ? 'var(--accent-indigo)' : 'var(--text-main)' }}>
                    {proj.name}
                  </h3>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    {proj.project_id}
                  </span>
                </div>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '0.25rem 0' }}>
                  {proj.description}
                </p>
                {/* Project Tags */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.35rem' }}>
                  {proj.tags?.map((t) => (
                    <span key={t} className="badge badge-tag">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* User Persona / User Tag Selector */}
        {selectedProject && (
          <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-dim)', fontWeight: 500 }}>
              Active User Tag / Persona:
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {selectedProject.assigned_users?.map((userTag) => {
                const isTagActive = selectedUserTag === userTag;
                return (
                  <button
                    key={userTag}
                    onClick={() => setSelectedUserTag(userTag)}
                    style={{
                      background: isTagActive ? 'var(--accent-purple)' : 'rgba(255, 255, 255, 0.05)',
                      color: isTagActive ? '#ffffff' : 'var(--text-main)',
                      border: isTagActive ? '1px solid var(--accent-purple)' : '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-full)',
                      padding: '0.3rem 0.8rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    👤 {userTag}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Protocol / Connector Selector */}
      <div className="glass-panel" style={{ padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            Active Connection & Routing Protocol:
          </span>
          {selectedConnection && (
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)' }}>
              {selectedConnection.endpoint_url} ({selectedConnection.model_name})
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {connections.map((c) => {
            const isSelected = selectedConnection?.connection_id === c.connection_id;
            return (
              <button
                key={c.connection_id}
                onClick={() => onSelectConnection(c)}
                style={{
                  background: isSelected ? 'var(--accent-indigo)' : 'rgba(255, 255, 255, 0.04)',
                  color: isSelected ? '#fff' : 'var(--text-main)',
                  border: isSelected ? '1px solid var(--accent-indigo)' : '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.45rem 0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                }}
              >
                <span className={`badge badge-${c.protocol.toLowerCase().slice(0, 4)}`}>{c.protocol}</span>
                <span>{c.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Persistent Chat Conversation Window */}
      <div className="chat-container">
        {/* Chat Header */}
        <div style={{ padding: '0.85rem 1.25rem', background: 'rgba(10, 13, 20, 0.85)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-emerald)', boxShadow: '0 0 8px var(--accent-emerald)' }} />
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              {selectedProject?.name || 'Project Conversation'}
            </h3>
            <span className="badge badge-tag">{selectedProject?.project_id}</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            {messages.length} messages in database thread
          </span>
        </div>

        {/* Scrollable Chat Area with Custom Scrollbar */}
        <div ref={chatScrollRef} className="chat-messages-scroll">
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>💬 No messages in this project yet.</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                Type your inquiry below as <strong>{selectedUserTag}</strong>. All exchanges are recorded in the database.
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const isUser = m.role.toUpperCase() === 'USER';
              return (
                <div
                  key={m.message_id}
                  className={`chat-bubble ${isUser ? 'chat-bubble-user' : 'chat-bubble-assistant'}`}
                >
                  <div className="chat-bubble-header">
                    <span>{isUser ? `👤 ${m.user_tag || 'User'}` : `🤖 Assistant (${m.model_name || 'Model'})`}</span>
                    <span>•</span>
                    <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    {m.token_count ? (
                      <span style={{ color: 'var(--text-dim)', marginLeft: 'auto' }}>
                        {m.token_count} toks
                      </span>
                    ) : null}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{m.content}</div>
                </div>
              );
            })
          )}
          {loading && (
            <div className="chat-bubble chat-bubble-assistant" style={{ fontStyle: 'italic', color: 'var(--text-dim)' }}>
              🤖 Generating response through {selectedConnection?.name || 'Connector'}...
            </div>
          )}
        </div>

        {/* Error notification */}
        {error && (
          <div style={{ background: 'rgba(244, 63, 94, 0.15)', borderTop: '1px solid var(--accent-rose)', padding: '0.6rem 1rem', color: '#fecdd3', fontSize: '0.8125rem' }}>
            ⚠️ {error}
          </div>
        )}

        {/* Input Bar */}
        <div className="chat-input-bar">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleExecute();
              }
            }}
            placeholder={`Message ${selectedProject?.name || 'project'} as [${selectedUserTag}]... (Press Enter to send)`}
            rows={2}
            style={{
              flex: 1,
              background: '#070a10',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem',
              color: 'var(--text-main)',
              fontSize: '0.875rem',
              resize: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleExecute}
            disabled={loading || !selectedConnection || !prompt.trim()}
            style={{
              background: 'var(--gradient-brand)',
              color: '#ffffff',
              padding: '0 1.5rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '0.875rem',
              boxShadow: 'var(--shadow-glow)',
              opacity: loading || !prompt.trim() ? 0.6 : 1,
              cursor: loading || !prompt.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              minHeight: '44px',
            }}
          >
            {loading ? 'Sending...' : '🚀 Send'}
          </button>
        </div>

        {/* Token Metrics summary footer */}
        {lastMetrics && (
          <div style={{ display: 'flex', gap: '1.25rem', padding: '0.5rem 1.25rem', background: 'rgba(0, 0, 0, 0.3)', borderTop: '1px solid var(--border-subtle)', fontSize: '0.75rem', color: 'var(--text-dim)', flexWrap: 'wrap' }}>
            <div>Last Request Tokens: <strong style={{ color: 'var(--accent-amber)' }}>{lastMetrics.tokens_consumed_request || lastMetrics.tokens_consumed_total}</strong></div>
            <div>Token Pool Balance: <strong style={{ color: 'var(--accent-emerald)' }}>{lastMetrics.tokens_available}</strong></div>
            <div>Refill Rate: <strong>{lastMetrics.refill_rate_per_second}/s</strong></div>
          </div>
        )}
      </div>
    </div>
  );
};
