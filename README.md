# Voice Chat RAG with xAI Realtime API

Push-to-talk voice assistant with RAG (Retrieval-Augmented Generation) using uploaded documents.

## Architecture

- **Frontend**: React 19 + Vite SPA with push-to-talk voice input
- **Backend**: Node.js/Express API for file upload, RAG retrieval, and ephemeral token generation
- **Voice**: xAI Grok Voice Agent API via WebSocket (`wss://api.x.ai/v1/realtime`)
- **Embeddings**: OpenAI `text-embedding-3-small` via OpenRouter
- **Database**: Supabase (PostgreSQL + pgvector) for document chunks with vector search

## Prerequisites

- Node.js 22+
- xAI API key ([console.x.ai](https://console.x.ai))
- OpenRouter API key ([openrouter.ai](https://openrouter.ai))
- Supabase instance with pgvector extension

## Setup

### 1. Database

Run `sql/schema.sql` on your Supabase instance to create the `voicechat` schema:

```bash
# If using the self-hosted Supabase at supabase.memba.es:
curl -s -X POST "https://api.supabase.memba.es/pg/query" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d @- < sql/schema.sql
```

### 2. Environment

Copy `.env.example` to `backend/.env` and fill in your keys:

```bash
cp .env.example backend/.env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `XAI_API_KEY` | Your xAI API key (for voice agent) |
| `OPENROUTER_API_KEY` | OpenRouter key (for embeddings + chat) |
| `SUPABASE_URL` | Supabase API URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `PORT` | Backend port (default 3001) |

### 3. Install & Run

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (in another terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Usage

1. **Upload documents**: Drag PDF, TXT, or MD files into the left panel
2. **Hold to Talk**: Press and hold the circular button (or hold Spacebar)
3. **Release**: The AI processes your speech, searches documents, and responds with audio
4. **Text fallback**: Type messages in the text input if mic is unavailable
5. **Citations**: Assistant responses include source citations `[filename, p.X]`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /upload` | POST | Upload files (PDF/TXT/MD) for indexing |
| `POST /query` | POST | RAG query: `{query: string}` returns context + citations |
| `GET /documents` | GET | List uploaded documents with status |
| `DELETE /documents/:id` | DELETE | Remove a document and its chunks |
| `POST /token` | POST | Create ephemeral WebSocket token for browser |

## RAG Pipeline

1. Files are parsed to Markdown (PDF via `pdf-parse`)
2. Text is chunked: 600 tokens, 10% overlap, with page metadata
3. Chunks are embedded with `text-embedding-3-small` (1536 dimensions)
4. Query retrieval: cosine similarity top_k=8 via pgvector
5. System prompt enforces citation-only answers

## Keyboard Shortcuts

- **Space** (hold): Push-to-talk
- **Ctrl+Enter**: Send text message

## Tech Stack

- xAI Grok Voice Agent API (`grok-voice-think-fast-1.0`)
- OpenRouter (`openai/text-embedding-3-small`)
- Supabase pgvector (IVFFlat index)
- Express.js, Multer, pdf-parse
- React 19, Vite, Web Audio API
