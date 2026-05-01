import { useRef, useEffect } from 'react';

export default function Transcript({ messages, isThinking }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isThinking]);

  if (messages.length === 0 && !isThinking) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <p className="empty-title">Ready when you are</p>
        <p className="empty-sub">Tap the mic to start talking, or upload documents to ask questions</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="transcript" role="log" aria-label="Conversation transcript">
      {messages.map((msg, i) => (
        <div key={i} className={`message message-${msg.role}`}>
          <span>{msg.text}</span>
          {msg.citations && msg.citations.length > 0 && (
            <div className="citations">
              {msg.citations.map((c, j) => (
                <span key={j} className="citation">
                  {c.filename} · p.{c.page}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      {isThinking && (
        <div className="thinking" aria-label="Assistant is thinking">
          <span></span><span></span><span></span>
        </div>
      )}
    </div>
  );
}
