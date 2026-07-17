'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export default function GoogleSignInButton({ onCredential, onError }) {
  const containerRef = useRef(null);
  const [desiredWidth, setDesiredWidth] = useState(320);
  const initializedRef = useRef(false);

  const renderButton = useCallback((width) => {
    const container = containerRef.current;
    if (!container || !window.google?.accounts?.id) return;

    // Clear any previous button
    container.innerHTML = '';
    window.google.accounts.id.renderButton(container, {
      theme: 'outline',
      size: 'large',
      width: width,
      text: 'continue_with',
    });
  }, []);

  // 1. Load the Google library and initialize only once
  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error('NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set');
      return;
    }

    const initGoogle = () => {
      if (!window.google?.accounts?.id) return;
      // Prevent multiple initializations
      if (initializedRef.current) return;
      initializedRef.current = true;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response.credential) {
            onCredential(response.credential);
          } else {
            onError?.('Google sign-in did not return a credential');
          }
        },
      });

      // Render the button immediately after initialization
      // Use the current desiredWidth (or default 320)
      renderButton(desiredWidth);
    };

    if (window.google?.accounts?.id) {
      initGoogle();
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initGoogle;
      document.body.appendChild(script);
    }

    return () => {
      // Optional cleanup: remove script if needed, but usually not
    };
  }, [onCredential, onError, renderButton, desiredWidth]);

  // 2. Observe container size changes and re‑render with new width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const rect = container.getBoundingClientRect();
      const newWidth = Math.min(Math.max(rect.width - 16, 200), 400);
      setDesiredWidth(newWidth);
      // If library is already ready, re‑render with new width
      if (window.google?.accounts?.id) {
        renderButton(newWidth);
      }
    };

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);

    // Initial width after layout
    requestAnimationFrame(updateWidth);

    return () => resizeObserver.disconnect();
  }, [renderButton]);

  return <div ref={containerRef} className="flex justify-center w-full" />;
}