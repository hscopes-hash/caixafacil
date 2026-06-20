'use client';

import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';

/**
 * useKioskMode — Gerencia modo quiosque (fullscreen) para apps PDV/kiosk.
 *
 * Comportamento:
 * - Quando `enabled` é true, entra em fullscreen automaticamente
 * - Se usuário sair do fullscreen (ESC, F11, etc), re-entra automaticamente
 *   e mostra toast "Use o botão Sair"
 * - Quando `enabled` volta para false, sai do fullscreen
 *
 * Limitações técnicas:
 * - Navegadores NÃO permitem bloquear ESC — só podemos detectar e reagir
 * - iOS Safari tem suporte limitado a fullscreen API
 * - requestFullscreen() exige interação do usuário (login é uma interação)
 *
 * Uso:
 *   useKioskMode(isAuthenticated);
 */
export function useKioskMode(enabled: boolean) {
  const isEnabledRef = useRef(enabled);
  const isReenteringRef = useRef(false);
  const lastToastRef = useRef(0);

  // Atualiza ref sempre que `enabled` mudar
  useEffect(() => {
    isEnabledRef.current = enabled;
  }, [enabled]);

  // Tenta entrar em fullscreen
  const enterFullscreen = useCallback(async (): Promise<boolean> => {
    if (typeof document === 'undefined') return false;
    const el = document.documentElement;

    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
        return true;
      } else if ((el as any).webkitRequestFullscreen) {
        // Safari antigo
        (el as any).webkitRequestFullscreen();
        return true;
      } else if ((el as any).msRequestFullscreen) {
        // IE/Edge antigo
        (el as any).msRequestFullscreen();
        return true;
      }
    } catch (err) {
      // Pode falhar se não houver interação do usuário prévia
      console.warn('[KioskMode] Falha ao entrar em fullscreen:', err);
    }
    return false;
  }, []);

  // Sai do fullscreen
  const exitFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen();
      }
    } catch (err) {
      console.warn('[KioskMode] Falha ao sair de fullscreen:', err);
    }
  }, []);

  // Effect principal: ativa fullscreen quando enabled vira true
  useEffect(() => {
    if (!enabled) {
      // Se desativou (logout), sai do fullscreen
      exitFullscreen();
      return;
    }

    // Tenta entrar em fullscreen imediatamente
    enterFullscreen();

    // Tenta novamente após 500ms (caso o primeiro tenha falhado por timing)
    const retryTimeout = setTimeout(() => {
      if (isEnabledRef.current && !document.fullscreenElement) {
        enterFullscreen();
      }
    }, 500);

    return () => clearTimeout(retryTimeout);
  }, [enabled, enterFullscreen, exitFullscreen]);

  // Listener: detecta quando sai do fullscreen e re-entra
  useEffect(() => {
    if (!enabled) return;

    const handleFullscreenChange = () => {
      if (!isEnabledRef.current) return;
      if (isReenteringRef.current) return;

      const isFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).msFullscreenElement
      );

      if (!isFullscreen) {
        // Saiu do fullscreen — re-entra após pequeno delay
        // (delay evita race condition com o navegador)
        isReenteringRef.current = true;

        // Toast com throttle (máx 1 a cada 3 segundos)
        const now = Date.now();
        if (now - lastToastRef.current > 3000) {
          lastToastRef.current = now;
          toast.warning('Use o botão Sair para sair do app', {
            duration: 2500,
          });
        }

        setTimeout(async () => {
          await enterFullscreen();
          isReenteringRef.current = false;
        }, 200);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, [enabled, enterFullscreen]);

  // Retorna utilitários para uso opcional (ex: forçar saída manual)
  return { enterFullscreen, exitFullscreen };
}
