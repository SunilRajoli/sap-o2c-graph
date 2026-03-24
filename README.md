# SAP O2C Graph

A full-stack app that **visualizes SAP Order-to-Cash relationships** as an interactive graph and answers **natural-language questions** over the same data using an LLM-powered SQL pipeline.

---

## What It Does

- Ingests SAP Order-to-Cash JSONL data into a local SQLite database
- Renders the full O2C entity graph (Sales Orders → Deliveries → Billing → Payments) interactively
- Lets you ask questions in plain English — the system generates SQL, executes it, and returns a grounded natural-language answer
- Blocks off-topic queries with a multi-layer guardrail system
- Offers two graph visualization modes:
  Network View (organic cluster layout inspired by force-directed graphs) and 
  Flow View (structured left-to-right dagre layout showing the O2C pipeline)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (: 5173)                    │
│                                                         │
│   ┌─────────────────────┐  ┌────────────────────────┐   │
│   │   Graph Panel       │  │     Chat Panel         │   │
│   │   (React Flow)      │  │  (Natural Language)    │   │
│   └──────────┬──────────┘  └───────────┬────────────┘   │
│              │  /api/graph             │  /api/chat     │
└──────────────┼─────────────────────────┼─────────────── ┘
               │         Vite Proxy      │
┌──────────────▼─────────────────────────▼─────────────── ┐
│                  Express API (: 3001)                   │
│                                                         │
│   GET /api/graph          POST /api/chat                │
│   Fixed SQL joins    →    1. LLM generates SQL          │
│   Returns nodes/edges     2. Execute on SQLite          │
│                           3. LLM narrates answer        │
└───────────────────────────┬─────────────────────────────┘
                            │
               ┌────────────▼────────────┐
               │    SQLite (database.db) │
               │    19 O2C tables        │
               └─────────────────────────┘
```

| Layer | Stack | Why |
|-------|-------|-----|
| Data | JSONL + better-sqlite3 | Self-contained, zero infra, fast reads |
| API | Node.js + Express | Lightweight, matches frontend JS stack |
| LLM | Groq — llama-3.3-70b-versatile | See reasoning below |
| Graph UI | React Flow + dagre | See reasoning below |
| Styling | Tailwind CSS v4 | Utility-first, no context switching |

---

## Technology Choices

### Why Groq + llama-3.3-70b-versatile

Groq runs inference on custom LPU hardware, delivering consistently fast response times — critical for a demo where evaluators are actively querying. The free tier allows 14,400 requests/day with no credit card required, meaning the demo never hits a rate limit wall during evaluation.

`llama-3.3-70b-versatile` was chosen over alternatives because it reliably generates valid SQLite SQL for complex multi-table joins, handles the two-step SQL-generation → answer flow cleanly, and stays within the free tier token limits. Gemini's free tier was considered but currently limits to ~250 requests/day — insufficient for live demos.

### Why React Flow + dagre

React Flow provides a production-ready graph canvas with built-in zoom, pan, node selection, and custom node rendering — all with a clean React API. Building this from scratch with D3 would add significant complexity for no benefit in this context.

dagre is added as a layout engine to automatically position nodes in a readable left-to-right directed graph layout, which maps naturally to the O2C flow: Customer → Sales Order → Delivery → Billing → Payment.

### Why SQLite + better-sqlite3

The dataset is a fixed JSONL export — there is no live SAP system. SQLite keeps the entire demo self-contained: one file, no database server, instant setup. `better-sqlite3` uses synchronous I/O which is appropriate here since each query is fast and isolated.

For the graph endpoint, fixed SQL joins (no LLM involved) keep the visualization fast and deterministic. For the chat endpoint, the LLM generates SQL which is then executed against the same SQLite file read-only.

### Why a Two-Step LLM Pipeline

A single LLM call that returns a direct answer is ungrounded — the model can hallucinate data. The two-step approach enforces grounding:

1. **Step 1 — SQL generation:** The model is constrained to return only a valid `SELECT` statement. The system prompt includes the full schema, join paths, and working examples. No prose allowed.
2. **Step 2 — Answer narration:** The model receives actual query results as JSON and is asked to narrate them. It never sees the SQL — only the data.

This makes every answer fully auditable: the SQL is shown in the UI so users can verify exactly what was queried.

### Why Two Graph Visualization Modes

The Network View uses a seeded organic cluster layout — nodes of each entity type are grouped around a center point with stable randomized positions based on node ID. This creates a constellation-style view that shows relationship density across the O2C graph.

The Flow View uses dagre's left-to-right layout which makes the business process 
immediately readable:
Customer → Sales Order → Delivery → Billing → Payment

Both modes share the same underlying data and support node click, zoom, pan, and 
fit-to-view. The toggle button switches between modes with auto-fit animation.

---

## O2C Data Flow

```
Business Partner (Customer)
        │
        ▼
Sales Order Header  ──→  Sales Order Items
        │                       │
        ▼                       ▼
Outbound Delivery Header  ←──  Outbound Delivery Items
        │                       │
        ▼                       ▼
Billing Document Header  ←──  Billing Document Items
        │
        ▼
Journal Entry Items  ←──  (via referenceDocument = billingDocument)
        │
        ▼
Payments (Accounts Receivable)
```

---

## Guardrails

Every chat message passes through three layers before any SQL runs:

| Layer | Mechanism | Cost |
|-------|-----------|------|
| 1. Keyword pre-check | Regex patterns block obvious off-topic queries instantly | Zero — no LLM call |
| 2. LLM guardrail | System prompt instructs model to return `GUARDRAIL_TRIGGERED` for anything outside the O2C domain | One LLM call |
| 3. SQL gate | Only a single `SELECT` or `WITH` statement is executed — no batching, no writes | Zero |

**Blocked examples:** poems, general knowledge, coding help, SAP product questions, math, personal questions

**Fixed response for blocked queries:**
> *This system is designed to answer questions related to the provided dataset only. Please ask about sales orders, deliveries, billing documents, payments, or customers.*

---

## Setup

### Prerequisites

- Node.js 18+
- Groq API key — free at [console.groq.com](https://console.groq.com)

### 1. Clone and configure

```bash
git clone https://github.com/SunilRajoli/sap-o2c-graph.git
cd sap-o2c-graph
cp .env.example .env
```

Edit `.env`:

```env
GROQ_API_KEY=your_key_here
PORT=3001
```

### 2. Place the dataset

Extract the JSONL dataset into:

```
backend/data/sap-o2c-data/
  billing_document_headers/
  billing_document_items/
  sales_order_headers/
  ... (19 entity folders)
```

### 3. Ingest data

```bash
cd backend
npm install
npm run ingest
```

You should see output like:
```
✓ Loaded 100 sales_order_headers
✓ Loaded 167 sales_order_items
✓ Loaded 163 billing_document_headers
...
```

### 4. Start the backend

```bash
cd backend
node server.js
```

Listening on `http://localhost:3001`

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`

---

## Example Queries

```
Which products are associated with the highest number of billing documents?

Trace the full flow for sales order 740506

Which sales orders have been delivered but not billed?

Which billing documents have no linked payment?

Find the journal entry linked to billing document 90504248

Show me all cancelled billing documents

Which customer has the highest total order value?
```

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/graph` | GET | Returns nodes and edges for the graph UI |
| `/api/chat` | POST | Accepts `{ message, conversationHistory }`, returns `{ answer, sql }` |

**Error responses** follow `{ "error": "..." }` with status codes: `400` bad input, `502` Groq failure, `503` missing DB or API key, `500` unexpected.

---

## Project Structure

```
sap-o2c-graph/
├── backend/
│   ├── server.js              # Express API, Groq integration, SQL prompts
│   ├── data/
│   │   └── sap-o2c-data/      # Entity JSONL folders
│   └── scripts/
│       └── ingest.js          # JSONL → SQLite ingestion
├── frontend/
│   └── src/
│       ├── App.jsx            # Root layout
│       ├── GraphPanel.jsx     # React Flow graph
│       └── ChatPanel.jsx      # Chat interface
├── .env.example
└── README.md
```

---

## Limitations

- Graph visualizes up to 100 sales orders for performance
- `product_storage_locations` (16,700+ records) is queryable via chat but excluded from the graph
- No authentication — intended for demo/evaluation use only
- Not hardened for production (add auth, rate limits, and stricter SQL validation before any real deployment)