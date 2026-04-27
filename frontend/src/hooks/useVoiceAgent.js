import { useState, useRef, useCallback, useEffect } from 'react';

const API_BASE = '/api';
const WS_URL = 'wss://api.x.ai/v1/realtime';

export function useVoiceAgent({ onTranscript, onCitations, onStatusChange }) {
  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const processorRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [micAvailable, setMicAvailable] = useState(true);
  const playbackQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const currentAudioRef = useRef(null);

  // Connect to xAI Voice Agent via WebSocket
  const connect = useCallback(async () => {
    try {
      // Get ephemeral token from backend
      const res = await fetch(`${API_BASE}/token`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to get token');
      const tokenData = await res.json();
      const secret = tokenData.client_secret?.value || tokenData.key || tokenData;

      const ws = new WebSocket(`${WS_URL}?model=grok-voice-think-fast-1.0`, [
        'realtime',
        `xai-client-secret.${secret}`
      ]);

      ws.onopen = () => {
        setIsConnected(true);
        onStatusChange?.('Connected');
        // Configure session
        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500
            },
            tools: [{
              type: 'function',
              name: 'search_documents',
              description: 'Search uploaded documents for relevant information.',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Search query' }
                },
                required: ['query']
              }
            }]
          }
        }));
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        onStatusChange?.('Disconnected');
      };

      ws.onerror = (err) => {
        console.error('WS error:', err);
        onStatusChange?.('Error');
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('Connect error:', err);
      onStatusChange?.('Connection failed');
    }
  }, [onStatusChange]);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'session.created':
        break;

      case 'response.audio_transcript.delta': {
        // Partial transcript from assistant
        onTranscript?.(msg.delta, 'assistant', false);
        break;
      }

      case 'response.audio_transcript.done': {
        onTranscript?.(msg.transcript, 'assistant', true);
        break;
      }

      case 'conversation.item.input_audio_transcription.completed': {
        // User's speech was transcribed
        if (msg.transcript) {
          onTranscript?.(msg.transcript, 'user', true);
        }
        break;
      }

      case 'response.audio.delta': {
        // Audio chunk from assistant - queue for playback
        if (msg.delta) {
          queueAudio(msg.delta);
        }
        break;
      }

      case 'response.function_call_arguments.done': {
        // Grok is calling our search_documents tool
        handleFunctionCall(msg);
        break;
      }

      case 'response.done': {
        setIsThinking(false);
        break;
      }

      default:
        break;
    }
  }, [onTranscript, onCitations]);

  // Handle function call from Grok (search_documents)
  const handleFunctionCall = useCallback(async (msg) => {
    if (msg.name !== 'search_documents') return;
    setIsThinking(true);

    try {
      const args = JSON.parse(msg.arguments);
      const res = await fetch(`${API_BASE}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: args.query })
      });
      const data = await res.json();

      // Send citations to UI
      if (data.citations && data.citations.length > 0) {
        onCitations?.(data.citations);
      }

      // Send function result back to Grok
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: msg.call_id,
            output: JSON.stringify({
              context: data.context || 'No documents found.',
              citations: data.citations || []
            })
          }
        }));

        // Request Grok to generate a response with the context
        ws.send(JSON.stringify({ type: 'response.create' }));
      }
    } catch (err) {
      console.error('Function call error:', err);
      setIsThinking(false);
    }
  }, [onCitations]);

  // Audio playback
  const queueAudio = useCallback((base64Delta) => {
    const bytes = atob(base64Delta);
    const samples = new Int16Array(bytes.length / 2);
    for (let i = 0; i < bytes.length; i += 2) {
      samples[i / 2] = (bytes.charCodeAt(i + 1) << 8) | bytes.charCodeAt(i);
    }

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext({ sampleRate: 24000 });
    }

    const ctx = audioCtxRef.current;
    const float32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      float32[i] = samples[i] / 32768;
    }

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    playbackQueueRef.current.push(source);
    source.onended = () => {
      playbackQueueRef.current = playbackQueueRef.current.filter(s => s !== source);
      playNext();
    };

    if (!isPlayingRef.current) {
      playNext();
    }
  }, []);

  const playNext = () => {
    if (playbackQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }
    isPlayingRef.current = true;
    const source = playbackQueueRef.current.shift();
    source.start();
  };

  // Start recording (push-to-talk start)
  const startRecording = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await connect();
      // Small delay to let connection establish
      await new Promise(r => setTimeout(r, 500));
    }

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: 24000 });
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        const base64 = arrayBufferToBase64(pcm16.buffer);
        ws.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64
        }));
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
      processorRef.current = processor;

      setIsRecording(true);
    } catch (err) {
      console.error('Mic access denied:', err);
      setMicAvailable(false);
    }
  }, [connect]);

  // Stop recording (push-to-talk end)
  const stopRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      ws.send(JSON.stringify({ type: 'response.create' }));
    }

    setIsRecording(false);
  }, []);

  // Send text query (fallback)
  const sendText = useCallback(async (text) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await connect();
      await new Promise(r => setTimeout(r, 500));
    }

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    onTranscript?.(text, 'user', true);

    // Add user text message to conversation
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }]
      }
    }));

    ws.send(JSON.stringify({ type: 'response.create' }));
    setIsThinking(true);
  }, [connect, onTranscript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  return {
    isRecording,
    isConnected,
    isThinking,
    micAvailable,
    connect,
    startRecording,
    stopRecording,
    sendText
  };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
