export default function Transcript({ messages, isThinking }) {
  if (messages.length === 0 && !isThinking) {
    return (
      <div className="empty-state">
        <div>
          <p style={{ fontSize: 32, marginBottom: 12 }}>🎙</p>
          <p>Hold the button below to talk</p>
          <p style={{ marginTop: 8, fontSize: 12 }}>Or upload documents and ask questions</p>
        </div>
      </div>
    );
  }

  return (
    <div className="transcript" role="log" aria-label="Conversation transcript">
      {messages.map((msg, i) => (
        <div key={i} className={`message message-${msg.role}`}>
          <span>{msg.text}</span>
          {msg.citations && msg.citations.length > 0 && (
            <div className="citations">
              {msg.citations.map((c, j) => (
                <span key={j} className="citation">
                  {c.filename}, p.{c.page}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      {isThinking && (
        <div className="thinking">Thinking...</div>
      )}
    </div>
  );
}
