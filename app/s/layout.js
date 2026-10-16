/** Patient SI link — no install/PWA prompts. */
export const metadata = {
  title: 'Cita confirmada',
  description: 'Confirmación de asistencia',
  robots: { index: false, follow: false },
  manifest: null,
  appleWebApp: {
    capable: false,
  },
};

export default function ShortYesLayout({ children }) {
  return children;
}
