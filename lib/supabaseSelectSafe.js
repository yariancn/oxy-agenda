/**
 * PostgREST select that retries after stripping columns missing from the live schema.
 * Use for tables that differ between GDL and TX (appointments.email, prefers_sms, etc.).
 */

export function extractMissingColumn(error) {
  if (!error?.message) return null;
  const msg = error.message;
  const quoted = msg.match(/Could not find the '([^']+)' column/i);
  if (quoted) return quoted[1];
  const dotted = msg.match(/column \w+\.(\w+) does not exist/i);
  if (dotted) return dotted[1];
  return null;
}

function isSchemaCacheError(error) {
  return !!error?.message && /column|schema cache/i.test(error.message);
}

function parseColumns(columns) {
  if (Array.isArray(columns)) return columns.map((c) => String(c).trim()).filter(Boolean);
  return String(columns || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * @param {(columnsCsv: string) => Promise<{ data: any, error: any }>} runSelect
 * @param {string|string[]} columns
 */
export async function selectWithColumnFallback(runSelect, columns, { maxAttempts = 16 } = {}) {
  let cols = parseColumns(columns);
  if (!cols.length) return { data: null, error: new Error('no columns') };

  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts && cols.length > 0; attempt += 1) {
    const result = await runSelect(cols.join(', '));
    if (!result.error) return { data: result.data, error: null, columns: cols };

    lastError = result.error;
    if (!isSchemaCacheError(result.error)) {
      return { data: null, error: result.error, columns: cols };
    }

    const missing = extractMissingColumn(result.error);
    if (!missing || !cols.includes(missing)) {
      return { data: null, error: result.error, columns: cols };
    }
    cols = cols.filter((c) => c !== missing);
  }

  return {
    data: null,
    error: lastError || new Error('select failed: incompatible schema'),
    columns: cols,
  };
}

/** Probe whether a single column is selectable on a table. */
export async function columnExists(supabase, table, column) {
  const { error } = await supabase.from(table).select(column).limit(1);
  return !error;
}
