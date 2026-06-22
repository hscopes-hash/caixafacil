'use client';

import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';

/**
 * useKioskMode — Gerencia modo quiosque (fullscreen) para apps PDV/kiosk.
 *
 * Comportamento:
 * - Quando `enabled` é true, tenta entrar em fullscreen
 * - Se usuário sair do fullscreen (ESC, F11, etc), re-entra automaticamente
 *   e mostra toast "Use o botão Sair"
 * - Quando `enabled` volta para false, sai do fullscreen
 *
 * ⚠️ IMPORTANTE — User Gesture:
 * - requestFullscreen() em navegadores mobile REQUER user gesture ativo
 * - Se chamado dentro de useEffect (após fetch assíncrono), perde o gesture
 *   e o navegador bloqueia silenciosamente
 * - Solução: chamar `requestFullscreenOnLogin()` DENTRO do handler de clique
 *   do botão de login, ANTES do fetch assíncrono
 *
 * Limitações técnicas:
 * - iOS Safari NÃO suporta Fullscreen API (apenas PWA via manifest.json)
 * - Navegadores não permitem bloquear ESC — só detectar e reagir
 *
 * Uso:
 *   const { requestFullscreenOnLogin } = useKioskMode(isAuthenticated);
 *   // No botão de login:
 *   <button onClick={() => {
 *     requestFullscreenOnLogin(); // ANTES do fetch
 *     handleLogin();
 *   }}>Entrar</button>
 */
export function useKioskMode(enabled: boolean) {
  const isEnabledRef = useRef(enabled);
  const isReenteringRef = useRef(false);
  const lastToastRef = useRef(0);
  const hasTriedInitialFullscreenRef = useRef(false);

  // Atualiza ref sempre que `enabled` mudar
  useEffect(() => {
    isEnabledRef.current = enabled;
  }, [enabled]);

  // Detecta iOS Safari (não suporta Fullscreen API)
  const isIOSSafari = useCallback(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isWebkit = /WebKit/.test(ua) && !/CriOS|FxiOS/.test(ua);
    return isIOS && isWebkit;
  }, []);

  // Tenta entrar em fullscreen
  const enterFullscreen = useCallback(async (): Promise<boolean> => {
    if (typeof document === 'undefined') return false;
    const el = document.documentElement;

    // iOS Safari não suporta Fullscreen API
    if (isIOSSafari()) {
      console.warn('[KioskMode] iOS Safari detectado — Fullscreen API não suportada. Use "Adicionar à Tela Inicial" para modo PWA.');
      return false;
    }

    try {
      const isAlreadyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).msFullscreenElement
      );
      if (isAlreadyFullscreen) return true;

      if (el.requestFullscreen) {
        await el.requestFullscreen();
        console.log('[KioskMode] ✓ Fullscreen ativado (standard API)');
        return true;
      } else if ((el as any).webkitRequestFullscreen) {
        // Safari antigo
        (el as any).webkitRequestFullscreen();
        console.log('[KioskMode] ✓ Fullscreen ativado (webkit)');
        return true;
      } else if ((el as any).msRequestFullscreen) {
        // IE/Edge antigo
        (el as any).msRequestFullscreen();
        console.log('[KioskMode] ✓ Fullscreen ativado (ms)');
        return true;
      } else {
        console.warn('[KioskMode] Navegador não suporta Fullscreen API');
      }
    } catch (err: any) {
      console.warn('[KioskMode] Falha ao entrar em fullscreen:', err?.message || err);
      // Log adicional para debug
      if (err?.name === 'NotAllowedError') {
        console.warn('[KioskMode] Bloqueado: requestFullscreen requer user gesture direto (clique).');
      }
    }
    return false;
  }, [isIOSSafari]);

  /**
   * Versão síncrona para chamar DENTRO do handler de clique do login.
   * Mantém o contexto de user gesture necessário para requestFullscreen.
   * Não espera await — apenas dispara e retorna.
   */
  const requestFullscreenOnLogin = useCallback(() => {
    if (typeof document === 'undefined') return;
    if (isIOSSafari()) {
      console.warn('[KioskMode] iOS Safari: Fullscreen API não suportada. Recomende instalar como PWA.');
      // Toast apenas uma vez por sessão
      const key = 'caixafacil-kiosk-ios-warning-shown';
      if (typeof localStorage !== 'undefined' && !localStorage.getItem(key)) {
        localStorage.setItem(key, '1');
        setTimeout(() => {
          toast.info('Para tela cheia no iPhone: toque em Compartilhar → Adicionar à Tela Inicial', { duration: 6000 });
        }, 2000);
      }
      return;
    }
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) {
        // Não espera await — apenas dispara
        el.requestFullscreen().then(() => {
          console.log('[KioskMode] ✓ Fullscreen ativado no login (user gesture direto)');
        }).catch((err: any) => {
          console.warn('[KioskMode] requestFullscreen falhou mesmo com user gesture:', err?.message);
        });
      } else if ((el as any).webkitRequestFullscreen) {
        (el as any).webkitRequestFullscreen();
      }
    } catch (err) {
      console.warn('[KioskMode] Erro ao chamar requestFullscreen no login:', err);
    }
  }, [isIOSSafari]);

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
  // (fallback caso requestFullscreenOnLogin não tenha sido chamado)
  useEffect(() => {
    if (!enabled) {
      // Se desativou (logout), sai do fullscreen
      exitFullscreen();
      hasTriedInitialFullscreenRef.current = false;
      return;
    }

    // Se já tentamos o initial fullscreen, não repetir
    if (hasTriedInitialFullscreenRef.current) return;
    hasTriedInitialFullscreenRef.current = true;

    // Tenta entrar em fullscreen (pode falhar se não houver user gesture)
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

  // Retorna utilitários para uso opcional
  return { enterFullscreen, exitFullscreen, requestFullscreenOnLogin };
}
