// Direct SQL access to Supabase via the pg/query endpoint
// This bypasses PostgREST schema limitations
// NOTE: pg/query does NOT support parameterized queries, so we sanitize manually

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export async function sql(query) {
  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SQL error: ${res.status} ${err}`);
  }

  return res.json();
}

function escapeStr(str) {
  return String(str).replace(/'/g, "''");
}

function escapeId(id) {
  return String(id).replace(/"/g, '""');
}

export async function insertDocument(filename, fileSize, status = 'uploading') {
  const rows = await sql(
    `INSERT INTO voicechat.documents (filename, file_size, status) VALUES ('${escapeStr(filename)}', ${fileSize}, '${escapeStr(status)}') RETURNING *`
  );
  return rows[0];
}

export async function updateDocument(id, updates) {
  const setClause = Object.entries(updates)
    .map(([k, v]) => {
      if (typeof v === 'number') return `${k} = ${v}`;
      return `${k} = '${escapeStr(v)}'`;
    })
    .join(', ');
  const rows = await sql(
    `UPDATE voicechat.documents SET ${setClause} WHERE id = '${escapeStr(id)}' RETURNING *`
  );
  return rows[0];
}

export async function getDocuments() {
  return sql(`SELECT * FROM voicechat.documents ORDER BY created_at DESC`);
}

export async function deleteDocument(id) {
  await sql(`DELETE FROM voicechat.documents WHERE id = '${escapeStr(id)}'`);
}

export async function insertChunks(chunks) {
  if (chunks.length === 0) return;

  // Batch insert to avoid "Request body is too large" on large PDFs.
  // Each chunk carries a 1536-dim embedding (~30KB serialized), so we keep
  // batches small.
  const BATCH = 25;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const values = slice.map(c =>
      `('${escapeStr(c.document_id)}', '${escapeStr(c.content)}', '${c.embedding}'::vector, '${escapeStr(JSON.stringify(c.metadata))}'::jsonb)`
    ).join(', ');

    await sql(
      `INSERT INTO voicechat.chunks (document_id, content, embedding, metadata) VALUES ${values}`
    );
  }
}

export async function matchChunks(queryEmbedding, matchThreshold = 0.3, matchCount = 8) {
  return sql(
    `SELECT * FROM voicechat.match_chunks('${queryEmbedding}'::vector, ${matchThreshold}, ${matchCount})`
  );
}
