'use client';

export default function GlobalError({ error, reset }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center">
          <p className="text-lg font-black uppercase mb-2">OXY Agenda</p>
          <p className="text-sm font-bold text-slate-300 normal-case leading-relaxed mb-4">
            No se pudo cargar la aplicación. Esto puede pasar en móvil tras un despliegue nuevo — recarga la página.
          </p>
          {error?.message && (
            <p className="text-[10px] font-mono text-slate-500 mb-4 break-all">{error.message}</p>
          )}
          <button
            type="button"
            onClick={() => reset()}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl uppercase text-xs"
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full mt-2 bg-slate-700 hover:bg-slate-600 text-white font-black py-3 rounded-xl uppercase text-xs"
          >
            Recargar página
          </button>
        </div>
      </body>
    </html>
  );
}
