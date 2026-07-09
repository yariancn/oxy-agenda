import fs from 'node:fs';
import zlib from 'node:zlib';

/**
 * Minimal reader for flat Setmore appointment exports (.xlsx).
 * No external dependencies — reads sharedStrings + sheet1 XML from the zip.
 */

function colToIndex(col) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function readZipEntries(buffer) {
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const compMethod = buffer.readUInt16LE(offset + 8);
    const compSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLen);
    const dataStart = offset + 30 + nameLen + extraLen;
    const comp = buffer.subarray(dataStart, dataStart + compSize);
    let raw = comp;
    if (compMethod === 8) raw = zlib.inflateRawSync(comp);
    entries.set(name, raw);
    offset = dataStart + compSize;
  }
  return entries;
}

function parseSharedStrings(xml) {
  const strings = [];
  const re = /<(?:m:)?si(?:>|[^>]*>)([\s\S]*?)<\/(?:m:)?si>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const chunk = m[1];
    const texts = [...chunk.matchAll(/<(?:m:)?t(?:[^>]*)>([^<]*)<\/(?:m:)?t>/g)].map((t) => t[1]);
    strings.push(texts.join(''));
  }
  return strings;
}

function parseSheetRows(xml, sharedStrings) {
  const rows = new Map();
  const rowRe = /<(?:m:)?row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/(?:m:)?row>/g;
  let rowMatch;
  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const rnum = Number(rowMatch[1]);
    const rowXml = rowMatch[2];
    const cells = new Map();
    const cellRe = /<(?:m:)?c[^>]*\br="([A-Z]+)(\d+)"(?:[^>]*\bt="([^"]*)")?[^>]*>(?:[\s\S]*?<(?:m:)?v>([^<]*)<\/(?:m:)?v>)?/g;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowXml)) !== null) {
      const col = cellMatch[1];
      const type = cellMatch[3];
      const raw = cellMatch[4] ?? '';
      const value = type === 's' ? (sharedStrings[Number(raw)] ?? '') : raw;
      cells.set(colToIndex(col), value);
    }
    if (cells.size > 0) rows.set(rnum, cells);
  }
  return rows;
}

const SETMORE_APPT_FIELDS = {
  1: 'Fecha de cita',
  2: 'Hora de la cita',
  3: 'Servicio/clase/evento',
  4: 'Meeting Type',
  5: 'Cost',
  6: 'proveedor',
  7: 'Nombre del Cliente',
  8: 'Código de País',
  9: 'Teléfono',
  10: 'Correo electrónico',
  11: 'Etiqueta',
  12: 'Estado',
  13: 'Comentarios',
  14: 'ID de reserva',
  15: 'Booked via',
  16: 'Reservado en',
};

function rowsToSetmoreObjects(rows) {
  const out = [];
  for (const [rnum, cells] of rows) {
    if (rnum === 1) continue;
    const obj = {};
    let hasValue = false;
    for (const [colIndex, field] of Object.entries(SETMORE_APPT_FIELDS)) {
      const val = cells.get(Number(colIndex)) ?? '';
      if (val) hasValue = true;
      obj[field] = val;
    }
    if (hasValue) out.push(obj);
  }
  return out;
}

export function readSetmoreXlsx(filePath) {
  const buffer = fs.readFileSync(filePath);
  const entries = readZipEntries(buffer);
  const sharedXml = entries.get('xl/sharedStrings.xml');
  const sheetXml = entries.get('xl/worksheets/sheet1.xml');
  if (!sheetXml) throw new Error(`No sheet1 in ${filePath}`);
  const sharedStrings = sharedXml ? parseSharedStrings(sharedXml.toString('utf8')) : [];
  const rows = parseSheetRows(sheetXml.toString('utf8'), sharedStrings);
  return rowsToSetmoreObjects(rows);
}
