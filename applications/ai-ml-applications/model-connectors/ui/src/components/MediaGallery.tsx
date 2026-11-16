import React, { useState } from 'react';
import { apiClient } from '@/services/api';
import { FileUtils } from '@/utils/file_utils';

export const MediaGallery: React.FC = () => {
  const [selectedImage, setSelectedImage] = useState('ModelConnectors_00001_.png');
  const [activeMediaTab, setActiveMediaTab] = useState<'image' | 'video'>('image');

  const imageUrl = apiClient.getImageUrl('comfyui-docker', selectedImage);
  const videoUrl = apiClient.getVideoStreamUrl('comfyui-docker', 'video_stream_01.mp4');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🎥 Multimedia Viewer & Video Streamer
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Inspect high-fidelity diffusion images and stream chunked video directly from ComfyUI / Model services.
            </p>
          </div>

          <div className="nav-tabs">
            <button
              className={`nav-tab ${activeMediaTab === 'image' ? 'active' : ''}`}
              onClick={() => setActiveMediaTab('image')}
            >
              🖼️ Static Images
            </button>
            <button
              className={`nav-tab ${activeMediaTab === 'video' ? 'active' : ''}`}
              onClick={() => setActiveMediaTab('video')}
            >
              🎬 Video Stream
            </button>
          </div>
        </div>

        {activeMediaTab === 'image' ? (
          <div>
            {/* Image Selector Controls */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {['ModelConnectors_00001_.png', 'ModelConnectors_00002_.png', 'flux_preview.png'].map((img) => (
                <button
                  key={img}
                  onClick={() => setSelectedImage(img)}
                  style={{
                    background: selectedImage === img ? 'var(--accent-indigo)' : 'rgba(255, 255, 255, 0.05)',
                    color: selectedImage === img ? '#fff' : 'var(--text-main)',
                    border: '1px solid var(--border-subtle)',
                    padding: '0.4rem 0.8rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8125rem',
                  }}
                >
                  {img}
                </button>
              ))}
            </div>

            {/* Image Viewer Container */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: '#040609',
                borderRadius: 'var(--radius-md)',
                padding: '2rem',
                border: '1px solid var(--border-subtle)',
                minHeight: '380px',
              }}
            >
              <img
                src={imageUrl}
                alt="Model Generated Artifact"
                style={{
                  maxWidth: '100%',
                  maxHeight: '460px',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: 'var(--shadow-lg)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
                onError={(e) => {
                  // Fallback visual placeholder
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-dim)', textAlign: 'center', display: 'flex', justifyContent: 'center', gap: '1rem' }}>
              <span>Asset: <strong>{FileUtils.getFilename(selectedImage)}</strong></span>
              <span>Format: <strong>{FileUtils.getFileExtension(selectedImage).toUpperCase()}</strong></span>
              <span>Endpoint: <code>/api/v1/media/image?connection_id=comfyui-docker&filename={selectedImage}</code></span>
            </div>
          </div>
        ) : (
          <div>
            {/* Video Player Container */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                background: '#040609',
                borderRadius: 'var(--radius-md)',
                padding: '1.5rem',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <video
                controls
                autoPlay
                muted
                loop
                style={{
                  maxWidth: '100%',
                  maxHeight: '460px',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: 'var(--shadow-lg)',
                }}
                src={videoUrl}
              >
                Your browser does not support HTML5 video streaming.
              </video>
              <div style={{ marginTop: '1rem', width: '100%', maxWidth: '640px', display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                <span>Codec: <strong>H.264 / MP4</strong></span>
                <span>Chunk Size: <strong>512 KB</strong></span>
                <span>Stream Protocol: <strong>HTTP Range Slices</strong></span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
