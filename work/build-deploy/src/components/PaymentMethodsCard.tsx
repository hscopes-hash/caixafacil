'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  DollarSign,
  QrCode,
  ShoppingCart,
  CreditCard,
  Copy,
  Check,
  CheckCircle2,
  Loader2,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

// ============================================
// TYPES
// ============================================
interface EmpresaData {
  pixChave?: string | null;
  pixMerchantNome?: string | null;
  pixMerchantCidade?: string | null;
  pixBancoNome?: string | null;
  mercadopagoAccessToken?: string | null;
  cieloMerchantId?: string | null;
  cieloAmbiente?: string | null;
  nome?: string;
  email?: string;
  [key: string]: any;
}

interface PaymentMethodsCardProps {
  empresa: EmpresaData | null;
  valor: number;
  descricao: string;
  clienteNome?: string;
  clienteCpfCnpj?: string;
  clienteEmail?: string;
  empresaId: string;
  clienteId?: string;
  layout?: 'grid' | 'stack';
  onPaymentApproved?: (forma: string, paymentId?: string) => void;
  enableCart?: boolean;
  enableCielo?: boolean;
}

type FormaPagamento = 'DINHEIRO' | 'PIX_BANCO' | 'MERCADO_PAGO' | 'CARTAO_CIELO';

interface MpPixData {
  qrCodeBase64: string;
  paymentId: string;
  status: string;
}

// ============================================
// HELPERS
// ============================================
function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PAYMENT_META: Record<FormaPagamento, {
  label: string;
  icon: typeof DollarSign;
  gradientActive: string;
  gradientInactive: string;
  gridBorderColor: string;
  gridBgActive: string;
  gridBgInactive: string;
  gridTextColor: string;
  accent: string;
  accentBg: string;
  badgeBorder: string;
}> = {
  DINHEIRO: {
    label: 'Dinheiro',
    icon: DollarSign,
    gradientActive: 'bg-gradient-to-r from-emerald-500 to-green-600',
    gradientInactive: 'bg-gradient-to-r from-emerald-500/80 to-green-600/80 opacity-70',
    gridBorderColor: 'border-emerald-500',
    gridBgActive: 'bg-emerald-500/10',
    gridBgInactive: 'bg-muted/30',
    gridTextColor: 'text-emerald-400',
    accent: 'emerald',
    accentBg: 'bg-emerald-500/20',
    badgeBorder: 'border-emerald-500/30',
  },
  PIX_BANCO: {
    label: 'PIX (Banco)',
    icon: QrCode,
    gradientActive: 'bg-gradient-to-r from-violet-500 to-purple-600',
    gradientInactive: 'bg-gradient-to-r from-violet-500/80 to-purple-600/80 opacity-70',
    gridBorderColor: 'border-violet-500',
    gridBgActive: 'bg-violet-500/10',
    gridBgInactive: 'bg-muted/30',
    gridTextColor: 'text-violet-400',
    accent: 'violet',
    accentBg: 'bg-violet-500/20',
    badgeBorder: 'border-violet-500/30',
  },
  MERCADO_PAGO: {
    label: 'Mercado Pago',
    icon: ShoppingCart,
    gradientActive: 'bg-gradient-to-r from-sky-500 to-blue-600',
    gradientInactive: 'bg-gradient-to-r from-sky-500/80 to-blue-600/80 opacity-70',
    gridBorderColor: 'border-sky-500',
    gridBgActive: 'bg-sky-500/10',
    gridBgInactive: 'bg-muted/30',
    gridTextColor: 'text-sky-400',
    accent: 'sky',
    accentBg: 'bg-sky-500/20',
    badgeBorder: 'border-sky-500/30',
  },
  CARTAO_CIELO: {
    label: 'Cartão Cielo',
    icon: CreditCard,
    gradientActive: 'bg-gradient-to-r from-amber-500 to-orange-600',
    gradientInactive: 'bg-gradient-to-r from-amber-500/80 to-orange-600/80 opacity-70',
    gridBorderColor: 'border-amber-500',
    gridBgActive: 'bg-amber-500/10',
    gridBgInactive: 'bg-muted/30',
    gridTextColor: 'text-amber-400',
    accent: 'amber',
    accentBg: 'bg-amber-500/20',
    badgeBorder: 'border-amber-500/30',
  },
};

// ============================================
// COMPONENT
// ============================================
export default function PaymentMethodsCard({
  empresa,
  valor,
  descricao,
  clienteNome,
  clienteCpfCnpj,
  clienteEmail,
  empresaId,
  clienteId,
  layout = 'grid',
  onPaymentApproved,
  enableCart = false,
  enableCielo = false,
}: PaymentMethodsCardProps) {
  // ---- Available methods ----
  const availableMethods = useCallback((): FormaPagamento[] => {
    const methods: FormaPagamento[] = ['DINHEIRO'];
    if (empresa?.pixChave) methods.push('PIX_BANCO');
    if (empresa?.mercadopagoAccessToken) methods.push('MERCADO_PAGO');
    if (enableCielo && empresa?.cieloMerchantId) methods.push('CARTAO_CIELO');
    return methods;
  }, [empresa?.pixChave, empresa?.mercadopagoAccessToken, empresa?.cieloMerchantId, enableCielo]);

  // ---- Selection state ----
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | null>(null);

  // ---- PIX Banco state ----
  const [pixQrDataUrl, setPixQrDataUrl] = useState<string | null>(null);
  const [pixCopiado, setPixCopiado] = useState(false);
  const [pixPayload, setPixPayload] = useState('');
  const [pixLoading, setPixLoading] = useState(false);

  // ---- Mercado Pago state ----
  const [mpPixData, setMpPixData] = useState<MpPixData | null>(null);
  const [mpPixLoading, setMpPixLoading] = useState(false);
  const [mpSubOption, setMpSubOption] = useState<'pix' | 'cartao' | null>(null);
  const mpPixPollRef = useRef<NodeJS.Timeout | null>(null);

  // ---- Cielo card form state ----
  const [cieloForm, setCieloForm] = useState({
    numero: '',
    validade: '',
    cvv: '',
    bandeira: 'visa',
    tipo: 'credito' as 'credito' | 'debito',
    parcelas: '1',
    nomePortador: '',
  });
  const [cieloSubmitting, setCieloSubmitting] = useState(false);
  const [cieloResult, setCieloResult] = useState<{ sucesso: boolean; mensagem: string; paymentId?: string } | null>(null);

  // ---- Cleanup polling on unmount ----
  useEffect(() => {
    return () => {
      if (mpPixPollRef.current) {
        clearInterval(mpPixPollRef.current);
        mpPixPollRef.current = null;
      }
    };
  }, []);

  // ---- Poll MP PIX status ----
  useEffect(() => {
    if (mpPixPollRef.current) {
      clearInterval(mpPixPollRef.current);
      mpPixPollRef.current = null;
    }
    if (!mpPixData || mpPixData.status === 'approved') return;

    mpPixPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/mercadopago/status?id=${mpPixData.paymentId}&empresaId=${empresaId}`);
        const data = await res.json();
        if (data.payment?.status) {
          setMpPixData((prev) => (prev ? { ...prev, status: data.payment.status } : null));
          if (data.payment.status === 'approved') {
            if (mpPixPollRef.current) {
              clearInterval(mpPixPollRef.current);
              mpPixPollRef.current = null;
            }
            onPaymentApproved?.('MERCADO_PAGO', data.payment.id);
          } else if (data.payment.status === 'cancelled' || data.payment.status === 'rejected') {
            if (mpPixPollRef.current) {
              clearInterval(mpPixPollRef.current);
              mpPixPollRef.current = null;
            }
            toast.error('Pagamento recusado ou cancelado');
            setMpPixData(null);
          }
        }
      } catch {
        /* silencioso */
      }
    }, 3000);
  }, [mpPixData?.paymentId, mpPixData?.status, empresaId, onPaymentApproved]);

  // ---- Helpers ----
  const limparPixBanco = () => {
    setPixQrDataUrl(null);
    setPixPayload('');
    setPixCopiado(false);
  };

  const limparMpPix = () => {
    setMpPixData(null);
    setMpSubOption(null);
    if (mpPixPollRef.current) {
      clearInterval(mpPixPollRef.current);
      mpPixPollRef.current = null;
    }
  };

  const resetAll = () => {
    setFormaPagamento(null);
    limparPixBanco();
    limparMpPix();
    setCieloForm({
      numero: '',
      validade: '',
      cvv: '',
      bandeira: 'visa',
      tipo: 'credito',
      parcelas: '1',
      nomePortador: '',
    });
    setCieloSubmitting(false);
    setCieloResult(null);
  };

  const selectForma = (forma: FormaPagamento) => {
    if (formaPagamento === forma) {
      resetAll();
      return;
    }
    resetAll();
    setFormaPagamento(forma);
  };

  // ---- PIX Banco: Gerar QR ----
  const gerarPixBanco = async () => {
    if (valor <= 0) {
      toast.error('Informe o valor');
      return;
    }
    if (!empresa?.pixChave) {
      toast.error('PIX não configurado nas configurações da empresa');
      return;
    }
    setPixLoading(true);
    try {
      const { gerarPayloadPix } = await import('@/lib/pix-payload');
      const payload = gerarPayloadPix({
        chave: empresa.pixChave,
        nome: empresa.pixMerchantNome || empresa.nome || '',
        cidade: empresa.pixMerchantCidade || '',
        valor,
        descricao: descricao || undefined,
      });
      setPixPayload(payload);
      const QRCode = await import('qrcode');
      const dataUrl = await QRCode.toDataURL(payload, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setPixQrDataUrl(dataUrl);
    } catch {
      toast.error('Erro ao gerar QR Code PIX');
    } finally {
      setPixLoading(false);
    }
  };

  // ---- PIX Banco: Copiar ----
  const copiarPix = async () => {
    try {
      await navigator.clipboard.writeText(pixPayload);
      setPixCopiado(true);
      toast.success('Código PIX copiado!');
      setTimeout(() => setPixCopiado(false), 3000);
    } catch {
      toast.error('Erro ao copiar');
    }
  };

  // ---- PIX Banco: Confirmar ----
  const confirmarPixBanco = () => {
    onPaymentApproved?.('PIX_BANCO');
  };

  // ---- DINHEIRO: Confirmar ----
  const confirmarDinheiro = () => {
    onPaymentApproved?.('DINHEIRO');
  };

  // ---- Mercado Pago: Gerar PIX ----
  const gerarMpPix = async () => {
    if (valor <= 0) {
      toast.error('Informe o valor');
      return;
    }
    setMpPixLoading(true);
    try {
      const res = await fetch('/api/mercadopago/criar-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valor,
          descricao: descricao || `Pagamento - ${clienteNome || 'Cliente'}`,
          nome: clienteNome || '',
          cpfCnpj: clienteCpfCnpj || '',
          email: clienteEmail || '',
          empresaId,
        }),
      });
      const data = await res.json();
      if (data.success && data.payment) {
        setMpPixData({
          qrCodeBase64: data.payment.qrCodeBase64,
          paymentId: data.payment.id,
          status: data.payment.status,
        });
        toast.success('QR Code PIX gerado!');
      } else {
        toast.error(data.error || 'Erro ao gerar PIX');
      }
    } catch {
      toast.error('Erro ao conectar com Mercado Pago');
    } finally {
      setMpPixLoading(false);
    }
  };

  // ---- Cielo: Submit card transaction ----
  const submitCielo = async () => {
    if (!cieloForm.numero || !cieloForm.validade || !cieloForm.cvv) {
      toast.error('Preencha todos os campos do cartão');
      return;
    }
    if (valor <= 0) {
      toast.error('Informe o valor');
      return;
    }
    setCieloSubmitting(true);
    setCieloResult(null);
    try {
      const res = await fetch('/api/cielo/transacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valor,
          descricao: descricao || `Pagamento - ${clienteNome || 'Cliente'}`,
          cartao: {
            numero: cieloForm.numero.replace(/\s/g, ''),
            validade: cieloForm.validade,
            cvv: cieloForm.cvv,
            bandeira: cieloForm.bandeira,
            tipo: cieloForm.tipo,
            parcelas: parseInt(cieloForm.parcelas) || 1,
            nomePortador: cieloForm.nomePortador,
          },
          cliente: {
            nome: clienteNome || '',
            cpfCnpj: clienteCpfCnpj || '',
          },
          empresaId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCieloResult({ sucesso: true, mensagem: 'Pagamento aprovado!', paymentId: data.paymentId });
        toast.success('Pagamento aprovado!');
        onPaymentApproved?.('CARTAO_CIELO', data.paymentId);
      } else {
        setCieloResult({ sucesso: false, mensagem: data.error || 'Erro na transação' });
        toast.error(data.error || 'Erro na transação');
      }
    } catch {
      setCieloResult({ sucesso: false, mensagem: 'Erro ao conectar com Cielo' });
      toast.error('Erro ao conectar com Cielo');
    } finally {
      setCieloSubmitting(false);
    }
  };

  // ---- Render ----
  const methods = availableMethods();
  const meta = formaPagamento ? PAYMENT_META[formaPagamento] : null;

  return (
    <div className="space-y-3">
      {/* ===== SELECTION BUTTONS ===== */}
      {layout === 'grid' ? (
        <div className="grid grid-cols-3 gap-2">
          {methods.map((forma) => {
            const m = PAYMENT_META[forma];
            const Icon = m.icon;
            const selected = formaPagamento === forma;
            return (
              <button
                key={forma}
                onClick={() => selectForma(forma)}
                className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all ${
                  selected
                    ? `${m.gridBorderColor} ${m.gridBgActive} ${m.gridTextColor} shadow-sm shadow-${m.accent}-500/20`
                    : 'border-border bg-muted/30 text-muted-foreground hover:border-border/80 hover:bg-muted/50'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    selected ? m.accentBg : 'bg-muted'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium">{m.label}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {methods.map((forma) => {
            const m = PAYMENT_META[forma];
            const Icon = m.icon;
            const selected = formaPagamento === forma;
            return (
              <Button
                key={forma}
                className={`w-full text-sm ${selected ? m.gradientActive : m.gradientInactive}`}
                onClick={() => selectForma(forma)}
              >
                <Icon className="w-4 h-4 mr-2" />
                {m.label}
              </Button>
            );
          })}
        </div>
      )}

      {/* No methods available hint */}
      {methods.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Configure PIX ou Mercado Pago nas configurações da empresa
        </p>
      )}

      {/* Selected badge (grid layout only) */}
      {formaPagamento && meta && layout === 'grid' && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-xs text-foreground font-medium">
            {formaPagamento === 'DINHEIRO' && 'Pagamento em dinheiro'}
            {formaPagamento === 'PIX_BANCO' && 'Pagamento via PIX (Banco)'}
            {formaPagamento === 'MERCADO_PAGO' && 'Pagamento via Mercado Pago'}
            {formaPagamento === 'CARTAO_CIELO' && 'Pagamento via Cartão Cielo'}
          </span>
        </div>
      )}

      {/* ===== DINAMIC CONTENT ===== */}
      <Separator className="bg-border" />

      {/* ---- DINHEIRO ---- */}
      {formaPagamento === 'DINHEIRO' && (
        <div className="space-y-3">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
              <DollarSign className="w-7 h-7 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-emerald-400">R$ {formatNumber(valor)}</p>
            <p className="text-xs text-muted-foreground">Confirme o recebimento em dinheiro</p>
          </div>
          <Button
            className="w-full bg-gradient-to-r from-emerald-500 to-green-600"
            onClick={confirmarDinheiro}
          >
            CONFIRMAR RECEBIMENTO
          </Button>
        </div>
      )}

      {/* ---- PIX BANCO ---- */}
      {formaPagamento === 'PIX_BANCO' && (
        <div className="space-y-3">
          {!pixQrDataUrl && !pixLoading ? (
            <div className="text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-violet-500/20 flex items-center justify-center">
                <QrCode className="w-7 h-7 text-violet-400" />
              </div>
              <p className="text-sm font-bold text-foreground">PIX via Banco</p>
              <p className="text-xs text-muted-foreground">Gere o QR Code para o cliente escanear</p>
              <div className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1">
                <span className="text-sm font-bold text-emerald-400">R$ {formatNumber(valor)}</span>
              </div>
              {empresa?.pixMerchantNome && (
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-foreground">{empresa.pixMerchantNome}</p>
                  {empresa.pixMerchantCidade && (
                    <p className="text-xs text-muted-foreground">Cidade: {empresa.pixMerchantCidade}</p>
                  )}
                  {empresa.pixBancoNome && (
                    <p className="text-xs text-muted-foreground">Banco: {empresa.pixBancoNome}</p>
                  )}
                </div>
              )}
              <Button
                className="w-full bg-gradient-to-r from-violet-500 to-purple-600"
                onClick={gerarPixBanco}
              >
                <QrCode className="w-4 h-4 mr-2" />Gerar QR Code PIX
              </Button>
            </div>
          ) : pixLoading ? (
            <div className="py-6 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
              <span className="text-xs text-muted-foreground">Gerando QR Code...</span>
            </div>
          ) : (
            <>
              <div className="text-center space-y-2">
                <img
                  src={pixQrDataUrl!}
                  alt="QR Code PIX"
                  className="mx-auto rounded-xl border-2 border-white shadow-lg"
                  style={{ width: 200, height: 200 }}
                />
                <p className="text-sm font-bold text-foreground">R$ {formatNumber(valor)}</p>
                <p className="text-xs text-muted-foreground">Escaneie o QR Code para pagar</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={copiarPix}>
                  {pixCopiado ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                  {pixCopiado ? 'Copiado!' : 'Copiar PIX'}
                </Button>
                <Button
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-green-600"
                  onClick={confirmarPixBanco}
                >
                  Confirmar
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground"
                onClick={limparPixBanco}
              >
                <RotateCcw className="w-3 h-3 mr-1" />Gerar novo QR Code
              </Button>
            </>
          )}
        </div>
      )}

      {/* ---- MERCADO PAGO ---- */}
      {formaPagamento === 'MERCADO_PAGO' && (
        <div className="space-y-3">
          {/* MP sub-option selection */}
          {!mpPixData && !mpPixLoading && !mpSubOption && (
            <div className="text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-sky-500/20 flex items-center justify-center">
                <ShoppingCart className="w-7 h-7 text-sky-400" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-foreground">Mercado Pago</p>
                <p className="text-xs text-muted-foreground">Escolha a forma de pagamento</p>
              </div>
              {valor > 0 && (
                <div className="inline-flex items-center gap-1 bg-sky-500/10 border border-sky-500/30 rounded-full px-3 py-1">
                  <span className="text-sm font-bold text-sky-400">R$ {formatNumber(valor)}</span>
                </div>
              )}
              <div className="grid grid-cols-1 gap-2">
                {/* PIX via MP */}
                <Button
                  className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white text-sm"
                  onClick={() => gerarMpPix()}
                >
                  <QrCode className="w-4 h-4 mr-2" />
                  PIX (QR Code)
                </Button>
                {/* Cartão via Brick (if enableCart) */}
                {enableCart && (
                  <Button
                    className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white text-sm"
                    onClick={() => {
                      setMpSubOption('cartao');
                      onPaymentApproved?.('MERCADO_PAGO_CARTAO');
                    }}
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Cartão de Crédito / Débito
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Loading PIX MP */}
          {mpPixLoading && (
            <div className="py-6 flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
              <span className="text-xs text-muted-foreground">Gerando QR Code PIX...</span>
            </div>
          )}

          {/* PIX QR Code gerado (MP) */}
          {mpPixData && (
            <div className="text-center space-y-2">
              {mpPixData.status === 'approved' ? (
                <div className="py-4 flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </div>
                  <p className="text-sm font-bold text-emerald-400">Pagamento aprovado!</p>
                  <p className="text-xs text-muted-foreground">ID: {mpPixData.paymentId}</p>
                </div>
              ) : (
                <>
                  <img
                    src={`data:image/png;base64,${mpPixData.qrCodeBase64}`}
                    alt="QR Code PIX Mercado Pago"
                    className="mx-auto rounded-xl border-2 border-white shadow-lg"
                    style={{ width: 200, height: 200 }}
                  />
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-foreground">PIX via Mercado Pago</p>
                    <p className="text-xs text-muted-foreground">Escaneie o QR Code para pagar</p>
                  </div>
                  {valor > 0 && (
                    <div className="inline-flex items-center gap-1 bg-sky-500/10 border border-sky-500/30 rounded-full px-3 py-1">
                      <span className="text-sm font-bold text-sky-400">R$ {formatNumber(valor)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-sky-400" />
                    <span className="text-xs text-muted-foreground">Aguardando pagamento...</span>
                  </div>
                </>
              )}
              {mpPixData.status !== 'approved' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs border-sky-500/30 text-sky-400 hover:bg-sky-500/10"
                  onClick={limparMpPix}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />Gerar novo QR Code
                </Button>
              )}
            </div>
          )}

          {/* Cartão sub-option (Brick trigger - parent handles rendering) */}
          {mpSubOption === 'cartao' && (
            <div className="text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-sky-500/20 flex items-center justify-center">
                <CreditCard className="w-7 h-7 text-sky-400" />
              </div>
              <p className="text-sm font-bold text-foreground">Cartão de Crédito / Débito</p>
              <p className="text-xs text-muted-foreground">
                O formulário de pagamento será exibido pelo componente pai (Brick).
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground"
                onClick={() => setMpSubOption(null)}
              >
                <RotateCcw className="w-3 h-3 mr-1" />Voltar
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ---- CARTAO CIELO ---- */}
      {formaPagamento === 'CARTAO_CIELO' && (
        <div className="space-y-3">
          {/* Success result */}
          {cieloResult?.sucesso ? (
            <div className="py-4 flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <p className="text-sm font-bold text-emerald-400">{cieloResult.mensagem}</p>
              {cieloResult.paymentId && (
                <p className="text-xs text-muted-foreground">ID: {cieloResult.paymentId}</p>
              )}
            </div>
          ) : (
            <>
              {/* Error result */}
              {cieloResult && !cieloResult.sucesso && (
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span className="text-xs text-red-400 font-medium">{cieloResult.mensagem}</span>
                </div>
              )}

              {/* Amount display */}
              <div className="text-center space-y-1">
                <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center">
                  <CreditCard className="w-7 h-7 text-amber-400" />
                </div>
                <p className="text-sm font-bold text-foreground">Cartão - Cielo</p>
                {empresa?.cieloAmbiente && (
                  <p className="text-[10px] text-muted-foreground uppercase">
                    {empresa.cieloAmbiente === 'production' ? 'Produção' : 'Sandbox'}
                  </p>
                )}
                {valor > 0 && (
                  <div className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1">
                    <span className="text-sm font-bold text-emerald-400">R$ {formatNumber(valor)}</span>
                  </div>
                )}
              </div>

              {/* Card form */}
              <div className="space-y-2">
                {/* Nome do Portador */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nome no Cartão</Label>
                  <Input
                    type="text"
                    value={cieloForm.nomePortador}
                    onChange={(e) => setCieloForm((f) => ({ ...f, nomePortador: e.target.value.toUpperCase() }))}
                    placeholder="Como está impresso no cartão"
                    className="bg-muted border-border text-foreground text-sm"
                  />
                </div>

                {/* Número do Cartão */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Número do Cartão</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={19}
                    value={cieloForm.numero}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').substring(0, 16);
                      const formatted = v.replace(/(\d{4})(?=\d)/g, '$1 ');
                      setCieloForm((f) => ({ ...f, numero: formatted }));
                    }}
                    placeholder="0000 0000 0000 0000"
                    className="bg-muted border-border text-foreground text-sm font-mono"
                  />
                </div>

                {/* Validade + CVV */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Validade</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={5}
                      value={cieloForm.validade}
                      onChange={(e) => {
                        let v = e.target.value.replace(/\D/g, '').substring(0, 4);
                        if (v.length >= 3) v = v.substring(0, 2) + '/' + v.substring(2);
                        setCieloForm((f) => ({ ...f, validade: v }));
                      }}
                      placeholder="MM/AA"
                      className="bg-muted border-border text-foreground text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">CVV</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={cieloForm.cvv}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, '').substring(0, 4);
                        setCieloForm((f) => ({ ...f, cvv: v }));
                      }}
                      placeholder="000"
                      className="bg-muted border-border text-foreground text-sm font-mono"
                    />
                  </div>
                </div>

                {/* Bandeira + Tipo */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Bandeira</Label>
                    <div className="flex gap-1">
                      {(['visa', 'master', 'amex', 'elo'] as const).map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setCieloForm((f) => ({ ...f, bandeira: b }))}
                          className={`flex-1 py-1.5 rounded-md text-[10px] font-semibold uppercase transition-all ${
                            cieloForm.bandeira === b
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-muted text-muted-foreground border border-transparent hover:bg-muted/80'
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Tipo</Label>
                    <div className="flex gap-1">
                      {(['credito', 'debito'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setCieloForm((f) => ({ ...f, tipo: t }))}
                          className={`flex-1 py-1.5 rounded-md text-[10px] font-semibold uppercase transition-all ${
                            cieloForm.tipo === t
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-muted text-muted-foreground border border-transparent hover:bg-muted/80'
                          }`}
                        >
                          {t === 'credito' ? 'Crédito' : 'Débito'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Parcelas (only for crédito) */}
                {cieloForm.tipo === 'credito' && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Parcelas</Label>
                    <div className="flex gap-1 flex-wrap">
                      {[1, 2, 3, 4, 5, 6].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setCieloForm((f) => ({ ...f, parcelas: String(p) }))}
                          className={`min-w-[48px] py-1.5 rounded-md text-[10px] font-semibold transition-all ${
                            cieloForm.parcelas === String(p)
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-muted text-muted-foreground border border-transparent hover:bg-muted/80'
                          }`}
                        >
                          {p}x
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Submit */}
              <Button
                className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
                onClick={submitCielo}
                disabled={cieloSubmitting}
              >
                {cieloSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Pagar R$ {formatNumber(valor)}
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
