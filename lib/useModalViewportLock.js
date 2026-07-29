'use client';

import { useEffect } from 'react';

/**
 * Lock background scroll while a modal is open and restore the iOS Safari
 * viewport on close. Without this, focusing small inputs zooms/shifts the page
 * and leaving the form leaves content stuck under the notch/status bar.
 */
export function useModalViewportLock(locked) {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return undefined;

    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const scrollX = window.scrollX || window.pageXOffset || 0;

    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
    };

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';

    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.left = prev.bodyLeft;
      body.style.right = prev.bodyRight;
      body.style.width = prev.bodyWidth;

      const active = document.activeElement;
      if (active && active !== body && typeof active.blur === 'function') {
        active.blur();
      }

      const restoreScroll = () => {
        window.scrollTo(scrollX, scrollY);
      };
      restoreScroll();
      requestAnimationFrame(() => {
        restoreScroll();
        // Second frame: Safari sometimes reapplies the keyboard offset after unlock.
        requestAnimationFrame(restoreScroll);
      });
    };
  }, [locked]);
}
