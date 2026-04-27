// Chunk text into ~600 token segments with 10% overlap
// Approximation: 1 token ≈ 4 chars for English text

const CHUNK_TOKENS = 600;
const OVERLAP_TOKENS = 60;
const CHARS_PER_TOKEN = 4;

export function chunkText(text, page, filename) {
  const chunkSize = CHUNK_TOKENS * CHARS_PER_TOKEN; // ~2400 chars
  const overlapSize = OVERLAP_TOKENS * CHARS_PER_TOKEN; // ~240 chars
  const stepSize = chunkSize - overlapSize;

  if (text.length <= chunkSize) {
    return [{ content: text, metadata: { page, filename } }];
  }

  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const content = text.slice(start, end).trim();
    if (content.length > 0) {
      chunks.push({ content, metadata: { page, filename } });
    }
    start += stepSize;
    if (end === text.length) break;
  }
  return chunks;
}

export function chunkPages(pages, filename) {
  const allChunks = [];
  for (const { content, page } of pages) {
    const chunks = chunkText(content, page, filename);
    allChunks.push(...chunks);
  }
  return allChunks;
}
