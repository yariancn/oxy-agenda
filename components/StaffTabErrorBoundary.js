'use client';

import React from 'react';

export default class StaffTabErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('[StaffTabErrorBoundary]', error);
  }

  render() {
    const { error } = this.state;
    if (error) {
      const es = this.props.locale !== 'en';
      return (
        <div className="flex-1 min-h-0 flex items-center justify-center p-6 bg-white z-10">
          <div className="max-w-sm w-full bg-red-50 border-2 border-red-200 rounded-2xl p-5 text-center">
            <p className="text-sm font-black uppercase text-red-800 mb-2">
              {es ? 'No se pudo cargar esta sección' : 'Could not load this section'}
            </p>
            <p className="text-[11px] font-bold text-red-700 normal-case leading-relaxed mb-4">
              {es
                ? 'Hubo un error al mostrar la pantalla. Prueba recargar o vuelve a Agenda.'
                : 'Something went wrong displaying this screen. Try reload or return to Schedule.'}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null });
                this.props.onRetry?.();
              }}
              className="w-full bg-red-700 text-white font-black py-3 rounded-xl uppercase text-xs mb-2"
            >
              {es ? 'Reintentar' : 'Retry'}
            </button>
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null });
                this.props.onGoAgenda?.();
              }}
              className="w-full bg-slate-200 text-slate-800 font-black py-3 rounded-xl uppercase text-xs"
            >
              {es ? 'Volver a agenda' : 'Back to schedule'}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
