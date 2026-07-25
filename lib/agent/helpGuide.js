import { ROLE_LEVEL } from './constants.js';
import { foldAgentText, fuzzyMatchToken, hasFuzzyToken, tokenizeAgentText } from './textUnderstand.js';

const HELP_TOPICS = [
  {
    id: 'charge_client',
    signals: ['cobrar', 'cobro', 'cobra', 'charge', 'pago', 'pagos', 'ticket', 'venta', 'vender', 'paquete', 'pos', 'cobrarle', 'cliente', 'clientes', 'paciente'],
    replyEs: `💳 CÓMO COBRAR A UN CLIENTE

1. Ve a Pacientes (menú lateral) o abre una cita en la agenda.
2. Pulsa 💳 Expediente del paciente.
3. Baja a «Paquetes, cartera compartida y cobros».
4. En el punto de venta (azul):
   • Elige el servicio / cámara
   • Sesiones, precio unitario y forma de pago
   • Revisa el total a cobrar
5. Pulsa 💳 Cobrar y generar ticket.

Si el paciente debe sesiones (adeudo), el cobro liquida el adeudo primero y el resto va a su cartera.

Cartera compartida 👥: solo el titular del grupo puede cobrar; los demás consumen del mismo saldo.

¿No lo encuentras? Dime el nombre o escribe: buscar paciente [nombre]`,
    replyEn: `💳 HOW TO CHARGE A CLIENT

1. Go to Patients (sidebar) or open an appointment on the schedule.
2. Tap 💳 Chart for that patient.
3. Scroll to «Packages, shared wallet & payments».
4. In the blue point-of-sale section:
   • Pick service / chamber
   • Sessions, unit price, and payment method
   • Check the total charge
5. Tap 💳 Charge & generate receipt.

If the patient owes sessions (debt), payment clears debt first; the remainder goes to their wallet.

Shared wallet 👥: only the group owner can charge; members share the same balance.

Can't find them? Tell me the name or ask: search patient [name]`,
  },
  {
    id: 'schedule_appointment',
    signals: ['agendar', 'agenda', 'cita', 'reservar', 'book', 'appointment', 'hueco', 'horario'],
    exclude: ['hoy', 'today', 'reporte', 'ventas'],
    replyEs: `📅 CÓMO AGENDAR UNA CITA

Opción A — Desde el calendario
1. Pestaña Agenda → elige día y cámara.
2. Toca un hueco libre en la hora deseada.
3. Busca al paciente, confirma servicio, fecha y hora.
4. Agendar espacio.

Opción B — Desde Pacientes
1. Pacientes → busca al cliente → 📅 Agendar.

Opción C — Captura WhatsApp 📷
1. Botón 📷 en la agenda → sube captura → revisa datos → confirmar.

Paciente nuevo: necesitas teléfono de 10 dígitos al guardar.`,
    replyEn: `📅 HOW TO BOOK AN APPOINTMENT

Option A — From the calendar
1. Schedule tab → pick day and chamber.
2. Tap an open slot at the desired time.
3. Search patient, confirm service, date, and time.
4. Schedule slot.

Option B — From Patients
1. Patients → find client → 📅 Schedule.

Option C — WhatsApp screenshot 📷
1. 📷 on schedule → upload screenshot → review → confirm.

New patients need a 10-digit phone when saving.`,
  },
  {
    id: 'search_patient',
    signals: ['buscar', 'encuentra', 'encontrar', 'search', 'find', 'localiza', 'expediente', 'ficha'],
    replyEs: `🔍 **Cómo buscar un paciente**

• En el chat: \`buscar paciente García\` o solo \`maría lópez\`
• En la app: pestaña **Pacientes** → cuadro de búsqueda (nombre o teléfono)

**Si no aparece:**
• Prueba solo apellido o solo nombre
• Busca por **teléfono** (10 dígitos)
• Confirma la **clínica activa** (GDL / Houston) arriba a la izquierda
• Si es nuevo, créalo al agendar o en Pacientes`,
    replyEn: `🔍 **How to find a patient**

• In chat: \`search patient Garcia\` or just \`maria lopez\`
• In the app: **Patients** tab → search box (name or phone)

**If nothing shows up:**
• Try last name only or first name only
• Search by **phone** (10 digits)
• Check the **active clinic** (GDL / Houston) top-left
• If new, create them when booking or under Patients`,
  },
  {
    id: 'shared_wallet',
    signals: ['compartida', 'compartido', 'grupo', 'shared', 'cartera'],
    secondary: ['cartera', 'paquete', 'sesiones', 'wallet', 'grupo', 'compartida', 'compartido'],
    replyEs: `👥 CÓMO CREAR UNA CARTERA COMPARTIDA

Sirve cuando un paquete lo pagan juntos y varias pacientes consumen del mismo saldo
(ej. 10 sesiones pagadas → 5 y 5).

1. Abre el 💳 Expediente de la titular (quien paga / dueña del grupo).
2. Baja a «Paquetes, cartera compartida y cobros» → 👥 Cartera compartida.
3. Pon un nombre al grupo y marca a la(s) beneficiaria(s) en la lista.
4. Pulsa Crear grupo compartido.
5. Cobra el paquete completo a la titular (p. ej. 10 sesiones) en el POS azul.
6. Al sellar bitácora, cada miembro descuenta del mismo saldo del grupo.

Ejemplo: Marisol + Ma. Eugenia con 10 sesiones → crea el grupo con ambas,
cobra 10 a la titular; cada una toma 5 hasta llegar a 0.

Si ambas ya entraron hoy y tienen adeudo (sesión sin pago), igual pueden
compartir: el adeudo se junta en el grupo y al cobrar el paquete se liquida
primero; el resto queda como saldo compartido.

¿Quieres buscar a una de ellas? Escribe: buscar paciente [nombre]`,
    replyEn: `👥 HOW TO CREATE A SHARED WALLET

Use when one package is paid once and several patients draw from the same balance
(e.g. 10 sessions paid → 5 and 5).

1. Open the owner's 💳 Chart (who pays / group owner).
2. Scroll to «Packages, shared wallet & payments» → 👥 Shared wallet.
3. Enter a group name and check the beneficiary(ies) in the list.
4. Tap Create shared group.
5. Charge the full package to the owner (e.g. 10 sessions) in the blue POS.
6. When sealing check-in, each member deducts from the same group balance.

Example: two patients share 10 → create the group with both, charge 10 to the owner;
each takes 5 until balance is 0.

If both already visited today and have unpaid debt, they can still share:
debt pools into the group; charging the package clears it first, then the rest
becomes shared wallet balance.

Search someone with: search patient [name]`,
  },
  {
    id: 'open_chart',
    signals: ['expediente', 'chart', 'historial', 'saldo', 'adeudo'],
    replyEs: `💳 **Cómo abrir el expediente**

1. **Pacientes** → **💳 Expediente** en la tarjeta del cliente, **o**
2. **Agenda** → toca una cita → **Abrir expediente**.

Ahí ves: datos de contacto, cartera de sesiones, historial de cobros, cartera compartida 👥 y notas.`,
    replyEn: `💳 **How to open the chart**

1. **Patients** → **💳 Chart** on the client card, **or**
2. **Schedule** → tap an appointment → **Open chart**.

You'll see: contact info, session wallet, payment history, shared wallet 👥, and notes.`,
  },
  {
    id: 'bitacora',
    signals: ['bitacora', 'bitácora', 'check', 'checkin', 'check-in', 'finalizar', 'atender', 'sesion'],
    replyEs: `📋 **Cómo abrir la bitácora (check-in)**

1. **Agenda** → toca la **cita** del paciente.
2. Asigna **personal que atiende** (si aplica).
3. Pulsa **Abrir bitácora**.
4. Al terminar la sesión, completa y **sella** la bitácora.

Si no hay saldo pagado en cartera, el sistema puede pedir confirmación o cobro.`,
    replyEn: `📋 **How to open check-in (bitácora)**

1. **Schedule** → tap the patient's **appointment**.
2. Assign **attending staff** (if needed).
3. Tap **Open check-in**.
4. When done, complete and **seal** the record.

If there's no paid balance in the wallet, the system may ask to confirm or charge.`,
  },
  {
    id: 'cancel_sale',
    signals: ['cancelar', 'cancel', 'devolver', 'reembolso', 'refund', 'anular'],
    secondary: ['cobro', 'venta', 'ticket', 'pago', 'charge', 'sale'],
    minLevel: ROLE_LEVEL.MANAGER,
    replyEs: `↩️ **Cómo cancelar un cobro**

Solo **gerencia** (nivel 2 o maestro):

1. Abre el **💳 Expediente** del paciente.
2. En **historial de compras**, localiza el ticket.
3. Usa **Cancelar / reembolsar cobro** (si está disponible).

Esto revierte sesiones en cartera. Si no ves el botón, tu usuario no tiene ese nivel.`,
    replyEn: `↩️ **How to cancel a charge**

**Managers only** (level 2 or master):

1. Open the patient's **💳 Chart**.
2. In **purchase history**, find the receipt.
3. Use **Cancel / refund charge** (when available).

This reverses sessions in the wallet. If you don't see the button, your role lacks access.`,
  },
  {
    id: 'sales_report',
    signals: ['reporte', 'ventas', 'vendimos', 'sales', 'report', 'caja'],
    minLevel: ROLE_LEVEL.MANAGER,
    replyEs: `📊 **Reportes de ventas**

Solo **gerencia** (nivel 2 o maestro):

• En el chat: \`reporte de ventas de hoy\`
• En la app: pestaña **Reportes** (si tu nivel la muestra)

El staff básico no ve montos ni ventas por diseño de permisos.`,
    replyEn: `📊 **Sales reports**

**Managers only** (level 2 or master):

• In chat: \`sales report today\`
• In the app: **Reports** tab (if your level shows it)

Basic staff cannot see revenue by permission design.`,
  },
  {
    id: 'screenshot_intake',
    signals: ['captura', 'screenshot', 'whatsapp', 'ocr', 'imagen', 'foto'],
    replyEs: `📷 **Agendar desde captura de WhatsApp**

1. En **Agenda**, pulsa el botón **📷** (arriba).
2. Sube la **captura** de la conversación.
3. Revisa nombre, fecha, hora y cámara detectados.
4. Confirma para abrir el formulario de cita ya lleno.

Funciona en el navegador; no necesita internet extra después de cargar la página.`,
    replyEn: `📷 **Book from WhatsApp screenshot**

1. On **Schedule**, tap **📷** (top).
2. Upload the chat **screenshot**.
3. Review detected name, date, time, and chamber.
4. Confirm to open the booking form pre-filled.

Runs in the browser; no extra API needed after the page loads.`,
  },
];

export function isHelpQuestion(message) {
  const raw = String(message || '');
  const folded = foldAgentText(message);
  if (!folded) return false;
  // foldAgentText strips punctuation — check the raw string for "?"
  if (/\?/.test(raw) || folded.includes('?')) return true;
  const patterns = [
    /\bcomo\s+(puedo|hago|se|le|creo|crear|hago)\b/,
    /\bcomo\s+\w+/,
    /\bdonde\s+(esta|queda|puedo|veo|encuentro)\b/,
    /\bque\s+hago\b/,
    /\bayuda\b/,
    /\bhelp\b/,
    /\bno\s+(lo\s+)?encuentro\b/,
    /\bno\s+aparece\b/,
    /\bexplicame\b/,
    /\bnecesito\s+(saber|ayuda)\b/,
    /\bhow\s+(do|can|to)\b/,
  ];
  return patterns.some((p) => p.test(folded));
}

function topicMatches(topic, tokens, folded) {
  if (!hasFuzzyToken(tokens, topic.signals)) return false;
  if (topic.exclude?.length && hasFuzzyToken(tokens, topic.exclude)) return false;
  if (topic.secondary?.length) {
    return hasFuzzyToken(tokens, topic.secondary);
  }
  return true;
}

function scoreTopic(topic, tokens, folded) {
  if (!topicMatches(topic, tokens, folded)) return 0;
  let score = 0;
  for (const sig of topic.signals) {
    if (tokens.some((t) => fuzzyMatchToken(t, [sig]))) score += 2;
  }
  if (topic.secondary) {
    for (const sig of topic.secondary) {
      if (tokens.some((t) => fuzzyMatchToken(t, [sig]))) score += 3;
    }
  }
  if (/\bcomo\b/.test(folded) && topic.id === 'charge_client' && hasFuzzyToken(tokens, ['cobrar', 'cobro', 'pago'])) {
    score += 5;
  }
  if (/\b(cartera|wallet|grupo)\b/.test(folded) && /\bcompartid/.test(folded) && topic.id === 'shared_wallet') {
    score += 8;
  }
  return score;
}

export function resolveHelpTopic(message, { roleLevel = ROLE_LEVEL.STAFF, locale = 'es' } = {}) {
  const folded = foldAgentText(message);
  const tokens = tokenizeAgentText(message);

  let best = null;
  let bestScore = 0;
  for (const topic of HELP_TOPICS) {
    // Default how-tos are for any authenticated user (GUEST=99 inclusive).
    const minLevel = topic.minLevel ?? ROLE_LEVEL.GUEST;
    if (roleLevel > minLevel) continue;
    const score = scoreTopic(topic, tokens, folded);
    if (score > bestScore) {
      bestScore = score;
      best = topic;
    }
  }

  if (best && bestScore >= 2) {
    return {
      topicId: best.id,
      reply: locale === 'en' ? best.replyEn : best.replyEs,
    };
  }

  return null;
}

export function buildGeneralHelp({ roleLevel = ROLE_LEVEL.STAFF, locale = 'es' } = {}) {
  const linesEs = [
    'Puedo explicarte cómo hacer cosas en OXY Agenda. Ejemplos:',
    '• «¿Cómo cobro a un cliente?»',
    '• «¿Cómo creo una cartera compartida?»',
    '• «¿Cómo agendo una cita?»',
    '• «No encuentro un paciente»',
    '• «¿Dónde veo el expediente?»',
    '',
    'También puedo ejecutar (según tu nivel):',
    '• `buscar paciente García`',
    '• `agenda de hoy`',
    '• `agendar María López mañana 10:30`',
  ];
  const linesEn = [
    'I can explain how to do things in OXY Agenda. Examples:',
    '• "How do I charge a client?"',
    '• "How do I create a shared wallet?"',
    '• "How do I book an appointment?"',
    '• "I can\'t find a patient"',
    '• "Where is the chart?"',
    '',
    'I can also run (based on your access):',
    '• `search patient Garcia`',
    '• `today\'s schedule`',
    '• `book Maria Lopez tomorrow 10:30 AM`',
  ];

  if (roleLevel <= ROLE_LEVEL.MANAGER) {
    (locale === 'en' ? linesEn : linesEs).push('• `sales report today`');
  }

  return (locale === 'en' ? linesEn : linesEs).join('\n');
}

export function buildPatientNotFoundHelp(query, locale = 'es') {
  const q = String(query || '').trim();
  if (locale === 'en') {
    return `I didn't find patients matching "${q || '…'}".

**Try:**
• Another spelling or accent (e.g. Garcia / García — I understand both)
• Last name only or first name only
• Phone number (10 digits)
• Confirm the active clinic (GDL / Houston) top-left

**New patient?** Create them from **Patients** or when booking a slot.

Ask me: \`how do I charge a client?\` or \`search patient [name]\``;
  }
  return `No encontré pacientes con «${q || '…'}».

**Prueba:**
• Otra forma de escribir el nombre (con o sin acentos)
• Solo apellido o solo nombre
• Teléfono (10 dígitos)
• Confirma la clínica activa (GDL / Houston) arriba a la izquierda

**¿Paciente nuevo?** Créalo en **Pacientes** o al agendar una cita.

Pregúntame: «¿cómo cobro a un cliente?» o \`buscar paciente [nombre]\``;
}

export function buildEmptyScheduleHelp(dateLabel, locale = 'es') {
  if (locale === 'en') {
    return `No appointments for ${dateLabel}.

That may be normal. To book: tap an open slot on the schedule or ask me \`how do I book an appointment?\``;
  }
  return `Sin citas para ${dateLabel}.

Puede ser normal. Para agendar: toca un hueco libre en la agenda o pregúntame «¿cómo agendo una cita?»`;
}
