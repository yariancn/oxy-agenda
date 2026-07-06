const CANONICAL_ORIGIN =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CANONICAL_HOST
    ? `https://${process.env.NEXT_PUBLIC_CANONICAL_HOST}`
    : 'https://oxy-agenda.vercel.app';

const GDL_LEGAL = {
  privacy: 'https://oxygengdl.com/aviso-de-privacidad',
  terms: 'https://oxygengdl.com/terminos-y-condiciones',
};

/** Public legal URLs per clinic — always absolute (safe when booking is embedded on corporate sites). */
export const LEGAL_LINKS_BY_CLINIC = {
  Shenandoah: {
    privacy: 'https://oxyhyperbaric.com/privacy-policy',
    terms: 'https://oxyhyperbaric.com/terms-and-conditions',
    sms: 'https://oxyhyperbaric.com/terms-and-conditions#sms-messaging',
  },
  Oxygengdl: GDL_LEGAL,
  Oxygengdl2: GDL_LEGAL,
  Guadalajara: GDL_LEGAL,
};

export function getLegalLinks(clinicName) {
  return LEGAL_LINKS_BY_CLINIC[clinicName] || LEGAL_LINKS_BY_CLINIC.Oxygengdl;
}

export { CANONICAL_ORIGIN };
