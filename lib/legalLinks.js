const CANONICAL_ORIGIN =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CANONICAL_HOST
    ? `https://${process.env.NEXT_PUBLIC_CANONICAL_HOST}`
    : 'https://oxy-agenda.vercel.app';

/** Public legal URLs per clinic — always absolute (safe when booking is embedded on corporate sites). */
export const LEGAL_LINKS_BY_CLINIC = {
  Shenandoah: {
    privacy: 'https://oxyhyperbaric.com/privacy-policy',
    terms: 'https://oxyhyperbaric.com/terms-and-conditions',
    // Twilio opt-in disclosure (booking-specific; keep on agenda until oxyhyperbaric has /sms-terms)
    sms: `${CANONICAL_ORIGIN}/legal/sms`,
  },
  Guadalajara: {
    privacy: 'https://oxygengdl.com/aviso-de-privacidad',
    terms: 'https://oxygengdl.com/terminos-y-condiciones',
  },
};

export function getLegalLinks(clinicName) {
  return LEGAL_LINKS_BY_CLINIC[clinicName] || LEGAL_LINKS_BY_CLINIC.Guadalajara;
}
