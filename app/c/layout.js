/** Minimal layout for patient confirmation links — no install/PWA prompts. */
export const metadata = {
  title: 'Confirmar cita',
  description: 'Confirma tu sesión con un toque',
  robots: { index: false, follow: false },
  // Do not advertise as installable app on these links
  manifest: null,
  appleWebApp: {
    capable: false,
  },
};

export default function ConfirmPublicLayout({ children }) {
  return children;
}
