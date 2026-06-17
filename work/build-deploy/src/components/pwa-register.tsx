'use client';

import { useEffect } from 'react';

export function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    // Registrar SW apenas se ainda nao existe
    navigator.serviceWorker.getRegistration('/sw.js').then((existingReg) => {
      if (existingReg) {
        // Ja registrado: so recarregar se houver UPDATE real (ja tinha controller ativo)
        existingReg.addEventListener('updatefound', () => {
          const newWorker = existingReg.installing;
          if (!newWorker) return;

          const hadController = !!navigator.serviceWorker.controller;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated' && hadController) {
              // So recarrega se ja existia um SW ativo antes (update real)
              console.log('SW atualizado, recarregando...');
              window.location.reload();
            }
          });
        });

        // Checagem periodica de updates (a cada 5 min)
        setInterval(() => {
          existingReg.update();
        }, 5 * 60 * 1000);

        return; // Nao registra de novo
      }

      // Primeira vez: registrar sem recarregar
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          console.log('SW registrado:', registration.scope);

          // Checagem periodica de updates (a cada 5 min)
          setInterval(() => {
            registration.update();
          }, 5 * 60 * 1000);

          // Detectar updates futuros (so recarregar se ja tinha controller)
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;

            const hadController = !!navigator.serviceWorker.controller;

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated' && hadController) {
                console.log('SW atualizado, recarregando...');
                window.location.reload();
              }
            });
          });
        })
        .catch((error) => {
          console.log('SW falhou:', error);
        });
    });
  }, []);

  return null;
}
