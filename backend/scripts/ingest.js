/**
 * Loads JSONL exports from backend/data/sap-o2c-data into backend/database.db
 * Run from backend: npm run ingest  (or: node scripts/ingest.js)
 */

import fs, { createReadStream } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

/** Rows per SQLite transaction (streaming keeps memory flat). */
const INSERT_BATCH_SIZE = 10_000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(BACKEND_ROOT, 'data', 'sap-o2c-data');
const DB_PATH = path.join(BACKEND_ROOT, 'database.db');

/** Remove SQLite db + WAL/SHM so schema DDL always runs on a clean file. */
function removeSqliteFiles(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch {
      /* ignore missing */
    }
  }
}

/** Subfolder name under backend/data/sap-o2c-data → SQLite table name */
const FOLDER_TO_TABLE = {
  sales_order_headers: 'sales_order_headers',
  sales_order_items: 'sales_order_items',
  sales_order_schedule_lines: 'sales_order_schedule_lines',
  outbound_delivery_headers: 'outbound_delivery_headers',
  outbound_delivery_items: 'outbound_delivery_items',
  billing_document_headers: 'billing_document_headers',
  billing_document_items: 'billing_document_items',
  billing_document_cancellations: 'billing_document_cancellations',
  journal_entry_items_accounts_receivable: 'journal_entry_items',
  payments_accounts_receivable: 'payments_accounts_receivable',
  business_partners: 'business_partners',
  business_partner_addresses: 'business_partner_addresses',
  customer_company_assignments: 'customer_company_assignments',
  customer_sales_area_assignments: 'customer_sales_area_assignments',
  products: 'products',
  product_descriptions: 'product_descriptions',
  product_plants: 'product_plants',
  plants: 'plants',
};

/** Process tables in this order (logging / deterministic runs). */
const TABLE_ORDER = [
  'sales_order_headers',
  'sales_order_items',
  'sales_order_schedule_lines',
  'outbound_delivery_headers',
  'outbound_delivery_items',
  'billing_document_headers',
  'billing_document_items',
  'billing_document_cancellations',
  'journal_entry_items',
  'payments_accounts_receivable',
  'business_partners',
  'business_partner_addresses',
  'customer_company_assignments',
  'customer_sales_area_assignments',
  'products',
  'product_descriptions',
  'product_plants',
  'plants',
];

const TABLE_TO_FOLDER = Object.fromEntries(
  Object.entries(FOLDER_TO_TABLE).map(([k, v]) => [v, k]),
);

const DDL = `
DROP TABLE IF EXISTS plants;
DROP TABLE IF EXISTS product_plants;
DROP TABLE IF EXISTS product_descriptions;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS customer_sales_area_assignments;
DROP TABLE IF EXISTS customer_company_assignments;
DROP TABLE IF EXISTS business_partner_addresses;
DROP TABLE IF EXISTS business_partners;
DROP TABLE IF EXISTS payments_accounts_receivable;
DROP TABLE IF EXISTS journal_entry_items;
DROP TABLE IF EXISTS billing_document_cancellations;
DROP TABLE IF EXISTS billing_document_items;
DROP TABLE IF EXISTS billing_document_headers;
DROP TABLE IF EXISTS outbound_delivery_items;
DROP TABLE IF EXISTS outbound_delivery_headers;
DROP TABLE IF EXISTS sales_order_schedule_lines;
DROP TABLE IF EXISTS sales_order_items;
DROP TABLE IF EXISTS sales_order_headers;

CREATE TABLE sales_order_headers (
  salesOrder TEXT PRIMARY KEY NOT NULL,
  salesOrderType TEXT,
  salesOrganization TEXT,
  soldToParty TEXT,
  creationDate TEXT,
  totalNetAmount REAL,
  transactionCurrency TEXT,
  overallDeliveryStatus TEXT,
  overallOrdReltdBillgStatus TEXT,
  requestedDeliveryDate TEXT
);

CREATE TABLE sales_order_items (
  salesOrder TEXT NOT NULL,
  salesOrderItem TEXT NOT NULL,
  material TEXT,
  requestedQuantity REAL,
  requestedQuantityUnit TEXT,
  netAmount REAL,
  productionPlant TEXT,
  storageLocation TEXT,
  PRIMARY KEY (salesOrder, salesOrderItem)
);

CREATE TABLE sales_order_schedule_lines (
  salesOrder TEXT NOT NULL,
  salesOrderItem TEXT NOT NULL,
  scheduleLine TEXT NOT NULL,
  confirmedDeliveryDate TEXT,
  confdOrderQtyByMatlAvailCheck REAL,
  PRIMARY KEY (salesOrder, salesOrderItem, scheduleLine)
);

CREATE TABLE outbound_delivery_headers (
  deliveryDocument TEXT PRIMARY KEY NOT NULL,
  creationDate TEXT,
  shippingPoint TEXT,
  overallGoodsMovementStatus TEXT,
  overallPickingStatus TEXT,
  deliveryBlockReason TEXT
);

CREATE TABLE outbound_delivery_items (
  deliveryDocument TEXT NOT NULL,
  deliveryDocumentItem TEXT NOT NULL,
  referenceSdDocument TEXT,
  referenceSdDocumentItem TEXT,
  plant TEXT,
  actualDeliveryQuantity REAL,
  storageLocation TEXT,
  PRIMARY KEY (deliveryDocument, deliveryDocumentItem)
);

CREATE TABLE billing_document_headers (
  billingDocument TEXT PRIMARY KEY NOT NULL,
  billingDocumentType TEXT,
  billingDocumentDate TEXT,
  billingDocumentIsCancelled INTEGER,
  totalNetAmount REAL,
  transactionCurrency TEXT,
  soldToParty TEXT,
  accountingDocument TEXT,
  companyCode TEXT,
  fiscalYear TEXT
);

CREATE TABLE billing_document_items (
  billingDocument TEXT NOT NULL,
  billingDocumentItem TEXT NOT NULL,
  material TEXT,
  billingQuantity REAL,
  netAmount REAL,
  referenceSdDocument TEXT,
  referenceSdDocumentItem TEXT,
  PRIMARY KEY (billingDocument, billingDocumentItem)
);

CREATE TABLE billing_document_cancellations (
  billingDocument TEXT PRIMARY KEY NOT NULL,
  billingDocumentType TEXT,
  billingDocumentIsCancelled INTEGER,
  cancelledBillingDocument TEXT,
  totalNetAmount REAL,
  soldToParty TEXT,
  accountingDocument TEXT
);

CREATE TABLE journal_entry_items (
  companyCode TEXT,
  fiscalYear TEXT,
  accountingDocument TEXT NOT NULL,
  accountingDocumentItem TEXT NOT NULL,
  glAccount TEXT,
  referenceDocument TEXT,
  amountInTransactionCurrency REAL,
  transactionCurrency TEXT,
  postingDate TEXT,
  customer TEXT,
  clearingDate TEXT,
  clearingAccountingDocument TEXT,
  PRIMARY KEY (accountingDocument, accountingDocumentItem)
);

CREATE TABLE payments_accounts_receivable (
  companyCode TEXT,
  fiscalYear TEXT,
  accountingDocument TEXT NOT NULL,
  accountingDocumentItem TEXT NOT NULL,
  clearingDate TEXT,
  clearingAccountingDocument TEXT,
  amountInTransactionCurrency REAL,
  transactionCurrency TEXT,
  customer TEXT,
  postingDate TEXT,
  PRIMARY KEY (accountingDocument, accountingDocumentItem)
);

CREATE TABLE business_partners (
  businessPartner TEXT PRIMARY KEY NOT NULL,
  customer TEXT,
  businessPartnerFullName TEXT,
  businessPartnerName TEXT,
  businessPartnerIsBlocked INTEGER,
  creationDate TEXT
);

CREATE TABLE business_partner_addresses (
  businessPartner TEXT NOT NULL,
  addressId TEXT NOT NULL,
  cityName TEXT,
  country TEXT,
  region TEXT,
  streetName TEXT,
  postalCode TEXT,
  PRIMARY KEY (businessPartner, addressId)
);

CREATE TABLE customer_company_assignments (
  customer TEXT NOT NULL,
  companyCode TEXT NOT NULL,
  paymentTerms TEXT,
  reconciliationAccount TEXT,
  PRIMARY KEY (customer, companyCode)
);

CREATE TABLE customer_sales_area_assignments (
  customer TEXT NOT NULL,
  salesOrganization TEXT NOT NULL,
  distributionChannel TEXT NOT NULL,
  currency TEXT,
  customerPaymentTerms TEXT,
  shippingCondition TEXT,
  PRIMARY KEY (customer, salesOrganization, distributionChannel)
);

CREATE TABLE products (
  product TEXT PRIMARY KEY NOT NULL,
  productType TEXT,
  creationDate TEXT,
  grossWeight REAL,
  weightUnit TEXT,
  netWeight REAL,
  productGroup TEXT,
  baseUnit TEXT,
  division TEXT
);

CREATE TABLE product_descriptions (
  product TEXT NOT NULL,
  language TEXT NOT NULL,
  productDescription TEXT,
  PRIMARY KEY (product, language)
);

CREATE TABLE product_plants (
  product TEXT NOT NULL,
  plant TEXT NOT NULL,
  profitCenter TEXT,
  mrpType TEXT,
  PRIMARY KEY (product, plant)
);

CREATE TABLE plants (
  plant TEXT PRIMARY KEY NOT NULL,
  plantName TEXT,
  salesOrganization TEXT,
  addressId TEXT,
  distributionChannel TEXT
);
`;

const INDEX_DDL = `
CREATE INDEX idx_sales_order_headers_sold_to_party ON sales_order_headers(soldToParty);

CREATE INDEX idx_sales_order_items_sales_order ON sales_order_items(salesOrder);

CREATE INDEX idx_sales_order_schedule_lines_so ON sales_order_schedule_lines(salesOrder);
CREATE INDEX idx_sales_order_schedule_lines_so_item ON sales_order_schedule_lines(salesOrder, salesOrderItem);

CREATE INDEX idx_outbound_delivery_items_doc ON outbound_delivery_items(deliveryDocument);
CREATE INDEX idx_outbound_delivery_items_ref_sd ON outbound_delivery_items(referenceSdDocument);
CREATE INDEX idx_outbound_delivery_items_ref_sd_item ON outbound_delivery_items(referenceSdDocument, referenceSdDocumentItem);

CREATE INDEX idx_billing_document_headers_sold_to ON billing_document_headers(soldToParty);
CREATE INDEX idx_billing_document_headers_company ON billing_document_headers(companyCode);
CREATE INDEX idx_billing_document_headers_acct_doc ON billing_document_headers(accountingDocument);

CREATE INDEX idx_billing_document_items_doc ON billing_document_items(billingDocument);
CREATE INDEX idx_billing_document_items_ref_sd ON billing_document_items(referenceSdDocument);
CREATE INDEX idx_billing_document_items_ref_sd_item ON billing_document_items(referenceSdDocument, referenceSdDocumentItem);

CREATE INDEX idx_billing_document_cancellations_sold_to ON billing_document_cancellations(soldToParty);
CREATE INDEX idx_billing_document_cancellations_acct_doc ON billing_document_cancellations(accountingDocument);

CREATE INDEX idx_journal_entry_items_customer ON journal_entry_items(customer);
CREATE INDEX idx_journal_entry_items_ref_doc ON journal_entry_items(referenceDocument);
CREATE INDEX idx_journal_entry_items_company_fy ON journal_entry_items(companyCode, fiscalYear);

CREATE INDEX idx_payments_ar_customer ON payments_accounts_receivable(customer);
CREATE INDEX idx_payments_ar_clearing_doc ON payments_accounts_receivable(clearingAccountingDocument);
CREATE INDEX idx_payments_ar_company_fy ON payments_accounts_receivable(companyCode, fiscalYear);

CREATE INDEX idx_business_partner_addresses_bp ON business_partner_addresses(businessPartner);

CREATE INDEX idx_customer_company_customer ON customer_company_assignments(customer);
CREATE INDEX idx_customer_company_code ON customer_company_assignments(companyCode);

CREATE INDEX idx_customer_sales_area_customer ON customer_sales_area_assignments(customer);
CREATE INDEX idx_customer_sales_area_org_ch ON customer_sales_area_assignments(salesOrganization, distributionChannel);

CREATE INDEX idx_product_descriptions_product ON product_descriptions(product);

CREATE INDEX idx_product_plants_product ON product_plants(product);
CREATE INDEX idx_product_plants_plant ON product_plants(plant);

CREATE INDEX idx_plants_sales_org ON plants(salesOrganization);
CREATE INDEX idx_plants_address ON plants(addressId);
`;

/** Column names per table (must match JSONL keys). */
const COLUMNS = {
  sales_order_headers: [
    'salesOrder',
    'salesOrderType',
    'salesOrganization',
    'soldToParty',
    'creationDate',
    'totalNetAmount',
    'transactionCurrency',
    'overallDeliveryStatus',
    'overallOrdReltdBillgStatus',
    'requestedDeliveryDate',
  ],
  sales_order_items: [
    'salesOrder',
    'salesOrderItem',
    'material',
    'requestedQuantity',
    'requestedQuantityUnit',
    'netAmount',
    'productionPlant',
    'storageLocation',
  ],
  sales_order_schedule_lines: [
    'salesOrder',
    'salesOrderItem',
    'scheduleLine',
    'confirmedDeliveryDate',
    'confdOrderQtyByMatlAvailCheck',
  ],
  outbound_delivery_headers: [
    'deliveryDocument',
    'creationDate',
    'shippingPoint',
    'overallGoodsMovementStatus',
    'overallPickingStatus',
    'deliveryBlockReason',
  ],
  outbound_delivery_items: [
    'deliveryDocument',
    'deliveryDocumentItem',
    'referenceSdDocument',
    'referenceSdDocumentItem',
    'plant',
    'actualDeliveryQuantity',
    'storageLocation',
  ],
  billing_document_headers: [
    'billingDocument',
    'billingDocumentType',
    'billingDocumentDate',
    'billingDocumentIsCancelled',
    'totalNetAmount',
    'transactionCurrency',
    'soldToParty',
    'accountingDocument',
    'companyCode',
    'fiscalYear',
  ],
  billing_document_items: [
    'billingDocument',
    'billingDocumentItem',
    'material',
    'billingQuantity',
    'netAmount',
    'referenceSdDocument',
    'referenceSdDocumentItem',
  ],
  billing_document_cancellations: [
    'billingDocument',
    'billingDocumentType',
    'billingDocumentIsCancelled',
    'cancelledBillingDocument',
    'totalNetAmount',
    'soldToParty',
    'accountingDocument',
  ],
  journal_entry_items: [
    'companyCode',
    'fiscalYear',
    'accountingDocument',
    'accountingDocumentItem',
    'glAccount',
    'referenceDocument',
    'amountInTransactionCurrency',
    'transactionCurrency',
    'postingDate',
    'customer',
    'clearingDate',
    'clearingAccountingDocument',
  ],
  payments_accounts_receivable: [
    'companyCode',
    'fiscalYear',
    'accountingDocument',
    'accountingDocumentItem',
    'clearingDate',
    'clearingAccountingDocument',
    'amountInTransactionCurrency',
    'transactionCurrency',
    'customer',
    'postingDate',
  ],
  business_partners: [
    'businessPartner',
    'customer',
    'businessPartnerFullName',
    'businessPartnerName',
    'businessPartnerIsBlocked',
    'creationDate',
  ],
  business_partner_addresses: [
    'businessPartner',
    'addressId',
    'cityName',
    'country',
    'region',
    'streetName',
    'postalCode',
  ],
  customer_company_assignments: [
    'customer',
    'companyCode',
    'paymentTerms',
    'reconciliationAccount',
  ],
  customer_sales_area_assignments: [
    'customer',
    'salesOrganization',
    'distributionChannel',
    'currency',
    'customerPaymentTerms',
    'shippingCondition',
  ],
  products: [
    'product',
    'productType',
    'creationDate',
    'grossWeight',
    'weightUnit',
    'netWeight',
    'productGroup',
    'baseUnit',
    'division',
  ],
  product_descriptions: ['product', 'language', 'productDescription'],
  product_plants: ['product', 'plant', 'profitCenter', 'mrpType'],
  plants: ['plant', 'plantName', 'salesOrganization', 'addressId', 'distributionChannel'],
};

const NUMERIC_COLUMNS = new Set([
  'totalNetAmount',
  'requestedQuantity',
  'netAmount',
  'confdOrderQtyByMatlAvailCheck',
  'actualDeliveryQuantity',
  'billingQuantity',
  'amountInTransactionCurrency',
  'grossWeight',
  'netWeight',
]);

const BOOLEAN_COLUMNS = new Set(['billingDocumentIsCancelled', 'businessPartnerIsBlocked']);

function collectJsonlByEntityFolder(dataDir) {
  /** @type {Map<string, string[]>} */
  const map = new Map();

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.jsonl')) {
        const entityFolder = path.basename(path.dirname(full));
        if (!map.has(entityFolder)) map.set(entityFolder, []);
        map.get(entityFolder).push(full);
      }
    }
  }

  walk(dataDir);
  for (const paths of map.values()) paths.sort();
  return map;
}

function coerceCell(column, raw) {
  if (raw === null || raw === undefined) return null;
  if (BOOLEAN_COLUMNS.has(column)) {
    if (typeof raw === 'boolean') return raw ? 1 : 0;
    return null;
  }
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    if (NUMERIC_COLUMNS.has(column)) {
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : null;
    }
    return raw;
  }
  return null;
}

function rowToParams(columns, row) {
  return columns.map((col) => coerceCell(col, row[col]));
}

/**
 * @param {string} filePath
 * @returns {AsyncGenerator<string, void, void>}
 */
async function* iterateJsonlLines(filePath) {
  const rl = readline.createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.trim()) yield line;
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} table
 * @param {string[]} files
 */
async function loadTable(db, table, files) {
  const columns = COLUMNS[table];
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
  const stmt = db.prepare(sql);

  const insertBatch = db.transaction((/** @type {unknown[][]} */ batch) => {
    for (const params of batch) {
      stmt.run(...params);
    }
  });

  let n = 0;
  let batch = [];

  for (const filePath of files) {
    for await (const line of iterateJsonlLines(filePath)) {
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      batch.push(rowToParams(columns, row));
      if (batch.length >= INSERT_BATCH_SIZE) {
        insertBatch(batch);
        n += batch.length;
        batch = [];
      }
    }
  }
  if (batch.length) {
    insertBatch(batch);
    n += batch.length;
  }

  return n;
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Data directory not found: ${DATA_DIR}`);
    process.exit(1);
  }

  const filesByFolder = collectJsonlByEntityFolder(DATA_DIR);
  removeSqliteFiles(DB_PATH);
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = OFF');
  db.pragma('cache_size = -200000');
  db.exec(DDL);
  db.exec(INDEX_DDL);

  for (const table of TABLE_ORDER) {
    const folder = TABLE_TO_FOLDER[table];
    const paths = folder ? filesByFolder.get(folder) ?? [] : [];
    const count = await loadTable(db, table, paths);
    console.log(`✓ Loaded ${count} ${table}`);
  }

  db.pragma('synchronous = NORMAL');
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
