const XAI_API_URL = 'https://api.x.ai/v1/realtime/client_secrets';

export async function createEphemeralToken() {
  const apiKey = process.env.XAI_API_KEY;

  // Only send expires_after - session config is done via session.update from the client
  const res = await fetch(XAI_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      expires_after: { seconds: 300 }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create ephemeral token: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data;
}
