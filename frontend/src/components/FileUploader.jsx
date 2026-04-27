import { useState, useCallback, useRef } from 'react';

const API_BASE = '/api';

export default function FileUploader({ onUploadComplete }) {
  const [documents, setDocuments] = useState([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/documents`);
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (err) {
      console.error('Fetch docs error:', err);
    }
  }, []);

  // Initial load
  useState(() => { fetchDocuments(); });

  const uploadFiles = useCallback(async (files) => {
    const formData = new FormData();
    for (const f of files) {
      formData.append('files', f);
    }

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      // Poll for completion
      const pollInterval = setInterval(async () => {
        await fetchDocuments();
        const allDone = data.documents?.every(d => d.status === 'indexed' || d.status === 'error');
        if (allDone) clearInterval(pollInterval);
      }, 2000);

      onUploadComplete?.(data);
    } catch (err) {
      console.error('Upload error:', err);
    }
  }, [fetchDocuments, onUploadComplete]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) uploadFiles(files);
  }, [uploadFiles]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragging(false);
  }, []);

  const handleFileInput = useCallback((e) => {
    const files = Array.from(e.target.files);
    if (files.length) uploadFiles(files);
    e.target.value = '';
  }, [uploadFiles]);

  const deleteDocument = useCallback(async (id) => {
    await fetch(`${API_BASE}/documents/${id}`, { method: 'DELETE' });
    fetchDocuments();
  }, [fetchDocuments]);

  const statusClass = (status) => `status status-${status}`;

  return (
    <div className="uploader">
      <div
        className={`drop-zone${dragging ? ' dragover' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        aria-label="Upload files"
        tabIndex={0}
      >
        <div className="icon">📄</div>
        <p>Drop PDF, TXT, or MD files here</p>
        <p style={{ fontSize: 11, marginTop: 4 }}>or click to browse</p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md"
        multiple
        onChange={handleFileInput}
        style={{ display: 'none' }}
      />
      <ul className="doc-list">
        {documents.map(doc => (
          <li key={doc.id} className="doc-item">
            <span className="filename">{doc.filename}</span>
            <span className={statusClass(doc.status)}>{doc.status}</span>
            {doc.status === 'indexed' && (
              <span style={{ fontSize: 11, color: 'var(--muted)', margin: '0 8px' }}>
                {doc.chunk_count} chunks
              </span>
            )}
            <button
              className="delete-btn"
              onClick={() => deleteDocument(doc.id)}
              aria-label={`Delete ${doc.filename}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
