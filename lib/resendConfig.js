/** Remitentes Resend por clínica (dominio verificado en la misma cuenta). */
export function getResendFromAddress(clinicName) {
  if (clinicName === 'Shenandoah' || String(clinicName).includes('Shenandoah')) {
    return process.env.RESEND_FROM_TX || 'OxyHyperbaric <inf@oxyhyperbaric.com>';
  }
  return process.env.RESEND_FROM_GDL || 'OXYGENGDL <programaciones@oxygengdl.com>';
}

export function getResendApiKey() {
  return process.env.RESEND_API_KEY || '';
}
