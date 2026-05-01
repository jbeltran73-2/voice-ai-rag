import { useState, useCallback } from 'react';

export default function TextInput({ onSend, disabled }) {
  const [text, setText] = useState('');

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  }, [text, disabled, onSend]);

  return (
    <form className="text-input-area" onSubmit={handleSubmit}>
      <input
        className="text-input"
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a message..."
        disabled={disabled}
        aria-label="Text message input"
      />
      <button className="text-send" type="submit" disabled={disabled || !text.trim()}>
        Send
      </button>

    </form>
  );
}
