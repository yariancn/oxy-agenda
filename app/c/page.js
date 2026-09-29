export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Confirmar cita · OXYGENGDL',
  robots: { index: false, follow: false },
};

// Same UI as /confirmar (short SMS URL). Do not re-export `dynamic`/`metadata`.
export { default } from '../confirmar/page.js';
