import { matchChunks } from '../db/supabase.js';
import { embedQuery } from './embedder.js';

const TOP_K = 8;

export async function retrieve(query) {
  const embedding = await embedQuery(query);
  const embeddingStr = `[${embedding.join(',')}]`;
  return matchChunks(embeddingStr, 0.3, TOP_K);
}

export async function retrieveWithCitations(query) {
  const chunks = await retrieve(query);
  const context = chunks.map(c => c.content).join('\n\n---\n\n');
  const citations = chunks.map(c => ({
    filename: c.metadata?.filename || 'unknown',
    page: c.metadata?.page || 1
  }));

  const seen = new Set();
  const uniqueCitations = citations.filter(c => {
    const key = `${c.filename}:${c.page}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { context, citations: uniqueCitations };
}
