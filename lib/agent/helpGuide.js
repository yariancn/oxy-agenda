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
   • Opcional: «Pago parcial / anticipo» (ej. cobra parte del paquete ahora)
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
   • Optional: «Partial payment / deposit» (charge part of a package now)
   • Check the total charge
5. Tap 💳 Charge & generate receipt.

If the patient owes sessions (debt), payment clears debt first; the remainder goes to their wallet.

Shared wallet 👥: only the group owner can charge; members share the same balance.

Can't find them? Tell me the name or ask: search patient [name]`,
  },
  {
    id: 'schedule_appointment',
    signals: ['agendar', 'agenda', 'cita', 'reservar', 'book', 'appointment', 'hueco', 'horario'],
    exclude: ['hoy', 'today', 'reporte', 'ventas', 'reprogram', 'mover', 'pasado'],
    replyEs: `📅 CÓMO AGENDAR UNA CITA

Opción A — Desde el calendario
1. Pestaña Agenda → elige día y cámara.
2. Toca un hueco libre en la hora deseada.
3. Busca al paciente y, si ya existe, haz clic en el resultado de la lista (obligatorio).
4. Confirma servicio, fecha y hora → Agendar espacio.

Opción B — Desde Pacientes
1. Pacientes → busca al cliente → 📅 Agendar.

Opción C — Por voz 🎤
1. Botón 🎤 → dicta nombre, fecha, hora y cámara (Split View con WhatsApp).
2. Revisar → Agendar.

Paciente nuevo: necesitas teléfono de 10 dígitos al guardar.
Si el nombre ya existe, elige de la lista (no escribas a mano).
No se puede crear una cita nueva en el pasado (sí mover una existente con código 0000).`,
    replyEn: `📅 HOW TO BOOK AN APPOINTMENT

Option A — From the calendar
1. Schedule tab → pick day and chamber.
2. Tap an open slot at the desired time.
3. Search the patient and, if they exist, click a result from the list (required).
4. Confirm service, date, and time → Schedule slot.

Option B — From Patients
1. Patients → find client → 📅 Schedule.

Option C — By voice 🎤
1. 🎤 button → dictate name, date, time, chamber (Split View with WhatsApp).
2. Review → Book.

New patients need a 10-digit phone.
If the name already exists, pick from the list — don't type freehand.
You cannot create a brand-new appointment in the past (moving an existing one with code 0000 is allowed).`,
  },
  {
    id: 'reschedule_move',
    signals: ['reprogramar', 'reprogramacion', 'reubicación', 'reubicar', 'mover', 'move', 'reschedule', 'pasado', '0000'],
    secondary: ['cita', 'horario', 'agenda', 'reprogram', 'mover', 'pasado', '0000', 'arrastr'],
    replyEs: `📅 CÓMO REPROGRAMAR / MOVER UNA CITA

1. Abre la cita → Reprogramar (o arrastra la cita en escritorio).
2. Elige nueva fecha/hora/cámara en el panel o tocando un hueco del calendario.
3. Confirma el cambio.

Mover al pasado (paciente llegó temprano, etc.):
• Al elegir un horario ya pasado aparece el código de autorización.
• Ingresa 0000 → autorizar → confirmar.
• Crear citas nuevas en el pasado sigue bloqueado; solo aplica al mover una existente.`,
    replyEn: `📅 HOW TO RESCHEDULE / MOVE AN APPOINTMENT

1. Open the appointment → Reschedule (or drag it on desktop).
2. Pick the new date/time/chamber in the panel or by tapping a calendar slot.
3. Confirm the change.

Moving into the past (patient arrived early, etc.):
• Choosing a past time opens the authorization code modal.
• Enter 0000 → authorize → confirm.
• Creating brand-new appointments in the past stays blocked; override is only for moving an existing one.`,
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
• Si es nuevo, créalo al agendar o en Pacientes

Al agendar: si el nombre ya existe, haz clic en el resultado de la lista para vincular el expediente correcto.`,
    replyEn: `🔍 **How to find a patient**

• In chat: \`search patient Garcia\` or just \`maria lopez\`
• In the app: **Patients** tab → search box (name or phone)

**If nothing shows up:**
• Try last name only or first name only
• Search by **phone** (10 digits)
• Check the **active clinic** (GDL / Houston) top-left
• If new, create them when booking or under Patients

When booking: if the name already exists, click a search result to link the correct chart.`,
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
3. Pon un nombre al grupo.
4. Busca a cada beneficiaria por nombre o teléfono, selecciónala y agrégala (no es una lista fija).
5. Pulsa Crear grupo compartido.
6. Cobra el paquete completo a la titular (p. ej. 10 sesiones) en el POS azul.
7. Al sellar bitácora, cada miembro descuenta del mismo saldo del grupo.

Notas:
• Solo el titular cobra; los miembros consumen.
• Si alguien ya tiene saldo o adeudo, al unirse puede migrar al grupo.
• No puede unirse si ya pertenece a otro grupo.

¿Quieres buscar a una de ellas? Escribe: buscar paciente [nombre]`,
    replyEn: `👥 HOW TO CREATE A SHARED WALLET

Use when one package is paid once and several patients draw from the same balance
(e.g. 10 sessions paid → 5 and 5).

1. Open the owner's 💳 Chart (who pays / group owner).
2. Scroll to «Packages, shared wallet & payments» → 👥 Shared wallet.
3. Enter a group name.
4. Search each beneficiary by name or phone, select them, and add them (not a static checklist).
5. Tap Create shared group.
6. Charge the full package to the owner (e.g. 10 sessions) in the blue POS.
7. When sealing check-in, each member deducts from the same group balance.

Notes:
• Only the owner can charge; members consume.
• Existing balance or debt may migrate into the group on join.
• Someone already in another group cannot join.

Search someone with: search patient [name]`,
  },
  {
    id: 'open_chart',
    signals: ['expediente', 'chart', 'historial', 'saldo', 'adeudo'],
    replyEs: `💳 **Cómo abrir el expediente**

1. **Pacientes** → **💳 Expediente** en la tarjeta del cliente, **o**
2. **Agenda** → toca una cita → **Expediente**.

Ahí ves: datos de contacto, cartera de sesiones, historial de cobros, cartera compartida 👥 y notas.`,
    replyEn: `💳 **How to open the chart**

1. **Patients** → **💳 Chart** on the client card, **or**
2. **Schedule** → tap an appointment → **Chart**.

You'll see: contact info, session wallet, payment history, shared wallet 👥, and notes.`,
  },
  {
    id: 'bitacora',
    signals: ['bitacora', 'bitácora', 'check', 'checkin', 'check-in', 'finalizar', 'atender', 'sesion', 'sellar', 'firmar'],
    replyEs: `📋 **Cómo abrir y sellar la bitácora**

1. **Agenda** → toca la **cita** del paciente.
2. Asigna **quién atendió** (obligatorio antes de firmar).
3. Pulsa **Bitácora**.
4. Completa y **sella** con la firma del paciente.

Reglas actuales:
• Solo se puede sellar citas de **hoy o días pasados** (si se olvidaron).
• Citas de **días futuros**: no se firma; sí puedes marcar falta, no show o cancelar.
• Sin saldo en cartera: al sellar se puede registrar **adeudo** (pide confirmación).
• Ya sellada (Finalizado): no cambia el estatus.

**Si la firma quedó mal:** abre la cita → **Quitar sello y volver a firmar** → escribe **tu NIP**. Se borra la firma, la bitácora vuelve a quedar abierta y **no se cobra otra vez** la sesión.`,
    replyEn: `📋 **How to open and seal attendance**

1. **Schedule** → tap the patient's **appointment**.
2. Assign **staff on duty** (required before signing).
3. Tap **Attendance**.
4. Complete and **seal** with the patient signature.

Current rules:
• You can seal **today or past** days (if someone forgot).
• **Future calendar days**: no sealing; you can still mark excused, no-show, or cancel.
• Empty wallet: sealing may record **debt** (asks for confirmation).
• Already sealed (Completed): status is locked.

**If the signature came out wrong:** open the visit → **Remove seal & sign again** → type **your PIN**. The signature is deleted, attendance reopens, and the session is **not charged again**.`,
  },
  {
    id: 'cancel_sale',
    signals: ['cancelar', 'cancel', 'devolver', 'reembolso', 'refund', 'anular', 'revertir'],
    secondary: ['cobro', 'venta', 'ticket', 'pago', 'charge', 'sale'],
    minLevel: ROLE_LEVEL.MANAGER,
    replyEs: `↩️ **Cómo cancelar / devolver un cobro**

Solo **gerencia** (nivel 2 o maestro):

Desde el expediente:
1. Abre el **💳 Expediente** del paciente.
2. En el historial de compras, localiza el ticket.
3. Usa **Revertir** (revierte sesiones en cartera).

Desde Reportes / Ventas:
• Con ventas desbloqueadas, en el ticket usa **Devolver Cobro**.

Si no ves el botón, tu usuario no tiene ese nivel.`,
    replyEn: `↩️ **How to cancel / reverse a charge**

**Managers only** (level 2 or master):

From the chart:
1. Open the patient's **💳 Chart**.
2. In purchase history, find the receipt.
3. Use **Reverse** (reverses wallet sessions).

From Reports / Sales:
• With sales unlocked, use **Refund charge** on the receipt.

If you don't see the button, your role lacks access.`,
  },
  {
    id: 'sales_report',
    signals: ['reporte', 'ventas', 'vendimos', 'sales', 'report', 'caja'],
    minLevel: ROLE_LEVEL.MANAGER,
    replyEs: `📊 **Reportes de ventas**

Solo **gerencia** (nivel 2 o maestro):

• En el chat: \`reporte de ventas de hoy\`
• En la app: pestaña **Reportes** → desbloquear con la **llave financiera** (NIP) para ver montos

El staff básico no ve montos ni ventas por diseño de permisos.`,
    replyEn: `📊 **Sales reports**

**Managers only** (level 2 or master):

• In chat: \`sales report today\`
• In the app: **Reports** tab → unlock with the **financial key** (PIN) to see amounts

Basic staff cannot see revenue by permission design.`,
  },
  {
    id: 'screenshot_intake',
    signals: ['captura', 'screenshot', 'whatsapp', 'ocr', 'imagen', 'foto', 'voz', 'dictar', 'voice', 'microfono', 'micrófono'],
    replyEs: `🎤 **Agendar por voz**

1. Pulsa **🎤 Agendar por voz** (menú o barra inferior).
2. **Minimizar** el panel y abre WhatsApp/Facebook en **Split View** (iPad) o pantalla dividida.
3. Dicta: nombre, fecha, hora, cámara y teléfono.
4. **Usar / Revisar** → corrige si hace falta → Agendar.

Importante: el micrófono de la web solo sigue activo si OXY permanece visible (no cambies del todo a otra app a pantalla completa).

Mover citas en tablet/teléfono: **mantén pulsada** la cita ~1 s y arrástrala al nuevo horario.`,
    replyEn: `🎤 **Book by voice**

1. Tap **🎤 Book by voice** (menu or bottom bar).
2. **Minimize** the panel and open WhatsApp/Facebook in **Split View**.
3. Dictate: name, date, time, chamber, and phone.
4. **Use / Review** → edit if needed → Book.

Note: the web mic stays on only while OXY remains visible (don't fully switch away full-screen).

Move appointments on tablet/phone: **long-press** the block ~1s, then drag to the new slot.`,
  },
  {
    id: 'live_sync',
    signals: ['sync', 'sincron', 'live', 'tiempo', 'real', 'actualiza', 'pantallas', 'otra'],
    secondary: ['sync', 'live', 'agenda', 'cita', 'pantalla', 'actualiza'],
    replyEs: `🔄 **Agenda en vivo (Sync)**

• La agenda se actualiza sola entre pantallas (Realtime).
• En el encabezado verás **● Live** cuando acaba de llegar un cambio, o **○ Sync** en reposo.
• El número **v…** al lado es la **versión de la app** (cambia solo al publicar), no el de la agenda.
• Si una pantalla no refleja un cambio: vuelve a enfocar la pestaña o espera unos segundos.`,
    replyEn: `🔄 **Live schedule (Sync)**

• The schedule updates across screens by itself (Realtime).
• Header shows **● Live** right after a change, or **○ Sync** when idle.
• The **v…** badge is the **app build** (changes only on deploy), not an agenda token.
• If a screen is stale: refocus the tab or wait a few seconds.`,
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
    /\bque\s+(hago|significa|es)\b/,
    /\bayuda\b/,
    /\bhelp\b/,
    /\bno\s+(lo\s+)?encuentro\b/,
    /\bno\s+aparece\b/,
    /\bexplicame\b/,
    /\bnecesito\s+(saber|ayuda)\b/,
    /\bhow\s+(do|can|to)\b/,
    /\bwhat\s+(does|is)\b/,
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
  if (/\b(reprogram|mover|pasado|0000)\b/.test(folded) && topic.id === 'reschedule_move') {
    score += 8;
  }
  if (/\b(sync|live|sincron)\b/.test(folded) && topic.id === 'live_sync') {
    score += 8;
  }
  if (/\b(sellar|firmar|bitacora)\b/.test(folded) && topic.id === 'bitacora') {
    score += 6;
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
    '• «¿Cómo reprogramo / muevo al pasado?»',
    '• «¿Cómo sello la bitácora?»',
    '• «No encuentro un paciente»',
    '• «¿Qué significa Sync?»',
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
    '• "How do I reschedule / move to the past?"',
    '• "How do I seal attendance?"',
    '• "I can\'t find a patient"',
    '• "What does Sync mean?"',
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
