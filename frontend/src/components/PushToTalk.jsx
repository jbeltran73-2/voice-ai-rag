export default function PushToTalk({
  isRecording,
  isConnected,
  micAvailable,
  onStart,
  onStop,
  status
}) {
  const handlePointerDown = (e) => {
    e.preventDefault();
    if (!micAvailable) return;
    onStart();
  };

  const handlePointerUp = (e) => {
    e.preventDefault();
    if (isRecording) onStop();
  };

  const handleKeyDown = (e) => {
    if (e.code === 'Space' && !e.repeat && !e.target.closest('.text-input')) {
      e.preventDefault();
      if (!micAvailable) return;
      if (!isRecording) onStart();
    }
  };

  const handleKeyUp = (e) => {
    if (e.code === 'Space' && !e.target.closest('.text-input')) {
      e.preventDefault();
      if (isRecording) onStop();
    }
  };

  // Attach keyboard listeners
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
  }

  return (
    <div className="ptt-area">
      <button
        className={`ptt-button${isRecording ? ' active' : ''}${!micAvailable ? ' disabled' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        disabled={!micAvailable}
        aria-label={isRecording ? 'Release to stop recording' : 'Hold to talk'}
        role="button"
      >
        {isRecording ? '⏺' : '🎤'}
      </button>
      <div className="ptt-label">
        {micAvailable ? 'Hold to Talk (or Space)' : 'Microphone unavailable'}
      </div>
      <div className="ptt-status">{status || ''}</div>
    </div>
  );
}
