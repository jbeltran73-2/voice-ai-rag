import { Router } from 'express';
import { getDocuments, deleteDocument } from '../db/supabase.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const docs = await getDocuments();
    res.json({ documents: docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteDocument(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
