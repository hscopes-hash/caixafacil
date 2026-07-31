'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary que captura erros fatais do React na seção de leituras.
 * Em vez de mostrar a tela "Ops! Algo deu errado" (error.tsx),
 * mostra um card com botão "Tentar novamente" que recarrega apenas
 * a seção, sem perder o resto do app.
 */
export default class LeiturasErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    console.error('[LeiturasErrorBoundary] Erro capturado:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[LeiturasErrorBoundary] Detalhes:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-destructive/10 p-4">
                <AlertTriangle className="h-10 w-10 text-destructive" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">
                Erro ao processar leituras
              </h2>
              <p className="text-sm text-muted-foreground">
                Ocorreu um erro durante o processamento. Suas leituras já salvas não foram perdidas.
              </p>
              {this.state.error && (
                <p className="text-xs text-muted-foreground/70 font-mono break-all">
                  {this.state.error.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <Button onClick={this.handleReset} className="w-full">
                <RotateCcw className="w-4 h-4 mr-2" />
                Tentar Novamente
              </Button>
              <Button
                variant="outline"
                onClick={this.handleReload}
                className="w-full"
              >
                Recarregar Página
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
