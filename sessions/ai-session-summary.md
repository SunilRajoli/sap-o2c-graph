# AI Coding Session Summary

## Tools Used
- Cursor (primary development)
- Claude (architecture planning, prompting strategy)

## Project Timeline
- 22nd March 2026: Project setup, dataset analysis, schema design
- 23rd March 2026: Backend API, LLM pipeline, guardrails, frontend
- 24th March 2026: UI polish, dual graph views, deployment

## How I Used AI Tools

### Architecture Planning
Used Claude to analyze the 19-table SAP O2C dataset,
understand entity relationships, and design the
SQLite schema before writing any code.

### Cursor for Development
Used Cursor Composer to scaffold the project,
write the Express backend, React frontend,
and ingestion pipeline. Reviewed every file
generated and understood the logic before moving on.

### Key Prompts and Workflows

#### 1. Dataset Analysis
Prompted Claude to analyze JSONL samples from each
entity folder and identify foreign key relationships
across 19 tables.

#### 2. LLM Pipeline Design
Decided on two-step pipeline after understanding
hallucination risk with single-step approach:
- Step 1: Generate auditable SQL only
- Step 2: Narrate results from actual data

#### 3. System Prompt Engineering
Iterated on the SQL generation prompt multiple times:
- Added explicit join path hints
- Added working SQL examples per query type
- Added GUARDRAIL_TRIGGERED pattern
- Fixed billing → journal entry join path
  (referenceDocument not accountingDocument)

#### 4. Guardrail System
Built three layers after initial single-layer
approach was insufficient:
- Layer 1: Regex pre-check (zero LLM cost)
- Layer 2: LLM system prompt restriction
- Layer 3: SQL allowlist (SELECT/WITH only)

## Key Debugging Sessions

### Bug 1 — Wrong Journal Entry Join
Problem: Query for billing doc 90504248
returned no journal entry.

Root cause: System prompt said to join via
journal_entry_items.accountingDocument but
actual data uses journal_entry_items.referenceDocument

Fix: Updated system prompt with correct join
and added explicit example query showing the
right pattern.

### Bug 2 — Data Path on Railway
Problem: Deployment failed with
"Data directory not found: /data/sap-o2c-data"

Root cause: Railway sets root to /backend
but data folder was at repo root level.

Fix: Moved data folder inside backend/
so relative path worked in both local
and production environments.

### Bug 3 — CORS Error on Vercel
Problem: Frontend on Vercel couldn't reach
backend on Railway.

Root cause: CORS_ORIGINS only had localhost.

Fix: Added FRONTEND_URL environment variable
to Railway and updated CORS config dynamically.

### Bug 4 — Graph Layout on Mode Switch
Problem: Switching between Network View and
Flow View showed blank screen until manual
fit view click.

Fix: Added useEffect watching viewMode that
calls fitView() with 200ms delay after
mode switch to allow nodes to render first.

## Iteration Pattern

For every major feature:
1. Understood the problem deeply first
2. Described it precisely to Cursor
3. Read every line of generated code
4. Tested in browser
5. Identified what broke
6. Debugged with understanding not guesswork
7. Fixed and verified

Never moved to next feature until current
one was fully understood and working.