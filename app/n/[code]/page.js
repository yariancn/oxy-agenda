import ShortConfirmReplyView from '../../../components/ShortConfirmReplyView.js';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Confirmar cita · OXYGENGDL',
  robots: { index: false, follow: false },
};

/** Ultra-short SMS link: /n/{code} → NO */
export default async function ShortNoConfirmPage({ params, searchParams }) {
  const p = typeof params?.then === 'function' ? await params : (params || {});
  const sp = typeof searchParams?.then === 'function' ? await searchParams : (searchParams || {});
  return (
    <ShortConfirmReplyView
      code={String(p.code || '').trim()}
      replyRaw="no"
      done={String(sp.done || '') === '1'}
      already={String(sp.already || '') === '1'}
    />
  );
}
