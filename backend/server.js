import path from 'node:path';

import { fileURLToPath } from 'node:url';

import express from 'express';

import cors from 'cors';

import dotenv from 'dotenv';

import Database from 'better-sqlite3';

import OpenAI from 'openai';



const __dirname = path.dirname(fileURLToPath(import.meta.url));



dotenv.config({ path: path.join(__dirname, '../.env') });

dotenv.config();



if (!process.env.GROQ_API_KEY?.trim()) {

  console.warn(

    '[env] GROQ_API_KEY is not set. POST /api/chat will return 503 until you add it to .env (see .env.example).',

  );

}



const DB_PATH = path.join(__dirname, 'database.db');

const MAX_SALES_ORDERS = 100;



const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

const GROQ_MODEL = 'llama-3.3-70b-versatile';



/** Browser origins allowed for CORS (Vite dev server on 5173). */

const CORS_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);



const SQL_SYSTEM_PROMPT = `You are a SQL query generator for a SAP Order-to-Cash SQLite database.
You ONLY answer questions about this dataset. Return GUARDRAIL_TRIGGERED for anything else.

TABLES:
- sales_order_headers (salesOrder, soldToParty, totalNetAmount, overallDeliveryStatus, creationDate, transactionCurrency)
- sales_order_items (salesOrder, salesOrderItem, material, requestedQuantity, netAmount)
- outbound_delivery_headers (deliveryDocument, creationDate, shippingPoint, overallGoodsMovementStatus, overallPickingStatus)
- outbound_delivery_items (deliveryDocument, deliveryDocumentItem, referenceSdDocument, referenceSdDocumentItem, plant, actualDeliveryQuantity)
- billing_document_headers (billingDocument, billingDocumentType, billingDocumentDate, totalNetAmount, soldToParty, accountingDocument, billingDocumentIsCancelled)
- billing_document_items (billingDocument, billingDocumentItem, material, billingQuantity, netAmount, referenceSdDocument, referenceSdDocumentItem)
- journal_entry_items (accountingDocument, accountingDocumentItem, referenceDocument, amountInTransactionCurrency, transactionCurrency, customer, postingDate, clearingDate)
- payments_accounts_receivable (accountingDocument, accountingDocumentItem, clearingDate, amountInTransactionCurrency, transactionCurrency, customer, postingDate)
- business_partners (businessPartner, businessPartnerFullName, customer)
- products (product, productType, productGroup)
- product_descriptions (product, language, productDescription)
- plants (plant, plantName)
- billing_document_cancellations (billingDocument, billingDocumentIsCancelled, cancelledBillingDocument, totalNetAmount, soldToParty, accountingDocument)

CRITICAL JOIN PATHS (use exactly these, never deviate):
- SalesOrder → Delivery:    outbound_delivery_items.referenceSdDocument = sales_order_headers.salesOrder
- Delivery → Billing:       billing_document_items.referenceSdDocument = outbound_delivery_items.deliveryDocument
- Billing → JournalEntry:   journal_entry_items.referenceDocument = billing_document_headers.billingDocument
- Billing → Payment:        payments_accounts_receivable.accountingDocument = billing_document_headers.accountingDocument
- Customer → SalesOrder:    sales_order_headers.soldToParty = business_partners.businessPartner
- Delivery header join:     outbound_delivery_headers.deliveryDocument = outbound_delivery_items.deliveryDocument

WORKING SQL EXAMPLES (follow these patterns exactly):

Q: List all customers
SELECT bp.businessPartner, bp.businessPartnerFullName FROM business_partners bp

Q: Show cancelled billing documents
SELECT billingDocument, totalNetAmount, soldToParty, billingDocumentDate
FROM billing_document_headers
WHERE billingDocumentIsCancelled = 1

Q: Find journal entry for billing document 90504248
SELECT j.accountingDocument, j.accountingDocumentItem, j.amountInTransactionCurrency, j.postingDate
FROM journal_entry_items j
WHERE j.referenceDocument = '90504248'

Q: Trace full flow for sales order 740506
SELECT 
  soh.salesOrder,
  odi.deliveryDocument,
  odh.shippingPoint,
  bdi.billingDocument,
  j.accountingDocument AS journalEntry,
  j.amountInTransactionCurrency
FROM sales_order_headers soh
LEFT JOIN outbound_delivery_items odi ON odi.referenceSdDocument = soh.salesOrder
LEFT JOIN outbound_delivery_headers odh ON odh.deliveryDocument = odi.deliveryDocument
LEFT JOIN billing_document_items bdi ON bdi.referenceSdDocument = odi.deliveryDocument
LEFT JOIN journal_entry_items j ON j.referenceDocument = bdi.billingDocument
WHERE soh.salesOrder = '740506'

Q: Which products are associated with the most billing documents
SELECT bdi.material, pd.productDescription, COUNT(DISTINCT bdi.billingDocument) AS billingCount
FROM billing_document_items bdi
LEFT JOIN product_descriptions pd ON pd.product = bdi.material AND pd.language = 'EN'
GROUP BY bdi.material
ORDER BY billingCount DESC
LIMIT 10

Q: Sales orders delivered but not billed
SELECT DISTINCT soh.salesOrder, soh.soldToParty, soh.totalNetAmount
FROM sales_order_headers soh
JOIN outbound_delivery_items odi ON odi.referenceSdDocument = soh.salesOrder
WHERE soh.salesOrder NOT IN (
  SELECT DISTINCT bdi.referenceSdDocument
  FROM billing_document_items bdi
  JOIN outbound_delivery_items odi2 ON odi2.deliveryDocument = bdi.referenceSdDocument
  WHERE odi2.referenceSdDocument = soh.salesOrder
)

Q: Billing documents with no linked payment
SELECT bdh.billingDocument, bdh.totalNetAmount, bdh.billingDocumentDate
FROM billing_document_headers bdh
WHERE bdh.accountingDocument NOT IN (
  SELECT DISTINCT accountingDocument FROM payments_accounts_receivable
  WHERE accountingDocument IS NOT NULL AND accountingDocument != ''
)

Q: Sales orders with incomplete flows (delivered but not billed OR billed without delivery)
SELECT soh.salesOrder, soh.soldToParty,
  CASE 
    WHEN odi.deliveryDocument IS NOT NULL AND bdi.billingDocument IS NULL THEN 'Delivered but not billed'
    WHEN odi.deliveryDocument IS NULL AND bdi.billingDocument IS NOT NULL THEN 'Billed without delivery'
    WHEN odi.deliveryDocument IS NULL AND bdi.billingDocument IS NULL THEN 'No delivery or billing'
    ELSE 'Complete'
  END AS flowStatus
FROM sales_order_headers soh
LEFT JOIN outbound_delivery_items odi ON odi.referenceSdDocument = soh.salesOrder
LEFT JOIN billing_document_items bdi ON bdi.referenceSdDocument = odi.deliveryDocument
WHERE flowStatus != 'Complete'

Q: What payment cleared billing document 90504248
SELECT p.accountingDocument, p.amountInTransactionCurrency, p.clearingDate, p.transactionCurrency
FROM payments_accounts_receivable p
JOIN billing_document_headers bdh ON bdh.accountingDocument = p.accountingDocument
WHERE bdh.billingDocument = '90504248'

Q: Deliveries linked to sales order 740506
SELECT DISTINCT odi.deliveryDocument, odh.shippingPoint, odh.overallGoodsMovementStatus
FROM outbound_delivery_items odi
JOIN outbound_delivery_headers odh ON odh.deliveryDocument = odi.deliveryDocument
WHERE odi.referenceSdDocument = '740506'

Q: How many deliveries are pending goods movement
SELECT COUNT(DISTINCT deliveryDocument) as pendingCount
FROM outbound_delivery_headers
WHERE overallGoodsMovementStatus = 'A'

RULES:
- Return ONLY valid SQLite SQL. No markdown, no backticks, no explanation.
- Always quote document numbers as strings: '740506' not 740506
- Always LIMIT to 50 rows unless aggregating
- For flow/trace queries always use LEFT JOIN so missing steps still show
- Return GUARDRAIL_TRIGGERED for anything not about this dataset
`;

const GUARDRAIL_ANSWER =

  'This system is designed to answer questions related to the provided dataset only. Please ask about sales orders, deliveries, billing documents, payments, or customers.';



const NL_SYSTEM_PROMPT =

  'You answer using the provided SQLite query results. Be concise and data-specific. If the results are empty, say so clearly.';



function getGroqClient() {

  const key = process.env.GROQ_API_KEY;

  if (!key || !String(key).trim()) return null;

  return new OpenAI({

    apiKey: key.trim(),

    baseURL: GROQ_BASE_URL,

  });

}



/** @param {unknown} err */

function errorMessage(err) {

  if (err instanceof Error) return err.message;

  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {

    return err.message;

  }

  return String(err);

}



/** @param {unknown} err Groq / OpenAI SDK error */

function groqApiErrorMessage(err) {

  const e = /** @type {{ status?: number; message?: string; response?: { data?: { error?: { message?: string } } } }} */ (

    err

  );

  const fromBody = e?.response?.data?.error?.message;

  if (typeof fromBody === 'string' && fromBody.trim()) return fromBody;

  if (typeof e?.message === 'string' && e.message.trim()) return e.message;

  return 'The language model request failed.';

}



/** @param {unknown} raw */

function normalizeConversationHistory(raw) {

  if (!Array.isArray(raw)) return [];

  /** @type {{ role: 'user' | 'assistant'; content: string }[]} */

  const out = [];

  for (const m of raw) {

    if (!m || typeof m !== 'object') continue;

    const role = 'role' in m ? m.role : null;

    const content = 'content' in m ? m.content : null;

    if (role !== 'user' && role !== 'assistant') continue;

    if (typeof content !== 'string' || !content.length) continue;

    out.push({ role, content });

  }

  return out;

}



function stripSqlFences(text) {

  const t = text.trim();

  const block = /^```(?:sql)?\s*([\s\S]*?)```$/m.exec(t);

  if (block) return block[1].trim();

  return t;

}



function isSafeSelectSql(sql) {

  const t = sql.trim().replace(/;+\s*$/g, '');

  if (!t || /;/.test(t)) return false;

  return /^\s*(WITH|SELECT)\b/is.test(t);

}



const app = express();



app.use(

  cors({

    origin(origin, callback) {

      if (!origin || CORS_ORIGINS.has(origin)) {

        callback(null, true);

      } else {

        callback(null, false);

      }

    },

  }),

);



app.use(express.json({ limit: '1mb' }));



function openDb() {

  try {

    return new Database(DB_PATH, { readonly: true, fileMustExist: true });

  } catch {

    return null;

  }

}



function placeholders(n) {

  return Array.from({ length: n }, () => '?').join(', ');

}



/**

 * @param {import('better-sqlite3').Database} db

 */

function buildGraph(db) {

  const salesOrders = db

    .prepare(

      `SELECT salesOrder, totalNetAmount, soldToParty, overallDeliveryStatus, creationDate, transactionCurrency

       FROM sales_order_headers

       ORDER BY creationDate DESC

       LIMIT ?`,

    )

    .all(MAX_SALES_ORDERS);



  if (salesOrders.length === 0) {

    return { nodes: [], edges: [] };

  }



  const soIds = salesOrders.map((r) => String(r.salesOrder));

  const soSet = new Set(soIds);

  const ph = placeholders(soIds.length);



  /** @type {Map<string, { id: string, label: string, type: string, data?: Record<string, unknown> }>} */

  const nodeMap = new Map();



  for (const row of salesOrders) {

    const id = String(row.salesOrder);

    nodeMap.set(id, {

      id,

      label: `SO: ${id}`,

      type: 'salesOrder',

      data: {

        salesOrder: id,

        soldToParty: row.soldToParty != null ? String(row.soldToParty) : null,

        totalNetAmount: row.totalNetAmount,

        overallDeliveryStatus: row.overallDeliveryStatus,

        creationDate: row.creationDate,

        transactionCurrency: row.transactionCurrency ?? null,

      },

    });

  }



  const deliveryRows = db

    .prepare(

      `SELECT DISTINCT deliveryDocument, referenceSdDocument

       FROM outbound_delivery_items

       WHERE referenceSdDocument IN (${ph})`,

    )

    .all(...soIds);



  const deliveryIds = [...new Set(deliveryRows.map((r) => String(r.deliveryDocument)))];

  /** @type {Map<string, Record<string, unknown>>} */

  const deliveryHeaderById = new Map();

  if (deliveryIds.length > 0) {

    const dph = placeholders(deliveryIds.length);

    const dhRows = db

      .prepare(

        `SELECT deliveryDocument, creationDate, shippingPoint, overallGoodsMovementStatus, overallPickingStatus

         FROM outbound_delivery_headers

         WHERE deliveryDocument IN (${dph})`,

      )

      .all(...deliveryIds);

    for (const r of dhRows) {

      deliveryHeaderById.set(String(r.deliveryDocument), r);

    }

  }

  for (const d of deliveryIds) {

    if (!nodeMap.has(d)) {

      const h = deliveryHeaderById.get(d);

      nodeMap.set(d, {

        id: d,

        label: `DEL: ${d}`,

        type: 'delivery',

        data: {

          deliveryDocument: d,

          creationDate: h?.creationDate ?? null,

          shippingPoint: h?.shippingPoint ?? null,

          overallGoodsMovementStatus: h?.overallGoodsMovementStatus ?? null,

          overallPickingStatus: h?.overallPickingStatus ?? null,

        },

      });

    }

  }



  /** @type {Set<string>} */

  const billingIds = new Set();



  if (deliveryIds.length > 0) {

    const dph = placeholders(deliveryIds.length);

    const billingRefRows = db

      .prepare(

        `SELECT DISTINCT billingDocument, referenceSdDocument

         FROM billing_document_items

         WHERE referenceSdDocument IN (${dph})`,

      )

      .all(...deliveryIds);



    for (const r of billingRefRows) {

      billingIds.add(String(r.billingDocument));

    }

  }



  /** @type {Map<string, Record<string, unknown>>} */

  const billingHeaderById = new Map();

  if (billingIds.size > 0) {

    const bidListForHdr = [...billingIds];

    const bphHdr = placeholders(bidListForHdr.length);

    const bhRows = db

      .prepare(

        `SELECT billingDocument, billingDocumentType, totalNetAmount, billingDocumentDate, billingDocumentIsCancelled, soldToParty

         FROM billing_document_headers

         WHERE billingDocument IN (${bphHdr})`,

      )

      .all(...bidListForHdr);

    for (const r of bhRows) {

      billingHeaderById.set(String(r.billingDocument), r);

    }

  }

  for (const b of billingIds) {

    const h = billingHeaderById.get(b);

    nodeMap.set(b, {

      id: b,

      label: `BILL: ${b}`,

      type: 'billing',

      data: {

        billingDocument: b,

        billingDocumentType: h?.billingDocumentType ?? null,

        totalNetAmount: h?.totalNetAmount ?? null,

        billingDocumentDate: h?.billingDocumentDate ?? null,

        billingDocumentIsCancelled: h?.billingDocumentIsCancelled ?? null,

        soldToParty: h?.soldToParty != null ? String(h.soldToParty) : null,

      },

    });

  }



  let paymentDocIds = [];

  if (billingIds.size > 0) {

    const bidList = [...billingIds];

    const bph = placeholders(bidList.length);

    const headerRows = db

      .prepare(

        `SELECT billingDocument, accountingDocument

         FROM billing_document_headers

         WHERE billingDocument IN (${bph}) AND accountingDocument IS NOT NULL AND accountingDocument != ''`,

      )

      .all(...bidList);



    const acctFromHeaders = [...new Set(headerRows.map((r) => String(r.accountingDocument)))];

    if (acctFromHeaders.length > 0) {

      const aph = placeholders(acctFromHeaders.length);

      const payRows = db

        .prepare(

          `SELECT DISTINCT accountingDocument

           FROM payments_accounts_receivable

           WHERE accountingDocument IN (${aph})`,

        )

        .all(...acctFromHeaders);

      paymentDocIds = payRows.map((r) => String(r.accountingDocument));

    }

  }

  /** @type {Map<string, Record<string, unknown>>} */

  const paymentByAcct = new Map();

  if (paymentDocIds.length > 0) {

    const pph = placeholders(paymentDocIds.length);

    const payAggRows = db

      .prepare(

        `SELECT accountingDocument,

                SUM(CAST(amountInTransactionCurrency AS REAL)) AS amountInTransactionCurrency,

                MAX(transactionCurrency) AS transactionCurrency,

                MAX(clearingDate) AS clearingDate,

                MAX(customer) AS customer

         FROM payments_accounts_receivable

         WHERE accountingDocument IN (${pph})

         GROUP BY accountingDocument`,

      )

      .all(...paymentDocIds);

    for (const r of payAggRows) {

      paymentByAcct.set(String(r.accountingDocument), r);

    }

  }

  for (const p of paymentDocIds) {

    const pr = paymentByAcct.get(p);

    nodeMap.set(p, {

      id: p,

      label: `PAY: ${p}`,

      type: 'payment',

      data: {

        accountingDocument: p,

        amountInTransactionCurrency: pr?.amountInTransactionCurrency ?? null,

        transactionCurrency: pr?.transactionCurrency ?? null,

        clearingDate: pr?.clearingDate ?? null,

        customer: pr?.customer != null ? String(pr.customer) : null,

      },

    });

  }



  const customerIds = [...new Set(salesOrders.map((r) => String(r.soldToParty)).filter(Boolean))];

  if (customerIds.length > 0) {

    const cph = placeholders(customerIds.length);

    const bpRows = db

      .prepare(

        `SELECT businessPartner, businessPartnerFullName, businessPartnerName, customer

         FROM business_partners

         WHERE businessPartner IN (${cph})`,

      )

      .all(...customerIds);



    const bpById = new Map(bpRows.map((r) => [String(r.businessPartner), r]));

    for (const cid of customerIds) {

      const bp = bpById.get(cid);

      const name =

        (bp?.businessPartnerFullName && String(bp.businessPartnerFullName).trim()) ||

        (bp?.businessPartnerName && String(bp.businessPartnerName).trim()) ||

        cid;

      nodeMap.set(cid, {

        id: cid,

        label: name,

        type: 'customer',

        data: {

          businessPartner: cid,

          businessPartnerFullName:

            bp?.businessPartnerFullName != null ? String(bp.businessPartnerFullName) : null,

          customer: bp?.customer != null ? String(bp.customer) : null,

        },

      });

    }

  }



  /** @type {Map<string, { id: string, source: string, target: string, label: string }>} */

  const edgeMap = new Map();



  function addEdge(source, target, label, kind) {

    const id = `${kind}:${source}->${target}`;

    if (!edgeMap.has(id)) edgeMap.set(id, { id, source, target, label });

  }



  for (const row of deliveryRows) {

    const so = String(row.referenceSdDocument);

    const del = String(row.deliveryDocument);

    if (soSet.has(so) && nodeMap.has(del)) {

      addEdge(so, del, 'fulfillment', 'so-del');

    }

  }



  if (deliveryIds.length > 0) {

    const dph = placeholders(deliveryIds.length);

    const billDelRows = db

      .prepare(

        `SELECT DISTINCT billingDocument, referenceSdDocument

         FROM billing_document_items

         WHERE referenceSdDocument IN (${dph})`,

      )

      .all(...deliveryIds);



    const delSet = new Set(deliveryIds);

    for (const r of billDelRows) {

      const del = String(r.referenceSdDocument);

      const bill = String(r.billingDocument);

      if (delSet.has(del) && nodeMap.has(bill)) {

        addEdge(del, bill, 'invoiced', 'del-bill');

      }

    }

  }



  if (billingIds.size > 0) {

    const bidList = [...billingIds];

    const bph = placeholders(bidList.length);

    const hdrRows = db

      .prepare(

        `SELECT billingDocument, accountingDocument

         FROM billing_document_headers

         WHERE billingDocument IN (${bph})`,

      )

      .all(...bidList);



    const paySet = new Set(paymentDocIds);

    for (const r of hdrRows) {

      const bill = String(r.billingDocument);

      const acct = r.accountingDocument != null ? String(r.accountingDocument) : '';

      if (!acct || !nodeMap.has(bill) || !paySet.has(acct)) continue;

      addEdge(bill, acct, 'cleared', 'bill-pay');

    }

  }



  for (const row of salesOrders) {

    const so = String(row.salesOrder);

    const cust = row.soldToParty != null ? String(row.soldToParty) : '';

    if (cust && nodeMap.has(cust) && nodeMap.has(so)) {

      addEdge(cust, so, 'sold-to', 'cust-so');

    }

  }



  return {

    nodes: [...nodeMap.values()],

    edges: [...edgeMap.values()],

  };

}



function isObviouslyOffTopic(message) {

  const lower = message.toLowerCase();



  const offTopicPatterns = [

    /write (a |me )?(poem|story|essay|joke|song|haiku)/i,

    /who (is|was|invented|created|founded)/i,

    /what is (the meaning|life|love|happiness)/i,

    /capital (city|of)/i,

    /how (to cook|to make|do you|does the human)/i,

    /tell me (a joke|a story|about yourself)/i,

    /what('s| is) (your name|the weather|the time|today)/i,

    /\b(recipe|movie|sport|football|cricket|music|celebrity)\b/i,

    /translate (this|to|from)/i,

    /\b(president|prime minister|king|queen|government)\b/i,

  ];



  return offTopicPatterns.some((p) => p.test(lower));

}



app.get('/api/graph', (req, res) => {

  let db = null;

  try {

    db = openDb();

    if (!db) {

      return res.status(503).json({

        error:

          'Database file is missing or unreadable. Run `npm run ingest` from the backend folder to create database.db.',

      });

    }

    const graph = buildGraph(db);

    return res.json(graph);

  } catch (err) {

    console.error('[GET /api/graph]', err);

    return res.status(500).json({

      error: `Failed to build graph: ${errorMessage(err)}`,

    });

  } finally {

    try {

      db?.close();

    } catch (closeErr) {

      console.error('[GET /api/graph] failed to close database', closeErr);

    }

  }

});



app.post('/api/chat', async (req, res) => {

  try {

    const { message, conversationHistory } = req.body ?? {};

    if (typeof message !== 'string' || !message.trim()) {

      return res.status(400).json({

        error: 'Invalid request: `message` must be a non-empty string.',

      });

    }



    const userMessage = message.trim();



    if (isObviouslyOffTopic(userMessage)) {

      return res.json({

        answer: GUARDRAIL_ANSWER,

        sql: null,

      });

    }



    const client = getGroqClient();

    if (!client) {

      return res.status(503).json({

        error:

          'GROQ_API_KEY is not configured. Add it to .env at the project root (see .env.example) and restart the server.',

      });

    }



    const history = normalizeConversationHistory(conversationHistory);



    const sqlMessages = [

      { role: 'system', content: SQL_SYSTEM_PROMPT },

      ...history,

      { role: 'user', content: userMessage },

    ];



    let sqlCompletion;

    try {

      sqlCompletion = await client.chat.completions.create({

        model: GROQ_MODEL,

        messages: sqlMessages,

      });

    } catch (err) {

      console.error('[POST /api/chat] Groq SQL step failed', err);

      return res.status(502).json({

        error: `Language model (SQL step) failed: ${groqApiErrorMessage(err)}`,

      });

    }



    const rawContent = sqlCompletion.choices[0]?.message?.content?.trim() ?? '';

    const sqlCandidate = stripSqlFences(rawContent);



    if (sqlCandidate === 'GUARDRAIL_TRIGGERED') {

      return res.json({

        answer: GUARDRAIL_ANSWER,

        sql: null,

      });

    }



    if (!isSafeSelectSql(sqlCandidate)) {

      return res.json({

        answer:

          'The model did not return a valid read-only SELECT query, so it was not executed.',

        sql: sqlCandidate || null,

      });

    }



    const db = openDb();

    if (!db) {

      return res.status(503).json({

        error:

          'Database file is missing or unreadable. Run `npm run ingest` from the backend folder first.',

      });

    }



    let rows;

    try {

      rows = db.prepare(sqlCandidate).all();

    } catch (execErr) {

      try {

        db.close();

      } catch {

        /* ignore */

      }

      return res.json({

        answer: `The query could not be executed: ${errorMessage(execErr)}`,

        sql: sqlCandidate,

      });

    }

    try {

      db.close();

    } catch {

      /* ignore */

    }



    const nlMessages = [

      { role: 'system', content: NL_SYSTEM_PROMPT },

      ...history,

      {

        role: 'user',

        content: `Given this data: ${JSON.stringify(rows)}, answer the user's question: ${userMessage}. Be concise and data-specific.`,

      },

    ];



    let nlCompletion;

    try {

      nlCompletion = await client.chat.completions.create({

        model: GROQ_MODEL,

        messages: nlMessages,

      });

    } catch (err) {

      console.error('[POST /api/chat] Groq answer step failed', err);

      return res.status(502).json({

        error: `Language model (answer step) failed: ${groqApiErrorMessage(err)}`,

      });

    }



    const answer =

      nlCompletion.choices[0]?.message?.content?.trim() ?? 'No answer returned.';



    return res.json({

      answer,

      sql: sqlCandidate,

    });

  } catch (err) {

    console.error('[POST /api/chat] unexpected error', err);

    return res.status(500).json({

      error: `Chat request failed: ${errorMessage(err)}`,

    });

  }

});



app.use((err, req, res, next) => {

  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {

    return res.status(400).json({ error: 'Request body must be valid JSON.' });

  }

  console.error('[unhandled]', err);

  return res.status(500).json({ error: 'Internal server error.' });

});



const PORT = Number(process.env.PORT) || 3001;



const server = app.listen(PORT, () => {

  console.log(`API listening on http://localhost:${PORT}`);

});



server.on('error', (err) => {

  if (err && 'code' in err && err.code === 'EADDRINUSE') {

    console.error(

      `Port ${PORT} is already in use. Stop the other server (or any app on that port), or set PORT in .env to a free port.`,

    );

  } else {

    console.error(err);

  }

  process.exit(1);

});



export { app, buildGraph };

