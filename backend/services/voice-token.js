const XAI_API_URL = 'https://api.x.ai/v1/realtime/client_secrets';

export async function createEphemeralToken() {
  const apiKey = process.env.XAI_API_KEY;

  const res = await fetch(XAI_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'grok-voice-think-fast-1.0',
      voice: 'ariel',
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500
      },
      tools: [
        {
          type: 'function',
          name: 'search_documents',
          description: 'Search uploaded documents for relevant information. Call this whenever the user asks a question that might require document context.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query to find relevant document passages'
              }
            },
            required: ['query']
          }
        }
      ]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create ephemeral token: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data;
}
