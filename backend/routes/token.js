import { Router } from 'express';
import { createEphemeralToken } from '../services/voice-token.js';

const router = Router();

router.post('/', async (_req, res) => {
  try {
    const tokenData = await createEphemeralToken();
    res.json(tokenData);
  } catch (err) {
    console.error('Token creation error:', err);
    res.status(500).json({ error: 'Failed to create token', detail: err.message });
  }
});

export default router;
