'use client';

import { useEffect } from 'react';

export function NonCriticalCSSLoader() {
  useEffect(() => {
    // Preload non-critical CSS
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'style';
    link.href = '/styles/non-critical.css';
    document.head.appendChild(link);

    // Load with media=print to avoid render blocking, then switch to screen
    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = '/styles/non-critical.css';
    styleLink.media = 'print';
    styleLink.onload = () => {
      styleLink.media = 'screen';
    };
    document.head.appendChild(styleLink);
  }, []);

  return null;
}
