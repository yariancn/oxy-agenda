/** Minimal layout for patient confirmation links — no install/PWA prompts. */
export const metadata = {
  title: 'Confirmar cita',
  description: 'Confirma tu sesión con un toque',
  robots: { index: false, follow: false },
  manifest: null,
  appleWebApp: {
    capable: false,
  },
};

export default function ConfirmarLayout({ children }) {
  return children;
}
