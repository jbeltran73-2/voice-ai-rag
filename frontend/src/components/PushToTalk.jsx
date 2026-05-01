import { useEffect } from 'react';

export default function PushToTalk({
  isRecording,
  isConnected,
  micAvailable,
  onToggle,
  status
}) {
  const handleClick = (e) => {
    e.preventDefault();
    if (!micAvailable) return;
    onToggle();
  };

  useEffect(() => {
    const onDown = (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      if (e.target?.closest?.('.text-input')) return;
      e.preventDefault();
      if (!micAvailable) return;
      if (!isRecording) onToggle();
    };
    const onUp = (e) => {
      if (e.code !== 'Space') return;
      if (e.target?.closest?.('.text-input')) return;
      e.preventDefault();
      if (isRecording) onToggle();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [isRecording, micAvailable, onToggle]);

  let label = 'Tap to speak';
  if (!micAvailable) label = 'Microphone unavailable';
  else if (isRecording) label = 'Listening — tap to stop';
  else if (!isConnected) label = 'Tap to connect & speak';

  return (
    <div className="ptt-area">
      <button
        className={`ptt-button${isRecording ? ' active' : ''}${!micAvailable ? ' disabled' : ''}`}
        onClick={handleClick}
        disabled={!micAvailable}
        aria-label={isRecording ? 'Stop recording' : 'Start talking'}
        role="switch"
        aria-pressed={isRecording}
      >
        <svg className="mic-icon" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <rect className="mic-head" x="24" y="14" width="16" height="28" rx="8" />
          <path className="mic-stand" d="M16 30 v4 a16 16 0 0 0 32 0 v-4" />
          <line className="mic-stand" x1="32" y1="50" x2="32" y2="56" />
          <line className="mic-stand" x1="24" y1="56" x2="40" y2="56" />
        </svg>
      </button>
      <div className="ptt-label">{label}</div>
      <div className="ptt-status">{status || ''}</div>
    </div>
  );
}
