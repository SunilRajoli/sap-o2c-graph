/** @param {unknown} value */
function parseIsoDate(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function formatDateField(value) {
  const d = parseIsoDate(value);
  if (!d) return value === null || value === undefined ? '—' : String(value);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * @param {unknown} value
 * @param {string | null | undefined} currencyCode ISO 4217 when known
 * @returns {string}
 */
export function formatAmountField(value, currencyCode) {
  if (value === null || value === undefined) return '—';
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
  if (!Number.isFinite(n)) return String(value);
  const code = currencyCode && String(currencyCode).trim();
  if (code) {
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: code.length === 3 ? code : 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);
    } catch {
      return `${n.toFixed(2)} ${code}`;
    }
  }
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * @param {string} key
 */
function isLikelyDateKey(key) {
  return /date$/i.test(key) || /^postingDate$/i.test(key) || /^clearingDate$/i.test(key);
}

/**
 * @param {string} key
 */
function isLikelyAmountKey(key) {
  return (
    /amount$/i.test(key) ||
    /Amount$/i.test(key) ||
    key === 'totalNetAmount' ||
    key === 'amountInTransactionCurrency' ||
    key === 'netAmount'
  );
}

/**
 * @param {string} key
 * @param {unknown} value
 * @param {Record<string, unknown>} all
 * @returns {string}
 */
export function formatNodeDataEntry(key, value, all) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  if (/^is[A-Z]|Is[A-Za-z]+$/i.test(key) || /IsCancelled|IsBlocked/i.test(key)) {
    if (value === 0 || value === '0') return 'No';
    if (value === 1 || value === '1') return 'Yes';
  }

  if (isLikelyDateKey(key)) {
    return formatDateField(value);
  }

  if (isLikelyAmountKey(key)) {
    const cur = /** @type {string | undefined} */ (
      all.transactionCurrency || all.currency
    );
    return formatAmountField(value, cur);
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

/**
 * @param {Record<string, unknown>} data
 * @returns {string[]}
 */
export function orderedDataKeys(data) {
  return Object.keys(data).sort((a, b) => a.localeCompare(b));
}

/** @param {string} key */
export function humanizeKey(key) {
  if (!key) return '';
  const spaced = key.replace(/([A-Z])/g, ' $1').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
