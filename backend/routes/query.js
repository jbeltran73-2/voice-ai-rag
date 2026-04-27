import { Router } from 'express';
import { retrieveWithCitations } from '../services/retriever.js';

const router = Router();

// Simple LRU cache
const cache = new Map();
const CACHE_MAX = 100;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

router.post('/', async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query is required' });
  }

  // Check cache
  const cacheKey = query.toLowerCase().trim();
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.ts < CACHE_TTL) {
      return res.json({ ...cached.data, cached: true });
    }
    cache.delete(cacheKey);
  }

  try {
    const data = await retrieveWithCitations(query);

    if (!data.context || data.context.length === 0) {
      return res.json({
        context: '',
        citations: [],
        answer: 'No evidence. Please upload files.'
      });
    }

    // Cache result
    const result = { context: data.context, citations: data.citations };
    if (cache.size >= CACHE_MAX) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    cache.set(cacheKey, { data: result, ts: Date.now() });

    res.json(result);
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({ error: 'Query failed', detail: err.message });
  }
});

export default router;
