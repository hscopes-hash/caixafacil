'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Loader2, CreditCard, QrCode, Smartphone, ArrowLeft, CheckCircle2, XCircle, Clock,
  Check, AlertTriangle, ExternalLink, RefreshCw,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

// ============================================
// SDK Loader
// ============================================
const MP_SDK_URL = 'https://sdk.mercadopago.com/js/v2';
let sdkLoadPromise: Promise<any> | null = null;

function loadMercadoPagoSDK(onProgress?: (msg: string) => void): Promise<any> {
  if (sdkLoadPromise) return sdkLoadPromise;

  if (typeof window !== 'undefined' && (window as any).MercadoPago) {
    return Promise.resolve((window as any).MercadoPago);
  }

  sdkLoadPromise = new Promise<any>((resolve, reject) => {
    // Timeout de 15 segundos
    const timeout = setTimeout(() => {
      sdkLoadPromise = null;
      reject(new Error('TIMEOUT'));
    }, 15000);

    try {
      onProgress?.('Baixando SDK do MercadoPago...');
      const script = document.createElement('script');
      script.src = MP_SDK_URL;
      script.async = true;

      script.onload = () => {
        onProgress?.('SDK carregado, inicializando...');
        const MPClass = (window as any).MercadoPago;
        if (MPClass) {
          clearTimeout(timeout);
          resolve(MPClass);
        } else {
          clearTimeout(timeout);
          sdkLoadPromise = null;
          reject(new Error('SDK carregou mas MercadoPago nao esta disponivel'));
        }
      };

      script.onerror = () => {
        clearTimeout(timeout);
        sdkLoadPromise = null;
        reject(new Error('Falha de rede ao baixar o SDK'));
      };

      document.head.appendChild(script);
    } catch (error) {
      clearTimeout(timeout);
      sdkLoadPromise = null;
      reject(error);
    }
  });

  return sdkLoadPromise;
}

// ============================================
// TYPES
// ============================================
interface CheckoutParams {
  planoNome: string;
  planoTipo: 'mensal' | 'anual';
  valor: string;
  planoSaaSId: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'idle' | 'loading' | 'sdk_loading' | 'payment' | 'processing' | 'done' | 'error' | 'mp_not_configured' | 'sdk_failed';

interface StatusLog {
  time: string;
  message: string;
  done: boolean;
}

// ============================================
// COMPONENT
// ============================================
export default function MercadoPagoCheckout({
  planoNome,
  planoTipo,
  valor,
  planoSaaSId,
  onClose,
  onSuccess,
}: CheckoutParams) {
  const [step, setStep] = useState<Step>('idle');
  const [statusLog, setStatusLog] = useState<StatusLog[]>([]);
  const [preferenceId, setPreferenceId] = useState<string | null>(null);
  const [mpPublicKey, setMpPublicKey] = useState<string | null>(null);
  const [initPoint, setInitPoint] = useState<string | null>(null);
  const [paymentResult, setPaymentResult] = useState<{ status: string; paymentId?: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const brickContainerRef = useRef<HTMLDivElement>(null);
  const brickInstanceRef = useRef<any>(null);
  const mountedRef = useRef(true);
  const token = useAuthStore((s) => s.token);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  // Helper: add status log entry
  const log = useCallback((message: string, done = false) => {
    if (!mountedRef.current) return;
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setStatusLog((prev) => [...prev, { time, message, done }]);
  }, []);

  const unmountBrick = () => {
    try {
      if (brickInstanceRef.current) {
        brickInstanceRef.current.unmount();
        brickInstanceRef.current = null;
      }
    } catch {
      brickInstanceRef.current = null;
    }
  };

  // Step 1: Create preference
  const createPreference = useCallback(async () => {
    try {
      log('Conectando ao servidor...');
      setStep('loading');

      const res = await fetch('/api/assinatura-saas/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planoSaaSId, planoTipo, embed: true }),
      });

      log('Servidor respondeu', true);

      if (!res.ok) {
        const errorData = await res.json();
        if (errorData.code === 'MP_NOT_CONFIGURED') {
          log('MercadoPago nao configurado no servidor');
          setStep('mp_not_configured');
          return;
        }
        throw new Error(errorData.error || 'Erro ao criar pagamento');
      }

      const data = await res.json();
      if (!mountedRef.current) return;
      setPreferenceId(data.id);
      setMpPublicKey(data.publicKey);
      // Guardar init_point como fallback
      if (data.init_point) setInitPoint(data.init_point);
      log('Preferencia de pagamento criada (ID: ' + data.id.substring(0, 8) + '...)', true);
      setStep('sdk_loading');
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      const message = error instanceof Error ? error.message : 'Erro ao iniciar pagamento';
      log('Erro: ' + message);
      setErrorMessage(message);
      setStep('error');
    }
  }, [planoSaaSId, planoTipo, token, log]);

  useEffect(() => {
    mountedRef.current = true;
    createPreference();
    return () => {
      mountedRef.current = false;
      unmountBrick();
    };
  }, [createPreference]);

  // Step 2: Load SDK + create Brick
  useEffect(() => {
    if (step !== 'sdk_loading' || !preferenceId || !mpPublicKey) return;

    const container = brickContainerRef.current;

    const init = async () => {
      try {
        log('Carregando SDK do MercadoPago...');

        const MPClass = await loadMercadoPagoSDK((msg) => log(msg));
        if (!mountedRef.current) return;

        log('SDK carregado com sucesso', true);
        log('Inicializando formulario de pagamento...');

        // Create MP instance
        const mp = new MPClass(mpPublicKey, { locale: 'pt-BR' });
        const bricksBuilder = mp.bricks();

        const valorNumerico = parseFloat(valor.replace(/[^\d,]/g, '').replace(',', '.'));

        if (!mountedRef.current) return;
        setStep('payment');
        log('Formulario de pagamento pronto', true);

        // Small delay for DOM
        await new Promise((r) => setTimeout(r, 100));
        if (!mountedRef.current || !container) return;

        brickInstanceRef.current = bricksBuilder.create(
          'payment',
          container,
          {
            initialization: {
              amount: valorNumerico,
              preferenceId,
              payer: { email: '' },
            },
            customization: {
              visual: {
                style: {
                  theme: 'dark',
                  customVariables: {
                    textPrimaryColor: '#ffffff',
                    textSecondaryColor: '#a1a1aa',
                    inputBackgroundColor: '#27272a',
                    inputBorderColor: '#3f3f46',
                    inputFocusedBorderColor: '#f59e0b',
                    elementBackgroundColor: '#27272a',
                    elementPrimaryColor: '#f59e0b',
                    elementSecondaryColor: '#78716c',
                    elementDisabledColor: '#3f3f46',
                    errorColor: '#ef4444',
                    successColor: '#22c55e',
                  },
                },
              },
              paymentMethods: {
                maxInstallments: 12,
                minInstallments: 1,
              },
            },
            callbacks: {
              onReady: () => log('Formulario renderizado e pronto para uso', true),
              onSubmit: async (formData: any) => {
                if (!mountedRef.current) return;
                setStep('processing');
                log('Enviando pagamento ao MercadoPago...');

                try {
                  const res = await fetch('/api/assinatura-saas/process-payment', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                      token: formData.token,
                      issuerId: formData.issuerId || '',
                      paymentMethodId: formData.paymentMethodId,
                      transactionAmount: formData.transactionAmount,
                      installments: formData.installments,
                      description: `LeiturasOficial - ${planoNome} (${planoTipo})`,
                      payer: {
                        email: formData.payer?.email || '',
                        identification: formData.payer?.identification || {},
                      },
                      planoSaaSId,
                      planoTipo,
                      externalReference: preferenceId,
                    }),
                  });

                  if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || 'Erro ao processar pagamento');
                  }

                  const result = await res.json();
                  if (!mountedRef.current) return;
                  log('Resposta do MercadoPago: ' + result.status, true);
                  setPaymentResult({ status: result.status, paymentId: result.id });
                  setStep('done');
                  if (result.status === 'approved') {
                    toast.success('Pagamento aprovado! Assinatura ativada.');
                    onSuccessRef.current();
                  } else if (result.status === 'pending') {
                    toast.info('Pagamento pendente. A assinatura sera ativada apos a confirmacao.');
                  }
                } catch (error: unknown) {
                  if (!mountedRef.current) return;
                  const message = error instanceof Error ? error.message : 'Erro ao processar pagamento';
                  log('Falha no pagamento: ' + message);
                  toast.error(message);
                  setErrorMessage(message);
                  setStep('error');
                }
              },
              onError: (error: any) => {
                log('Erro no formulario: ' + (error?.message || 'desconhecido'));
                console.error('[MP Brick Error]', error);
              },
            },
          },
        );
      } catch (error: unknown) {
        console.error('[MP Brick Init Error]', error);
        if (!mountedRef.current) return;

        const message = error instanceof Error ? error.message : 'Erro desconhecido';

        if (message === 'TIMEOUT') {
          log('Timeout: SDK nao carregou em 15 segundos');
          setErrorMessage('O formulario de pagamento demorou demais para carregar. Tente o checkout externo ou recarregue a pagina.');
          setStep('sdk_failed');
        } else {
          log('Falha ao carregar: ' + message);
          setErrorMessage('Nao foi possivel carregar o formulario: ' + message);
          setStep('sdk_failed');
        }
      }
    };

    init();

    return () => { unmountBrick(); };
  }, [step, preferenceId, mpPublicKey, valor, planoNome, planoTipo, token, planoSaaSId, log]);

  const handleClose = useCallback(() => { unmountBrick(); onClose(); }, [onClose]);

  const handleRetry = useCallback(() => {
    unmountBrick();
    setStep('idle');
    setErrorMessage('');
    setPaymentResult(null);
    setPreferenceId(null);
    setMpPublicKey(null);
    setInitPoint(null);
    setStatusLog([]);
    createPreference();
  }, [createPreference]);

  // Fallback: open external checkout in new tab
  const handleExternalCheckout = useCallback(async () => {
    log('Abrindo checkout externo...');
    try {
      // Try to create a new preference with embed=false to get init_point
      const res = await fetch('/api/assinatura-saas/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planoSaaSId, planoTipo, embed: false }),
      });
      const data = await res.json();
      if (data.init_point) {
        window.open(data.init_point, '_blank');
        log('Checkout externo aberto', true);
        unmountBrick();
        onClose();
      } else {
        toast.error('Nao foi possivel gerar o link de pagamento');
      }
    } catch {
      toast.error('Erro ao gerar checkout externo');
    }
  }, [planoSaaSId, planoTipo, token, onClose]);

  // Status log component
  const StatusLogView = () => (
    <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 max-h-[140px] overflow-y-auto font-mono text-[11px]">
      {statusLog.map((entry, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-muted-foreground shrink-0">{entry.time}</span>
          {entry.done ? (
            <Check className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <Loader2 className="w-3 h-3 text-amber-400 shrink-0 mt-0.5 animate-spin" />
          )}
          <span className={entry.done ? 'text-emerald-300/80' : 'text-foreground'}>{entry.message}</span>
        </div>
      ))}
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="bg-card border-border text-foreground max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-amber-400" />
            Pagamento
          </DialogTitle>
        </DialogHeader>

        {/* Loading — creating preference */}
        {(step === 'idle' || step === 'loading') && (
          <div className="py-8 text-center space-y-4">
            <div className="relative w-14 h-14 mx-auto">
              <Loader2 className="w-14 h-14 animate-spin text-amber-400" />
              <CreditCard className="w-5 h-5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Preparando pagamento...</p>
              <p className="text-sm text-muted-foreground mt-1">Criando preferencia no MercadoPago</p>
            </div>
            <StatusLogView />
          </div>
        )}

        {/* Loading — SDK */}
        {step === 'sdk_loading' && (
          <div className="py-8 text-center space-y-4">
            <div className="relative w-14 h-14 mx-auto">
              <Loader2 className="w-14 h-14 animate-spin text-amber-400" />
              <CreditCard className="w-5 h-5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Carregando formulario de pagamento</p>
              <p className="text-sm text-muted-foreground mt-1">Baixando SDK do MercadoPago (pode levar alguns segundos)</p>
            </div>
            <StatusLogView />
          </div>
        )}

        {/* Payment Brick */}
        {step === 'payment' && (
          <div>
            <div className="p-4 rounded-lg bg-muted/50 border border-border mb-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-semibold text-foreground">{planoNome}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    Plano {planoTipo === 'mensal' ? 'Mensal' : 'Anual'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-foreground">{valor}</p>
                  <p className="text-xs text-muted-foreground">
                    {planoTipo === 'mensal' ? '/mes' : '/ano'}
                  </p>
                </div>
              </div>
              <Separator className="bg-border my-2" />
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" /><span>Cartao</span></div>
                <div className="flex items-center gap-1"><QrCode className="w-3.5 h-3.5" /><span>PIX</span></div>
                <div className="flex items-center gap-1"><Smartphone className="w-3.5 h-3.5" /><span>Outros</span></div>
              </div>
            </div>

            <div id="paymentBrick_container" ref={brickContainerRef} className="min-h-[300px]" />

            {/* Collapsible status log */}
            {statusLog.length > 0 && (
              <details className="mt-3">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  Detalhes do carregamento ({statusLog.length} etapas)
                </summary>
                <div className="mt-2"><StatusLogView /></div>
              </details>
            )}

            <p className="text-xs text-muted-foreground text-center mt-3 flex items-center justify-center gap-1">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1L7.5 4.5L11 5L8.5 7.5L9 11L6 9.5L3 11L3.5 7.5L1 5L4.5 4.5L6 1Z" fill="#f59e0b"/>
              </svg>
              Pagamento seguro processado pelo MercadoPago
            </p>
          </div>
        )}

        {/* Processing */}
        {step === 'processing' && (
          <div className="py-8 text-center space-y-4">
            <div className="relative w-14 h-14 mx-auto">
              <Loader2 className="w-14 h-14 animate-spin text-amber-400" />
              <CreditCard className="w-5 h-5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Processando pagamento...</p>
              <p className="text-sm text-muted-foreground mt-1">Aguarde a confirmacao do MercadoPago</p>
            </div>
            <StatusLogView />
          </div>
        )}

        {/* Done */}
        {step === 'done' && paymentResult && (
          <div className="py-6">
            {paymentResult.status === 'approved' ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                </div>
                <p className="text-lg font-bold text-foreground mb-1">Pagamento Aprovado!</p>
                <p className="text-sm text-muted-foreground mb-2">
                  Assinatura do plano <strong className="text-foreground">{planoNome}</strong> ativada.
                </p>
                {paymentResult.paymentId && (
                  <p className="text-xs text-muted-foreground">ID: {paymentResult.paymentId}</p>
                )}
                <Button className="mt-6 bg-gradient-to-r from-emerald-500 to-teal-600" onClick={() => { unmountBrick(); onSuccessRef.current(); }}>
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Continuar
                </Button>
              </div>
            ) : paymentResult.status === 'pending' ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-10 h-10 text-amber-400" />
                </div>
                <p className="text-lg font-bold text-foreground mb-1">Pagamento Pendente</p>
                <p className="text-sm text-muted-foreground mb-4">A assinatura sera ativada automaticamente.</p>
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 mb-4">Aguardando confirmacao</Badge>
                <div className="mt-4"><Button variant="outline" onClick={handleClose}><ArrowLeft className="w-4 h-4 mr-2" /> Voltar</Button></div>
              </div>
            ) : paymentResult.status === 'rejected' ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                  <XCircle className="w-10 h-10 text-red-400" />
                </div>
                <p className="text-lg font-bold text-foreground mb-1">Pagamento Recusado</p>
                <p className="text-sm text-muted-foreground mb-4">Verifique os dados ou tente outro metodo.</p>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={handleClose}><ArrowLeft className="w-4 h-4 mr-2" /> Voltar</Button>
                  <Button className="bg-gradient-to-r from-amber-500 to-orange-600" onClick={handleRetry}><CreditCard className="w-4 h-4 mr-2" /> Tentar Novamente</Button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-10 h-10 text-amber-400" />
                </div>
                <p className="text-lg font-bold text-foreground mb-1">Pagamento em Analise</p>
                <p className="text-sm text-muted-foreground mb-4">Voce recebera uma atualizacao em breve.</p>
                <Button variant="outline" onClick={handleClose}><ArrowLeft className="w-4 h-4 mr-2" /> Voltar</Button>
              </div>
            )}
          </div>
        )}

        {/* SDK Failed — with fallback */}
        {step === 'sdk_failed' && (
          <div className="py-6 space-y-4">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-10 h-10 text-amber-400" />
              </div>
              <p className="text-lg font-bold text-foreground mb-1">Nao foi possivel carregar o formulario</p>
              <p className="text-sm text-muted-foreground mb-4">{errorMessage}</p>
            </div>

            {/* Show status log */}
            {statusLog.length > 0 && (
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-xs font-medium text-muted-foreground mb-2">Log do processo:</p>
                <StatusLogView />
              </div>
            )}

            {/* Action buttons */}
            <div className="space-y-2">
              <Button className="w-full bg-gradient-to-r from-amber-500 to-orange-600" onClick={handleExternalCheckout}>
                <ExternalLink className="w-4 h-4 mr-2" />
                Pagar no site do MercadoPago
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Abre o checkout oficial do MercadoPago em uma nova aba
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleRetry}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Tentar Brick
                </Button>
                <Button variant="outline" className="flex-1" onClick={handleClose}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* MP Not Configured */}
        {step === 'mp_not_configured' && (
          <div className="py-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
                <CreditCard className="w-10 h-10 text-amber-400" />
              </div>
              <p className="text-lg font-bold text-foreground mb-2">MercadoPago nao configurado</p>
              <p className="text-sm text-muted-foreground mb-4">
                O administrador precisa configurar as credenciais do MercadoPago.
              </p>
              <div className="p-4 rounded-lg bg-muted/50 border border-border mb-4 text-left">
                <p className="text-sm font-medium text-foreground mb-2">Como configurar:</p>
                <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                  <li>Acesse <strong className="text-foreground">CONFIG SAAS</strong></li>
                  <li>Role ate <strong className="text-foreground">Mercado Pago</strong></li>
                  <li>Preencha <strong className="text-foreground">Access Token</strong> e <strong className="text-foreground">Public Key</strong></li>
                  <li>Clique em <strong className="text-foreground">Salvar</strong></li>
                </ol>
              </div>
              <Button variant="outline" onClick={handleClose}><ArrowLeft className="w-4 h-4 mr-2" /> Voltar</Button>
            </div>
          </div>
        )}

        {/* Generic Error */}
        {step === 'error' && (
          <div className="py-8 space-y-4">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-10 h-10 text-red-400" />
              </div>
              <p className="text-lg font-bold text-foreground mb-2">Erro no Pagamento</p>
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
            </div>
            {statusLog.length > 0 && (
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-xs font-medium text-muted-foreground mb-2">Log:</p>
                <StatusLogView />
              </div>
            )}
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={handleClose}><ArrowLeft className="w-4 h-4 mr-2" /> Voltar</Button>
              <Button className="bg-gradient-to-r from-amber-500 to-orange-600" onClick={handleRetry}>
                <CreditCard className="w-4 h-4 mr-2" /> Tentar Novamente
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
