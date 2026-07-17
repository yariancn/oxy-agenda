import assert from 'node:assert/strict';
import {
  extractMissingColumn,
  selectWithColumnFallback,
} from '../lib/supabaseSelectSafe.js';

assert.equal(
  extractMissingColumn({ message: 'column appointments.prefers_sms does not exist' }),
  'prefers_sms',
);
assert.equal(
  extractMissingColumn({ message: "Could not find the 'email' column of 'appointments' in the schema cache" }),
  'email',
);

const missingQueue = ['email', 'prefers_sms'];
const { data, error, columns } = await selectWithColumnFallback(
  async (cols) => {
    for (const m of missingQueue) {
      if (cols.split(',').map((c) => c.trim()).includes(m)) {
        return { data: null, error: { message: `column appointments.${m} does not exist` } };
      }
    }
    return {
      data: { id: '1', patient: 'Ana', phone: '3312345678', time: '10:00', full_date: '2026-07-17' },
      error: null,
    };
  },
  ['id', 'patient', 'phone', 'time', 'full_date', 'email', 'prefers_sms'],
);

assert.equal(error, null);
assert.equal(data.patient, 'Ana');
assert.deepEqual(columns, ['id', 'patient', 'phone', 'time', 'full_date']);
console.log('supabaseSelectSafe ok');
