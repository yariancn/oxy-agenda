import ShortConfirmReplyView from '../../../../components/ShortConfirmReplyView.js';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Confirmar cita · OXYGENGDL',
  robots: { index: false, follow: false },
};

/**
 * Short SMS links: /c/{code}/si|/no (also /s|/n aliases).
 * GET never applies the reply — patient must tap Confirmar (POST).
 */
export default async function ShortConfirmReplyPage({ params, searchParams }) {
  const p = typeof params?.then === 'function' ? await params : (params || {});
  const sp = typeof searchParams?.then === 'function' ? await searchParams : (searchParams || {});
  return (
    <ShortConfirmReplyView
      code={String(p.code || '').trim()}
      replyRaw={String(p.reply || '').trim()}
      done={String(sp.done || '') === '1'}
      already={String(sp.already || '') === '1'}
    />
  );
}
