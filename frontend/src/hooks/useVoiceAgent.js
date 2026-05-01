import { useState, useRef, useCallback, useEffect } from 'react';

const API_BASE = '/api';
const XAI_REALTIME_URL = 'wss://api.x.ai/v1/realtime';
const XAI_AUDIO_RATE = 24000;

function float32ToPCM16Base64(float32Array) {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64PCM16ToFloat32(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const pcm16 = new Int16Array(bytes.buffer);
  const f32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    f32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
  }
  return f32;
}

const CHUNK_DURATION_MS = 100;

// Downsample Float32 PCM from native rate to target rate (linear interpolation)
function downsample(float32Array, fromRate, toRate) {
  if (fromRate === toRate) return float32Array;
  const ratio = fromRate / toRate;
  const newLength = Math.round(float32Array.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, float32Array.length - 1);
    const frac = srcIdx - lo;
    result[i] = float32Array[lo] * (1 - frac) + float32Array[hi] * frac;
  }
  return result;
}

export function useVoiceAgent({ onTranscript, onCitations, onStatusChange, onTurnComplete }) {
  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const micStreamRef = useRef(null);
  const micSourceRef = useRef(null);
  const micWorkletRef = useRef(null);
  const nextPlaybackTimeRef = useRef(0);
  const scheduledSourcesRef = useRef([]);
  const connectingRef = useRef(false);
  const isSessionConfiguredRef = useRef(false);
  const isAssistantSpeakingRef = useRef(false);
  const workletReadyRef = useRef(false);
  const playAudioRef = useRef(null);
  const stopPlaybackRef = useRef(null);
  const handleRAGCallRef = useRef(null);
  const configureSessionRef = useRef(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [micAvailable, setMicAvailable] = useState(true);

  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then(stream => { stream.getTracks().forEach(t => t.stop()); setMicAvailable(true); })
      .catch(() => setMicAvailable(false));
  }, []);

  // ─── Audio Context (native sample rate) ──────────────────
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
      // Force speaker output on mobile (avoid earpiece/call mode)
      if (typeof audioCtxRef.current.setSinkId === 'function') {
        try { audioCtxRef.current.setSinkId('speaker'); } catch (_) {}
      }
      console.log('Audio context at native rate:', audioCtxRef.current.sampleRate);
    }
    return audioCtxRef.current;
  }, []);

  // ─── Connect ───────────────────────────────────────────
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return wsRef.current;
    if (connectingRef.current) return null;
    connectingRef.current = true;
    onStatusChange?.('Connecting...');

    try {
      // 1. Get ephemeral token from our backend
      const res = await fetch(`${API_BASE}/token`, { method: 'POST' });
      if (!res.ok) throw new Error('Token request failed');
      const tokenData = await res.json();
      const ephemeralToken = tokenData.value;

      // 2. Open WebSocket to xAI using OpenAI-compatible subprotocol
      const ws = new WebSocket(
        `${XAI_REALTIME_URL}?model=grok-voice-think-fast-1.0`,
        [
          'realtime',
          `openai-insecure-api-key.${ephemeralToken}`,
          'openai-beta.realtime-v1',
        ]
      );

      // 3. Wire up message handler BEFORE waiting for open,
      //    so we don't miss the early session.created event.
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        handleMessage(msg, ws);
      };
      ws.onclose = () => {
        setIsConnected(false);
        setIsRecording(false);
        setIsThinking(false);
        wsRef.current = null;
        isSessionConfiguredRef.current = false;
        onStatusChange?.('Disconnected');
        onTurnComplete?.();
      };
      ws.onerror = () => onStatusChange?.('WebSocket error');

      // 4. Wait for open (handlers are already wired, so session.created won't be missed)
      await new Promise((resolve, reject) => {
        if (ws.readyState === WebSocket.OPEN) { resolve(); return; }
        ws.onopen = resolve;
        ws.onerror = () => reject(new Error('WebSocket open failed'));
        setTimeout(() => reject(new Error('Connection timeout')), 10000);
      });

      wsRef.current = ws;
      setIsConnected(true);

      // 5. Send session.update immediately on open (like the official xAI example),
      //    rather than waiting for session.created to arrive.
      configureSessionRef.current?.(ws);
      onStatusChange?.('Connected, configuring...');
      return ws;
    } catch (err) {
      console.error('Connect error:', err);
      onStatusChange?.('Connection failed: ' + err.message);
      return null;
    } finally {
      connectingRef.current = false;
    }
  }, [onStatusChange, onTurnComplete]);

  // ─── Handle incoming messages ───────────────────────────
  const handleMessage = useCallback((msg, ws) => {
    switch (msg.type) {
      // Session lifecycle
      case 'session.created':
        console.log('Session:', msg.session?.id);
        break;

      case 'session.updated':
        if (!isSessionConfiguredRef.current) {
          isSessionConfiguredRef.current = true;
          console.log('Session configured, ready for voice');
          onStatusChange?.('Ready - click mic to talk');
        }
        break;

      // User speech started — cancel ongoing response and stop playback
      case 'input_audio_buffer.speech_started':
        console.log('Speech started');
        isAssistantSpeakingRef.current = false;
        stopPlaybackRef.current?.();
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'response.cancel' }));
        }
        onStatusChange?.('Listening...');
        break;

      // User audio committed (done speaking)
      case 'input_audio_buffer.committed':
        console.log('Audio committed');
        onStatusChange?.('Processing...');
        break;

      // User transcript via conversation.item.added
      case 'conversation.item.added':
        if (msg.item?.role === 'user' && msg.item?.content) {
          for (const content of msg.item.content) {
            if (content.type === 'input_audio' && content.transcript) {
              onTranscript?.(content.transcript, 'user', true);
              break;
            }
          }
        }
        break;

      // Assistant audio streaming — gate mic while speaking
      case 'response.output_audio.delta':
        isAssistantSpeakingRef.current = true;
        if (msg.delta) playAudioRef.current?.(msg.delta);
        break;

      // Assistant transcript streaming
      case 'response.output_audio_transcript.delta':
        if (msg.delta) onTranscript?.(msg.delta, 'assistant', false);
        break;

      // Function call from Grok → do RAG
      case 'response.function_call_arguments.done':
        if (msg.name === 'search_documents') handleRAGCallRef.current?.(msg, ws);
        break;

      // Response lifecycle
      case 'response.created':
        setIsThinking(true);
        break;
      case 'response.done':
        isAssistantSpeakingRef.current = false;
        setIsThinking(false);
        onStatusChange?.('Ready');
        onTurnComplete?.();
        break;

      case 'error':
        console.error('xAI error:', msg.message || msg);
        setIsThinking(false);
        onStatusChange?.('Error: ' + (msg.message || 'unknown'));
        break;

      default:
        break;
    }
  }, [onTranscript, onCitations, onStatusChange, onTurnComplete]);

  // ─── Configure session (xAI format) ─────────────────────
  const configureSession = useCallback((ws) => {
    const sessionConfig = {
      type: 'session.update',
      session: {
        instructions: [
          'You are a voice assistant that helps the user explore their personal collection of uploaded documents (PDFs, notes, reports).',
          '',
          'CRITICAL RULES — follow them in order:',
          '1. For ANY question that involves a concrete piece of information — products, plans, services, names, dates, prices, contracts, reports, internal data, or anything that could plausibly appear in the user\'s documents — you MUST call the search_documents function FIRST before answering. Do NOT say "I don\'t have that information", "no tengo información sobre…", "no conozco ese plan", or anything similar without first invoking search_documents.',
          '2. After calling search_documents, base your answer strictly on the returned context. Cite the source by filename and page number when possible.',
          '3. ONLY if search_documents returns no relevant context (or returns "No documents found.") may you tell the user that you don\'t have that information in their documents. Phrase it naturally, e.g. "No tengo esa información en tus documentos" / "I don\'t have that in your documents."',
          '4. For greetings, small talk, or meta questions about how to use the app, you don\'t need to search.',
          '5. Always reply in the same language the user is speaking. If the user speaks Spanish, reply in Spanish.',
          '6. Keep responses concise and conversational since they will be spoken out loud. Avoid long lists; summarize naturally.',
        ].join('\n'),
        voice: 'yy6flpd9dq90',
        turn_detection: {
          type: 'server_vad',
          threshold: 0.85,
          silence_duration_ms: 0,
        },
        input_audio_transcription: {
          model: 'grok-2-audio',
        },
        audio: {
          input: {
            format: {
              type: 'audio/pcm',
              rate: XAI_AUDIO_RATE,
            },
          },
          output: {
            format: {
              type: 'audio/pcm',
              rate: XAI_AUDIO_RATE,
            },
          },
        },
        tools: [{
          type: 'function',
          name: 'search_documents',
          description: 'Search uploaded documents for relevant information. Call this whenever the user asks a question that might require document context.',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string', description: 'The search query to find relevant document passages' } },
            required: ['query']
          }
        }]
      }
    };
    ws.send(JSON.stringify(sessionConfig));
    console.log('Session update sent with rate:', XAI_AUDIO_RATE);
  }, []);
  configureSessionRef.current = configureSession;

  // ─── RAG function call handler ──────────────────────────
  const handleRAGCall = useCallback(async (msg, ws) => {
    setIsThinking(true);
    try {
      const args = JSON.parse(msg.arguments);
      const res = await fetch(`${API_BASE}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: args.query })
      });
      const data = await res.json();
      if (data.citations?.length) onCitations?.(data.citations);

      if (ws?.readyState === WebSocket.OPEN) {
        // Send function result
        ws.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: msg.call_id,
            output: JSON.stringify({ context: data.context || 'No documents found.', citations: data.citations || [] })
          }
        }));
        // Request next response
        ws.send(JSON.stringify({ type: 'response.create' }));
      }
    } catch (err) {
      console.error('RAG call error:', err);
      setIsThinking(false);
    }
  }, [onCitations]);
  handleRAGCallRef.current = handleRAGCall;

  // ─── Audio playback (gapless scheduling) ───────────────
  // Incoming audio is PCM16 at 24000 Hz from xAI. We create the AudioBuffer
  // at 24000 Hz and let the AudioContext resample to its native rate on playback.
  // We also force the AudioContext output to the speaker (not earpiece) on mobile.
  const playAudio = useCallback((base64) => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') ctx.resume();

      const float32Data = base64PCM16ToFloat32(base64);
      const buf = ctx.createBuffer(1, float32Data.length, XAI_AUDIO_RATE);
      buf.getChannelData(0).set(float32Data);

      const src = ctx.createBufferSource();
      src.buffer = buf;
      // Route to speaker (not earpiece) on mobile
      const sinkId = ctx.sinkId || '';
      if (sinkId !== 'speaker' && typeof ctx.setSinkId === 'function') {
        try { ctx.setSinkId('speaker'); } catch (_) {}
      }
      src.connect(ctx.destination);

      const now = ctx.currentTime;
      nextPlaybackTimeRef.current = Math.max(now, nextPlaybackTimeRef.current);
      src.start(nextPlaybackTimeRef.current);
      nextPlaybackTimeRef.current += buf.duration;

      scheduledSourcesRef.current.push(src);
      src.onended = () => {
        scheduledSourcesRef.current = scheduledSourcesRef.current.filter(s => s !== src);
      };
    } catch (err) {
      console.error('Playback error:', err);
    }
  }, [getAudioContext]);
  playAudioRef.current = playAudio;

  const stopPlayback = useCallback(() => {
    scheduledSourcesRef.current.forEach(s => {
      try { s.stop(); s.disconnect(); } catch (_) {}
    });
    scheduledSourcesRef.current = [];
    nextPlaybackTimeRef.current = audioCtxRef.current?.currentTime || 0;
  }, []);
  stopPlaybackRef.current = stopPlayback;

  // ─── Start mic + streaming ──────────────────────────────
  const startRecording = useCallback(async () => {
    if (!micAvailable) return;

    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') await ctx.resume();
      const nativeSampleRate = ctx.sampleRate;

      // Load AudioWorklet module if not already loaded
      if (!workletReadyRef.current) {
        await ctx.audioWorklet.addModule('/pcm-processor.js');
        workletReadyRef.current = true;
      }

      // Get mic stream — keep echoCancellation ON to prevent feedback loop
      // (mic picking up speaker output). Speaker routing is handled by
      // AudioContext.setSinkId('speaker') instead of disabling echoCancellation.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: nativeSampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      micStreamRef.current = stream;

      const source = ctx.createMediaStreamSource(stream);
      micSourceRef.current = source;

      // AudioWorkletNode — runs on dedicated audio thread, not main thread
      const worklet = new AudioWorkletNode(ctx, 'pcm-processor');

      let audioBuffer = [];
      let totalSamples = 0;
      const chunkSizeSamples = (ctx.sampleRate * CHUNK_DURATION_MS) / 1000;

      worklet.port.onmessage = (e) => {
        const inputData = e.data;
        audioBuffer.push(inputData);
        totalSamples += inputData.length;

        while (totalSamples >= chunkSizeSamples) {
          const chunk = new Float32Array(chunkSizeSamples);
          let offset = 0;

          while (offset < chunkSizeSamples && audioBuffer.length > 0) {
            const buf = audioBuffer[0];
            const needed = chunkSizeSamples - offset;
            const available = buf.length;

            if (available <= needed) {
              chunk.set(buf, offset);
              offset += available;
              totalSamples -= available;
              audioBuffer.shift();
            } else {
              chunk.set(buf.subarray(0, needed), offset);
              audioBuffer[0] = buf.subarray(needed);
              offset += needed;
              totalSamples -= needed;
            }
          }

          // Downsample from native rate to 24000 Hz before sending
          const resampled = downsample(chunk, ctx.sampleRate, XAI_AUDIO_RATE);

          const ws = wsRef.current;
          if (ws?.readyState === WebSocket.OPEN && isSessionConfiguredRef.current && !isAssistantSpeakingRef.current) {
            ws.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: float32ToPCM16Base64(resampled)
            }));
          }
        }
      };

      source.connect(worklet);
      // Mute local feedback (we don't want to hear ourselves)
      const muteGain = ctx.createGain();
      muteGain.gain.value = 0;
      worklet.connect(muteGain);
      muteGain.connect(ctx.destination);
      micWorkletRef.current = worklet;

      // Connect WebSocket
      const ws = await connect();
      if (!ws) {
        worklet.disconnect();
        source.disconnect();
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      setIsRecording(true);
      onStatusChange?.('Connecting...');
    } catch (err) {
      console.error('Mic denied:', err);
      setMicAvailable(false);
      onStatusChange?.('Microphone denied');
    }
  }, [micAvailable, connect, getAudioContext, onStatusChange]);

  // ─── Stop mic ──────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (micWorkletRef.current) {
      micWorkletRef.current.port.close();
      micWorkletRef.current.disconnect();
      micWorkletRef.current = null;
    }
    if (micSourceRef.current) { micSourceRef.current.disconnect(); micSourceRef.current = null; }
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null; }

    setIsRecording(false);
    onStatusChange?.('Stopped');
  }, [onStatusChange]);

  // ─── Toggle ──────────────────────────────────────────
  const toggleRecording = useCallback(() => {
    if (isRecording) stopRecording();
    else startRecording();
  }, [isRecording, startRecording, stopRecording]);

  // ─── Text fallback ───────────────────────────────────
  const sendText = useCallback(async (text) => {
    const ctx = getAudioContext();
    const ws = wsRef.current?.readyState === WebSocket.OPEN
      ? wsRef.current
      : await connect();
    if (!ws) return;

    onTranscript?.(text, 'user', true);
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] }
    }));
    ws.send(JSON.stringify({ type: 'response.create' }));
    setIsThinking(true);
  }, [connect, getAudioContext, onTranscript]);

  // ─── Cleanup ───────────────────────────────────────────
  useEffect(() => () => {
    wsRef.current?.close();
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close();
  }, []);

  return { isRecording, isConnected, isThinking, micAvailable, toggleRecording, startRecording, stopRecording, sendText, connect };
}
