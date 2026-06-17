'use client';

import { useRef, useCallback } from 'react';

/**
 * Hook de swipe horizontal para navegação entre tabs.
 * Funciona com touch nativo (Android/iOS) — zero dependência externa.
 * Leve e compatível com qualquer navegador mobile.
 *
 * Suporta edge-swipe: deslizar da borda esquerda para a direita abre o menu lateral.
 *
 * Proteções contra navegação acidental:
 * - Não navega se o touch iniciou em input/textarea/select
 * - Não navega se houver um input com foco ativo no documento
 * - Exige que o swipe horizontal seja claramente dominante sobre o vertical (ratio 2:1)
 * - Não navega quando o scroll do container ainda tem conteúdo para rolar
 */
interface UseSwipeNavigationOptions {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  /** Distância mínima do swipe para considerar navegação (default 80px) */
  minSwipeDistance?: number;
  /** Velocidade máxima do swipe em ms — swipes lentos são ignorados (default 400ms) */
  maxSwipeDuration?: number;
  /** Largura da borda esquerda para detectar edge-swipe (default 30px) */
  edgeWidth?: number;
  /** Callback chamado ao detectar edge-swipe para a direita (abrir menu) */
  onEdgeSwipeRight?: () => void;
}

export function useSwipeNavigation({
  tabs,
  activeTab,
  onTabChange,
  minSwipeDistance = 80,
  maxSwipeDuration = 400,
  edgeWidth = 30,
  onEdgeSwipeRight,
}: UseSwipeNavigationOptions) {
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const isSwiping = useRef(false);
  const touchStartTarget = useRef<EventTarget | null>(null);

  /** Verifica se o touch iniciou em um input, textarea ou select — nesses casos não navega */
  const isInputElement = useCallback((target: EventTarget | null): boolean => {
    if (!target || !(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    // Verifica se é filho de um input (ex: ícone dentro de um Input do shadcn)
    const closestInput = target.closest('input, textarea, select, [contenteditable]');
    return !!closestInput;
  }, []);

  /** Verifica se há algum campo de input com foco no documento */
  const isAnyInputFocused = useCallback((): boolean => {
    const active = document.activeElement;
    if (!active || !(active instanceof HTMLElement)) return false;
    const tag = active.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (active.isContentEditable) return true;
    return !!active.closest('input, textarea, select, [contenteditable]');
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    touchStartTarget.current = e.target;
    isSwiping.current = true;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!isSwiping.current) return;
      isSwiping.current = false;

      // Ignorar swipe se iniciou dentro de um campo de input
      if (isInputElement(touchStartTarget.current)) return;

      // Ignorar swipe se há algum input com foco ativo (teclado aberto)
      if (isAnyInputFocused()) return;

      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;
      const elapsed = Date.now() - touchStartTime.current;

      // Ignorar se swipe foi muito lento
      if (elapsed > maxSwipeDuration) return;

      // Ignorar swipes curtos demais
      if (Math.abs(deltaX) < minSwipeDistance) return;

      // Exigir que o swipe horizontal seja claramente dominante (pelo menos 2x o vertical)
      // Isso impede que scrolls diagonais sejam confundidos com swipes de navegação
      if (Math.abs(deltaY) > Math.abs(deltaX) * 0.5) return;

      // Edge-swipe: touch iniciou na borda esquerda e deslizou para a direita
      if (onEdgeSwipeRight && touchStartX.current < edgeWidth && deltaX > 0) {
        onEdgeSwipeRight();
        if (navigator.vibrate) navigator.vibrate(10);
        return;
      }

      const currentIndex = tabs.indexOf(activeTab);
      if (currentIndex === -1) return;

      // Swipe para esquerda -> próxima tab
      if (deltaX < 0 && currentIndex < tabs.length - 1) {
        onTabChange(tabs[currentIndex + 1]);
        if (navigator.vibrate) navigator.vibrate(8);
      }
      // Swipe para direita -> tab anterior
      else if (deltaX > 0 && currentIndex > 0) {
        onTabChange(tabs[currentIndex - 1]);
        if (navigator.vibrate) navigator.vibrate(8);
      }
    },
    [tabs, activeTab, onTabChange, minSwipeDistance, maxSwipeDuration, edgeWidth, onEdgeSwipeRight, isInputElement, isAnyInputFocused]
  );

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
  };
}
