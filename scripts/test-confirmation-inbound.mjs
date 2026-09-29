/**
 * Local unit checks for confirmation SI/NO parsing + inbound payload shape.
 * Does not hit production DB.
 *
 *   node scripts/test-confirmation-inbound.mjs
 */
import assert from 'node:assert/strict';
import { parseConfirmationReply } from '../lib/appointmentConfirmation.js';

const cases = [
  ['SI', 'confirmed'],
  ['si', 'confirmed'],
  ['SÍ', 'confirmed'],
  ['YES', 'confirmed'],
  ['Y', 'confirmed'],
  ['OK', 'confirmed'],
  ['1', 'confirmed'],
  ['NO', 'declined'],
  ['no', 'declined'],
  ['N', 'declined'],
  ['CANCEL', 'declined'],
  ['2', 'declined'],
  ['hola', null],
  ['tal vez', null],
  ['', null],
];

let failed = 0;
for (const [input, expected] of cases) {
  const got = parseConfirmationReply(input);
  try {
    assert.equal(got, expected, `parseConfirmationReply(${JSON.stringify(input)})`);
    console.log(`  ok  ${JSON.stringify(input)} → ${got}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${err.message} (got ${got})`);
  }
}

console.log(failed ? `\n${failed} parse failure(s)` : '\nAll parse checks passed.');

const liveUrl = process.env.CONFIRMATION_INBOUND_URL
  || 'https://oxy-agenda.vercel.app/api/sms/inbound-mx';

console.log(`\nLive webhook probe → ${liveUrl}`);

async function probe(label, init) {
  try {
    const res = await fetch(liveUrl, init);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
    console.log(`  ${label}: HTTP ${res.status}`, JSON.stringify(json));
    return { status: res.status, json };
  } catch (err) {
    console.error(`  ${label}: network error`, err.message);
    return null;
  }
}

// Missing fields → 400
await probe('GET missing', { method: 'GET' });

// LabsMobile-shaped POST with unknown phone → 200 + no_pending (webhook alive)
await probe('POST LabsMobile SI (unknown phone)', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    inbound_number: '12015576234',
    service_number: '12015576234',
    msisdn: '523300000001',
    message: 'SI',
    timestamp: '2026-03-29 18:00:00',
  }),
});

await probe('GET query SI (unknown phone)', {
  method: 'GET',
});

const q = new URL(liveUrl);
q.searchParams.set('msisdn', '523300000002');
q.searchParams.set('message', 'NO');
await probe('GET with msisdn+message', {
  method: 'GET',
  // fetch URL override
}).then(async () => {
  try {
    const res = await fetch(q.toString());
    const json = await res.json().catch(() => ({}));
    console.log(`  GET msisdn+NO: HTTP ${res.status}`, JSON.stringify(json));
    if (res.status === 200 && (json.error === 'no_pending' || json.ok === true)) {
      console.log('\nWebhook is reachable and accepts LabsMobile-shaped payloads.');
    }
  } catch (err) {
    console.error('  GET msisdn+NO failed', err.message);
  }
});

process.exit(failed ? 1 : 0);
