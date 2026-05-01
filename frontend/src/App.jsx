import { useState, useCallback } from 'react';
import './styles/index.css';
import ThemeToggle from './components/ThemeToggle';
import FileUploader from './components/FileUploader';
import Transcript from './components/Transcript';
import PushToTalk from './components/PushToTalk';
import TextInput from './components/TextInput';
import { useVoiceAgent } from './hooks/useVoiceAgent';

export default function App() {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Append/extend transcript entries.
  // - Final user transcripts always create a new bubble.
  // - Assistant streaming deltas extend the last assistant bubble if it is
  //   still "open" (created in this turn). Otherwise they create a new one.
  // The previous turn's assistant message is left untouched.
  const handleTranscript = useCallback((text, role, isFinal) => {
    setMessages(prev => {
      if (role === 'user' && isFinal) {
        return [...prev, { role: 'user', text }];
      }

      if (role === 'assistant' && !isFinal) {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last._streaming) {
          const updated = prev.slice();
          updated[updated.length - 1] = { ...last, text: last.text + text };
          return updated;
        }
        return [...prev, { role: 'assistant', text, citations: [], _streaming: true }];
      }

      // Final assistant transcript (rare path): close the streaming bubble.
      if (role === 'assistant' && isFinal) {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last._streaming) {
          const updated = prev.slice();
          updated[updated.length - 1] = { ...last, text, _streaming: false };
          return updated;
        }
        return [...prev, { role: 'assistant', text, citations: [] }];
      }

      return prev;
    });
  }, []);

  // Called when the model finishes a turn — close any open assistant bubble.
  const handleTurnComplete = useCallback(() => {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant' && last._streaming) {
        const updated = prev.slice();
        updated[updated.length - 1] = { ...last, _streaming: false };
        return updated;
      }
      return prev;
    });
  }, []);

  const handleCitations = useCallback((citations) => {
    setMessages(prev => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === 'assistant') { idx = i; break; }
      }
      if (idx < 0) return prev;
      const updated = prev.slice();
      updated[idx] = { ...updated[idx], citations };
      return updated;
    });
  }, []);

  const {
    isRecording,
    isConnected,
    isThinking,
    micAvailable,
    toggleRecording,
    sendText
  } = useVoiceAgent({
    onTranscript: handleTranscript,
    onCitations: handleCitations,
    onStatusChange: setStatus,
    onTurnComplete: handleTurnComplete
  });

  return (
    <div className="app">
      <div
        className={`sidebar-overlay${sidebarOpen ? ' visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-header">
          <h2>Documents</h2>
          <ThemeToggle />
        </div>
        <FileUploader />
      </aside>
      <main className="main">
        <header className="assistant-header">
          <button
            className="menu-btn"
            onClick={() => setSidebarOpen(v => !v)}
            aria-label="Toggle documents"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="assistant-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="10" rx="2"/>
              <circle cx="12" cy="5" r="2"/>
              <path d="M12 7v4"/>
              <line x1="8" y1="16" x2="8" y2="16"/>
              <line x1="16" y1="16" x2="16" y2="16"/>
            </svg>
          </div>
          <div className="assistant-info">
            <span className="assistant-name">Agent Voice</span>
            <span className={`assistant-status${isConnected ? '' : ' offline'}`}>
              <span className="dot"></span>
              {isConnected ? 'Available' : 'Offline'}
            </span>
          </div>
        </header>
        <Transcript messages={messages} isThinking={isThinking} />
        <PushToTalk
          isRecording={isRecording}
          isConnected={isConnected}
          micAvailable={micAvailable}
          onToggle={toggleRecording}
          status={status}
        />
        <TextInput onSend={sendText} disabled={isThinking} />
      </main>
    </div>
  );
}
