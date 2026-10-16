/** Patient NO link — no install/PWA prompts. */
export const metadata = {
  title: 'Cancelar cita',
  description: 'Confirmar que no asistirás',
  robots: { index: false, follow: false },
  manifest: null,
  appleWebApp: {
    capable: false,
  },
};

export default function ShortNoLayout({ children }) {
  return children;
}
