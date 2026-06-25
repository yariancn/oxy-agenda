/** Ancho estándar impresoras térmicas 58 mm (Uplayteck y similares). */
export const THERMAL_WIDTH_MM = 58;

function escapeTitle(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function wrapThermalPrintDocument(bodyHtml, title = 'Ticket POS') {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${THERMAL_WIDTH_MM}mm" />
  <title>${escapeTitle(title)}</title>
  <style>
    @page { size: ${THERMAL_WIDTH_MM}mm auto; margin: 1.5mm; }
    html, body {
      margin: 0;
      padding: 0;
      width: ${THERMAL_WIDTH_MM}mm;
      max-width: ${THERMAL_WIDTH_MM}mm;
      background: #fff;
      color: #000;
    }
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    img { max-width: 52mm; height: auto; }
    p { margin: 0 0 3px; word-break: break-word; }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

/**
 * Imprime vía diálogo del sistema. Devuelve promesa:
 * - ok: diálogo de impresión mostrado y cerrado
 * - error: no se pudo abrir impresión (p. ej. impresora BT no disponible)
 */
export function printThermalHtml(bodyHtml, title = 'Ticket POS') {
  if (typeof window === 'undefined') {
    return Promise.resolve({ ok: false, status: 'error', code: 'no_window' });
  }

  return new Promise((resolve) => {
    let settled = false;
    let sawPrintDialog = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none;opacity:0';
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    let dialogTimer = null;
    let failTimer = null;

    const cleanup = () => {
      if (dialogTimer) window.clearTimeout(dialogTimer);
      if (failTimer) window.clearTimeout(failTimer);
      win?.removeEventListener('beforeprint', onBeforePrint);
      win?.removeEventListener('afterprint', onAfterPrint);
      window.removeEventListener('afterprint', onWindowAfterPrint);
      window.setTimeout(() => {
        if (iframe.parentNode) document.body.removeChild(iframe);
      }, 500);
    };

    const onBeforePrint = () => {
      sawPrintDialog = true;
    };

    const onAfterPrint = () => {
      finish({ ok: true, status: 'ok', code: 'printed' });
    };

    const onWindowAfterPrint = () => {
      if (!settled) finish({ ok: true, status: 'ok', code: 'printed_window' });
    };

    const runPrint = () => {
      try {
        win.addEventListener('beforeprint', onBeforePrint);
        win.addEventListener('afterprint', onAfterPrint);
        window.addEventListener('afterprint', onWindowAfterPrint);

        failTimer = window.setTimeout(() => {
          if (!sawPrintDialog && !settled) {
            finish({ ok: false, status: 'error', code: 'print_unavailable' });
          }
        }, 5000);

        dialogTimer = window.setTimeout(() => {
          if (sawPrintDialog && !settled) {
            finish({ ok: true, status: 'ok', code: 'dialog_timeout' });
          }
        }, 120000);

        win.focus();
        win.print();
      } catch {
        finish({ ok: false, status: 'error', code: 'print_exception' });
      }
    };

    const doc = win.document;
    doc.open();
    doc.write(wrapThermalPrintDocument(bodyHtml, title));
    doc.close();

    const imgs = doc.querySelectorAll('img');
    if (imgs.length === 0) {
      window.setTimeout(runPrint, 200);
      return;
    }

    let pending = imgs.length;
    const imgDone = () => {
      pending -= 1;
      if (pending <= 0) window.setTimeout(runPrint, 120);
    };

    imgs.forEach((img) => {
      if (img.complete) imgDone();
      else {
        img.addEventListener('load', imgDone);
        img.addEventListener('error', imgDone);
      }
    });

    window.setTimeout(() => {
      if (!settled) runPrint();
    }, 3000);
  });
}
