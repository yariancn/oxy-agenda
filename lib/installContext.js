export const INSTALL_GUIDE_EVENT = 'oxy-open-install-guide';
export const INSTALL_DISMISS_KEY = 'oxy-install-guide-dismissed-v1';

export function openInstallGuide() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(INSTALL_GUIDE_EVENT));
  }
}

export function getInstallContext() {
  if (typeof window === 'undefined') {
    return {
      platform: 'unknown',
      isStandalone: false,
      canNativeInstall: false,
      browserLabel: '',
      needsSafariOnIos: false,
    };
  }

  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);
  const isChrome = /Chrome|CriOS/.test(ua);
  const isEdge = /Edg/.test(ua);
  const isFirefox = /Firefox|FxiOS/.test(ua);

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  let platform = 'desktop';
  if (isIOS) platform = 'ios';
  else if (isAndroid) platform = 'android';

  let browserLabel = 'tu navegador';
  if (isIOS && isSafari) browserLabel = 'Safari';
  else if (isIOS && isChrome) browserLabel = 'Chrome';
  else if (isAndroid && isChrome) browserLabel = 'Chrome';
  else if (isEdge) browserLabel = 'Edge';
  else if (isChrome) browserLabel = 'Chrome';
  else if (isFirefox) browserLabel = 'Firefox';
  else if (isSafari) browserLabel = 'Safari';

  return {
    platform,
    isStandalone,
    canNativeInstall: false,
    browserLabel,
    needsSafariOnIos: isIOS && !isSafari,
    isSafari,
    isChrome,
    isEdge,
    isFirefox,
  };
}

export function getInstallSteps(ctx) {
  if (ctx.isStandalone) {
    return {
      title: '¡Ya la tienes instalada!',
      subtitle: 'Estás usando OXY Agenda como app. Puedes abrirla desde tu pantalla de inicio cuando quieras.',
      steps: [],
      tip: null,
    };
  }

  if (ctx.platform === 'ios') {
    if (ctx.needsSafariOnIos) {
      return {
        title: 'Abre la página en Safari',
        subtitle: 'En iPhone e iPad, la instalación solo funciona con Safari.',
        steps: [
          { icon: '🔗', text: 'Copia la dirección de esta página (oxy-agenda.vercel.app).' },
          { icon: '🧭', text: 'Abre la app Safari — ícono azul con brújula.' },
          { icon: '📋', text: 'Pega la dirección en Safari y carga la página.' },
          { icon: '📲', text: 'Cuando estés en Safari, vuelve a tocar «Instalar app» para ver los pasos finales.' },
        ],
        tip: 'Si llegaste desde WhatsApp o correo, usa «Abrir en Safari» en el menú del navegador.',
      };
    }

    return {
      title: 'Agregar a tu iPhone o iPad',
      subtitle: 'Quedará un ícono en tu pantalla de inicio, como cualquier app.',
      steps: [
        { icon: '⬆️', text: 'Toca Compartir — el cuadrado con flecha hacia arriba (abajo en iPhone, arriba en iPad).' },
        { icon: '➕', text: 'Desliza las opciones y elige «Agregar a Inicio».' },
        { icon: '✅', text: 'Toca «Agregar» arriba a la derecha. ¡Listo!' },
      ],
      tip: 'La próxima vez entra desde el ícono «OXY Agenda» en tu pantalla de inicio.',
    };
  }

  if (ctx.platform === 'android') {
    return {
      title: 'Instalar en tu Android',
      subtitle: 'La app quedará en tu pantalla de inicio para entrar con un solo toque.',
      steps: [
        { icon: '⋮', text: 'Toca el menú de tres puntos arriba a la derecha en Chrome.' },
        { icon: '📲', text: 'Elige «Instalar aplicación» o «Agregar a pantalla de inicio».' },
        { icon: '✅', text: 'Confirma con «Instalar». ¡Ya quedó en tu teléfono!' },
      ],
      tip: 'Si ves un botón «Instalar ahora» arriba, úsalo — es aún más rápido.',
    };
  }

  if (ctx.isChrome || ctx.isEdge) {
    return {
      title: 'Instalar en tu computadora',
      subtitle: 'OXY Agenda se abrirá en su propia ventana, sin pestañas del navegador.',
      steps: [
        { icon: '⬇️', text: 'Busca el ícono de instalar en la barra de direcciones (a la derecha de la URL).' },
        { icon: '⋮', text: 'Si no lo ves: menú ⋮ → «Instalar OXY Agenda…» o «Instalar aplicación».' },
        { icon: '✅', text: 'Confirma. La app aparecerá en tu escritorio o menú de inicio.' },
      ],
      tip: 'También puedes usar el botón «Instalar ahora» si aparece abajo.',
    };
  }

  if (ctx.isSafari) {
    return {
      title: 'Agregar en Mac (Safari)',
      subtitle: 'Tendrás acceso rápido desde el Dock.',
      steps: [
        { icon: '📁', text: 'En la barra de menú, ve a Archivo → «Agregar al Dock».' },
        { icon: '✅', text: 'Confirma. OXY Agenda aparecerá en tu Dock.' },
      ],
      tip: 'En versiones anteriores de macOS, usa Compartir → «Agregar al Dock».',
    };
  }

  return {
    title: 'Guarda OXY Agenda en favoritos',
    subtitle: 'Tu navegador no permite instalar apps, pero puedes acceder rápido así:',
    steps: [
      { icon: '⭐', text: 'Agrega esta página a favoritos o marcadores.' },
      { icon: '📌', text: 'Para la mejor experiencia, usa Chrome o Edge en computadora, o Safari en iPhone.' },
    ],
    tip: 'La dirección es: oxy-agenda.vercel.app',
  };
}
