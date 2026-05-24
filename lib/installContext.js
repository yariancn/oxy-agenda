export const INSTALL_GUIDE_EVENT = 'oxy-open-install-guide';
export const INSTALL_DISMISS_KEY = 'oxy-install-guide-dismissed-v4';
export const INSTALL_SESSION_KEY = 'oxy-install-hidden-session';

export function openInstallGuide() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(INSTALL_GUIDE_EVENT));
  }
}

export function isIosDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** WebView de WhatsApp, Instagram, Facebook, etc. */
export function isIosInAppBrowser() {
  if (!isIosDevice()) return false;
  const ua = navigator.userAgent || '';
  if (/Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return false;
  if (/FBAN|FBAV|Instagram|Line\/|WhatsApp|Twitter|LinkedInApp|Snapchat|TikTok/i.test(ua)) return true;
  return /iPhone|iPad/i.test(ua) && /AppleWebKit/i.test(ua) && !/Safari/i.test(ua);
}

export function isIosChrome() {
  if (!isIosDevice()) return false;
  return /CriOS/.test(navigator.userAgent || '');
}

export function getInstallContext() {
  if (typeof window === 'undefined') {
    return {
      platform: 'unknown',
      isStandalone: false,
      canNativeInstall: false,
      browserLabel: '',
      needsSafariOnIos: false,
      iosFlow: null,
      isIPad: false,
    };
  }

  const ua = navigator.userAgent || '';
  const isIOS = isIosDevice();
  const isIPad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);
  const isChrome = /Chrome|CriOS/.test(ua);
  const isEdge = /Edg/.test(ua);
  const isFirefox = /Firefox|FxiOS/.test(ua);
  const inApp = isIosInAppBrowser();
  const iosChrome = isIosChrome();

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  let platform = 'desktop';
  if (isIOS) platform = 'ios';
  else if (isAndroid) platform = 'android';

  let browserLabel = 'tu navegador';
  if (inApp) browserLabel = 'esta app';
  else if (isIOS && isSafari) browserLabel = 'Safari';
  else if (iosChrome) browserLabel = 'Chrome';
  else if (isAndroid && isChrome) browserLabel = 'Chrome';
  else if (isEdge) browserLabel = 'Edge';
  else if (isChrome) browserLabel = 'Chrome';
  else if (isFirefox) browserLabel = 'Firefox';
  else if (isSafari) browserLabel = 'Safari';

  let iosFlow = null;
  if (isIOS && !isStandalone) {
    if (inApp) iosFlow = 'in-app';
    else if (iosChrome) iosFlow = 'chrome';
    else if (isSafari) iosFlow = 'safari';
    else iosFlow = 'other';
  }

  return {
    platform,
    isStandalone,
    canNativeInstall: false,
    browserLabel,
    needsSafariOnIos: isIOS && !isSafari && !iosChrome,
    isSafari,
    isChrome,
    isEdge,
    isFirefox,
    iosFlow,
    isIPad,
    inApp,
    iosChrome,
    canWebShare: typeof navigator !== 'undefined' && typeof navigator.share === 'function',
  };
}

export function shouldAutoShowInstallGuide(context) {
  if (context.isStandalone) return false;

  if (typeof window !== 'undefined') {
    const forceGuide = new URLSearchParams(window.location.search).has('pwa');
    if (forceGuide) return true;
  }

  const stored = typeof window !== 'undefined'
    ? localStorage.getItem(INSTALL_DISMISS_KEY)
    : null;
  const sessionHidden = typeof window !== 'undefined'
    ? sessionStorage.getItem(INSTALL_SESSION_KEY)
    : null;

  if (context.platform === 'ios' && context.iosFlow === 'safari') {
    return !stored;
  }

  if (context.platform === 'ios' && context.inApp) {
    return !sessionHidden;
  }

  if (context.platform === 'ios') {
    return !stored && !sessionHidden;
  }

  return !stored && !sessionHidden;
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

  if (ctx.isSafari && ctx.platform === 'desktop') {
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

/** Pasos del asistente visual para iPhone/iPad */
export function getIosWizardSteps(ctx) {
  const url = typeof window !== 'undefined' ? window.location.href : 'https://oxy-agenda.vercel.app';

  if (ctx.inApp) {
    return {
      flow: 'in-app',
      steps: [
        {
          id: 'menu',
          title: 'Paso 1: Abre el menú',
          body: 'Arriba a la derecha verás tres puntos ··· o tres líneas ≡. Tócalos.',
          mockup: 'in-app-menu',
          autoLabel: null,
          autoAction: null,
        },
        {
          id: 'safari',
          title: 'Paso 2: Abrir en Safari',
          body: 'En el menú elige «Abrir en Safari», «Abrir en navegador» o «Abrir en Chrome».',
          mockup: 'in-app-safari',
          autoLabel: 'Intentar abrir en Safari',
          autoAction: 'open-external',
        },
        {
          id: 'return',
          title: 'Paso 3: Vuelve aquí en Safari',
          body: 'Cuando la página cargue en Safari, te mostramos los 2 pasos finales para instalar.',
          mockup: 'safari-ready',
          autoLabel: 'Copiar enlace por si no abrió',
          autoAction: 'copy-url',
        },
      ],
      url,
    };
  }

  if (ctx.iosChrome) {
    return {
      flow: 'chrome',
      steps: [
        {
          id: 'use-safari',
          title: 'Paso 1: Abre en Safari',
          body: 'En iPhone, instalar solo funciona en Safari (no en Chrome). Copia el enlace y ábrelo en Safari.',
          mockup: 'safari-required',
          autoLabel: 'Copiar enlace',
          autoAction: 'copy-url',
        },
        {
          id: 'share',
          title: 'Paso 2: Compartir en Safari',
          body: 'En Safari, toca el botón Compartir ↗ de la barra inferior (no uses botones dentro de la página).',
          mockup: 'safari-share-iphone',
          autoLabel: null,
          autoAction: null,
        },
        {
          id: 'scroll-add',
          title: 'Paso 3: Baja en el menú',
          body: 'Desliza hacia arriba en el menú gris. «Agregar a pantalla de inicio» está abajo del todo, después de Copiar y otras opciones.',
          mockup: 'share-sheet-scroll',
          autoLabel: null,
          autoAction: null,
        },
        {
          id: 'confirm',
          title: 'Paso 4: Confirmar',
          body: 'Toca «Agregar a pantalla de inicio», luego «Agregar» arriba a la derecha.',
          mockup: 'confirm-add',
          autoLabel: null,
          autoAction: null,
        },
      ],
      url,
    };
  }

  return {
    flow: 'safari',
    steps: [
      {
        id: 'share',
        title: 'Paso 1: Compartir en Safari',
        body: ctx.isIPad
          ? 'Toca Compartir ↗ arriba a la derecha en Safari. No uses botones dentro de esta página.'
          : 'Toca Compartir ↗ abajo en el centro en Safari. No uses botones dentro de esta página.',
        mockup: ctx.isIPad ? 'safari-share-ipad' : 'safari-share-iphone',
        autoLabel: null,
        autoAction: null,
        warn: 'Si ya se abrió un menú con AirDrop/Mensajes/Copiar, ciérralo — ese menú no sirve. Usa solo el ↗ de Safari.',
      },
      {
        id: 'scroll-add',
        title: 'Paso 2: Baja en el menú',
        body: 'Desliza el dedo hacia arriba en el menú gris. «Agregar a pantalla de inicio» aparece abajo, en la lista (no arriba con AirDrop).',
        mockup: 'share-sheet-scroll',
        autoLabel: null,
        autoAction: null,
      },
      {
        id: 'confirm',
        title: 'Paso 3: Confirmar',
        body: 'Toca «Agregar a pantalla de inicio» y después «Agregar» arriba a la derecha. Listo — busca OXY Agenda en tu pantalla de inicio.',
        mockup: 'confirm-add',
        autoLabel: null,
        autoAction: null,
      },
    ],
    url,
  };
}
