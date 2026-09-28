/**
 * Native / Capacitor Bluetooth thermal print bridge.
 * Web (Safari/Chrome) never uses this — AirPrint path stays untouched.
 */

export const NATIVE_PRINTER_STORAGE_KEY = 'oxy_native_bt_printer_v1';

export function isCapacitorNative() {
  if (typeof window === 'undefined') return false;
  try {
    const cap = window.Capacitor;
    if (!cap) return false;
    if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform();
    return Boolean(cap.isNative || cap.Platform || cap.getPlatform?.());
  } catch {
    return false;
  }
}

export function getSavedNativePrinter() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(NATIVE_PRINTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.deviceId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveNativePrinter(printer) {
  if (typeof window === 'undefined') return;
  if (!printer?.deviceId) {
    window.localStorage.removeItem(NATIVE_PRINTER_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(NATIVE_PRINTER_STORAGE_KEY, JSON.stringify({
    deviceId: String(printer.deviceId),
    name: String(printer.name || 'Impresora BT'),
    serviceUuid: printer.serviceUuid || '',
    characteristicUuid: printer.characteristicUuid || '',
    savedAt: new Date().toISOString(),
  }));
}

/** Strip HTML to plain lines suitable for 58 mm ESC/POS text. */
export function htmlToThermalText(html) {
  const doc = typeof DOMParser !== 'undefined'
    ? new DOMParser().parseFromString(String(html || ''), 'text/html')
    : null;
  let text = '';
  if (doc?.body) {
    text = doc.body.innerText || doc.body.textContent || '';
  } else {
    text = String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, ' ');
  }
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trimEnd().slice(0, 32))
    .join('\n')
    .trim();
}

/** Minimal ESC/POS payload: init + text + feed + partial cut. */
export function encodeEscPosText(plainText) {
  const encoder = typeof TextEncoder !== 'undefined'
    ? new TextEncoder('utf-8')
    : null;
  const chunks = [];
  const pushBytes = (arr) => {
    chunks.push(Uint8Array.from(arr));
  };
  // ESC @ init
  pushBytes([0x1b, 0x40]);
  // ESC a 1 center (optional) — left align is safer
  pushBytes([0x1b, 0x61, 0x00]);
  // Code page / UTF-8 where supported (many 58mm ignore; ASCII subset still prints)
  const text = `${String(plainText || '')}\n\n\n`;
  if (encoder) {
    chunks.push(encoder.encode(text));
  } else {
    const bytes = [];
    for (let i = 0; i < text.length; i += 1) {
      bytes.push(text.charCodeAt(i) & 0xff);
    }
    chunks.push(Uint8Array.from(bytes));
  }
  // Feed + GS V 0 cut
  pushBytes([0x1b, 0x64, 0x03]);
  pushBytes([0x1d, 0x56, 0x00]);

  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Try printing via Capacitor / injected native bridge.
 * Returns null if native path is not available (caller should use AirPrint).
 */
export async function tryNativeThermalPrint(bodyHtml, title = 'Ticket') {
  if (!isCapacitorNative()) return null;

  const printer = getSavedNativePrinter();
  if (!printer?.deviceId) {
    return {
      ok: false,
      status: 'error',
      code: 'no_native_printer',
      via: 'native',
      message: 'Elige una impresora Bluetooth en Admin → Impresora iPad.',
    };
  }

  const plain = htmlToThermalText(bodyHtml);
  const payload = encodeEscPosText(plain);
  const dataBase64 = bytesToBase64(payload);

  // 1) Custom bridge injected by the Capacitor shell (preferred).
  if (typeof window.OxyThermalPrint?.print === 'function') {
    const result = await window.OxyThermalPrint.print({
      deviceId: printer.deviceId,
      name: printer.name,
      serviceUuid: printer.serviceUuid,
      characteristicUuid: printer.characteristicUuid,
      title,
      text: plain,
      dataBase64,
      html: bodyHtml,
      widthMm: 58,
    });
    return {
      ok: result?.ok !== false,
      status: result?.ok === false ? 'error' : 'ok',
      code: result?.code || (result?.ok === false ? 'native_print_failed' : 'native_printed'),
      via: 'native',
      message: result?.message || '',
    };
  }

  // 2) Optional community BLE plugin if the shell registered it.
  try {
    const { BleClient, numbersToDataView } = await import('@capacitor-community/bluetooth-le');
    await BleClient.initialize({ androidNeverForLocation: true });
    await BleClient.connect(printer.deviceId, () => {});
    const services = await BleClient.getServices(printer.deviceId);
    const writeTarget = pickWriteCharacteristic(services, printer);
    if (!writeTarget) {
      await BleClient.disconnect(printer.deviceId).catch(() => null);
      return {
        ok: false,
        status: 'error',
        code: 'no_write_characteristic',
        via: 'native',
        message: 'La impresora no expone un canal BLE de escritura ESC/POS.',
      };
    }
    const chunkSize = 100;
    for (let i = 0; i < payload.length; i += chunkSize) {
      const slice = payload.subarray(i, i + chunkSize);
      const dataView = numbersToDataView(Array.from(slice));
      try {
        await BleClient.write(
          printer.deviceId,
          writeTarget.serviceUuid,
          writeTarget.characteristicUuid,
          dataView,
        );
      } catch {
        await BleClient.writeWithoutResponse(
          printer.deviceId,
          writeTarget.serviceUuid,
          writeTarget.characteristicUuid,
          dataView,
        );
      }
    }
    await BleClient.disconnect(printer.deviceId).catch(() => null);
    return { ok: true, status: 'ok', code: 'ble_printed', via: 'native' };
  } catch (err) {
    return {
      ok: false,
      status: 'error',
      code: 'ble_failed',
      via: 'native',
      message: err?.message || String(err),
    };
  }
}

function pickWriteCharacteristic(services, printer) {
  if (printer.serviceUuid && printer.characteristicUuid) {
    return {
      serviceUuid: printer.serviceUuid,
      characteristicUuid: printer.characteristicUuid,
    };
  }
  const list = services || [];
  for (const svc of list) {
    for (const ch of svc.characteristics || []) {
      const props = ch.properties || {};
      if (props.write || props.writeWithoutResponse) {
        return { serviceUuid: svc.uuid, characteristicUuid: ch.uuid };
      }
    }
  }
  return null;
}

/**
 * Scan nearby BLE devices (Capacitor shell only).
 */
export async function scanNativePrinters({ timeoutMs = 8000 } = {}) {
  if (!isCapacitorNative()) {
    return { ok: false, devices: [], error: 'not_native' };
  }
  if (typeof window.OxyThermalPrint?.scan === 'function') {
    const result = await window.OxyThermalPrint.scan({ timeoutMs });
    return {
      ok: true,
      devices: result?.devices || [],
    };
  }
  try {
    const { BleClient } = await import('@capacitor-community/bluetooth-le');
    await BleClient.initialize({ androidNeverForLocation: true });
    const devices = [];
    await BleClient.requestLEScan({}, (result) => {
      const id = result?.device?.deviceId;
      const name = result?.device?.name || result?.localName || '';
      if (!id) return;
      if (!devices.some((d) => d.deviceId === id)) {
        devices.push({ deviceId: id, name: name || id.slice(0, 8) });
      }
    });
    await new Promise((r) => setTimeout(r, timeoutMs));
    await BleClient.stopLEScan().catch(() => null);
    return { ok: true, devices };
  } catch (err) {
    return { ok: false, devices: [], error: err?.message || String(err) };
  }
}
