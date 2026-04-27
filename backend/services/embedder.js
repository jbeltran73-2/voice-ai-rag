const OPENROUTER_URL = 'https://openrouter.ai/api/v1/embeddings';
const MODEL = 'openai/text-embedding-3-small';

export async function embedTexts(texts) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const batchSize = 64;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://voice-chat-xai.app',
        'X-Title': 'Voice Chat xAI'
      },
      body: JSON.stringify({
        model: MODEL,
        input: batch
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Embedding API error: ${res.status} ${err}`);
    }

    const data = await res.json();
    // Sort by index to maintain order
    data.data.sort((a, b) => a.index - b.index);
    allEmbeddings.push(...data.data.map(d => d.embedding));
  }

  return allEmbeddings;
}

export async function embedQuery(text) {
  const embeddings = await embedTexts([text]);
  return embeddings[0];
}
