import { Router } from 'express';
import multer from 'multer';
import { insertDocument, updateDocument, insertChunks } from '../db/supabase.js';
import { parseFile } from '../services/parser.js';
import { chunkPages } from '../services/chunker.js';
import { embedTexts } from '../services/embedder.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    if (ext.endsWith('.pdf') || ext.endsWith('.txt') || ext.endsWith('.md')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, TXT, and MD files are allowed'));
    }
  }
});

router.post('/', upload.array('files', 20), async (req, res) => {
  const files = req.files;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const results = [];
  for (const file of files) {
    const doc = await processFile(file);
    results.push(doc);
  }

  res.json({ documents: results });
});

async function processFile(file) {
  try {
    const doc = await insertDocument(file.originalname, file.size, 'processing');

    // Process asynchronously
    processDocument(doc.id, file).catch(err => {
      console.error(`Error processing ${file.originalname}:`, err);
      updateDocument(doc.id, { status: 'error' });
    });

    return { id: doc.id, filename: file.originalname, status: 'processing' };
  } catch (err) {
    return { filename: file.originalname, status: 'error', error: err.message };
  }
}

async function processDocument(docId, file) {
  const pages = await parseFile(file.buffer, file.mimetype, file.originalname);
  const chunks = chunkPages(pages, file.originalname);

  if (chunks.length === 0) {
    await updateDocument(docId, { status: 'indexed', chunk_count: 0 });
    return;
  }

  const texts = chunks.map(c => c.content);
  const embeddings = await embedTexts(texts);

  const rows = chunks.map((chunk, i) => ({
    document_id: docId,
    content: chunk.content,
    embedding: `[${embeddings[i].join(',')}]`,
    metadata: chunk.metadata
  }));

  await insertChunks(rows);
  await updateDocument(docId, { status: 'indexed', chunk_count: chunks.length });
}

export default router;
