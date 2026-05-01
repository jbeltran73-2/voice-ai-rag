import { useState, useCallback, useRef, useEffect } from 'react';

const API_BASE = '/api';

export default function FileUploader({ onUploadComplete }) {
  const [documents, setDocuments] = useState([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/documents`);
      const data = await res.json();
      const docs = data.documents || [];
      setDocuments(docs);
      return docs;
    } catch (err) {
      console.error('Fetch docs error:', err);
      return [];
    }
  }, []);

  // Initial load
  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

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
      const targetIds = new Set((data.documents || []).map(d => d.id).filter(Boolean));

      // Poll for completion (read fresh state, not the stale upload response)
      const MAX_TRIES = 90; // 3 min cap
      let tries = 0;
      const pollInterval = setInterval(async () => {
        tries++;
        const fresh = await fetchDocuments();
        const watched = fresh.filter(d => targetIds.has(d.id));
        const allDone =
          watched.length === targetIds.size &&
          watched.every(d => d.status === 'indexed' || d.status === 'error');
        if (allDone || tries >= MAX_TRIES) clearInterval(pollInterval);
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
        <div className="icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <p>Drop PDF, TXT, or MD files</p>
        <p className="hint">or click to browse</p>
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
              <span className="chunks">{doc.chunk_count}</span>
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
