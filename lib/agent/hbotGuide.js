/**
 * Guía operativa de oxigenoterapia hiperbárica (OHB / HBOT) para el agente staff.
 * Sustento: indicaciones reconocidas por UHMS; contraindicaciones de práctica clínica estándar.
 * No sustituye evaluación médica / GFE.
 */

export const HBOT_SIGNAL_WORDS = [
  'hiperbarica',
  'hiperbarico',
  'hiperbárica',
  'hiperbárico',
  'hbot',
  'ohb',
  'oxigenoterapia',
  'oxigenacion',
  'oxigenación',
  'camara',
  'cámara',
  'hyperbaric',
  'hyperbarics',
  'ata',
];

export const HBOT_HELP_TOPICS = [
  {
    id: 'hbot_contraindications',
    signals: [
      ...HBOT_SIGNAL_WORDS,
      'contraindicacion',
      'contraindicaciones',
      'contraindication',
      'contraindications',
      'prohibido',
      'riesgo',
      'peligro',
      'puede',
      'apto',
      'apta',
      'entrar',
      'seguridad',
    ],
    secondary: [
      'contraindicacion',
      'contraindicaciones',
      'contraindication',
      'contraindications',
      'prohibido',
      'apto',
      'apta',
      'riesgo',
    ],
    replyEs: `🚫 OHB — CONTRAINDICACIONES (cribado rápido)

ABSOLUTA (no entrar a cámara):
• Neumotórax no tratado / no drenado

RELATIVAS / PARCIALES (valorar médico; a menudo aplazan o adaptan la sesión):
• Infección/congestión de vías altas o senos (barosinusitis / oído)
• Enfermedad pulmonar bullosa / blebs; EPOC grave con retención de CO₂
• Antecedente de neumotórax espontáneo o cirugía torácica reciente
• Disfunción de trompa de Eustaquio / cirugía reciente de oído
• Convulsiones no controladas · fiebre alta
• Claustrofobia severa
• Embarazo (salvo indicación médica clara, p. ej. intoxicación por CO)
• Quimioterapia con bleomicina, doxorubicina o cisplatino (riesgo pulmonar/cardíaco — consultar oncólogo)
• Marcapasos / implantes: confirmar compatibilidad con OHB

Si hay duda → no agendar hasta GFE / médico. Esto no sustituye valoración clínica.`,
    replyEn: `🚫 HBOT — CONTRAINDICATIONS (quick screen)

ABSOLUTE (do not enter chamber):
• Untreated / undrained pneumothorax

RELATIVE / PARTIAL (physician judgment; often delay or adapt the session):
• URI / sinus congestion (barosinusitis / ear barotrauma risk)
• Bullous lung disease / blebs; severe COPD with CO₂ retention
• Prior spontaneous pneumothorax or recent thoracic surgery
• Eustachian tube dysfunction / recent ear surgery
• Uncontrolled seizures · high fever
• Severe claustrophobia
• Pregnancy (except clear medical indication, e.g. CO poisoning)
• Chemo with bleomycin, doxorubicin, or cisplatin (pulmonary/cardiac risk — ask oncology)
• Pacemaker / implants: confirm HBOT compatibility

If unsure → do not book until GFE / physician clearance. Not a substitute for clinical judgment.`,
  },
  {
    id: 'hbot_indications',
    signals: [
      ...HBOT_SIGNAL_WORDS,
      'indicacion',
      'indicaciones',
      'indication',
      'indications',
      'sirve',
      'trata',
      'tratamiento',
      'apto',
      'apta',
      'beneficia',
      'uhms',
    ],
    secondary: [
      'indicacion',
      'indicaciones',
      'indication',
      'indications',
      'sirve',
      'trata',
      'tratamiento',
      'uhms',
    ],
    replyEs: `✅ OHB — INDICACIONES CON SUSTENTO (UHMS)

Útil para cribado: ¿hay una de estas? → probable indicación médica formal.
• Embolia gaseosa · enfermedad descompresiva
• Intoxicación por monóxido de carbono
• Infecciones necrosantes de tejidos blandos / gangrena gaseosa
• Osteomielitis refractaria
• Lesión por radiación (tejido blando / óseo)
• Injertos o colgajos comprometidos
• Heridas problema seleccionadas / pie diabético avanzado (criterio médico)
• Anemia excepcional · absceso intracraneal
• Isquemias traumáticas agudas / síndrome compartimental / crush
• Quemaduras térmicas agudas (centros especializados)
• Sordera súbita neurosensorial idiopática (protocolo médico)
• Absceso / infección seleccionada según criterio

Bienestar / “anti-edad” / fatiga sin diagnóstico: no es indicación UHMS.
Duda clínica → GFE / médico antes de prometer resultados.`,
    replyEn: `✅ HBOT — EVIDENCE-BACKED INDICATIONS (UHMS)

Screening: one of these present → likely formal medical indication.
• Gas embolism · decompression sickness
• Carbon monoxide poisoning
• Necrotizing soft-tissue infection / gas gangrene
• Refractory osteomyelitis
• Delayed radiation injury (soft tissue / bone)
• Compromised grafts or flaps
• Selected problem wounds / advanced diabetic foot (physician criteria)
• Exceptional anemia · intracranial abscess
• Acute traumatic ischemias / compartment syndrome / crush
• Acute thermal burns (specialty centers)
• Idiopathic sudden sensorineural hearing loss (medical protocol)
• Selected abscess/infection per physician

Wellness / “anti-aging” / fatigue alone: not a UHMS indication.
Clinical doubt → GFE / physician before promising outcomes.`,
  },
  {
    id: 'hbot_screening',
    signals: [
      ...HBOT_SIGNAL_WORDS,
      'cribado',
      'screening',
      'evaluar',
      'evaluacion',
      'evaluación',
      'candidato',
      'candidata',
      'puede',
      'entrar',
      'sesion',
      'sesión',
      'terapia',
      'therapy',
    ],
    replyEs: `🫁 OHB — ¿INDICADA Y SEGURA? (3 pasos)

1) CONTRAINDICACIÓN ABSOLUTA
   ¿Neumotórax no tratado? → NO entrar.

2) CONTRAINDICACIONES RELATIVAS
   Oído/senos congestionados, EPOC grave, convulsiones mal controladas,
   quimio (bleomicina/doxo/cisplatino), embarazo, claustrofobia severa,
   cirugía torácica/oído reciente → pausar y pasar a GFE/médico.

3) INDICACIÓN
   ¿Encaja en lista UHMS (herida problema, radiación, infección necrosante,
   CO, osteomielitis refractaria, etc.)? → sí, con protocolo médico.
   Solo “bienestar” sin diagnóstico → no vender como indicación médica.

Pregúntame: «contraindicaciones hiperbárica» o «indicaciones UHMS».`,
    replyEn: `🫁 HBOT — INDICATED & SAFE? (3 steps)

1) ABSOLUTE CONTRAINDICATION
   Untreated pneumothorax? → DO NOT enter.

2) RELATIVE CONTRAINDICATIONS
   Congested ears/sinuses, severe COPD, poorly controlled seizures,
   chemo (bleomycin/doxo/cisplatin), pregnancy, severe claustrophobia,
   recent thoracic/ear surgery → pause for GFE/physician.

3) INDICATION
   Fits UHMS list (problem wound, radiation injury, necrotizing infection,
   CO, refractory osteomyelitis, etc.)? → yes, under medical protocol.
   Wellness-only with no diagnosis → do not sell as a medical indication.

Ask: "HBOT contraindications" or "UHMS indications".`,
  },
];

/** Detecta preguntas clínicas de OHB aunque no traigan “?” ni “cómo”. */
export function isHbotGuideQuestion(message) {
  const folded = String(message || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (!folded.trim()) return false;

  const hasHbot = HBOT_SIGNAL_WORDS.some((w) => {
    const plain = w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return folded.includes(plain);
  });
  if (!hasHbot) return false;

  // Con señal OHB basta para abrir la guía (cribado / indicación / seguridad).
  return true;
}
