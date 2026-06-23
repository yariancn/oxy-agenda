const CANONICAL_ORIGIN =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CANONICAL_HOST
    ? `https://${process.env.NEXT_PUBLIC_CANONICAL_HOST}`
    : 'https://oxy-agenda.vercel.app';

/** Public legal URLs per clinic — always absolute (safe when booking is embedded on corporate sites). */
export const LEGAL_LINKS_BY_CLINIC = {
  Shenandoah: {
    privacy: 'https://oxyhyperbaric.com/privacy-policy',
    terms: 'https://oxyhyperbaric.com/terms-and-conditions',
    sms: 'https://oxyhyperbaric.com/terms-and-conditions#sms-messaging',
  },
  Guadalajara: {
    privacy: 'https://oxygengdl.com/aviso-de-privacidad',
    terms: 'https://oxygengdl.com/terminos-y-condiciones',
  },
};

export function getLegalLinks(clinicName) {
  return LEGAL_LINKS_BY_CLINIC[clinicName] || LEGAL_LINKS_BY_CLINIC.Guadalajara;
}
