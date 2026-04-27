import { useState, useCallback, useRef } from 'react';
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
  const transcriptEndRef = useRef(null);
  const partialRef = useRef({});

  const handleTranscript = useCallback((text, role, isFinal) => {
    if (isFinal) {
      setMessages(prev => {
        // Remove any partial message for this role and add final
        const filtered = partialRef.current.key
          ? prev.filter((_, i) => i !== partialRef.current.key)
          : prev;
        return [...filtered, { role, text, citations: role === 'assistant' ? [] : undefined }];
      });
      partialRef.current = {};
    } else {
      // Update partial assistant message
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && !last._final) {
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, text: last.text + text };
          return updated;
        }
        const key = prev.length;
        partialRef.current = { key };
        return [...prev, { role, text, _final: false }];
      });
    }
    // Auto scroll
    setTimeout(() => transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  const handleCitations = useCallback((citations) => {
    setMessages(prev => {
      const updated = [...prev];
      const lastAssistant = [...updated].reverse().findIndex(m => m.role === 'assistant');
      if (lastAssistant >= 0) {
        const idx = updated.length - 1 - lastAssistant;
        updated[idx] = { ...updated[idx], citations };
      }
      return updated;
    });
  }, []);

  const {
    isRecording,
    isConnected,
    isThinking,
    micAvailable,
    connect,
    startRecording,
    stopRecording,
    sendText
  } = useVoiceAgent({
    onTranscript: handleTranscript,
    onCitations: handleCitations,
    onStatusChange: setStatus
  });

  const handleStart = useCallback(async () => {
    if (!isConnected) await connect();
    startRecording();
  }, [isConnected, connect, startRecording]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Documents</h2>
          <ThemeToggle />
        </div>
        <FileUploader />
      </aside>
      <main className="main">
        <Transcript messages={messages} isThinking={isThinking} />
        <div ref={transcriptEndRef} />
        {micAvailable && (
          <PushToTalk
            isRecording={isRecording}
            isConnected={isConnected}
            micAvailable={micAvailable}
            onStart={handleStart}
            onStop={stopRecording}
            status={status}
          />
        )}
        <TextInput onSend={sendText} disabled={isThinking} />
      </main>
    </div>
  );
}
