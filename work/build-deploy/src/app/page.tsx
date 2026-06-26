// Sistema de Gestão de Máquinas - v2.3.0.7
'use client';

import { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import { useSwipeNavigation } from '@/hooks/use-swipe-navigation';
import { useKioskMode } from '@/hooks/use-kiosk-mode';
import { useTheme } from 'next-themes';
import { useAuthStore, type Usuario, type Empresa, type NivelAcesso, type PreferenciasUsuario } from '@/stores/auth-store';
import { SUPER_ADMIN_EMAIL } from '@/lib/saas-config';

// Capacitor: esconder splash screen ao iniciar (corrige bloqueio de toque no WebView)
try {
  if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
    (window as any).Capacitor?.Plugins?.SplashScreen?.hide?.();
  }
} catch {}
import { Button } from '@/components/ui/button';
import { PRINTER_PRESETS, connectPrinter, disconnectPrinter, isBluetoothAvailable, isAnyPrinterAvailable, isPrinterConnected, getConnectedDeviceName, getActiveConfig, printReceipt, fallbackPrint, generateReceiptText, type PrinterConfig } from '@/lib/printer-bluetooth';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

import {
  LogOut, Menu, Users, Cog, DollarSign, Settings, ChevronRight,
  Music, Circle, Gamepad2, Gift, TrendingUp, TrendingDown, Clock,
  Plus, Pencil, Trash2, Eye, Ban, CheckCircle, AlertTriangle, Building2,
  ClipboardList, Printer, Camera, X, Image as ImageIcon, Layers, MessageCircle, LogIn,
  CalendarDays, ShieldAlert, FileText, Sun, Moon, DatabaseBackup, Download, Upload, HardDrive, SlidersHorizontal,
  Key, Wifi, EyeOff, CreditCard, ExternalLink, ChevronDown, ChevronUp, ChevronLeft, RotateCcw, Crown, Check, CheckCircle2, XCircle, Sparkles, Zap, Shield, Info,
  Receipt, Mic, MicOff, Send, Volume2, ShoppingCart, ShoppingBag, Maximize2, Minimize2, Monitor, User, Lock, QrCode, BookOpen, Globe, Save, HelpCircle, Landmark, MapPin, Copy, Bot, Calculator, Phone, Smartphone
} from 'lucide-react';
import { VERSION_DISPLAY, VERSION_STRING, VERSION_WITH_DATE } from '@/lib/version';
import GestaoPlanosSaaS from '@/components/GestaoPlanosSaaS';
import RelatoriosPage from '@/components/RelatoriosPage';
import PainelFinanceiroSaaS from '@/components/PainelFinanceiroSaaS';
import { redirectToCheckout } from '@/components/MercadoPagoCheckout';
import ChatIAPage from '@/components/ChatIAPage';
import GruaDashboard from '@/components/GruaDashboard';

// ============================================
// TYPES
// ============================================
interface Cliente {
  id: string;
  nome: string;
  cpfCnpj?: string;
  email?: string;
  telefone?: string;
  telefone2?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  observacoes?: string;
  whatsapp?: string;
  acertoPercentual?: number;
  formaCobranca?: string;
  ativo: boolean;
  bloqueado: boolean;
  motivoBloqueio?: string;
  createdAt: string;
  _count?: { maquinas: number };
}

interface TipoMaquina {
  id: string;
  descricao: string;
  nomeEntrada: string;
  nomeSaida: string;
  ativo: boolean;
  classe: number; // 0=primária, 1=secundária
  _count?: { maquinas: number };
}

interface Maquina {
  id: string;
  codigo: string;
  nome: string;
  tipoId: string;
  tipo?: TipoMaquina;
  descricao?: string;
  marca?: string;
  modelo?: string;
  numeroSerie?: string;
  dataAquisicao?: string;
  valorAquisicao?: number;
  valorMensal?: number;
  localizacao?: string;
  status: 'ATIVA' | 'INATIVA' | 'MANUTENCAO' | 'VENDIDA';
  observacoes?: string;
  moeda: 'M001' | 'M005' | 'M010' | 'M025';
  entradaAtual: number;
  saidaAtual: number;
  nomeCampoEntrada?: string;
  nomeCampoSaida?: string;
  clienteId: string;
  cliente?: { id: string; nome: string; telefone?: string };
}

interface Pagamento {
  id: string;
  valor: number;
  dataVencimento: string;
  dataPagamento?: string;
  status: 'PENDENTE' | 'PAGO' | 'ATRASADO' | 'CANCELADO';
  formaPagamento?: string;
  observacoes?: string;
  clienteId: string;
  cliente?: { id: string; nome: string };
}

interface UsuarioSistema {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  ativo: boolean;
  nivelAcesso: NivelAcesso;
  ultimoAcesso?: string;
  createdAt: string;
}

interface DashboardData {
  clientes: { total: number; ativos: number; bloqueados: number };
  maquinas: { total: number; ativas: number; manutencao: number; porTipo: { tipo: string; _count: number }[] };
  financeiro: { pagamentosPendentes: number; pagamentosAtrasados: number; totalAReceber: number; totalRecebidoMes: number };
  ultimos: { pagamentos: Pagamento[]; clientes: Cliente[] };
}

// ============================================
// LOGIN COMPONENT
// ============================================
function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-muted-foreground hover:bg-card"
    >
      {theme === 'dark' ? (
        <>
          <Sun className="w-5 h-5" />
          <span>Tema Claro</span>
        </>
      ) : (
        <>
          <Moon className="w-5 h-5" />
          <span>Tema Escuro</span>
        </>
      )}
    </button>
  );
}

// Abrir link do WhatsApp de forma confiável em mobile/PWA
// (Função global no arquivo — usada tanto por LoginPage quanto por App)
const abrirWhatsAppLink = (url: string) => {
  // Em PWA/Capacitor, usar o plugin Browser
  try {
    if ((window as any).Capacitor?.isNativePlatform?.()) {
      (window as any).Capacitor?.Plugins?.Browser?.open({ url });
      return;
    }
  } catch {}
  // Fallback: usar anchor element (mais confiavel que location.href em mobile PWA)
  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 300);
  } catch {
    window.location.href = url;
  }
};

function LoginPage() {
  const [etapa, setEtapa] = useState<'empresa' | 'credenciais' | 'nova_empresa' | 'adicionar_empresa'>('empresa');
  const [deviceEmpresas, setDeviceEmpresas] = useState<Empresa[]>([]);
  const [empresaSelecionada, setEmpresaSelecionada] = useState<Empresa | null>(null);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSenha, setShowSenha] = useState(false);
  const [showNovaSenha, setShowNovaSenha] = useState(false);
  const [showBuscarSenha, setShowBuscarSenha] = useState(false);
  const [showFormSenha, setShowFormSenha] = useState(false);
  const [showMpToken, setShowMpToken] = useState(false);
  const [showMpKey, setShowMpKey] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  // Nova empresa form
  const [novaEmpresaNome, setNovaEmpresaNome] = useState('');
  const [novaEmpresaEmail, setNovaEmpresaEmail] = useState('');
  const [novaEmpresaSenha, setNovaEmpresaSenha] = useState('');
  const [novaEmpresaTelefone, setNovaEmpresaTelefone] = useState('');
  const [novaEmpresaLoading, setNovaEmpresaLoading] = useState(false);
  // Adicionar empresa
  const [buscarEmail, setBuscarEmail] = useState('');
  const [buscarSenha, setBuscarSenha] = useState('');
  const [buscarResultados, setBuscarResultados] = useState<Array<{ empresaId: string; empresaNome: string; empresaLogo?: string | null; nivelAcesso: string }>>([]);
  const [buscando, setBuscando] = useState(false);
  const [logandoBusca, setLogandoBusca] = useState(false);
  const login = useAuthStore((state) => state.login);





  // Helper: save company to localStorage
  const saveEmpresaToDevice = (empresa: Empresa) => {
    try {
      const stored = localStorage.getItem('cf-companies');
      let companies: Array<{ id: string; nome: string; cnpj?: string | null; logo?: string | null }> = stored ? JSON.parse(stored) : [];
      // Remove existing entry with same id
      companies = companies.filter(c => c.id !== empresa.id);
      // Add to top
      companies.unshift({
        id: empresa.id,
        nome: empresa.nome,
        cnpj: empresa.cnpj || null,
        logo: empresa.logo || null,
      });
      // Keep max 20
      companies = companies.slice(0, 20);
      localStorage.setItem('cf-companies', JSON.stringify(companies));
    } catch {}
  };

  useEffect(() => {
    // Capacitor: garantir que a splash screen suma (corrige toque bloqueado no WebView)
    const hideSplash = () => {
      try {
        const cap = (window as any).Capacitor;
        if (cap?.isNativePlatform?.()) {
          cap.Plugins?.SplashScreen?.hide?.();
        }
      } catch {}
    };
    hideSplash();
    // Tente novamente após 1s e 3s como fallback
    const t1 = setTimeout(hideSplash, 1000);
    const t2 = setTimeout(hideSplash, 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    // Load device empresas from localStorage (show immediately, then refresh from API)
    try {
      const stored = localStorage.getItem('cf-companies');
      const companies: Array<{ id: string; nome: string; cnpj?: string | null; logo?: string | null }> = stored ? JSON.parse(stored) : [];

      if (companies.length > 0) {
        // Show cached companies immediately for instant rendering
        setDeviceEmpresas(companies as unknown as Empresa[]);

        // Then refresh from API in background
        const ids = companies.map(c => c.id).join(',');
        fetch(`/api/empresas?ids=${ids}`)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          })
          .then((data) => {
            // Filter: only active and not blocked
            const fresh = (Array.isArray(data) ? data : []).filter(
              (e: any) => e.ativa && !e.bloqueada
            );
            if (fresh.length > 0) {
              setDeviceEmpresas(fresh);
            }
            // If API returns empty (all blocked/inactive), keep cached data
          })
          .catch((err) => {
            console.warn('[LoginPage] Falha ao buscar empresas da API, usando cache local:', err.message);
            // Keep cached companies on API failure - already set above
          });
      }
    } catch {}

    // Detectar se já está instalado como app
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(standalone);

    // Detectar capacidade de instalação PWA
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      if (!standalone) setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Verificar se é super admin
  const isSuperAdminLogin = email === SUPER_ADMIN_EMAIL;

  // Instalar PWA
  const handleInstallApp = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        setCanInstall(false);
        setInstallPrompt(null);
        toast.success('App instalado com sucesso!');
      }
    } else {
      // Fallback para iOS/Safari: mostrar modal com instruções
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      if (isIOS || isSafari) {
        setShowIOSModal(true);
      } else {
        toast.info('Use o menu do navegador e selecione "Instalar app" ou "Adicionar à tela inicial"', { duration: 5000 });
      }
    }
  };

  // Quando o email do super admin é digitado, pular para credenciais automaticamente
  useEffect(() => {
    if (isSuperAdminLogin && etapa === 'empresa') {
      setEtapa('credenciais');
    }
  }, [email, etapa]);

  const handleLogin = async () => {
    // Se for super admin, não precisa selecionar empresa
    if (isSuperAdminLogin) {
      if (!senha) {
        toast.error('Digite a senha');
        return;
      }
    } else {
      if (!empresaSelecionada || !email || !senha) {
        toast.error('Preencha todos os campos');
        return;
      }
    }

    // ⚠️ Kiosk Mode: chamar ANTES do fetch assíncrono para manter user gesture
    // requestFullscreen() em mobile requer gesture direto — se chamado após
    // await, perde o contexto e o navegador bloqueia silenciosamente.
    try {
      (window as any).__caixafacil_requestFullscreenOnLogin?.();
    } catch (e) {
      console.warn('[Login] Falha ao ativar fullscreen no clique:', e);
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          senha,
          empresaId: empresaSelecionada?.id,
        }),
      });

      const data = await res.json();


      if (!res.ok) {
        toast.error(data.error || 'Erro ao fazer login');
        return;
      }

      login(data.usuario, data.empresa, data.token, data.preferencias || null);
      // Save company to device
      if (data.empresa) {
        saveEmpresaToDevice(data.empresa);
      }
    } catch {
      toast.error('Erro ao conectar com o servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleRegistrarEmpresa = async () => {
    if (!novaEmpresaNome.trim()) {
      toast.error('Nome da empresa é obrigatório');
      return;
    }
    if (novaEmpresaSenha.length < 6) {
      toast.error('A senha deve ter no mínimo 6 caracteres');
      return;
    }

    setNovaEmpresaLoading(true);
    try {
      const res = await fetch('/api/empresas/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: novaEmpresaNome.trim(),
          email: novaEmpresaEmail.trim(),
          senha: novaEmpresaSenha,
          telefone: novaEmpresaTelefone.trim() || undefined,
        }),
      });

      const data = await res.json();


      if (!res.ok) {
        toast.error(data.error || 'Erro ao criar empresa');
        return;
      }

      saveEmpresaToDevice(data.empresa);
      toast.success('Empresa criada com sucesso! Bem-vindo ao CaixaFácil!');
    } catch {
      toast.error('Erro ao conectar com o servidor');
    } finally {
      setNovaEmpresaLoading(false);
    }
  };

  const handleBuscarEmpresa = async () => {
    if (!buscarEmail.trim()) {
      toast.error('Digite um email');
      return;
    }

    setBuscando(true);
    setBuscarResultados([]);
    try {
      const res = await fetch(`/api/empresas/por-email?email=${encodeURIComponent(buscarEmail.trim())}`);
      const data = await res.json();


      if (!res.ok) {
        toast.error(data.error || 'Erro ao buscar');
        return;
      }

      if (data.length === 0) {
        toast.info('Nenhuma empresa encontrada com esse email');
      }
      setBuscarResultados(data);
    } catch {
      toast.error('Erro ao conectar com o servidor');
    } finally {
      setBuscando(false);
    }
  };

  const handleSelecionarEmpresaBusca = async (resultado: { empresaId: string; empresaNome: string; empresaLogo?: string | null; nivelAcesso: string }) => {
    if (!buscarSenha) {
      toast.error('Digite sua senha');
      return;
    }

    setLogandoBusca(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: buscarEmail.trim(),
          senha: buscarSenha,
          empresaId: resultado.empresaId,
        }),
      });

      const data = await res.json();


      if (!res.ok) {
        toast.error(data.error || 'Credenciais inválidas');
        return;
      }

      login(data.usuario, data.empresa, data.token, data.preferencias || null);
      if (data.empresa) {
        saveEmpresaToDevice(data.empresa);
      }
    } catch {
      toast.error('Erro ao conectar com o servidor');
    } finally {
      setLogandoBusca(false);
    }
  };

  const resetFormStates = () => {
    setEmail('');
    setSenha('');
    setEmpresaSelecionada(null);
    setNovaEmpresaNome('');
    setNovaEmpresaEmail('');
    setNovaEmpresaSenha('');
    setNovaEmpresaTelefone('');
    setBuscarEmail('');
    setBuscarSenha('');
    setBuscarResultados([]);
  };

  return (
    <div className="pos-login-screen min-h-screen flex flex-col items-center justify-center bg-background p-4 relative">
      {/* Botão encerrar - topo direito */}
      <button
        onClick={() => {
          if (confirm('Deseja encerrar o aplicativo?')) {
            try { window.close(); } catch {}
            try { (window as any).history.back(); } catch {}
            setTimeout(() => {
              try { (window as any).location.replace('about:blank'); } catch {}
            }, 300);
          }
        }}
        className="pos-login-close absolute top-4 right-4 p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
        title="Encerrar"
      >
        <X className="w-6 h-6" />
      </button>

      <div className="pos-login-container w-full max-w-md">
        <div className="pos-login-header text-center mb-8">
          <img src="/icon-512.png" alt="CaixaFácil" className="w-32 h-32 rounded-3xl mb-3 shadow-lg mx-auto" />
          <img src="/logo-caixafacil.svg" alt="CaixaFácil" className="h-8 mx-auto" />
          <p className="text-muted-foreground mt-1 text-sm">Gestão de Máquinas</p>
          <p className="text-xs text-muted-foreground mt-2">{VERSION_DISPLAY}</p>
        </div>

        <Card className="border-0 shadow-2xl bg-card/80 backdrop-blur">
          <CardContent className="pt-6">
            {etapa === 'empresa' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Suas Empresas</Label>
                  {deviceEmpresas.length === 0 ? (
                    <div className="rounded-lg border border-border p-6 text-center">
                      <Building2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
                      <p className="font-semibold text-foreground">Bem-vindo ao CaixaFácil!</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Crie sua empresa ou adicione uma existente para começar.
                      </p>
                    </div>
                  ) : (
                    <ScrollArea className="h-64 rounded-lg border border-border">
                      <div className="p-2 space-y-1">
                        {deviceEmpresas.map((empresa) => (
                          <button
                            key={empresa.id}
                            onClick={() => {
                              setEmpresaSelecionada(empresa);
                              setEmail('');
                              setSenha('');
                              setEtapa('credenciais');
                            }}
                            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                          >
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold">
                              {empresa.logo ? (
                                <img src={empresa.logo} alt={empresa.nome} className="w-full h-full rounded-lg object-cover" />
                              ) : (
                                empresa.nome.charAt(0)
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-foreground truncate">{empresa.nome}</p>
                              {empresa.cnpj && (
                                <p className="text-xs text-muted-foreground">{empresa.cnpj}</p>
                              )}
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>

                {/* Ações principais */}
                <div className="space-y-2">
                  <Button
                    onClick={() => {
                      resetFormStates();
                      setEtapa('nova_empresa');
                    }}
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Nova Empresa
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      resetFormStates();
                      setEtapa('adicionar_empresa');
                    }}
                    className="w-full"
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    Adicionar Empresa Existente
                  </Button>
                </div>

                {/* Super Admin link (sutil) */}
                <div className="pt-2 border-t border-border">
                  <button
                    onClick={() => {
                      setEmpresaSelecionada(null);
                      setEmail('');
                      setSenha('');
                      setEtapa('credenciais');
                    }}
                    className="w-full text-center text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors py-1"
                  >
                    Acesso Administrativo
                  </button>
                </div>
              </div>
            ) : etapa === 'nova_empresa' ? (
              <div className="space-y-4">
                <button
                  onClick={() => {
                    setEtapa('empresa');
                    resetFormStates();
                  }}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-2"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                  <span className="text-sm">Voltar</span>
                </button>

                <div className="text-center mb-2">
                  <h2 className="text-lg font-semibold text-foreground">Criar Nova Empresa</h2>
                  <p className="text-sm text-muted-foreground">Preencha os dados abaixo para começar</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nova-nome" className="text-muted-foreground">Nome da Empresa</Label>
                  <Input
                    id="nova-nome"
                    value={novaEmpresaNome}
                    onChange={(e) => setNovaEmpresaNome(e.target.value)}
                    placeholder="Ex: Máquinas do João"
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nova-email" className="text-muted-foreground">Email do Administrador</Label>
                  <Input
                    id="nova-email"
                    type="email"
                    value={novaEmpresaEmail}
                    onChange={(e) => setNovaEmpresaEmail(e.target.value)}
                    placeholder="admin@empresa.com"
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nova-senha" className="text-muted-foreground">Senha</Label>
                  <div className="relative">
                    <Input
                      id="nova-senha"
                      type={showNovaSenha ? 'text' : 'password'}
                      value={novaEmpresaSenha}
                      onChange={(e) => setNovaEmpresaSenha(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10"
                    />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5" onClick={() => setShowNovaSenha(!showNovaSenha)}>
                      {showNovaSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nova-telefone" className="text-muted-foreground">Telefone <span className="text-muted-foreground/50">(opcional)</span></Label>
                  <Input
                    id="nova-telefone"
                    value={novaEmpresaTelefone}
                    onChange={(e) => setNovaEmpresaTelefone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                <Button
                  onClick={handleRegistrarEmpresa}
                  disabled={novaEmpresaLoading}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
                >
                  {novaEmpresaLoading ? 'Criando...' : 'Criar e Entrar'}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  7 dias de teste grátis. Sem compromisso.
                </p>
              </div>
            ) : etapa === 'adicionar_empresa' ? (
              <div className="space-y-4">
                <button
                  onClick={() => {
                    setEtapa('empresa');
                    resetFormStates();
                  }}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-2"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                  <span className="text-sm">Voltar</span>
                </button>

                <div className="text-center mb-2">
                  <h2 className="text-lg font-semibold text-foreground">Adicionar Empresa</h2>
                  <p className="text-sm text-muted-foreground">Digite seus dados de acesso para encontrar sua empresa</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="buscar-email" className="text-muted-foreground">Email</Label>
                  <Input
                    id="buscar-email"
                    type="email"
                    value={buscarEmail}
                    onChange={(e) => setBuscarEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleBuscarEmpresa(); }}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="buscar-senha" className="text-muted-foreground">Senha</Label>
                  <div className="relative">
                    <Input
                      id="buscar-senha"
                      type={showBuscarSenha ? 'text' : 'password'}
                      value={buscarSenha}
                      onChange={(e) => setBuscarSenha(e.target.value)}
                      placeholder="Sua senha"
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleBuscarEmpresa(); }}
                    />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5" onClick={() => setShowBuscarSenha(!showBuscarSenha)}>
                      {showBuscarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  onClick={handleBuscarEmpresa}
                  disabled={buscando}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
                >
                  {buscando ? 'Buscando...' : 'Buscar Empresa'}
                </Button>

                {buscarResultados.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <Label className="text-muted-foreground text-sm">Clique na empresa para entrar</Label>
                    <ScrollArea className="max-h-48 rounded-lg border border-border">
                      <div className="p-2 space-y-1">
                        {buscarResultados.map((r) => (
                          <button
                            key={r.empresaId}
                            onClick={() => handleSelecionarEmpresaBusca(r)}
                            disabled={logandoBusca}
                            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
                          >
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold">
                              {r.empresaLogo ? (
                                <img src={r.empresaLogo} alt={r.empresaNome} className="w-full h-full rounded-lg object-cover" />
                              ) : (
                                r.empresaNome.charAt(0)
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-foreground truncate">{r.empresaNome}</p>
                              <p className="text-xs text-muted-foreground">{r.nivelAcesso}</p>
                            </div>
                            {logandoBusca ? (
                              <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={() => {
                    setEtapa('empresa');
                    setEmpresaSelecionada(null);
                    setEmail('');
                    setSenha('');
                  }}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                  <span className="text-sm">Voltar</span>
                </button>

                {/* Card diferente para Super Admin */}
                {isSuperAdminLogin ? (
                  <div className="bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/30 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white">
                        <ShieldAlert className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-medium text-amber-400">Super Administrador</p>
                        <p className="text-xs text-muted-foreground">Acesso global a todas as empresas</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold">
                      {empresaSelecionada?.nome.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{empresaSelecionada?.nome}</p>
                      <p className="text-xs text-muted-foreground">Empresa selecionada</p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-muted-foreground">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="senha" className="text-muted-foreground">Senha</Label>
                  <div className="relative">
                    <Input
                      id="senha"
                      type={showSenha ? 'text' : 'password'}
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="••••••••"
                      className="bg-muted border-border text-foreground placeholder:text-muted-foreground pr-10"
                    />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5" onClick={() => setShowSenha(!showSenha)}>
                      {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  onClick={handleLogin}
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
                >
                  {loading ? 'Entrando...' : 'Entrar'}
                </Button>

                <div className="text-center mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground">{VERSION_WITH_DATE}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Botão Instalar App - sempre visível se não for standalone */}
        {!isStandalone && (
          <button
            onClick={handleInstallApp}
            className={`w-full mt-4 flex items-center justify-center gap-2 p-3 rounded-xl transition-all group ${
              canInstall
                ? 'bg-gradient-to-r from-[#00d4aa] to-[#00b894] hover:from-[#00c49a] hover:to-[#00a888] shadow-lg shadow-[#00d4aa]/20'
                : 'bg-gradient-to-r from-[#1e3a5f] to-[#0f172a] border border-[#00d4aa]/30 hover:border-[#00d4aa]/60'
            }`}
          >
            <Download className={`w-5 h-5 group-hover:scale-110 transition-transform ${canInstall ? 'text-[#0f172a]' : 'text-[#00d4aa]'}`} />
            <span className={`text-sm ${canInstall ? 'font-bold text-[#0f172a]' : 'font-medium text-[#00d4aa]'}`}>
              Instalar como App
            </span>
          </button>
        )}

        {/* Botão Convide pelo WhatsApp */}
        <button
          onClick={async () => {
            const appUrl = 'https://caixafaciloficial.web.app';
            const shareText = 'Confira o CaixaFacil - Sistema de gestao de maquinas de entretenimento! ' + appUrl;
            if (navigator.share) {
              try {
                await navigator.share({ title: 'CaixaFacil', text: shareText, url: appUrl });
                return;
              } catch (e: unknown) {
                if (e instanceof Error && e.name === 'AbortError') return;
              }
            }
            const text = encodeURIComponent(shareText);
            abrirWhatsAppLink(`https://wa.me/?text=${text}`);
          }}
          className="w-full mt-3 flex items-center justify-center gap-2 p-3 rounded-xl transition-all group bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 shadow-lg shadow-green-600/20"
        >
          <svg className="w-5 h-5 group-hover:scale-110 transition-transform text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          <span className="text-sm font-bold text-white">Convide pelo WhatsApp</span>
        </button>

        {/* Modal de instruções iOS */}
        {showIOSModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setShowIOSModal(false)}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            
            {/* Modal */}
            <div className="relative bg-[#1c1c1e] rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl border border-[#00d4aa]/20" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="bg-gradient-to-r from-[#1e3a5f] to-[#0f172a] px-5 py-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#00d4aa]/20 flex items-center justify-center">
                  <Download className="w-5 h-5 text-[#00d4aa]" />
                </div>
                <div>
                  <p className="text-base font-bold text-white">Instalar no iPhone/iPad</p>
                  <p className="text-xs text-gray-400">Siga os 2 passos abaixo</p>
                </div>
                <button onClick={() => setShowIOSModal(false)} className="ml-auto text-gray-400 hover:text-white p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="px-5 py-5 space-y-5">
                {/* Step 1 */}
                <div className="flex flex-col items-center text-center">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-7 h-7 rounded-full bg-[#00d4aa] text-[#0f172a] flex items-center justify-center text-sm font-bold">1</span>
                    <span className="text-sm font-semibold text-white">Toque no botão Compartilhar</span>
                  </div>
                  <img 
                    src="/ios-step1.png" 
                    alt="Passo 1: Botão compartilhar" 
                    className="w-56 h-56 rounded-xl"
                  />
                  <p className="text-xs text-gray-400 mt-2">Ícone quadrado com seta para cima</p>
                </div>

                {/* Separator */}
                <div className="flex items-center gap-2 px-4">
                  <div className="flex-1 h-px bg-gray-700" />
                  <ChevronDown className="w-4 h-4 text-[#00d4aa]" />
                  <div className="flex-1 h-px bg-gray-700" />
                </div>

                {/* Step 2 */}
                <div className="flex flex-col items-center text-center">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-7 h-7 rounded-full bg-[#00d4aa] text-[#0f172a] flex items-center justify-center text-sm font-bold">2</span>
                    <span className="text-sm font-semibold text-white">Adicionar à Tela Início</span>
                  </div>
                  <img 
                    src="/ios-step2.png" 
                    alt="Passo 2: Adicionar à tela inicial" 
                    className="w-56 h-56 rounded-xl"
                  />
                  <p className="text-xs text-gray-400 mt-2">Deslize e toque nesta opção</p>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 pb-5">
                <button
                  onClick={() => setShowIOSModal(false)}
                  className="w-full py-3 rounded-xl bg-[#00d4aa] hover:bg-[#00b894] text-[#0f172a] font-bold text-sm transition-colors"
                >
                  Entendi
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// DASHBOARD COMPONENT
// ============================================
function DashboardPage({ data, onNavigate }: { data: DashboardData | null; onNavigate: (tab: string) => void }) {
  if (!data?.clientes || !data?.maquinas || !data?.financeiro) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const stats = [
    {
      title: 'Clientes Ativos',
      value: data.clientes.ativos,
      total: data.clientes.total,
      icon: Users,
      color: 'from-emerald-500 to-teal-600',
    },
    {
      title: 'Máquinas Ativas',
      value: data.maquinas.ativas,
      total: data.maquinas.total,
      icon: Cog,
      color: 'from-blue-500 to-indigo-600',
    },
    {
      title: 'A Receber',
      value: formatCurrency(data.financeiro.totalAReceber),
      subtitle: `${data.financeiro.pagamentosPendentes} pendentes`,
      icon: DollarSign,
      color: 'from-amber-500 to-orange-600',
    },
    {
      title: 'Recebido (Mês)',
      value: formatCurrency(data.financeiro.totalRecebidoMes),
      subtitle: 'Este mês',
      icon: TrendingUp,
      color: 'from-green-500 to-emerald-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat, i) => (
          <Card key={i} className="border-0 shadow-lg bg-card">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{stat.title}</p>
                  <p className="text-xl font-bold text-foreground mt-1">{stat.value}</p>
                  {stat.total && (
                    <p className="text-xs text-muted-foreground mt-1">de {stat.total} total</p>
                  )}
                  {stat.subtitle && (
                    <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
                  )}
                </div>
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                  <stat.icon className="w-5 h-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alerts */}
      {(data.clientes.bloqueados > 0 || data.financeiro.pagamentosAtrasados > 0 || data.maquinas.manutencao > 0) && (
        <Card className="border-0 shadow-lg bg-destructive/10 border-destructive/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold text-foreground">Alertas</h3>
            </div>
            <div className="space-y-2">
              {data.clientes.bloqueados > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Clientes bloqueados</span>
                  <Badge variant="destructive">{data.clientes.bloqueados}</Badge>
                </div>
              )}
              {data.financeiro.pagamentosAtrasados > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Pagamentos em atraso</span>
                  <Badge variant="destructive">{data.financeiro.pagamentosAtrasados}</Badge>
                </div>
              )}
              {data.maquinas.manutencao > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Máquinas em manutenção</span>
                  <Badge variant="secondary">{data.maquinas.manutencao}</Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Máquinas por Tipo */}
      <Card className="border-0 shadow-lg bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-foreground">Máquinas por Tipo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {data.maquinas.porTipo.map((item, idx) => {
              const colors = [
                'from-purple-500 to-pink-600',
                'from-green-500 to-emerald-600',
                'from-amber-500 to-orange-600',
                'from-blue-500 to-indigo-600',
                'from-slate-500 to-slate-600',
              ];

              return (
                <div key={item.tipo} className="text-center">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colors[idx % colors.length]} flex items-center justify-center mx-auto mb-1`}>
                    <Cog className="w-6 h-6 text-white" />
                  </div>
                  <p className="text-lg font-bold text-foreground">{item._count}</p>
                  <p className="text-xs text-muted-foreground">{item.tipo}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Últimos Clientes */}
      <Card className="border-0 shadow-lg bg-card">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base text-foreground">Últimos Clientes</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('clientes')} className="text-amber-500">
            Ver todos
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.ultimos.clientes.slice(0, 3).map((cliente) => (
            <div key={cliente.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-gradient-to-br from-amber-500 to-orange-600 text-white text-xs">
                  {cliente.nome.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{cliente.nome}</p>
                <p className="text-xs text-muted-foreground">{cliente.telefone || 'Sem telefone'}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// CLIENTES COMPONENT
// ============================================
function ClientesPage({ empresaId, isAdmin, isSupervisor }: { empresaId: string; isAdmin: boolean; isSupervisor: boolean }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [clienteEditando, setClienteEditando] = useState<Cliente | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    cpfCnpj: '',
    email: '',
    telefone: '',
    telefone2: '',
    endereco: '',
    cidade: '',
    estado: '',
    cep: '',
    observacoes: '',
    whatsapp: '',
    telegramGroupId: '',
    acertoPercentual: '50',
    formaCobranca: '' as string,
  });

  useEffect(() => {
    loadClientes();
  }, [empresaId]);

  const loadClientes = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clientes?empresaId=${empresaId}`);
      const data = await res.json();

      setClientes(data);
    } catch (error) {
      toast.error('Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.nome || formData.nome.trim() === '') {
      toast.error('Nome é obrigatório');
      return;
    }

    setSaving(true);
    try {
      if (clienteEditando) {
        const res = await fetch(`/api/clientes/${clienteEditando.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, acertoPercentual: formData.acertoPercentual !== '' ? parseInt(formData.acertoPercentual) : 50 }),
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Erro ao atualizar');
        }
        toast.success('Cliente atualizado com sucesso!');
      } else {
        const res = await fetch('/api/clientes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, acertoPercentual: formData.acertoPercentual !== '' ? parseInt(formData.acertoPercentual) : 50, empresaId }),
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Erro ao cadastrar');
        }
        toast.success('Cliente cadastrado com sucesso!');
      }
      setDialogOpen(false);
      loadClientes();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar cliente';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleBloquear = async (cliente: Cliente, bloquear: boolean) => {
    try {
      const motivo = bloquear ? prompt('Motivo do bloqueio:') : undefined;
      if (bloquear && !motivo) return;

      await fetch(`/api/clientes/${cliente.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bloqueado: bloquear, motivoBloqueio: motivo }),
      });
      toast.success(bloquear ? 'Cliente bloqueado' : 'Cliente desbloqueado');
      loadClientes();
    } catch {
      toast.error('Erro ao atualizar cliente');
    }
  };

  const handleExcluir = async (cliente: Cliente) => {
    if (!confirm(`Deseja excluir o cliente "${cliente.nome}"?`)) return;

    try {
      await fetch(`/api/clientes/${cliente.id}`, { method: 'DELETE' });
      toast.success('Cliente excluído');
      loadClientes();
    } catch {
      toast.error('Erro ao excluir cliente');
    }
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      cpfCnpj: '',
      email: '',
      telefone: '',
      telefone2: '',
      endereco: '',
      cidade: '',
      estado: '',
      cep: '',
      observacoes: '',
      whatsapp: '',
      telegramGroupId: '',
      acertoPercentual: '50',
      formaCobranca: '',
    });
    setClienteEditando(null);
  };

  const openEditDialog = (cliente: Cliente) => {
    setClienteEditando(cliente);
    setFormData({
      nome: cliente.nome,
      cpfCnpj: cliente.cpfCnpj || '',
      email: cliente.email || '',
      telefone: cliente.telefone || '',
      telefone2: cliente.telefone2 || '',
      endereco: cliente.endereco || '',
      cidade: cliente.cidade || '',
      estado: cliente.estado || '',
      cep: cliente.cep || '',
      observacoes: cliente.observacoes || '',
      whatsapp: cliente.whatsapp || '',
      telegramGroupId: (cliente as any).telegramGroupId || '',
      acertoPercentual: String(cliente.acertoPercentual ?? 50),
      formaCobranca: cliente.formaCobranca || '',
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Clientes</h2>
        {isSupervisor && (
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (open) resetForm(); setDialogOpen(open); if (!open) setTimeout(resetForm, 300); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-gradient-to-r from-amber-500 to-orange-600">
                <Plus className="w-4 h-4 mr-1" /> Novo
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border text-foreground max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{clienteEditando ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    className="bg-muted border-border"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>CPF/CNPJ</Label>
                    <Input
                      value={formData.cpfCnpj}
                      onChange={(e) => setFormData({ ...formData, cpfCnpj: e.target.value })}
                      className="bg-muted border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="bg-muted border-border"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input
                      value={formData.telefone}
                      onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                      className="bg-muted border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone 2</Label>
                    <Input
                      value={formData.telefone2}
                      onChange={(e) => setFormData({ ...formData, telefone2: e.target.value })}
                      className="bg-muted border-border"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Endereço</Label>
                  <Input
                    value={formData.endereco}
                    onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                    className="bg-muted border-border"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Cidade</Label>
                    <Input
                      value={formData.cidade}
                      onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                      className="bg-muted border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <Input
                      value={formData.estado}
                      onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                      className="bg-muted border-border"
                      maxLength={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CEP</Label>
                    <Input
                      value={formData.cep}
                      onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                      className="bg-muted border-border"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea
                    value={formData.observacoes}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                    className="bg-muted border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Grupo Telegram</Label>
                  <Input
                    value={formData.telegramGroupId || ''}
                    onChange={(e) => setFormData({ ...formData, telegramGroupId: e.target.value })}
                    className="bg-muted border-border"
                    placeholder="-1001234567890"
                  />
                  <p className="text-xs text-muted-foreground">ID do grupo Telegram para envio silencioso de fotos e extrato</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Acerto %</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.acertoPercentual}
                      onChange={(e) => setFormData({ ...formData, acertoPercentual: e.target.value })}
                      className="bg-muted border-border"
                      placeholder="50"
                    />
                    <p className="text-xs text-muted-foreground">Percentual do cliente no jogado (padrão 50%)</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Forma de Cobrança</Label>
                    <select
                      value={formData.formaCobranca}
                      onChange={(e) => setFormData({ ...formData, formaCobranca: e.target.value })}
                      className="w-full h-9 rounded-md border border-border bg-muted px-3 py-1 text-sm text-foreground"
                    >
                      <option value="">Nenhum</option>
                      <option value="COBRANCA">Cobrança</option>
                      <option value="LEITURA">Leitura</option>
                    </select>
                    <p className="text-xs text-muted-foreground">Define o modo padrão ao selecionar este cliente</p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
                <Button type="button" onClick={handleSave} className="bg-gradient-to-r from-amber-500 to-orange-600" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : clientes.length === 0 ? (
        <Card className="border-0 shadow-lg bg-card">
          <CardContent className="py-8 text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum cliente cadastrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {clientes.map((cliente) => (
            <Card key={cliente.id} className={`border-0 shadow-lg ${cliente.bloqueado ? 'bg-destructive/10 border-destructive/30' : 'bg-card'}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                      {cliente.nome.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground truncate">{cliente.nome}</p>
                      {cliente.bloqueado && (
                        <Badge variant="destructive" className="text-xs">Bloqueado</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{cliente.telefone || 'Sem telefone'}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{cliente._count?.maquinas || 0} máquinas</span>
                    </div>
                  </div>
                  {isSupervisor && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => openEditDialog(cliente)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {cliente.bloqueado ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-green-400 hover:text-green-300"
                          onClick={() => handleBloquear(cliente, false)}
                        >
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-400 hover:text-red-300"
                          onClick={() => handleBloquear(cliente, true)}
                        >
                          <Ban className="w-4 h-4" />
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-red-400"
                          onClick={() => handleExcluir(cliente)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// MÁQUINAS COMPONENT
// ============================================
function MaquinasPage({ empresaId, isAdmin }: { empresaId: string; isAdmin: boolean }) {
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tipos, setTipos] = useState<TipoMaquina[]>([]);
  const [filtroClienteId, setFiltroClienteId] = useState<string>('todos');
  const [filtroTipoId, setFiltroTipoId] = useState<string>('todos');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [maquinaEditando, setMaquinaEditando] = useState<Maquina | null>(null);
  const [formData, setFormData] = useState({
    codigo: '',
    tipoId: '',
    descricao: '',
    marca: '',
    modelo: '',
    numeroSerie: '',
    valorMensal: '',
    localizacao: '',
    status: 'ATIVA' as Maquina['status'],
    observacoes: '',
    moeda: 'M001' as Maquina['moeda'],
    entradaAtual: '0',
    saidaAtual: '0',
    clienteId: '',
  });

  useEffect(() => {
    loadMaquinas();
    loadClientes();
    loadTipos();
  }, [empresaId]);

  const loadMaquinas = async () => {
    setLoading(true);
    try {
      let url = `/api/maquinas?empresaId=${empresaId}`;
      if (filtroClienteId !== 'todos') url += `&clienteId=${filtroClienteId}`;
      if (filtroTipoId !== 'todos') url += `&tipoId=${filtroTipoId}`;
      if (filtroStatus !== 'todos') url += `&status=${filtroStatus}`;
      const res = await fetch(url);
      const data = await res.json();

      setMaquinas(data);
    } catch (error) {
      toast.error('Erro ao carregar máquinas');
    } finally {
      setLoading(false);
    }
  };

  const loadClientes = async () => {
    try {
      const res = await fetch(`/api/clientes?empresaId=${empresaId}`);
      const data = await res.json();

      setClientes(data);
    } catch (error) {
      console.error('Erro ao carregar clientes');
    }
  };

  const loadTipos = async () => {
    try {
      const res = await fetch(`/api/tipos-maquina?empresaId=${empresaId}&ativo=true`);
      const data = await res.json();

      setTipos(data);
    } catch (error) {
      console.error('Erro ao carregar tipos');
    }
  };

  useEffect(() => {
    loadMaquinas();
  }, [filtroClienteId, filtroTipoId, filtroStatus]);

  const handleSave = async () => {
    if (!formData.codigo || !formData.tipoId || !formData.clienteId) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    try {
      const dataToSend = {
        ...formData,
        valorMensal: formData.valorMensal ? parseFloat(formData.valorMensal) : undefined,
        entradaAtual: formData.entradaAtual ? parseFloat(formData.entradaAtual) : 0,
        saidaAtual: formData.saidaAtual ? parseFloat(formData.saidaAtual) : 0,
      };

      if (maquinaEditando) {
        const res = await fetch(`/api/maquinas/${maquinaEditando.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSend),
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Erro ao atualizar');
        }
        toast.success('Máquina atualizada!');
      } else {
        const res = await fetch('/api/maquinas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSend),
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Erro ao salvar');
        }
        toast.success('Máquina cadastrada!');
      }
      setDialogOpen(false);
      resetForm();
      loadMaquinas();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar máquina';
      toast.error(message);
    }
  };

  const handleExcluir = async (maquina: Maquina) => {
    if (!confirm(`Deseja excluir a máquina "${maquina.codigo}"?`)) return;

    try {
      await fetch(`/api/maquinas/${maquina.id}`, { method: 'DELETE' });
      toast.success('Máquina excluída');
      loadMaquinas();
    } catch {
      toast.error('Erro ao excluir máquina');
    }
  };

  const resetForm = () => {
    setFormData({
      codigo: '',
      tipoId: '',
      descricao: '',
      marca: '',
      modelo: '',
      numeroSerie: '',
      valorMensal: '',
      localizacao: '',
      status: 'ATIVA',
      observacoes: '',
      moeda: 'M001',
      entradaAtual: '0',
      saidaAtual: '0',
      clienteId: '',
    });
    setMaquinaEditando(null);
  };

  const openEditDialog = (maquina: Maquina) => {
    setMaquinaEditando(maquina);
    setFormData({
      codigo: maquina.codigo,
      tipoId: maquina.tipoId,
      descricao: maquina.descricao || '',
      marca: maquina.marca || '',
      modelo: maquina.modelo || '',
      numeroSerie: maquina.numeroSerie || '',
      valorMensal: maquina.valorMensal?.toString() || '',
      localizacao: maquina.localizacao || '',
      status: maquina.status,
      observacoes: maquina.observacoes || '',
      moeda: maquina.moeda || 'M001',
      entradaAtual: maquina.entradaAtual?.toString() || '0',
      saidaAtual: maquina.saidaAtual?.toString() || '0',
      clienteId: maquina.clienteId,
    });
    setDialogOpen(true);
  };

  const getTipoDescricao = (tipoId: string) => {
    const tipo = tipos.find((t) => t.id === tipoId);
    return tipo?.descricao || 'Desconhecido';
  };

  const getTipoNome = (maquina: Maquina) => {
    return maquina.tipo?.descricao || tipos.find(t => t.id === maquina.tipoId)?.descricao || 'Tipo';
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      ATIVA: 'default',
      INATIVA: 'secondary',
      MANUTENCAO: 'outline',
      VENDIDA: 'destructive',
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Máquinas</h2>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-gradient-to-r from-amber-500 to-orange-600">
                <Plus className="w-4 h-4 mr-1" /> Nova
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border text-foreground max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{maquinaEditando ? 'Editar Máquina' : 'Nova Máquina'}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Código *</Label>
                    <Input
                      value={formData.codigo}
                      onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                      className="bg-muted border-border"
                      placeholder="MUS-001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo *</Label>
                    <Select value={formData.tipoId} onValueChange={(v) => setFormData({ ...formData, tipoId: v })}>
                      <SelectTrigger className="bg-muted border-border">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {tipos.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.descricao}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cliente *</Label>
                  <Select value={formData.clienteId} onValueChange={(v) => setFormData({ ...formData, clienteId: v })}>
                    <SelectTrigger className="bg-muted border-border">
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Marca</Label>
                    <Input
                      value={formData.marca}
                      onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                      className="bg-muted border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Modelo</Label>
                    <Input
                      value={formData.modelo}
                      onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                      className="bg-muted border-border"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Valor Mensal</Label>
                    <Input
                      type="number"
                      value={formData.valorMensal}
                      onChange={(e) => setFormData({ ...formData, valorMensal: e.target.value })}
                      className="bg-muted border-border"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as Maquina['status'] })}>
                      <SelectTrigger className="bg-muted border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ATIVA">Ativa</SelectItem>
                        <SelectItem value="INATIVA">Inativa</SelectItem>
                        <SelectItem value="MANUTENCAO">Manutenção</SelectItem>
                        <SelectItem value="VENDIDA">Vendida</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Localização</Label>
                  <Input
                    value={formData.localizacao}
                    onChange={(e) => setFormData({ ...formData, localizacao: e.target.value })}
                    className="bg-muted border-border"
                  />
                </div>
                {/* Controle de Moedas */}
                <div className="border-t border-border pt-4 mt-2">
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">Controle de Moedas</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Moeda</Label>
                      <Select value={formData.moeda} onValueChange={(v) => setFormData({ ...formData, moeda: v as Maquina['moeda'] })}>
                        <SelectTrigger className="bg-muted border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="M001">R$ 0,01</SelectItem>
                          <SelectItem value="M005">R$ 0,05</SelectItem>
                          <SelectItem value="M010">R$ 0,10</SelectItem>
                          <SelectItem value="M025">R$ 0,25</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Entrada</Label>
                      <Input
                        type="number"
                        value={formData.entradaAtual}
                        onChange={(e) => setFormData({ ...formData, entradaAtual: e.target.value })}
                        className="bg-muted border-border"
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Saída</Label>
                      <Input
                        type="number"
                        value={formData.saidaAtual}
                        onChange={(e) => setFormData({ ...formData, saidaAtual: e.target.value })}
                        className="bg-muted border-border"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea
                    value={formData.observacoes}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                    className="bg-muted border-border"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleSave} className="bg-gradient-to-r from-amber-500 to-orange-600">
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        <Select value={filtroClienteId} onValueChange={setFiltroClienteId}>
          <SelectTrigger className="w-44 bg-card border-border">
            <SelectValue placeholder="Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Clientes</SelectItem>
            {clientes.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroTipoId} onValueChange={setFiltroTipoId}>
          <SelectTrigger className="w-40 bg-card border-border">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Tipos</SelectItem>
            {tipos.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.descricao}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-32 bg-card border-border">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ATIVA">Ativa</SelectItem>
            <SelectItem value="INATIVA">Inativa</SelectItem>
            <SelectItem value="MANUTENCAO">Manutenção</SelectItem>
            <SelectItem value="VENDIDA">Vendida</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : maquinas.length === 0 ? (
        <Card className="border-0 shadow-lg bg-card">
          <CardContent className="py-8 text-center text-muted-foreground">
            <Cog className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhuma máquina cadastrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {maquinas.map((maquina) => {
            const getMoedaLabel = (moeda: string) => {
              const labels: Record<string, string> = {
                M001: 'R$ 0,01',
                M005: 'R$ 0,05',
                M010: 'R$ 0,10',
                M025: 'R$ 0,25',
              };
              return labels[moeda] || moeda;
            };
            return (
              <Card key={maquina.id} className={`border-0 shadow-lg ${maquina.status === 'MANUTENCAO' ? 'bg-amber-900/20' : maquina.status === 'INATIVA' ? 'bg-accent/50' : 'bg-card'}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                      <Cog className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground truncate">{maquina.codigo}</p>
                        {getStatusBadge(maquina.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">{maquina.tipo?.descricao || 'Tipo não definido'}</p>
                      <p className="text-xs text-muted-foreground mt-1">{maquina.cliente?.nome || 'Sem cliente'}</p>
                      {maquina.valorMensal && (
                        <p className="text-xs text-emerald-400 mt-1">
                          R$ {maquina.valorMensal.toFixed(2)}/mês
                        </p>
                      )}
                      {/* Controle de Moedas */}
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          Moeda: {getMoedaLabel(maquina.moeda)}
                        </span>
                        <span className="text-green-400">
                          Entrada: {Math.round(maquina.entradaAtual || 0)}
                        </span>
                        <span className="text-red-400">
                          Saída: {Math.round(maquina.saidaAtual || 0)}
                        </span>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => openEditDialog(maquina)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-red-400"
                          onClick={() => handleExcluir(maquina)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================
// USUÁRIOS COMPONENT
// ============================================
function UsuariosPage({ empresaId, isAdmin, onOpenPreferencias }: { empresaId: string; isAdmin: boolean; onOpenPreferencias: (userId: string, userName: string) => void }) {
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<UsuarioSistema | null>(null);
  const [showFormSenha, setShowFormSenha] = useState(false);
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    senha: '',
    telefone: '',
    nivelAcesso: 'OPERADOR' as NivelAcesso,
    ativo: true,
  });

  useEffect(() => {
    loadUsuarios();
  }, [empresaId]);

  const loadUsuarios = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/usuarios?empresaId=${empresaId}`);
      const data = await res.json();

      setUsuarios(data);
    } catch (error) {
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.nome || !formData.email || (!usuarioEditando && !formData.senha)) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    try {
      if (usuarioEditando) {
        const dataToSend = { ...formData };
        if (!dataToSend.senha) delete (dataToSend as Record<string, unknown>).senha;
        
        const res = await fetch(`/api/usuarios/${usuarioEditando.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToSend),
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Erro ao atualizar usuário');
        toast.success('Usuário atualizado!');
      } else {
        const res = await fetch('/api/usuarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, empresaId }),
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar usuário');
        toast.success('Usuário cadastrado!');
      }
      setDialogOpen(false);
      resetForm();
      loadUsuarios();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar usuário';
      toast.error(message);
    }
  };

  const handleExcluir = async (usuario: UsuarioSistema) => {
    if (!confirm(`Deseja excluir o usuário "${usuario.nome}"?`)) return;

    try {
      await fetch(`/api/usuarios/${usuario.id}`, { method: 'DELETE' });
      toast.success('Usuário excluído');
      loadUsuarios();
    } catch {
      toast.error('Erro ao excluir usuário');
    }
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      email: '',
      senha: '',
      telefone: '',
      nivelAcesso: 'OPERADOR',
      ativo: true,
    });
    setUsuarioEditando(null);
  };

  const openEditDialog = (usuario: UsuarioSistema) => {
    setUsuarioEditando(usuario);
    setFormData({
      nome: usuario.nome,
      email: usuario.email,
      senha: '',
      telefone: usuario.telefone || '',
      nivelAcesso: usuario.nivelAcesso,
      ativo: usuario.ativo,
    });
    setDialogOpen(true);
  };

  const getNivelBadge = (nivel: NivelAcesso) => {
    const colors: Record<string, string> = {
      ADMINISTRADOR: 'bg-red-500/20 text-red-400 border-red-500/50',
      SUPERVISOR: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
      OPERADOR: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    };
    return (
      <Badge variant="outline" className={colors[nivel]}>
        {nivel}
      </Badge>
    );
  };

  if (!isAdmin) {
    return (
      <Card className="border-0 shadow-lg bg-card">
        <CardContent className="py-8 text-center text-muted-foreground">
          <Settings className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Acesso restrito a administradores</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Usuários</h2>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-gradient-to-r from-amber-500 to-orange-600">
              <Plus className="w-4 h-4 mr-1" /> Novo
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border text-foreground">
            <DialogHeader>
              <DialogTitle>{usuarioEditando ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  className="bg-muted border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="bg-muted border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>{usuarioEditando ? 'Nova Senha (deixe vazio para manter)' : 'Senha *'}</Label>
                <div className="relative">
                  <Input
                    type={showFormSenha ? 'text' : 'password'}
                    value={formData.senha}
                    onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
                    className="bg-muted border-border pr-10"
                  />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5" onClick={() => setShowFormSenha(!showFormSenha)}>
                    {showFormSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input
                    value={formData.telefone}
                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                    className="bg-muted border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nível de Acesso</Label>
                  <Select value={formData.nivelAcesso} onValueChange={(v) => setFormData({ ...formData, nivelAcesso: v as NivelAcesso })}>
                    <SelectTrigger className="bg-muted border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMINISTRADOR">Administrador</SelectItem>
                      <SelectItem value="SUPERVISOR">Supervisor</SelectItem>
                      <SelectItem value="OPERADOR">Operador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Usuário Ativo</Label>
                <Switch
                  checked={formData.ativo}
                  onCheckedChange={(v) => setFormData({ ...formData, ativo: v })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} className="bg-gradient-to-r from-amber-500 to-orange-600">
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : usuarios.length === 0 ? (
        <Card className="border-0 shadow-lg bg-card">
          <CardContent className="py-8 text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum usuário cadastrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {usuarios.map((usuario) => (
            <Card key={usuario.id} className={`border-0 shadow-lg ${!usuario.ativo ? 'bg-accent/50' : 'bg-card'}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                      {usuario.nome.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground truncate">{usuario.nome}</p>
                      {!usuario.ativo && (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{usuario.email}</p>
                    <div className="mt-1">{getNivelBadge(usuario.nivelAcesso)}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-amber-400"
                      onClick={() => onOpenPreferencias(usuario.id, usuario.nome)}
                      title="Preferências do Usuário"
                    >
                      <SlidersHorizontal className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => openEditDialog(usuario)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-400"
                      onClick={() => handleExcluir(usuario)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// LEITURAS COMPONENT
// ============================================
interface MaquinaLeitura extends Maquina {
  novaEntrada: string;
  novaSaida: string;
  diferencaEntrada: number;
  diferencaSaida: number;
  saldoMaquina: number;
  fotoProcessada: string | null;
}

// ============================================
// RECEBER COMPONENT — Recebimento Avulso
// ============================================
function ReceberPage({ empresaId }: { empresaId: string }) {
  const { empresa } = useAuthStore();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [formaPagamento, setFormaPagamento] = useState<'DINHEIRO' | 'PIX_BANCO' | 'MERCADO_PAGO' | null>(null);
  const [saving, setSaving] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [ultimoRecebimento, setUltimoRecebimento] = useState<{ id: string; valor: number; descricao: string } | null>(null);

  // PIX Banco (QR Code) state
  const [pixQrDataUrl, setPixQrDataUrl] = useState<string | null>(null);
  const [pixCopiado, setPixCopiado] = useState(false);
  const [pixPayload, setPixPayload] = useState('');

  // Mercado Pago state
  const [mpPixData, setMpPixData] = useState<{ qrCodeBase64: string; paymentId: string; status: string } | null>(null);
  const [mpPixLoading, setMpPixLoading] = useState(false);
  const mpPixPollRef = useRef<NodeJS.Timeout | null>(null);

  // Carregar clientes
  useEffect(() => {
    if (!empresaId) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/clientes?empresaId=${empresaId}`);
        const data = await res.json();
        if (Array.isArray(data)) setClientes(data);
      } catch { /* silencioso */ }
    };
    load();
  }, [empresaId]);

  // Polling status PIX MP
  useEffect(() => {
    if (mpPixPollRef.current) { clearInterval(mpPixPollRef.current); mpPixPollRef.current = null; }
    if (!mpPixData || mpPixData.status === 'approved') return;
    mpPixPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/mercadopago/status?id=${mpPixData.paymentId}&empresaId=${empresa?.id}`);
        const data = await res.json();
        if (data.payment?.status) {
          setMpPixData(prev => prev ? { ...prev, status: data.payment.status } : null);
          if (data.payment.status === 'approved') {
            if (mpPixPollRef.current) { clearInterval(mpPixPollRef.current); mpPixPollRef.current = null; }
            registrarRecebimento('MERCADO_PAGO', data.payment.id);
          } else if (data.payment.status === 'cancelled' || data.payment.status === 'rejected') {
            if (mpPixPollRef.current) { clearInterval(mpPixPollRef.current); mpPixPollRef.current = null; }
            toast.error('Pagamento recusado ou cancelado');
            setMpPixData(null);
          }
        }
      } catch { /* silencioso */ }
    }, 3000);
    return () => { if (mpPixPollRef.current) { clearInterval(mpPixPollRef.current); mpPixPollRef.current = null; } };
  }, [mpPixData?.paymentId, mpPixData?.status, empresa?.id]);

  // Limpar polling ao desmontar
  useEffect(() => {
    return () => { if (mpPixPollRef.current) { clearInterval(mpPixPollRef.current); mpPixPollRef.current = null; } };
  }, []);

  const formatNumber = (n: number) => {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const valorNumerico = parseFloat((valor || '0').replace(',', '.')) || 0;

  // Gerar QR Code PIX Banco
  const gerarPixBanco = async () => {
    if (valorNumerico <= 0) { toast.error('Informe o valor'); return; }
    if (!empresa?.pixChave) { toast.error('PIX nao configurado nas configuracoes da empresa'); return; }
    try {
      const { gerarPayloadPix } = await import('@/lib/pix-payload');
      const payload = gerarPayloadPix({
        chave: empresa.pixChave,
        nome: empresa.pixMerchantNome || empresa.nome || '',
        cidade: empresa.pixMerchantCidade || '',
        valor: valorNumerico,
      });
      setPixPayload(payload);
      // Gerar QR Code como data URL
      const QRCode = await import('qrcode');
      const dataUrl = await QRCode.toDataURL(payload, { width: 200, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
      setPixQrDataUrl(dataUrl);
    } catch {
      toast.error('Erro ao gerar QR Code PIX');
    }
  };

  // Copiar código PIX
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

  // Confirmar recebimento PIX Banco
  const confirmarPixBanco = () => {
    registrarRecebimento('PIX_BANCO');
  };

  // Confirmar recebimento em dinheiro
  const confirmarDinheiro = () => {
    registrarRecebimento('DINHEIRO');
  };

  // Gerar PIX via Mercado Pago
  const gerarMpPix = async () => {
    if (valorNumerico <= 0) { toast.error('Informe o valor'); return; }
    setMpPixLoading(true);
    try {
      const res = await fetch('/api/mercadopago/criar-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valor: valorNumerico,
          descricao: `Recebimento avulso - ${motivo || 'Sem motivo'} - ${clienteSelecionado?.nome || 'Sem cliente'}`,
          nome: clienteSelecionado?.nome || '',
          cpfCnpj: clienteSelecionado?.cpfCnpj || '',
          email: clienteSelecionado?.email || '',
          empresaId: empresa?.id,
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

  // Registrar recebimento como Conta a Receber quitada
  const registrarRecebimento = async (forma: string, mpPaymentId?: string) => {
    if (!clienteSelecionado) { toast.error('Selecione um cliente'); return; }
    if (valorNumerico <= 0) { toast.error('Informe o valor'); return; }

    setSaving(true);
    try {
      const formaLabel = forma === 'DINHEIRO' ? 'Dinheiro' : forma === 'PIX_BANCO' ? 'PIX Banco' : 'Mercado Pago';
      const obs = `Recebimento avulso via ${formaLabel}${mpPaymentId ? ` - MP ID: ${mpPaymentId}` : ''}`;

      const res = await fetch('/api/contas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descricao: `RECEBIMENTO: ${motivo || 'Avulso'}`,
          valor: valorNumerico,
          data: new Date().toISOString().split('T')[0],
          dataPagamento: new Date().toISOString().split('T')[0],
          paga: true,
          tipo: 1, // A Receber
          clienteId: clienteSelecionado.id,
          empresaId,
          observacoes: obs,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao registrar recebimento');
      }

      const conta = await res.json();
      setUltimoRecebimento({ id: conta.id, valor: conta.valor, descricao: conta.descricao });
      setSucesso(true);

      // Resetar estado
      setValor('');
      setMotivo('');
      setFormaPagamento(null);
      setPixQrDataUrl(null);
      setPixPayload('');
      setMpPixData(null);

      toast.success(`Recebimento de R$ ${formatNumber(valorNumerico)} registrado!`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao registrar';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  // Limpar PIX
  const limparPixBanco = () => {
    setPixQrDataUrl(null);
    setPixPayload('');
    setPixCopiado(false);
  };

  // Limpar MP PIX
  const limparMpPix = () => {
    setMpPixData(null);
    if (mpPixPollRef.current) { clearInterval(mpPixPollRef.current); mpPixPollRef.current = null; }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Receber</h2>
        {ultimoRecebimento && (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
            Ultimo: R$ {formatNumber(ultimoRecebimento.valor)}
          </Badge>
        )}
      </div>

      {/* Sucesso */}
      {sucesso && ultimoRecebimento && (
        <Card className="border-0 shadow-lg bg-emerald-500/10 border border-emerald-500/30">
          <CardContent className="p-4 text-center space-y-2">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <p className="text-sm font-bold text-emerald-400">Recebimento Registrado!</p>
            <p className="text-xs text-muted-foreground">
              R$ {formatNumber(ultimoRecebimento.valor)} — {ultimoRecebimento.descricao}
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setSucesso(false)}>
              <Plus className="w-4 h-4 mr-1" /> Novo Recebimento
            </Button>
          </CardContent>
        </Card>
      )}

      {!sucesso && (
        <>
          {/* Formulário */}
          <Card className="border-0 shadow-lg bg-card">
            <CardContent className="p-4 space-y-4">
              {/* Cliente */}
              <div className="space-y-2">
                <Label className="text-muted-foreground">Cliente</Label>
                <Select value={clienteSelecionado?.id || ''} onValueChange={(id) => {
                  const c = clientes.find(x => x.id === id);
                  setClienteSelecionado(c || null);
                }}>
                  <SelectTrigger className="bg-muted border-border text-foreground">
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Valor */}
              <div className="space-y-2">
                <Label className="text-muted-foreground">Valor (R$)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                  className="bg-muted border-border text-foreground text-right text-lg font-bold pr-4 h-12 font-mono"
                  autoFocus
                />
              </div>

              {/* Motivo */}
              <div className="space-y-2">
                <Label className="text-muted-foreground">Motivo / Descrição</Label>
                <Input
                  type="text"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value.toUpperCase())}
                  placeholder="Ex: Aluguel, Manutenção, Outros..."
                  className="bg-muted border-border text-foreground"
                />
              </div>
            </CardContent>
          </Card>

          {/* Forma de Pagamento */}
          {valorNumerico > 0 && clienteSelecionado && (
            <Card className="border-0 shadow-lg bg-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-foreground">Forma de Pagamento</p>
                  <div className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1">
                    <span className="text-sm font-bold text-emerald-400">R$ {formatNumber(valorNumerico)}</span>
                  </div>
                </div>
                <Separator className="bg-border" />

                <div className="grid grid-cols-1 gap-2">
                  {/* Dinheiro */}
                  <Button
                    className={`w-full text-sm ${formaPagamento === 'DINHEIRO' ? 'bg-gradient-to-r from-emerald-500 to-green-600' : 'bg-gradient-to-r from-emerald-500/80 to-green-600/80 opacity-70'}`}
                    onClick={() => {
                      setFormaPagamento(formaPagamento === 'DINHEIRO' ? null : 'DINHEIRO');
                      setPixQrDataUrl(null); setMpPixData(null);
                    }}
                  >
                    <DollarSign className="w-4 h-4 mr-2" />Dinheiro
                  </Button>

                  {/* PIX Banco */}
                  {empresa?.pixChave && (
                    <Button
                      className={`w-full text-sm ${formaPagamento === 'PIX_BANCO' ? 'bg-gradient-to-r from-violet-500 to-purple-600' : 'bg-gradient-to-r from-violet-500/80 to-purple-600/80 opacity-70'}`}
                      onClick={() => {
                        setFormaPagamento(formaPagamento === 'PIX_BANCO' ? null : 'PIX_BANCO');
                        setMpPixData(null);
                      }}
                    >
                      <QrCode className="w-4 h-4 mr-2" />PIX (Banco)
                    </Button>
                  )}

                  {/* Mercado Pago — PIX */}
                  {empresa?.mercadopagoAccessToken && (
                    <Button
                      className={`w-full text-sm ${formaPagamento === 'MERCADO_PAGO' ? 'bg-gradient-to-r from-sky-500 to-blue-600' : 'bg-gradient-to-r from-sky-500/80 to-blue-600/80 opacity-70'}`}
                      onClick={() => {
                        setFormaPagamento(formaPagamento === 'MERCADO_PAGO' ? null : 'MERCADO_PAGO');
                        setPixQrDataUrl(null);
                      }}
                    >
                      <ShoppingCart className="w-4 h-4 mr-2" />Mercado Pago
                    </Button>
                  )}
                </div>

                {/* Sem formas habilitadas */}
                {!empresa?.pixChave && !empresa?.mercadopagoAccessToken && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Configure PIX ou Mercado Pago nas configuracoes da empresa
                  </p>
                )}

                {/* ---- DINHEIRO ---- */}
                {formaPagamento === 'DINHEIRO' && (
                  <div className="space-y-3 pt-2">
                    <div className="text-center space-y-2">
                      <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <DollarSign className="w-7 h-7 text-emerald-400" />
                      </div>
                      <p className="text-2xl font-bold text-emerald-400">R$ {formatNumber(valorNumerico)}</p>
                      <p className="text-xs text-muted-foreground">Confirme o recebimento em dinheiro</p>
                    </div>
                    <Button
                      className="w-full bg-gradient-to-r from-emerald-500 to-green-600"
                      onClick={confirmarDinheiro}
                      disabled={saving}
                    >
                      {saving ? 'Registrando...' : 'CONFIRMAR RECEBIMENTO'}
                    </Button>
                  </div>
                )}

                {/* ---- PIX BANCO ---- */}
                {formaPagamento === 'PIX_BANCO' && (
                  <div className="space-y-3 pt-2">
                    {!pixQrDataUrl ? (
                      <div className="text-center space-y-3">
                        <div className="w-14 h-14 mx-auto rounded-full bg-violet-500/20 flex items-center justify-center">
                          <QrCode className="w-7 h-7 text-violet-400" />
                        </div>
                        <p className="text-sm font-bold text-foreground">PIX via Banco</p>
                        <p className="text-xs text-muted-foreground">Gere o QR Code para o cliente escanear</p>
                        <Button
                          className="w-full bg-gradient-to-r from-violet-500 to-purple-600"
                          onClick={gerarPixBanco}
                        >
                          <QrCode className="w-4 h-4 mr-2" />Gerar QR Code PIX
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="text-center space-y-2">
                          <img src={pixQrDataUrl} alt="QR Code PIX" className="mx-auto rounded-xl border-2 border-white shadow-lg" style={{ width: 200, height: 200 }} />
                          <p className="text-sm font-bold text-foreground">R$ {formatNumber(valorNumerico)}</p>
                          <p className="text-xs text-muted-foreground">Escaneie o QR Code para pagar</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" className="flex-1" onClick={copiarPix}>
                            <Copy className="w-4 h-4 mr-1" />
                            {pixCopiado ? 'Copiado!' : 'Copiar PIX'}
                          </Button>
                          <Button className="flex-1 bg-gradient-to-r from-emerald-500 to-green-600" onClick={confirmarPixBanco} disabled={saving}>
                            {saving ? 'Registrando...' : 'Confirmar'}
                          </Button>
                        </div>
                        <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={limparPixBanco}>
                          <RotateCcw className="w-3 h-3 mr-1" />Gerar novo QR Code
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {/* ---- MERCADO PAGO ---- */}
                {formaPagamento === 'MERCADO_PAGO' && (
                  <div className="space-y-3 pt-2">
                    {!mpPixData && !mpPixLoading && (
                      <div className="text-center space-y-3">
                        <div className="w-14 h-14 mx-auto rounded-full bg-sky-500/20 flex items-center justify-center">
                          <ShoppingCart className="w-7 h-7 text-sky-400" />
                        </div>
                        <p className="text-sm font-bold text-foreground">Mercado Pago</p>
                        <p className="text-xs text-muted-foreground">Gere o QR Code PIX via Mercado Pago</p>
                        <Button
                          className="w-full bg-gradient-to-r from-sky-500 to-blue-600"
                          onClick={gerarMpPix}
                        >
                          <QrCode className="w-4 h-4 mr-2" />Gerar PIX via Mercado Pago
                        </Button>
                      </div>
                    )}
                    {mpPixLoading && (
                      <div className="py-6 flex flex-col items-center gap-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
                        <span className="text-xs text-muted-foreground">Gerando QR Code PIX...</span>
                      </div>
                    )}
                    {mpPixData && (
                      <div className="text-center space-y-2">
                        {mpPixData.status === 'approved' ? (
                          <div className="py-4 flex flex-col items-center gap-2">
                            <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
                              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                            </div>
                            <p className="text-sm font-bold text-emerald-400">Pagamento aprovado!</p>
                          </div>
                        ) : (
                          <>
                            <img
                              src={`data:image/png;base64,${mpPixData.qrCodeBase64}`}
                              alt="QR Code PIX Mercado Pago"
                              className="mx-auto rounded-xl border-2 border-white shadow-lg"
                              style={{ width: 200, height: 200 }}
                            />
                            <p className="text-sm font-bold text-foreground">R$ {formatNumber(valorNumerico)}</p>
                            <div className="flex items-center justify-center gap-2">
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-sky-400" />
                              <span className="text-xs text-muted-foreground">Aguardando pagamento...</span>
                            </div>
                          </>
                        )}
                        {mpPixData.status !== 'approved' && (
                          <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={limparMpPix}>
                            <RotateCcw className="w-3 h-3 mr-1" />Gerar novo QR Code
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ============================================
// LEITURAS COMPONENT
// ============================================
function LeiturasPage({ empresaId, isSupervisor, usuarioId, usuarioNome, ajusteMode }: { empresaId: string; isSupervisor: boolean; usuarioId: string; usuarioNome: string; ajusteMode?: boolean }) {
  const { empresa } = useAuthStore();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [maquinas, setMaquinas] = useState<MaquinaLeitura[]>([]);
  const [maquinasAlteradas, setMaquinasAlteradas] = useState<Map<string, MaquinaLeitura>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extratoVisivel, setExtratoVisivel] = useState(false);
  const [saldoAnterior, setSaldoAnterior] = useState(0);
  const [recebido, setRecebido] = useState('');
  // Modo de operação derivado do cliente ou forçado por ajusteMode
  const [modoOperacao, setModoOperacao] = useState<'COBRANCA' | 'LEITURA' | 'AJUSTE'>(() => ajusteMode ? 'AJUSTE' : 'COBRANCA');
  // Estados para captura de foto
  const [fotoModalOpen, setFotoModalOpen] = useState(false);
  const [resumoTelegramEnviado, setResumoTelegramEnviado] = useState(false);
  const [maquinaFoto, setMaquinaFoto] = useState<MaquinaLeitura | null>(null);
  const [fotoCapturada, setFotoCapturada] = useState<string | null>(null);
  // ⚠️ Ref para a foto COM tarja vermelha — evita race condition com estado assíncrono
  // Usado em aplicarLeituraExtraida() para garantir que fotoProcessada sempre tenha tarja
  const fotoComTarjaRef = useRef<string | null>(null);
  // Estado para extração de leitura
  const [extraindoLeitura, setExtraindoLeitura] = useState(false);
  const [leituraExtraida, setLeituraExtraida] = useState<{ entrada: number | null; saida: number | null; confianca?: number } | null>(null);
  // Estado para visualização em tela cheia
  const [fotoTelaCheia, setFotoTelaCheia] = useState(false);
  const [zoomFoto, setZoomFoto] = useState(1);
  // Estado para o modal de resumo
  const [resumoModalOpen, setResumoModalOpen] = useState(false);
  const [maquinasSalvas, setMaquinasSalvas] = useState<MaquinaLeitura[]>([]);
  // Estado para Extrato 2a Via
  const [segundaViaOpen, setSegundaViaOpen] = useState(false);
  const [fechamentosAnteriores, setFechamentosAnteriores] = useState<{ data: string; dataISO: string; operadores: string; qtdFotos: number }[]>([]);
  const [segundaViaLoading, setSegundaViaLoading] = useState(false);
  const [segundaViaSelecionada, setSegundaViaSelecionada] = useState<{ data: string; dataISO: string } | null>(null);
  const [segundaViaDados, setSegundaViaDados] = useState<any[]>([]);
  const [segundaViaExtratoOpen, setSegundaViaExtratoOpen] = useState(false);
  // Seletor de visualização da 2a via: 'EXTRATO' (texto) ou 'RELATORIO' (A4 com fotos)
  // Persiste em localStorage para lembrar da última escolha do usuário
  const [segundaViaModo, setSegundaViaModo] = useState<'EXTRATO' | 'RELATORIO'>('EXTRATO');
  // Fotos baixadas do GCS para exibir no relatório (miniaturas)
  const [segundaViaFotos, setSegundaViaFotos] = useState<Array<{ maquinaId: string; codigo: string; fotoBase64: string }>>([]);
  // Carrega preferência do usuário ao montar o componente
  useEffect(() => {
    try {
      const saved = localStorage.getItem('caixafacil-2via-modo');
      if (saved === 'EXTRATO' || saved === 'RELATORIO') {
        setSegundaViaModo(saved);
      }
    } catch {}
  }, []);
  // Ref para evitar loop infinito no restore do localStorage
  const restoreDoneRef = useRef<string>('');
  // Estado para rastrear origem da foto (CÂMERA ou GALERIA)
  const [fotoOrigem, setFotoOrigem] = useState<'CÂMERA' | 'GALERIA' | 'LOTE' | null>(null);
  // Estados para entradas (antigo "receitas")
  const [receitasItens, setReceitasItens] = useState<{ id: string; descricao: string; valor: string; fixo: boolean; readonly?: boolean }[]>([
    { id: 'leitura', descricao: 'LEITURA', valor: '', fixo: true, readonly: true },
    { id: 'caixa_inicial', descricao: 'CAIXA INICIAL', valor: '', fixo: true },
    { id: 'reforco', descricao: 'REFORÇO', valor: '', fixo: true },
  ]);
  // Descrições detalhadas das receitas salvas (para WhatsApp/resumo)
  const [receitasSalvas, setReceitasSalvas] = useState<{ descricao: string; valor: number }[]>([]);

  // Estados para saídas (antigo "despesas")
  const [despesasItens, setDespesasItens] = useState<{ id: string; descricao: string; valor: string; fixo: boolean }[]>([
    { id: 'uber', descricao: 'UBER', valor: '', fixo: true },
    { id: 'mercado', descricao: 'MERCADO', valor: '', fixo: true },
    { id: 'gasolina', descricao: 'GASOLINA', valor: '', fixo: true },
    { id: 'vales', descricao: 'VALES', valor: '', fixo: true },
    { id: 'bonus', descricao: 'BONUS', valor: '', fixo: true },
    { id: 'diaria', descricao: 'DIÁRIA', valor: '', fixo: true },
    { id: 'horas_extras', descricao: 'HORAS EXTRAS', valor: '', fixo: true },
    { id: 'cartao', descricao: 'CARTÃO', valor: '', fixo: true },
    { id: 'dinheiro', descricao: 'DINHEIRO', valor: '', fixo: true },
    { id: 'caixa_final', descricao: 'CAIXA FINAL', valor: '', fixo: true },
  ]);
  // Estado para o valor total das despesas salvas (para exibir no resumo)
  const [valorDespesaSalva, setValorDespesaSalva] = useState<number>(0);
  // Estado para o valor total das receitas salvas (para exibir no resumo)
  const [valorReceitaSalva, setValorReceitaSalva] = useState<number>(0);
  // Descrições detalhadas das despesas salvas (para WhatsApp/resumo)
  const [despesasSalvas, setDespesasSalvas] = useState<{ descricao: string; valor: number }[]>([]);

  // CAIXA card removido — CAIXA INICIAL está em ENTRADAS, CAIXA FINAL está em SAÍDAS

  // Forma de pagamento (3 estados)
  const [formaPagamento, setFormaPagamento] = useState<'DINHEIRO' | 'MERCADO_PAGO' | 'PIX_QRCODE' | null>(null);
  const [valorPago, setValorPago] = useState<string>('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [mpPixData, setMpPixData] = useState<{ qrCodeBase64: string; paymentId: string; status: string } | null>(null);
  const [mpPixLoading, setMpPixLoading] = useState(false);
  const mpPixPollRef = useRef<NodeJS.Timeout | null>(null);
  // Cartão via Brick
  const [mpBrickOpen, setMpBrickOpen] = useState(false);
  const [mpBrickLoading, setMpBrickLoading] = useState(false);
  const [mpBrickReady, setMpBrickReady] = useState(false);
  const [mpBrickError, setMpBrickError] = useState('');
  const mpBrickContainerRef = useRef<HTMLDivElement>(null);
  const mpBrickInstanceRef = useRef<any>(null);

  // Estados para cortina (collapsible) de ENTRADAS e SAÍDAS
  const [receitasAberto, setReceitasAberto] = useState(false);
  const [despesasAberto, setDespesasAberto] = useState(false);

  // Estados para foto do cartao (canhotos)
  const [cartaoModalOpen, setCartaoModalOpen] = useState(false);
  const [cartaoFotoCapturada, setCartaoFotoCapturada] = useState<string | null>(null);
  const [cartaoFotoProcessada, setCartaoFotoProcessada] = useState<string | null>(null);
  const [extraindoCartao, setExtraindoCartao] = useState(false);
  const [cartaoResultado, setCartaoResultado] = useState<{ tickets: number[]; total: number; totalIA?: number; totalConferido: boolean; quantidade: number } | null>(null);

  // Estados para foto do mercado (cupons fiscais)
  const [mercadoModalOpen, setMercadoModalOpen] = useState(false);
  const [mercadoFotoCapturada, setMercadoFotoCapturada] = useState<string | null>(null);
  const [mercadoFotoProcessada, setMercadoFotoProcessada] = useState<string | null>(null);
  const [extraindoMercado, setExtraindoMercado] = useState(false);
  const [mercadoResultado, setMercadoResultado] = useState<{ tickets: number[]; total: number; totalIA?: number; totalConferido: boolean; quantidade: number } | null>(null);

  // Funções para gerenciar receitas
  const calcularTotalReceitas = () => {
    return receitasItens.reduce((total, item) => {
      const val = parseFloat(item.valor.replace(',', '.')) || 0;
      return total + val;
    }, 0);
  };

  const formatarValorReceita = (id: string, valor: string) => {
    if (!valor || valor.trim() === '') return;
    const limpo = valor.replace(/[^\d]/g, '');
    if (!limpo) return;
    if (!valor.includes(',') && !valor.includes('.')) {
      setReceitasItens(prev => prev.map(item =>
        item.id === id ? { ...item, valor: limpo + ',00' } : item
      ));
    } else if (valor.includes(',') && !valor.includes('.')) {
      const partes = valor.split(',');
      const decimais = (partes[1] || '').replace(/[^\d]/g, '');
      const formatado = partes[0] + ',' + decimais.padEnd(2, '0').substring(0, 2);
      setReceitasItens(prev => prev.map(item =>
        item.id === id ? { ...item, valor: formatado } : item
      ));
    }
  };

  const atualizarReceita = (id: string, campo: 'descricao' | 'valor', valor: string) => {
    setReceitasItens(prev => prev.map(item =>
      item.id === id ? { ...item, [campo]: campo === 'valor' ? valor.replace(/[^\d.,]/g, '') : valor.toUpperCase() } : item
    ));
  };

  const adicionarReceita = () => {
    const novoId = `custom_rec_${Date.now()}`;
    setReceitasItens(prev => [...prev, { id: novoId, descricao: '', valor: '', fixo: false }]);
  };

  const removerReceita = (id: string) => {
    setReceitasItens(prev => prev.filter(item => item.id !== id));
  };

  const resetReceitas = () => {
    setReceitasItens([
      { id: 'leitura', descricao: 'LEITURA', valor: '', fixo: true, readonly: true },
      { id: 'caixa_inicial', descricao: 'CAIXA INICIAL', valor: '', fixo: true },
      { id: 'reforco', descricao: 'REFORÇO', valor: '', fixo: true },
    ]);
  };

  // ============================================
  // Funções para foto do cartão (canhotos)
  // ============================================
  const abrirModalCartao = () => {
    setCartaoFotoCapturada(null);
    setCartaoFotoProcessada(null);
    setCartaoResultado(null);
    setExtraindoCartao(false);
    setCartaoModalOpen(true);
  };

  const handleFileChangeCartao = (event: React.ChangeEvent<HTMLInputElement>, origem: 'CÂMERA' | 'GALERIA') => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          try {
            const maxDimensao = 1920;
            let largura = img.width;
            let altura = img.height;
            if (largura > maxDimensao || altura > maxDimensao) {
              if (largura > altura) {
                altura = Math.round((altura / largura) * maxDimensao);
                largura = maxDimensao;
              } else {
                largura = Math.round((largura / altura) * maxDimensao);
                altura = maxDimensao;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = largura;
            canvas.height = altura;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, largura, altura);
              const imagemRedimensionada = canvas.toDataURL('image/jpeg', 0.8);
              setCartaoFotoCapturada(imagemRedimensionada);
              setCartaoFotoProcessada(null);
              setCartaoResultado(null);
            } else {
              setCartaoFotoCapturada(reader.result as string);
            }
          } catch (error) {
            console.error('Erro ao processar imagem:', error);
            toast.error('Erro ao processar imagem. Tente outra foto.');
          }
        };
        img.onerror = () => {
          toast.error('Erro ao carregar imagem. Tente outra foto.');
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const extrairValoresCartao = async () => {
    if (!cartaoFotoCapturada) {
      toast.error('Nenhuma foto capturada');
      return;
    }
    setExtraindoCartao(true);
    setCartaoResultado(null);
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch('/api/leituras/extrair-cartao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ imagem: cartaoFotoCapturada, empresaId: empresaId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao extrair valores');
      }
      // Build 130: Soma ja vem calculada pelo backend (confiavel)
      const totalBackend = data.total || 0;
      const tickets = (data.tickets || []).map((v: any) => typeof v === 'number' ? v : parseFloat(v)).filter((v: number) => !isNaN(v) && v > 0);
      // Dupla validacao: frontend tambem soma para garantir
      const totalFrontend = tickets.reduce((s: number, v: number) => s + v, 0);
      const totalFinal = Math.abs(totalBackend - totalFrontend) < 0.01 ? totalBackend : totalFrontend;

      const resultado = {
        tickets: tickets,
        total: totalFinal,
        totalIA: data.totalConferido ? undefined : data.totalIA,
        totalConferido: data.totalConferido ?? true,
        quantidade: data.quantidade || tickets.length,
      };
      setCartaoResultado(resultado);

      if (!resultado.totalConferido && resultado.totalIA !== undefined) {
        toast.warning(`IA disse R$ ${resultado.totalIA.toFixed(2)} mas a soma correta e R$ ${totalFinal.toFixed(2)}. Usando valor conferido.`);
      } else {
        toast.success(`${resultado.quantidade} ticket(s) identificado(s) - Total: R$ ${totalFinal.toFixed(2)}`);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(msg);
    } finally {
      setExtraindoCartao(false);
    }
  };

  // Adicionar tarja vermelha com total dos canhotos na foto
  const adicionarTarjaCartao = (imagemBase64: string, total: number, quantidade: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout ao processar imagem'));
      }, 10000);
      const img = new Image();
      img.onload = () => {
        try {
          clearTimeout(timeout);
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Não foi possível criar contexto do canvas'));
            return;
          }
          let larguraOriginal = img.width;
          let alturaOriginal = img.height;
          const maxDimensao = 1920;
          if (larguraOriginal > maxDimensao || alturaOriginal > maxDimensao) {
            const ratio = Math.min(maxDimensao / larguraOriginal, maxDimensao / alturaOriginal);
            larguraOriginal = Math.round(larguraOriginal * ratio);
            alturaOriginal = Math.round(alturaOriginal * ratio);
          }
          const tamanhoFonteBase = Math.max(20, Math.min(44, Math.round(larguraOriginal / 30)));
          const alturaTarja = Math.round(tamanhoFonteBase * 2.5);
          canvas.width = larguraOriginal;
          canvas.height = alturaOriginal + alturaTarja;
          if (img.width !== larguraOriginal || img.height !== alturaOriginal) {
            ctx.drawImage(img, 0, 0, larguraOriginal, alturaOriginal);
          } else {
            ctx.drawImage(img, 0, 0);
          }
          // Tarja vermelha
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(0, alturaOriginal, larguraOriginal, alturaTarja);
          // Texto branco
          ctx.fillStyle = '#ffffff';
          ctx.textBaseline = 'middle';
          const totalStr = `CARTAO: ${quantidade} ticket(s) | TOTAL: R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
          const tamanhoFonte = Math.max(16, Math.min(tamanhoFonteBase, Math.round((larguraOriginal - 24) / (totalStr.length * 0.55))));
          ctx.font = `bold ${tamanhoFonte}px Arial, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(totalStr, larguraOriginal / 2, alturaOriginal + alturaTarja / 2);
          resolve(canvas.toDataURL('image/jpeg', 0.9));
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      };
      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Erro ao carregar imagem'));
      };
      img.src = imagemBase64;
    });
  };

  const aplicarValoresCartao = async () => {
    if (!cartaoResultado || !cartaoFotoCapturada) return;
    try {
      // Gerar foto com tarja
      const fotoComTarja = await adicionarTarjaCartao(cartaoFotoCapturada, cartaoResultado.total, cartaoResultado.quantidade);
      setCartaoFotoProcessada(fotoComTarja);
      // Atualizar campo Cartão com o valor total
      const valorFormatado = cartaoResultado.total.toFixed(2).replace('.', ',');
      setDespesasItens(prev => prev.map(item =>
        item.id === 'cartao' ? { ...item, valor: valorFormatado } : item
      ));
      toast.success(`Total R$ ${valorFormatado} aplicado ao campo CARTÃO`);
      setCartaoModalOpen(false);
    } catch (error) {
      console.error('Erro ao aplicar valores:', error);
      toast.error('Erro ao processar a foto. Tente novamente.');
    }
  };

  // ============================================
  // Funções para foto do mercado (cupons fiscais)
  // ============================================
  const abrirModalMercado = () => {
    setMercadoFotoCapturada(null);
    setMercadoFotoProcessada(null);
    setMercadoResultado(null);
    setExtraindoMercado(false);
    setMercadoModalOpen(true);
  };

  const handleFileChangeMercado = (event: React.ChangeEvent<HTMLInputElement>, origem: 'CÂMERA' | 'GALERIA') => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          try {
            const maxDimensao = 1920;
            let largura = img.width;
            let altura = img.height;
            if (largura > maxDimensao || altura > maxDimensao) {
              if (largura > altura) {
                altura = Math.round((altura / largura) * maxDimensao);
                largura = maxDimensao;
              } else {
                largura = Math.round((largura / altura) * maxDimensao);
                altura = maxDimensao;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = largura;
            canvas.height = altura;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, largura, altura);
              const imagemRedimensionada = canvas.toDataURL('image/jpeg', 0.8);
              setMercadoFotoCapturada(imagemRedimensionada);
              setMercadoFotoProcessada(null);
              setMercadoResultado(null);
            } else {
              setMercadoFotoCapturada(reader.result as string);
            }
          } catch (error) {
            console.error('Erro ao processar imagem:', error);
            toast.error('Erro ao processar imagem. Tente outra foto.');
          }
        };
        img.onerror = () => {
          toast.error('Erro ao carregar imagem. Tente outra foto.');
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const extrairValoresMercado = async () => {
    if (!mercadoFotoCapturada) {
      toast.error('Nenhuma foto capturada');
      return;
    }
    setExtraindoMercado(true);
    setMercadoResultado(null);
    setMercadoFotoProcessada(null);
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch('/api/leituras/extrair-cartao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ imagem: mercadoFotoCapturada, empresaId: empresaId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao extrair valores');
      }
      const totalBackend = data.total || 0;
      const tickets = (data.tickets || []).map((v: any) => typeof v === 'number' ? v : parseFloat(v)).filter((v: number) => !isNaN(v) && v > 0);

      // Remover valores duplicados (IA pode repetir o mesmo valor)
      const ticketsUnicos = [...new Set(tickets.map(v => Math.round(v * 100) / 100))];
      const temDuplicatas = ticketsUnicos.length < tickets.length;

      const totalFrontend = ticketsUnicos.reduce((s: number, v: number) => s + v, 0);
      const totalFinal = Math.abs(totalBackend - totalFrontend) < 0.01 ? totalBackend : totalFrontend;

      const resultado = {
        tickets: ticketsUnicos,
        total: totalFinal,
        totalIA: data.totalConferido ? undefined : data.totalIA,
        totalConferido: data.totalConferido ?? true,
        quantidade: ticketsUnicos.length,
      };
      setMercadoResultado(resultado);

      // Gerar tarja vermelha automaticamente com os valores extraidos
      try {
        const fotoComTarja = await adicionarTarjaMercado(mercadoFotoCapturada, resultado.total, resultado.quantidade);
        setMercadoFotoProcessada(fotoComTarja);
      } catch {
        // Falha na tarja nao impede o fluxo
      }

      if (temDuplicatas) {
        toast.warning(`Duplicata(s) removida(s). ${resultado.quantidade} cupom(ns) - Total: R$ ${totalFinal.toFixed(2)}`);
      } else if (!resultado.totalConferido && resultado.totalIA !== undefined) {
        toast.warning(`IA disse R$ ${resultado.totalIA.toFixed(2)} mas a soma correta e R$ ${totalFinal.toFixed(2)}. Usando valor conferido.`);
      } else {
        toast.success(`${resultado.quantidade} cupom(ns) identificado(s) - Total: R$ ${totalFinal.toFixed(2)}`);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(msg);
    } finally {
      setExtraindoMercado(false);
    }
  };

  // Adicionar tarja vermelha com total dos cupons na foto
  const adicionarTarjaMercado = (imagemBase64: string, total: number, quantidade: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout ao processar imagem'));
      }, 10000);
      const img = new Image();
      img.onload = () => {
        try {
          clearTimeout(timeout);
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Nao foi possivel criar contexto do canvas'));
            return;
          }
          let larguraOriginal = img.width;
          let alturaOriginal = img.height;
          const maxDimensao = 1920;
          if (larguraOriginal > maxDimensao || alturaOriginal > maxDimensao) {
            const ratio = Math.min(maxDimensao / larguraOriginal, maxDimensao / alturaOriginal);
            larguraOriginal = Math.round(larguraOriginal * ratio);
            alturaOriginal = Math.round(alturaOriginal * ratio);
          }
          const tamanhoFonteBase = Math.max(20, Math.min(44, Math.round(larguraOriginal / 30)));
          const alturaTarja = Math.round(tamanhoFonteBase * 2.5);
          canvas.width = larguraOriginal;
          canvas.height = alturaOriginal + alturaTarja;
          if (img.width !== larguraOriginal || img.height !== alturaOriginal) {
            ctx.drawImage(img, 0, 0, larguraOriginal, alturaOriginal);
          } else {
            ctx.drawImage(img, 0, 0);
          }
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(0, alturaOriginal, larguraOriginal, alturaTarja);
          ctx.fillStyle = '#ffffff';
          ctx.textBaseline = 'middle';
          const totalStr = `MERCADO: ${quantidade} cupom(ns) | TOTAL: R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
          const tamanhoFonte = Math.max(16, Math.min(tamanhoFonteBase, Math.round((larguraOriginal - 24) / (totalStr.length * 0.55))));
          ctx.font = `bold ${tamanhoFonte}px Arial, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(totalStr, larguraOriginal / 2, alturaOriginal + alturaTarja / 2);
          resolve(canvas.toDataURL('image/jpeg', 0.9));
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      };
      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Erro ao carregar imagem'));
      };
      img.src = imagemBase64;
    });
  };

  const aplicarValoresMercado = async () => {
    if (!mercadoResultado || !mercadoFotoCapturada) return;
    try {
      const fotoComTarja = await adicionarTarjaMercado(mercadoFotoCapturada, mercadoResultado.total, mercadoResultado.quantidade);
      setMercadoFotoProcessada(fotoComTarja);
      const valorFormatado = mercadoResultado.total.toFixed(2).replace('.', ',');
      setDespesasItens(prev => prev.map(item =>
        item.id === 'mercado' ? { ...item, valor: valorFormatado } : item
      ));
      toast.success(`Total R$ ${valorFormatado} aplicado ao campo MERCADO`);
      setMercadoModalOpen(false);
    } catch (error) {
      console.error('Erro ao aplicar valores:', error);
      toast.error('Erro ao processar a foto. Tente novamente.');
    }
  };

  // Funções para gerenciar despesas
  const calcularTotalDespesas = () => {
    return despesasItens.reduce((total, item) => {
      const val = parseFloat(item.valor.replace(',', '.')) || 0;
      return total + val;
    }, 0);
  };

  const formatarValorDespesa = (id: string, valor: string) => {
    if (!valor || valor.trim() === '') return;
    const limpo = valor.replace(/[^\d]/g, '');
    if (!limpo) return;
    const num = parseInt(limpo, 10);
    if (isNaN(num)) return;
    // Se o valor original nao tem virgula nem ponto, e' inteiro -> adicionar ,00
    if (!valor.includes(',') && !valor.includes('.')) {
      setDespesasItens(prev => prev.map(item =>
        item.id === id ? { ...item, valor: limpo + ',00' } : item
      ));
    } else if (valor.includes(',') && !valor.includes('.')) {
      // Tem virgula: garantir 2 casas decimais
      const partes = valor.split(',');
      const decimais = (partes[1] || '').replace(/[^\d]/g, '');
      const formatado = partes[0] + ',' + decimais.padEnd(2, '0').substring(0, 2);
      setDespesasItens(prev => prev.map(item =>
        item.id === id ? { ...item, valor: formatado } : item
      ));
    }
  };

  const atualizarDespesa = (id: string, campo: 'descricao' | 'valor', valor: string) => {
    setDespesasItens(prev => prev.map(item =>
      item.id === id ? { ...item, [campo]: campo === 'valor' ? valor.replace(/[^\d.,]/g, '') : valor.toUpperCase() } : item
    ));
  };

  const adicionarDespesa = () => {
    const novoId = `custom_${Date.now()}`;
    setDespesasItens(prev => [...prev, { id: novoId, descricao: '', valor: '', fixo: false }]);
  };

  const removerDespesa = (id: string) => {
    setDespesasItens(prev => prev.filter(item => item.id !== id));
  };

  const resetDespesas = () => {
    setDespesasItens([
      { id: 'uber', descricao: 'UBER', valor: '', fixo: true },
      { id: 'mercado', descricao: 'MERCADO', valor: '', fixo: true },
      { id: 'gasolina', descricao: 'GASOLINA', valor: '', fixo: true },
      { id: 'vales', descricao: 'VALES', valor: '', fixo: true },
      { id: 'bonus', descricao: 'BONUS', valor: '', fixo: true },
      { id: 'diaria', descricao: 'DIÁRIA', valor: '', fixo: true },
      { id: 'horas_extras', descricao: 'HORAS EXTRAS', valor: '', fixo: true },
      { id: 'cartao', descricao: 'CARTÃO', valor: '', fixo: true },
      { id: 'dinheiro', descricao: 'DINHEIRO', valor: '', fixo: true },
      { id: 'caixa_final', descricao: 'CAIXA FINAL', valor: '', fixo: true },
    ]);
  };


  // Débitos vencidos não pagos do cliente (saldo acumulado)
  const [debitosVencidos, setDebitosVencidos] = useState<number>(0);
  const [debitosVencidosSalvos, setDebitosVencidosSalvos] = useState<number>(0);
  // Estados para Lançamento de Lote
  const [loteModalOpen, setLoteModalOpen] = useState(false);
  const [fotosLote, setFotosLote] = useState<{ id: string; imagem: string; status: 'pendente' | 'processando' | 'concluido' | 'erro'; origem?: 'CÂMERA' | 'GALERIA' | 'LOTE'; resultado?: { codigoMaquina: string; codigoReconhecido: boolean; entrada?: number | null; saida?: number | null; confianca: number; observacoes: string; confiancaOCR?: number }; erro?: string }[]>([]);
  const [processandoLote, setProcessandoLote] = useState(false);
  const [loteProgresso, setLoteProgresso] = useState(0);
  const loteIdCounter = useRef(0);
  const processandoEmBackground = useRef(false);
  const fotosLoteRef = useRef(fotosLote);
  fotosLoteRef.current = fotosLote;
  const maquinasRef = useRef(maquinas);
  maquinasRef.current = maquinas;
  const empresaRef = useRef(empresa);
  empresaRef.current = empresa;
  
  // Refs para os inputs de entrada e saída
  const entradaRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const saidaRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  
  // (Painel de fotos recebidas via WhatsApp Business removido — integração inativa)
  
  // Ref para o container da imagem em tela cheia (para pinch zoom)
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  
  // Refs para controlar o pinch zoom
  const pinchStartDistance = useRef(0);
  const pinchStartZoom = useRef(1);
  
  // Efeito para gerenciar pinch zoom
  useEffect(() => {
    const container = imageContainerRef.current;
    if (!container || !fotoTelaCheia) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        pinchStartDistance.current = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) +
          Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        pinchStartZoom.current = zoomFoto;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartDistance.current > 0) {
        e.preventDefault();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDistance = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) +
          Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        const scale = currentDistance / pinchStartDistance.current;
        const newZoom = Math.min(5, Math.max(0.5, pinchStartZoom.current * scale));
        setZoomFoto(newZoom);
      }
      // Com 1 dedo: scroll nativo (sem preventDefault)
    };

    const handleTouchEnd = () => {
      pinchStartDistance.current = 0;
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [fotoTelaCheia]);
  
  // Salvar estado e liberar memória quando o app vai para background (troca de janela)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        startTransition(() => {
          setMaquinas(prev => [...prev]);
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [loading]);

  useEffect(() => {
    loadClientes();
  }, [empresaId]);

  const loadClientes = async () => {
    try {
      const res = await fetch(`/api/clientes?empresaId=${empresaId}`);
      const data = await res.json();

      const ativos = data.filter((c: Cliente) => !c.bloqueado && c.ativo);
      setClientes(ativos);
    } catch (error) {
      toast.error('Erro ao carregar clientes');
    }
  };

  // Restaurar dados persistidos de um modo específico (ao trocar seletor de modo)

  const loadMaquinasCliente = async (clienteId: string, modoForcado?: 'COBRANCA' | 'LEITURA' | 'AJUSTE', skipRestore?: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/maquinas?empresaId=${empresaId}&clienteId=${clienteId}`);
      const data = await res.json();

      // Tentar restaurar dados do localStorage
      const modo = modoForcado || modoOperacao;
      let savedData: any = null;
      if (!skipRestore) {
        try {
          const raw = localStorage.getItem(`cf-digitacao-${modo}-${clienteId}`);
          if (raw) savedData = JSON.parse(raw);
        } catch { /* silencioso */ }
      }

      let maquinasComLeitura: MaquinaLeitura[] = data.map((m: Maquina) => {
        const machine: MaquinaLeitura = {
          ...m,
          novaEntrada: '',
          novaSaida: '',
          diferencaEntrada: 0,
          diferencaSaida: 0,
          saldoMaquina: 0,
          fotoProcessada: null,
        };

        // Restaurar valores salvos
        if (savedData?.maquinas && Array.isArray(savedData.maquinas)) {
          const s = savedData.maquinas.find((sv: any) => sv.id === m.id);
          if (s) {
            machine.novaEntrada = s.novaEntrada || '';
            machine.novaSaida = s.novaSaida || '';
            machine.diferencaEntrada = s.diferencaEntrada || 0;
            machine.diferencaSaida = s.diferencaSaida || 0;
            machine.saldoMaquina = s.saldoMaquina || 0;
            machine.fotoProcessada = s.fotoProcessada || null;
          }
        }

        return machine;
      });

      setMaquinas(maquinasComLeitura);

      // Restaurar outros campos salvos
      if (savedData) {
        if (savedData.receitasItens) setReceitasItens(savedData.receitasItens);
        if (savedData.despesasItens) setDespesasItens(savedData.despesasItens);
        if (savedData.recebido !== undefined) setRecebido(savedData.recebido);
        if (savedData.formaPagamento !== undefined) setFormaPagamento(savedData.formaPagamento);
        if (savedData.valorPago !== undefined) setValorPago(savedData.valorPago);
        if (savedData.saldoAnterior !== undefined) setSaldoAnterior(savedData.saldoAnterior);
      }
    } catch (error) {
      toast.error('Erro ao carregar máquinas');
    } finally {
      setLoading(false);
    }
  };

  // Carregar débitos vencidos não pagos do cliente
  const loadDebitosVencidos = async () => {
    if (!clienteSelecionado) {
      setDebitosVencidos(0);
      return;
    }
    try {
      const hoje = new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/contas?empresaId=${empresaId}&clienteId=${clienteSelecionado.id}&paga=false&tipo=1&dataMax=${hoje}`);
      const data = await res.json();

      const total = Array.isArray(data) ? data.reduce((sum: number, d: any) => sum + d.valor, 0) : 0;
      setDebitosVencidos(total);
    } catch {
      setDebitosVencidos(0);
    }
  };

  const handleClienteChange = async (clienteId: string) => {
    const cliente = clientes.find((c) => c.id === clienteId);
    setClienteSelecionado(cliente || null);
    restoreDoneRef.current = '';
    setExtratoVisivel(false);
    setRecebido('');
    setSaldoAnterior(0);
    // Limpar campos de receita e despesa ao trocar de cliente
    resetReceitas();
    resetDespesas();
    // Derivar modo de operação do cliente (ou manter AJUSTE se ajusteMode)
    let modoNovo: 'COBRANCA' | 'LEITURA' | 'AJUSTE' = 'COBRANCA';
    if (!ajusteMode && cliente) {
      modoNovo = (cliente.formaCobranca === 'LEITURA' ? 'LEITURA' : 'COBRANCA') as 'COBRANCA' | 'LEITURA';
      setModoOperacao(modoNovo);
    } else if (ajusteMode) {
      modoNovo = 'AJUSTE';
      setModoOperacao('AJUSTE');
    }

    if (clienteId) {
      await loadMaquinasCliente(clienteId, modoNovo);
      loadDebitosVencidos();
    } else {
      setMaquinas([]);
      setDebitosVencidos(0);
    }
  };

  // (Função abrirWhatsAppLink movida para escopo global do arquivo — usada por LoginPage e App)

  // Enviar texto via WhatsApp — usa navigator.share (sem limite de tamanho) ou wa.me link
  const enviarWhatsAppTextoSeguro = async (texto: string, phone?: string, grupoUrl?: string) => {
    // Método 1: navigator.share com texto (funciona no Chrome Android/iOS, sem limite de tamanho)
    if (navigator.share) {
      try {
        await navigator.share({ text: texto });
        return; // Enviado com sucesso
      } catch (shareError: unknown) {
        if (shareError instanceof Error && shareError.name === 'AbortError') return; // Usuário cancelou
        console.warn('navigator.share falhou, tentando wa.me:', shareError);
      }
    }

    // Método 2: wa.me deep link (limite ~2000 chars na URL)
    const encoded = encodeURIComponent(texto);
    const MAX_URL_LENGTH = 2000;
    const baseUrl = phone ? `https://wa.me/55${phone}?text=` : `https://wa.me/?text=`;

    if (baseUrl.length + encoded.length <= MAX_URL_LENGTH) {
      abrirWhatsAppLink(`${baseUrl}${encoded}`);
    } else {
      // Fallback: copiar e abrir WhatsApp
      try {
        await navigator.clipboard.writeText(texto);
        toast.info('Mensagem copiada! Cole-a no WhatsApp.');
      } catch {
        toast.info('Abra o WhatsApp e envie a mensagem manualmente.');
      }
      if (grupoUrl) {
        setTimeout(() => abrirWhatsAppLink(grupoUrl), 300);
      } else if (phone) {
        setTimeout(() => abrirWhatsAppLink(`https://wa.me/55${phone}`), 300);
      } else {
        setTimeout(() => abrirWhatsAppLink('https://wa.me/'), 300);
      }
    }
  };

  const calcularValor = (moeda: string, diferenca: number): number => {
    const multiplicadores: Record<string, number> = {
      M001: 0.01,
      M005: 0.05,
      M010: 0.10,
      M025: 0.25,
    };
    const multiplicador = multiplicadores[moeda] || 0.01; // Default M001
    return diferenca * multiplicador;
  };

  const handleNovaEntrada = (index: number, valor: string) => {
    // Só permite dígitos numéricos
    const valorNumerico = valor.replace(/[^0-9]/g, '');
    
    const novasMaquinas = [...maquinas];
    novasMaquinas[index].novaEntrada = valorNumerico;
    
    // Se o campo está vazio, zera diferença e recalcula saldo
    if (!valorNumerico) {
      novasMaquinas[index].diferencaEntrada = 0;
      novasMaquinas[index].saldoMaquina = calcularValor(
        maquinas[index].moeda,
        0 - novasMaquinas[index].diferencaSaida
      );
      setMaquinas(novasMaquinas);
      return;
    }
    
    const entradaAtual = maquinas[index].entradaAtual || 0;
    const novaEntradaNum = parseInt(valorNumerico) || 0;
    const diferenca = novaEntradaNum - entradaAtual;
    
    novasMaquinas[index].diferencaEntrada = diferenca;
    novasMaquinas[index].saldoMaquina = calcularValor(
      maquinas[index].moeda,
      novasMaquinas[index].diferencaEntrada - novasMaquinas[index].diferencaSaida
    );
    
    setMaquinas(novasMaquinas);
  };

  const validateNovaEntrada = (index: number) => {
    // No modo AJUSTE, permite qualquer valor (correção de leituras)
    if (modoOperacao === 'AJUSTE') return;
    const entradaAtual = maquinas[index].entradaAtual || 0;
    const novaEntradaNum = parseInt(maquinas[index].novaEntrada) || 0;
    
    if (maquinas[index].novaEntrada && novaEntradaNum < entradaAtual) {
      toast.error(`Valor deve ser maior que ${entradaAtual}`);
      // Limpa o campo se inválido
      const novasMaquinas = [...maquinas];
      novasMaquinas[index].novaEntrada = '';
      novasMaquinas[index].diferencaEntrada = 0;
      novasMaquinas[index].saldoMaquina = calcularValor(
        maquinas[index].moeda,
        0 - novasMaquinas[index].diferencaSaida
      );
      setMaquinas(novasMaquinas);
      // Retorna o foco ao campo
      setTimeout(() => {
        entradaRefs.current[index]?.focus();
      }, 100);
    }
  };

  const handleNovaSaida = (index: number, valor: string) => {
    // Só permite dígitos numéricos
    const valorNumerico = valor.replace(/[^0-9]/g, '');
    
    const novasMaquinas = [...maquinas];
    novasMaquinas[index].novaSaida = valorNumerico;
    
    // Se o campo está vazio, zera diferença e recalcula saldo
    if (!valorNumerico) {
      novasMaquinas[index].diferencaSaida = 0;
      novasMaquinas[index].saldoMaquina = calcularValor(
        maquinas[index].moeda,
        novasMaquinas[index].diferencaEntrada - 0
      );
      setMaquinas(novasMaquinas);
      return;
    }
    
    const saidaAtual = maquinas[index].saidaAtual || 0;
    const novaSaidaNum = parseInt(valorNumerico) || 0;
    const diferenca = novaSaidaNum - saidaAtual;
    
    novasMaquinas[index].diferencaSaida = diferenca;
    novasMaquinas[index].saldoMaquina = calcularValor(
      maquinas[index].moeda,
      novasMaquinas[index].diferencaEntrada - novasMaquinas[index].diferencaSaida
    );
    
    setMaquinas(novasMaquinas);
  };

  const validateNovaSaida = (index: number) => {
    // No modo AJUSTE, permite qualquer valor (correção de leituras)
    if (modoOperacao === 'AJUSTE') return;
    const saidaAtual = maquinas[index].saidaAtual || 0;
    const novaSaidaNum = parseInt(maquinas[index].novaSaida) || 0;
    
    if (maquinas[index].novaSaida && novaSaidaNum < saidaAtual) {
      toast.error(`Valor deve ser maior que ${saidaAtual}`);
      // Limpa o campo se inválido
      const novasMaquinas = [...maquinas];
      novasMaquinas[index].novaSaida = '';
      novasMaquinas[index].diferencaSaida = 0;
      novasMaquinas[index].saldoMaquina = calcularValor(
        maquinas[index].moeda,
        novasMaquinas[index].diferencaEntrada - 0
      );
      setMaquinas(novasMaquinas);
      // Retorna o foco ao campo
      setTimeout(() => {
        saidaRefs.current[index]?.focus();
      }, 100);
    }
  };

  // Função para repetir leitura anterior (copia ANTERIOR para ATUAL)
  const repetirLeitura = (index: number) => {
    const novasMaquinas = [...maquinas];
    const entradaAnterior = String(maquinas[index].entradaAtual || 0);
    const saidaAnterior = String(maquinas[index].saidaAtual || 0);

    novasMaquinas[index].novaEntrada = entradaAnterior;
    novasMaquinas[index].novaSaida = saidaAnterior;
    // Diferenca será 0 (repetição = sem movimento)
    novasMaquinas[index].diferencaEntrada = 0;
    novasMaquinas[index].diferencaSaida = 0;
    novasMaquinas[index].saldoMaquina = 0;

    setMaquinas(novasMaquinas);
    toast.success(`Leitura repetida para ${maquinas[index].codigo}`);
  };

  // Funções para captura de foto
  const abrirModalFoto = (maquina: MaquinaLeitura) => {
    setMaquinaFoto(maquina);
    setFotoCapturada(maquina.fotoProcessada || null);
    setLeituraExtraida(null);
    setFotoOrigem(maquina.fotoProcessada ? 'GALERIA' : null);
    setFotoModalOpen(true);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, origem: 'CÂMERA' | 'GALERIA') => {
    const file = event.target.files?.[0];
    if (file) {
      setFotoOrigem(origem);
      const reader = new FileReader();
      reader.onloadend = () => {
        // Redimensionar imagem para evitar problemas de memória
        const img = new Image();
        img.onload = () => {
          try {
            // Limitar tamanho máximo para 1920px (mantendo proporção)
            const maxDimensao = 1920;
            let largura = img.width;
            let altura = img.height;
            
            if (largura > maxDimensao || altura > maxDimensao) {
              if (largura > altura) {
                altura = Math.round((altura / largura) * maxDimensao);
                largura = maxDimensao;
              } else {
                largura = Math.round((largura / altura) * maxDimensao);
                altura = maxDimensao;
              }
            }
            
            // Criar canvas para redimensionar
            const canvas = document.createElement('canvas');
            canvas.width = largura;
            canvas.height = altura;
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
              ctx.drawImage(img, 0, 0, largura, altura);
              const imagemRedimensionada = canvas.toDataURL('image/jpeg', 0.8);
              setFotoCapturada(imagemRedimensionada);
            } else {
              // Se não conseguir redimensionar, usa original
              setFotoCapturada(reader.result as string);
            }
          } catch (error) {
            console.error('Erro ao processar imagem:', error);
            toast.error('Erro ao processar imagem. Tente outra foto.');
          }
        };
        img.onerror = () => {
          console.error('Erro ao carregar imagem');
          toast.error('Erro ao carregar imagem. Tente outra foto.');
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  // Enviar foto para WhatsApp do grupo do cliente
  const enviarFotoWhatsApp = async () => {
    if (!maquinaFoto) {
      toast.error('Nenhuma máquina selecionada');
      return;
    }

    if (!fotoCapturada) {
      toast.error('Nenhuma foto capturada');
      return;
    }

    // Pegar o WhatsApp do cliente (deve ser link de grupo)
    const whatsappOriginal = (clienteSelecionado?.whatsapp || '').trim();
    
    if (!whatsappOriginal) {
      toast.error('Cliente não possui grupo WhatsApp cadastrado. Cadastre no formulário do cliente.');
      return;
    }

    // Montar mensagem
    const now = new Date();
    const dataStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const nomeMaquina = maquinaFoto.tipo?.descricao || maquinaFoto.codigo || 'Máquina';
    let mensagem = `📸 FOTO DA LEITURA\n`;
    mensagem += `━━━━━━━━━━━━━━━━━\n`;
    mensagem += `🖥️ ${maquinaFoto.codigo} - ${nomeMaquina}\n`;
    mensagem += `📅 ${dataStr}\n`;
    mensagem += `👤 ${usuarioNome}\n`;
    
    if (leituraExtraida) {
      mensagem += `━━━━━━━━━━━━━━━━━\n`;
      mensagem += `📊 VALORES:\n`;
      mensagem += `${maquinaFoto.tipo?.nomeEntrada || 'E'}: ${leituraExtraida.entrada ?? '-'}\n`;
      mensagem += `${maquinaFoto.tipo?.nomeSaida || 'S'}: ${leituraExtraida.saida ?? '-'}\n`;
    }
    
    mensagem += `━━━━━━━━━━━━━━━━━\n`;
    mensagem += `Cliente: ${clienteSelecionado?.nome || 'N/A'}`;

    // Montar URL do grupo
    const grupoUrl = whatsappOriginal.includes('chat.whatsapp.com')
      ? whatsappOriginal
      : `https://chat.whatsapp.com/${whatsappOriginal}`;

    // Converter foto base64 para Blob/File
    try {
      const response = await fetch(fotoCapturada);
      const blob = await response.blob();
      const fileName = `leitura_${maquinaFoto.codigo}_${now.getTime()}.jpg`;
      const file = new File([blob], fileName, { type: 'image/jpeg' });

      // =============================================
      // 1) Web Share API (melhor experiência - mobile)
      // =============================================
      if (navigator.share) {
        const shareData: ShareData = {
          title: `Leitura - ${maquinaFoto.codigo}`,
          text: mensagem,
        };

        // Verificar se o navegador suporta compartilhar arquivos
        const canShareFiles = navigator.canShare && navigator.canShare({ files: [file] });
        if (canShareFiles) {
          (shareData as ShareData & { files: File[] }).files = [file];
        }

        try {
          await navigator.share(shareData);
          toast.success('Compartilhado com sucesso!');
          return;
        } catch (shareError: unknown) {
          // Se o usuário cancelou o compartilhamento, não mostrar erro
          if (shareError instanceof Error && shareError.name === 'AbortError') {
            return;
          }
          // Se o share falhou por outro motivo, cai no fallback abaixo
          console.warn('Web Share falhou, usando fallback:', shareError);
        }
      }

      // =============================================
      // 2) Fallback: baixar foto + copiar mensagem + abrir grupo
      // =============================================
      // Criar link de download da foto para o usuário salvar
      const fotoUrl = URL.createObjectURL(blob);
      const linkDownload = document.createElement('a');
      linkDownload.href = fotoUrl;
      linkDownload.download = fileName;
      document.body.appendChild(linkDownload);
      linkDownload.click();
      document.body.removeChild(linkDownload);
      // Liberar URL após um momento
      setTimeout(() => URL.revokeObjectURL(fotoUrl), 5000);

      // Copiar mensagem para a área de transferência
      try {
        await navigator.clipboard.writeText(mensagem);
        toast.success('Foto salva e mensagem copiada! O grupo abrirá em seguida. Cole a mensagem e anexe a foto salva.');
      } catch {
        toast.info('Foto salva! O grupo abrirá. Envie a foto e a mensagem manualmente.');
      }

      // Abrir o grupo do WhatsApp com delay para dar tempo do download iniciar
      setTimeout(() => {
        abrirWhatsAppLink(grupoUrl);
      }, 800);
    } catch (error) {
      console.error('Erro ao preparar compartilhamento:', error);
      toast.error('Erro ao compartilhar. Tente novamente.');
    }
  };

  // =============================================
  // Enviar foto da leitura para Telegram (silencioso)
  // =============================================
  const enviarFotoTelegram = async () => {
    if (!maquinaFoto || !fotoCapturada) {
      toast.error('Nenhuma máquina ou foto selecionada');
      return;
    }
    if (!empresa?.id || !clienteSelecionado?.id) {
      toast.error('Empresa ou cliente não selecionado');
      return;
    }
    const telegramGroupId = (clienteSelecionado as any).telegramGroupId;
    if (!telegramGroupId) {
      toast.error('Cliente não possui grupo Telegram cadastrado. Cadastre no formulário do cliente.');
      return;
    }

    toast.loading('Enviando para Telegram...');

    // Montar mensagem
    const now = new Date();
    const dataStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const nomeMaquina = maquinaFoto.tipo?.descricao || maquinaFoto.codigo || 'Máquina';
    let mensagem = `FOTO DA LEITURA\n`;
    mensagem += `━━━━━━━━━━━━━━━━━\n`;
    mensagem += `${maquinaFoto.codigo} - ${nomeMaquina}\n`;
    mensagem += `Data: ${dataStr}\n`;
    mensagem += `Operador: ${usuarioNome}\n`;
    if (leituraExtraida) {
      mensagem += `━━━━━━━━━━━━━━━━━\n`;
      mensagem += `VALORES:\n`;
      mensagem += `${maquinaFoto.tipo?.nomeEntrada || 'E'}: ${leituraExtraida.entrada ?? '-'}\n`;
      mensagem += `${maquinaFoto.tipo?.nomeSaida || 'S'}: ${leituraExtraida.saida ?? '-'}\n`;
    }
    mensagem += `━━━━━━━━━━━━━━━━━\n`;
    mensagem += `Cliente: ${clienteSelecionado?.nome || 'N/A'}`;

    try {
      const res = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresaId: empresa.id,
          clienteId: clienteSelecionado.id,
          mensagem,
          fotos: [fotoCapturada],
        }),
      });
      toast.dismiss();
      const data = await res.json();
      if (data.success) {
        toast.success('Enviado para o Telegram!');
      } else {
        toast.error(data.errorDetail || data.error || 'Erro ao enviar para Telegram', { duration: 8000 });
      }
    } catch (error) {
      toast.dismiss();
      console.error('Erro Telegram:', error);
      toast.error('Erro ao enviar. Verifique a conexão.');
    }
  };

  // Extrair leitura da foto usando IA
  const extrairLeitura = async () => {
    if (!fotoCapturada || !maquinaFoto) {
      toast.error('Nenhuma foto para analisar');
      return;
    }

    setExtraindoLeitura(true);
    try {
      // Usar o MESMO endpoint do lote (processar-lote-foto) que tem melhor taxa de acerto
      // — prompt estruturado (identifica máquina + lê valores) e temperature 0.05
      const token = useAuthStore.getState().token;
      const codigosMaquinas = maquinas.map(m => m.codigo);
      const modelosMap: Record<string, { nomeEntrada: string; nomeSaida: string }> = {};
      maquinas.forEach(m => {
        modelosMap[m.codigo] = {
          nomeEntrada: m.tipo?.nomeEntrada || 'E',
          nomeSaida: m.tipo?.nomeSaida || 'S',
        };
      });

      const res = await fetch('/api/leituras/processar-lote-foto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          imagem: fotoCapturada,
          codigosMaquinas,
          modelosMap,
          empresaId: empresa?.id,
        }),
      });

      const data = await res.json();


      if (!res.ok) {
        throw new Error(data.error || 'Erro ao extrair leitura');
      }

      // Log para debug
      console.log('Dados extraídos:', data);

      // Formatar data atual
      const now = new Date();
      const dataFormatada = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear().toString().slice(-2)} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      // Adicionar tarja vermelha na foto com os dados extraídos
      try {
        const fotoComTarja = await adicionarTarjaNaFoto(
          fotoCapturada,
          dataFormatada,
          usuarioNome,
          data.entrada,
          data.saida,
          fotoOrigem
        );
        setFotoCapturada(fotoComTarja);
        // ⚠️ Armazena em ref para evitar race condition com estado assíncrono
        // aplicarLeituraExtraida() usa fotoComTarjaRef.current em vez de fotoCapturada
        fotoComTarjaRef.current = fotoComTarja;
        console.log('Tarja adicionada com sucesso');
      } catch (error) {
        console.error('Erro ao adicionar tarja na foto:', error);
        // Continua mesmo sem a tarja
        // Fallback: usar foto original (sem tarja) no ref
        fotoComTarjaRef.current = fotoCapturada;
      }

      // Sempre definir os valores extraídos (mesmo que sejam null)
      console.log('Definindo leituraExtraida:', data);
      setLeituraExtraida({
        entrada: data.entrada,
        saida: data.saida,
        confianca: data.confianca || 0,
      });
      console.log('leituraExtraida definido com sucesso');

      // Feedback ao usuário
      if (data.entrada === null && data.saida === null) {
        const obs = data.observacoes ? ` Detalhe: ${data.observacoes}` : '';
        toast.warning(`Não foi possível identificar os valores na foto. Tente outra foto mais clara e certifique-se de que os rótulos "${maquinaFoto?.tipo?.nomeEntrada || 'E'}" e "${maquinaFoto?.tipo?.nomeSaida || 'S'}" estejam visíveis.${obs}`);
      } else if ((data.confianca || 0) < 70) {
        toast.warning(`Leitura com baixa confiança (${data.confianca || 0}%). Verifique os valores.`);
      } else {
        toast.success(`Leitura extraída com ${data.confianca || 0}% de confiança`);
      }

      if (data.observacoes) {
        console.log('Observações:', data.observacoes);
      }

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao extrair leitura';
      toast.error(message);
      console.error('Erro na extração:', error);
    } finally {
      setExtraindoLeitura(false);
    }
  };

  // Aplicar valores extraídos aos campos da máquina
  const aplicarLeituraExtraida = () => {
    if (!maquinaFoto || !leituraExtraida) return;

    const index = maquinas.findIndex(m => m.id === maquinaFoto.id);
    if (index === -1) return;

    const novasMaquinas = [...maquinas];

    // Aplicar valor de entrada se disponível
    if (leituraExtraida.entrada !== null) {
      novasMaquinas[index].novaEntrada = String(leituraExtraida.entrada);
      const entradaAtual = maquinas[index].entradaAtual || 0;
      const novaEntradaNum = leituraExtraida.entrada;
      novasMaquinas[index].diferencaEntrada = novaEntradaNum - entradaAtual;
    }

    // Aplicar valor de saída se disponível
    if (leituraExtraida.saida !== null) {
      novasMaquinas[index].novaSaida = String(leituraExtraida.saida);
      const saidaAtual = maquinas[index].saidaAtual || 0;
      const novaSaidaNum = leituraExtraida.saida;
      novasMaquinas[index].diferencaSaida = novaSaidaNum - saidaAtual;
    }

    // Recalcular saldo da máquina
    novasMaquinas[index].saldoMaquina = calcularValor(
      maquinas[index].moeda,
      novasMaquinas[index].diferencaEntrada - novasMaquinas[index].diferencaSaida
    );

    setMaquinas(novasMaquinas);
    
    // Guardar foto processada (com tarja) diretamente no objeto da máquina
    // ⚠️ Usa fotoComTarjaRef.current (não fotoCapturada) para evitar race condition:
    // setFotoCapturada(fotoComTarja) pode não ter re-renderizado ainda quando o
    // usuário clica em APLICAR VALORES, capturando foto original sem tarja.
    novasMaquinas[index].fotoProcessada = fotoComTarjaRef.current || fotoCapturada || null;
    setMaquinas([...novasMaquinas]);
    
    toast.success('Valores aplicados com sucesso!');
    
    // Fechar modal
    setFotoModalOpen(false);
    setFotoCapturada(null);
    setMaquinaFoto(null);
    setLeituraExtraida(null);
    setFotoOrigem(null);
    // Limpar ref para próxima foto
    fotoComTarjaRef.current = null;
  };

  // (Seção de fotos recebidas via WhatsApp Business removida — integração inativa)

  // ============================================
  // LANÇAMENTO DE LOTE
  // ============================================

  // Função helper para processar arquivo de imagem e adicionar ao lote
  const processarArquivoImagem = (file: File, origem: 'CÂMERA' | 'GALERIA' | 'LOTE' = 'LOTE') => {
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const maxDim = 1280;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h / w) * maxDim); w = maxDim; }
          else { w = Math.round((w / h) * maxDim); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const base64 = canvas.toDataURL('image/jpeg', 0.75);
          setFotosLote(prev => [...prev, {
            id: `lote_${++loteIdCounter.current}_${Date.now()}`,
            imagem: base64,
            status: 'pendente',
            origem: origem,
          }]);
        }
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        console.error('Erro ao carregar imagem:', file.name);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch (err) {
      console.error('Erro ao processar arquivo:', err);
    }
  };

  const processarLote = async () => {
    if (fotosLote.length === 0) return;

    setProcessandoLote(true);
    setLoteProgresso(0);

    // Preparar lista de códigos de máquinas e mapa de nomes E/S
    const codigosMaquinas = maquinas.map(m => m.codigo);
    const modelosMap: Record<string, { nomeEntrada: string; nomeSaida: string }> = {};
    maquinas.forEach(m => {
      modelosMap[m.codigo] = {
        nomeEntrada: m.tipo?.nomeEntrada || 'E',
        nomeSaida: m.tipo?.nomeSaida || 'S',
      };
    });

    // Snapshot das máquinas no momento do processamento
    let maquinasSnapshot = [...maquinas];

    for (let i = 0; i < fotosLote.length; i++) {
      const foto = fotosLote[i];
      if (foto.status !== 'pendente') continue;

      // Marcar como processando
      setFotosLote(prev => prev.map((f, idx) =>
        idx === i ? { ...f, status: 'processando' } : f
      ));

      try {
        // =============================================
        // UNICA CHAMADA: identificar + extrair valores
        // (antes eram 2 chamadas sequenciais)
        // =============================================
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);
        let res: Response;
        try {
          res = await fetch('/api/leituras/processar-lote-foto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${useAuthStore.getState().token}` },
            signal: controller.signal,
            body: JSON.stringify({
              imagem: foto.imagem,
              codigosMaquinas,
              modelosMap,
              empresaId: empresa?.id,
            }),
          });
        } finally {
          clearTimeout(timeoutId);
        }

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Erro ao processar foto');
        }

        if (data.codigoReconhecido) {
          // Máquina identificada e valores extraídos em 1 chamada
          setFotosLote(prev => prev.map((f, idx) =>
            idx === i ? {
              ...f,
              status: 'concluido',
              resultado: {
                codigoMaquina: data.codigoMaquina,
                codigoReconhecido: true,
                entrada: data.entrada,
                saida: data.saida,
                confianca: data.confianca,
                confiancaOCR: data.confiancaOCR || data.confianca,
                observacoes: data.observacoes || '',
              },
            } : f
          ));

          // Aplicar valores nos campos da máquina
          if (data.entrada !== null || data.saida !== null) {
            const indexMaquina = maquinasSnapshot.findIndex(
              m => m.codigo.toUpperCase() === data.codigoMaquina.toUpperCase()
            );

            if (indexMaquina !== -1) {
              const novasMaquinas = [...maquinasSnapshot];
              if (data.entrada !== null) {
                novasMaquinas[indexMaquina].novaEntrada = String(data.entrada);
                const entradaAtual = novasMaquinas[indexMaquina].entradaAtual || 0;
                novasMaquinas[indexMaquina].diferencaEntrada = data.entrada - entradaAtual;
              }
              if (data.saida !== null) {
                novasMaquinas[indexMaquina].novaSaida = String(data.saida);
                const saidaAtual = novasMaquinas[indexMaquina].saidaAtual || 0;
                novasMaquinas[indexMaquina].diferencaSaida = data.saida - saidaAtual;
              }
              novasMaquinas[indexMaquina].saldoMaquina = calcularValor(
                novasMaquinas[indexMaquina].moeda,
                novasMaquinas[indexMaquina].diferencaEntrada - novasMaquinas[indexMaquina].diferencaSaida
              );

              // ⚠️ CORREÇÃO: Guardar foto processada (com tarja vermelha) na máquina
              // Antes estava faltando — causava fotos sem tarja no GCS e no relatório 2a via
              try {
                const nowTs = new Date();
                const dataStrTarja = `${nowTs.getDate().toString().padStart(2, '0')}/${(nowTs.getMonth() + 1).toString().padStart(2, '0')}/${nowTs.getFullYear().toString().slice(-2)} ${nowTs.getHours().toString().padStart(2, '0')}:${nowTs.getMinutes().toString().padStart(2, '0')}`;
                const fotoComTarja = await adicionarTarjaNaFoto(
                  foto.imagem,
                  dataStrTarja,
                  usuarioNome,
                  data.entrada ?? null,
                  data.saida ?? null,
                  foto.origem || 'LOTE'
                );
                novasMaquinas[indexMaquina].fotoProcessada = fotoComTarja;
                console.log(`[Lote] Tarja aplicada à máquina ${data.codigoMaquina}`);
              } catch (err) {
                console.warn(`[Lote] Falha ao aplicar tarja na máquina ${data.codigoMaquina}:`, err);
                // Fallback: usar foto original sem tarja (melhor que null)
                novasMaquinas[indexMaquina].fotoProcessada = foto.imagem;
              }

              maquinasSnapshot = novasMaquinas;
              setMaquinas(novasMaquinas);

              setMaquinasComFotoAplicada(prev => new Map(prev).set(maquinasSnapshot[indexMaquina].id, ''));
            }
          }
        } else {
          // Máquina não reconhecida na lista
          setFotosLote(prev => prev.map((f, idx) =>
            idx === i ? {
              ...f,
              status: 'concluido',
              resultado: {
                codigoMaquina: data.codigoMaquina,
                codigoReconhecido: false,
                confianca: data.confianca,
                observacoes: data.observacoes || data.motivoNaoReconhecido || 'Máquina não encontrada na lista do cliente',
              },
            } : f
          ));
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
        setFotosLote(prev => prev.map((f, idx) =>
          idx === i ? { ...f, status: 'erro', erro: errorMsg } : f
        ));
      }

      setLoteProgresso(i + 1);

      // Delay entre processamentos (reduzido de 5s para 2s pois agora é 1 chamada por foto)
      if (i < fotosLote.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    setProcessandoLote(false);

    // Contar resultados
    const fotosProcessadas = fotosLote.filter(f => f.status === 'concluido' || f.status === 'erro');
    const concluidas = fotosProcessadas.filter(f => f.status === 'concluido' && f.resultado?.codigoReconhecido && (f.resultado.entrada !== null || f.resultado.saida !== null)).length;
    const naoEncontradas = fotosProcessadas.filter(f => f.status === 'concluido' && !f.resultado?.codigoReconhecido).length;
    const erros = fotosProcessadas.filter(f => f.status === 'erro').length;

    if (erros === 0 && naoEncontradas === 0 && concluidas > 0) {
      toast.success(`${concluidas} foto(s) processada(s) com sucesso!`);
    } else if (concluidas > 0) {
      toast.warning(`${concluidas} processada(s), ${naoEncontradas} nao encontrada(s), ${erros} com erro.`);
    } else if (erros > 0) {
      toast.error(`${erros} foto(s) com erro. Tente novamente.`);
    }
  };

  // =============================================
  // ENVIAR LOTE DE FOTOS COM TARJA PARA WHATSAPP
  // Fotos processadas em memoria, sem salvar no banco
  // =============================================
  const enviarLoteWhatsApp = async () => {
    // Verificar pré-requisitos
    const whatsappOriginal = (clienteSelecionado?.whatsapp || '').trim();
    if (!whatsappOriginal) {
      toast.error('Cliente nao possui grupo WhatsApp cadastrado.');
      return;
    }

    const fotosConcluidas = fotosLote.filter(f => f.status === 'concluido' && f.resultado?.codigoReconhecido);
    if (fotosConcluidas.length === 0) {
      toast.error('Nenhuma foto processada com sucesso para enviar.');
      return;
    }

    toast.loading('Preparando fotos com tarja...', { id: 'enviando-lote' });

    try {
      const now = new Date();
      const dataStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;

      // Montar mensagem de resumo
      let mensagem = `LEITURAS EM LOTE\n`;
      mensagem += `${'━'.repeat(20)}\n`;
      mensagem += `Cliente: ${clienteSelecionado?.nome || 'N/A'}\n`;
      mensagem += `Data: ${dataStr}\n`;
      mensagem += `Operador: ${usuarioNome}\n`;
      mensagem += `Fotos: ${fotosConcluidas.length} processada(s)\n`;
      mensagem += `${'━'.repeat(20)}\n`;

      // Adicionar detalhes de cada foto
      fotosConcluidas.forEach((foto, idx) => {
        const r = foto.resultado!;
        const entradaStr = r.entrada !== null && r.entrada !== undefined ? String(r.entrada) : '-';
        const saidaStr = r.saida !== null && r.saida !== undefined ? String(r.saida) : '-';
        mensagem += `${idx + 1}. ${r.codigoMaquina} | E: ${entradaStr} | S: ${saidaStr}\n`;
      });

      // Gerar tarjas nas fotos (em memoria)
      const files: File[] = [];
      for (const foto of fotosConcluidas) {
        const r = foto.resultado!;
        try {
          const fotoComTarja = await adicionarTarjaNaFoto(
            foto.imagem,
            dataStr,
            usuarioNome,
            r.entrada ?? null,
            r.saida ?? null,
            foto.origem || 'LOTE'
          );
          // Converter para File
          const response = await fetch(fotoComTarja);
          const blob = await response.blob();
          const fileName = `leitura_${r.codigoMaquina}_${now.getTime()}.jpg`;
          files.push(new File([blob], fileName, { type: 'image/jpeg' }));
        } catch (err) {
          console.error(`Erro ao adicionar tarja na foto ${r.codigoMaquina}:`, err);
        }
      }

      toast.dismiss('enviando-lote');

      // Montar URL do grupo
      const grupoUrl = whatsappOriginal.includes('chat.whatsapp.com')
        ? whatsappOriginal
        : `https://chat.whatsapp.com/${whatsappOriginal}`;

      // =============================================
      // 1) Web Share API - enviar multiplas fotos
      // =============================================
      if (navigator.share && files.length > 0) {
        const shareData: ShareData = {
          title: `Leituras - ${clienteSelecionado?.nome || 'Lote'}`,
          text: mensagem,
        };

        // Tentar compartilhar com arquivos
        const canShareFiles = navigator.canShare && navigator.canShare({ files });
        if (canShareFiles) {
          (shareData as ShareData & { files: File[] }).files = files;
        }

        try {
          await navigator.share(shareData);
          toast.success(`${files.length} foto(s) enviada(s)!`);
          return;
        } catch (shareError: unknown) {
          if (shareError instanceof Error && shareError.name === 'AbortError') return;
          console.warn('Web Share falhou, usando fallback:', shareError);
        }
      }

      // =============================================
      // 2) Fallback: baixar fotos + copiar mensagem + abrir grupo
      // =============================================
      if (files.length === 1) {
        // 1 foto: baixar direto
        const url = URL.createObjectURL(files[0]);
        const link = document.createElement('a');
        link.href = url;
        link.download = files[0].name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else {
        // Multiplas fotos: baixar uma a uma com delay
        for (let i = 0; i < files.length; i++) {
          const url = URL.createObjectURL(files[i]);
          const link = document.createElement('a');
          link.href = url;
          link.download = files[i].name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          if (i < files.length - 1) await new Promise(r => setTimeout(r, 800));
        }
      }

      try {
        await navigator.clipboard.writeText(mensagem);
        toast.success(`${files.length} foto(s) salva(s) e mensagem copiada! O grupo abrira...`);
      } catch {
        toast.info(`${files.length} foto(s) salva(s)! O grupo abrira. Envie as fotos e a mensagem.`);
      }

      setTimeout(() => abrirWhatsAppLink(grupoUrl), 800);
    } catch (error) {
      toast.dismiss('enviando-lote');
      console.error('Erro ao enviar lote:', error);
      toast.error('Erro ao enviar fotos. Tente novamente.');
    }
  };

  // =============================================
  // PROCESSAMENTO EM BACKGROUND DO LOTE
  // Processa fotos automaticamente conforme sao adicionadas
  // OTIMIZADO: 1 unica chamada de IA (antes eram 2)
  // =============================================
  const processarFotoEmBackground = async (fotoId: string, imagemBase64: string) => {
    const globalController = new AbortController();
    const globalTimeout = setTimeout(() => globalController.abort(), 90000); // 90s (antes 120s, basta 1 chamada agora)

    setFotosLote(prev => prev.map(f =>
      f.id === fotoId ? { ...f, status: 'processando' as const } : f
    ));

    const currentMaquinas = maquinasRef.current;
    const currentEmpresa = empresaRef.current;

    if (!currentMaquinas || currentMaquinas.length === 0) {
      setFotosLote(prev => prev.map(f =>
        f.id === fotoId ? { ...f, status: 'pendente' as const } : f
      ));
      clearTimeout(globalTimeout);
      return;
    }

    const codigosMaquinas = currentMaquinas.map(m => m.codigo);
    const modelosMap: Record<string, { nomeEntrada: string; nomeSaida: string }> = {};
    currentMaquinas.forEach(m => {
      modelosMap[m.codigo] = {
        nomeEntrada: m.tipo?.nomeEntrada || 'E',
        nomeSaida: m.tipo?.nomeSaida || 'S',
      };
    });
    let maquinasSnapshot = [...currentMaquinas];

    console.log(`[Lote] Processando foto ${fotoId} (endpoint unificado)...`);

    try {
      if (globalController.signal.aborted) {
        throw new DOMException('Timeout global de processamento atingido', 'AbortError');
      }

      // UNICA CHAMADA: identificar + extrair
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      globalController.signal.addEventListener(() => controller.abort(), { once: true });
      let res: Response;
      try {
        res = await fetch('/api/leituras/processar-lote-foto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${useAuthStore.getState().token}` },
          signal: controller.signal,
          body: JSON.stringify({
            imagem: imagemBase64,
            codigosMaquinas,
            modelosMap,
            empresaId: currentEmpresa?.id,
          }),
        });
      } finally {
        clearTimeout(timeout);
      }

      let data: any;
      try {
        data = await res.json();
      } catch (jsonErr) {
        throw new Error(`Resposta invalida do servidor: ${jsonErr instanceof Error ? jsonErr.message : 'JSON invalido'}`);
      }
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao processar foto');
      }

      console.log(`[Lote] Foto ${fotoId} processada: ${data.codigoMaquina} (reconhecido: ${data.codigoReconhecido})`);

      if (data.codigoReconhecido) {
        setFotosLote(prev => prev.map(f =>
          f.id === fotoId ? {
            ...f,
            status: 'concluido' as const,
            resultado: {
              codigoMaquina: data.codigoMaquina,
              codigoReconhecido: true,
              entrada: data.entrada,
              saida: data.saida,
              confianca: data.confianca,
              confiancaOCR: data.confiancaOCR || data.confianca,
              observacoes: data.observacoes || '',
            },
          } : f
        ));

        // Aplicar valores nos campos da máquina
        if (data.entrada !== null || data.saida !== null) {
          const indexMaquina = maquinasSnapshot.findIndex(
            m => m.codigo.toUpperCase() === data.codigoMaquina.toUpperCase()
          );
          if (indexMaquina !== -1) {
            const novasMaquinas = [...maquinasSnapshot];
            if (data.entrada !== null) {
              novasMaquinas[indexMaquina].novaEntrada = String(data.entrada);
              novasMaquinas[indexMaquina].diferencaEntrada = data.entrada - (novasMaquinas[indexMaquina].entradaAtual || 0);
            }
            if (data.saida !== null) {
              novasMaquinas[indexMaquina].novaSaida = String(data.saida);
              novasMaquinas[indexMaquina].diferencaSaida = data.saida - (novasMaquinas[indexMaquina].saidaAtual || 0);
            }
            novasMaquinas[indexMaquina].saldoMaquina = calcularValor(
              novasMaquinas[indexMaquina].moeda,
              novasMaquinas[indexMaquina].diferencaEntrada - novasMaquinas[indexMaquina].diferencaSaida
            );
            maquinasSnapshot = novasMaquinas;
            setMaquinas(novasMaquinas);
          }
        }
      } else {
        setFotosLote(prev => prev.map(f =>
          f.id === fotoId ? {
            ...f,
            status: 'concluido' as const,
            resultado: {
              codigoMaquina: data.codigoMaquina,
              codigoReconhecido: false,
              confianca: data.confianca,
              observacoes: data.observacoes || data.motivoNaoReconhecido || 'Máquina não encontrada na lista do cliente',
            },
          } : f
        ));
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error(`[Lote] Erro foto ${fotoId}:`, errorMsg);
      setFotosLote(prev => prev.map(f =>
        f.id === fotoId ? { ...f, status: 'erro' as const, erro: errorMsg } : f
      ));
    } finally {
      clearTimeout(globalTimeout);
    }

    console.log(`[Lote] Foto ${fotoId} finalizada`);
  };

  // Efeito: processar automaticamente fotos pendentes em background
  // Delay de 2s entre fotos (reduzido: agora é 1 chamada IA por foto, antes eram 2)
  const ultimaFotoProcessadaRef = useRef<number>(0);
  const DELAY_ENTRE_FOTOS = 2000; // 2 segundos entre cada processamento

  useEffect(() => {
    const pendentes = fotosLote.filter(f => f.status === 'pendente');
    const processando = fotosLote.some(f => f.status === 'processando');

    if (pendentes.length > 0 && !processando && !processandoEmBackground.current && maquinas.length > 0) {
      const tempoDesdeUltima = Date.now() - ultimaFotoProcessadaRef.current;
      const delayNecessario = Math.max(0, DELAY_ENTRE_FOTOS - tempoDesdeUltima);

      if (delayNecessario > 0) {
        // Aguardar o delay antes de processar a proxima foto
        console.log(`[Lote] Aguardando ${Math.round(delayNecessario / 1000)}s antes de processar proxima foto...`);
        const timer = setTimeout(() => {
          processandoEmBackground.current = true;
          const fotoParaProcessar = pendentes[0];
          processarFotoEmBackground(fotoParaProcessar.id, fotoParaProcessar.imagem)
            .catch(err => console.error('[Lote] Erro inesperado:', err))
            .finally(() => {
              processandoEmBackground.current = false;
              ultimaFotoProcessadaRef.current = Date.now();
            });
        }, delayNecessario);

        return () => clearTimeout(timer);
      } else {
        processandoEmBackground.current = true;
        const fotoParaProcessar = pendentes[0];
        processarFotoEmBackground(fotoParaProcessar.id, fotoParaProcessar.imagem)
          .catch(err => console.error('[Lote] Erro inesperado:', err))
          .finally(() => {
            processandoEmBackground.current = false;
            ultimaFotoProcessadaRef.current = Date.now();
          });
      }
    }
  }, [fotosLote, maquinas]);

  // Funções para tela cheia e zoom
  const handleDuploCliqueFoto = () => {
    if (fotoCapturada) {
      setFotoTelaCheia(true);
      setZoomFoto(1);
    }
  };

  const handleDuploCliqueTelaCheia = () => {
    setFotoTelaCheia(false);
    setZoomFoto(1);
  };

  const aumentarZoom = () => {
    setZoomFoto(prev => Math.min(prev + 0.5, 5));
  };

  const diminuirZoom = () => {
    setZoomFoto(prev => Math.max(prev - 0.5, 0.5));
  };

  const resetarZoom = () => {
    setZoomFoto(1);
  };

  // Função para adicionar tarja vermelha com informações na foto
  const adicionarTarjaNaFoto = (
    imagemBase64: string,
    data: string,
    operador: string,
    entrada: number | null,
    saida: number | null,
    origem: 'CÂMERA' | 'GALERIA' | 'LOTE' | null = null
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Timeout de segurança (10 segundos)
      const timeout = setTimeout(() => {
        reject(new Error('Timeout ao processar imagem'));
      }, 10000);

      const img = new Image();
      
      img.onload = () => {
        try {
          clearTimeout(timeout);
          
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Não foi possível criar contexto do canvas'));
            return;
          }

          // Dimensões da imagem original
          let larguraOriginal = img.width;
          let alturaOriginal = img.height;
          
          // Redimensionar se a imagem for muito grande (max 1920px)
          const maxDimensao = 1920;
          if (larguraOriginal > maxDimensao || alturaOriginal > maxDimensao) {
            const ratio = Math.min(maxDimensao / larguraOriginal, maxDimensao / alturaOriginal);
            larguraOriginal = Math.round(larguraOriginal * ratio);
            alturaOriginal = Math.round(alturaOriginal * ratio);
          }
          
          // Fonte adaptativa: mínimo 20px, máximo 44px
          // Para 720px → 22px | Para 1200px → 37px | Para 1920px → 44px(cap)
          const tamanhoFonteBase = Math.max(20, Math.min(44, Math.round(larguraOriginal / 30)));
          const alturaTarja = Math.round(tamanhoFonteBase * 3.0);
          
          // Nova altura total = imagem + tarja
          canvas.width = larguraOriginal;
          canvas.height = alturaOriginal + alturaTarja;

          // Desenhar a imagem original (redimensionada se necessário)
          if (img.width !== larguraOriginal || img.height !== alturaOriginal) {
            ctx.drawImage(img, 0, 0, larguraOriginal, alturaOriginal);
          } else {
            ctx.drawImage(img, 0, 0);
          }

          // Desenhar tarja vermelha
          ctx.fillStyle = '#dc2626'; // vermelho-600
          ctx.fillRect(0, alturaOriginal, larguraOriginal, alturaTarja);

          // Configurar texto
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';

          // Tamanho da fonte adaptativo à largura da imagem
          const tamanhoFonte = tamanhoFonteBase;
          const padding = Math.max(12, Math.round(larguraOriginal * 0.03));

          // Posições verticais das linhas (centralizadas na tarja)
          const espacamentoEntreLinhas = Math.round(tamanhoFonte * 1.5);
          const inicioTarja = alturaOriginal + alturaTarja / 2;
          const linha1Y = inicioTarja - espacamentoEntreLinhas / 2;
          const linha2Y = inicioTarja + espacamentoEntreLinhas / 2;

          // === DESENHO POR COLUNAS (alinhamento perfeito) ===
          ctx.fillStyle = '#ffffff'; // branco
          const tamanhoFonteCabecalho = Math.round(tamanhoFonte * 1.15); // cabeçalhos 15% maiores
          ctx.font = `bold ${tamanhoFonteCabecalho}px Arial, sans-serif`;

          // Formatar valores
          const usuarioLimitado = operador.substring(0, 8);
          const entradaStr = String(entrada ?? '-');
          const saidaStr = String(saida ?? '-');
          const origemStr = origem || '-';

          // Medir largura de cada texto para posicionar colunas
          const cabecalhos = ['Data Hora          ', 'Operador', 'ENTR', 'SAÍDA', 'Origem'];
          const valores = [data, usuarioLimitado, entradaStr, saidaStr, origemStr];

          // Medir a largura de cada cabeçalho (com fonte maior) e valor (com fonte normal)
          const largurasCab = cabecalhos.map(t => ctx.measureText(t).width);
          ctx.font = `bold ${tamanhoFonte}px Arial, sans-serif`; // fonte normal para valores
          const largurasVal = valores.map(t => ctx.measureText(t).width);

          // Largura da barra separadora " | " (medida com fonte de cabeçalho)
          ctx.font = `bold ${tamanhoFonteCabecalho}px Arial, sans-serif`;
          const sepLargura = ctx.measureText(' | ').width;
          const espacoEntreColunas = tamanhoFonteCabecalho * 0.5; // espaço extra após o separador

          // Calcular largura total ocupada
          let larguraTotal = 0;
          const colunas = cabecalhos.map((cab, i) => {
            const larguraColuna = Math.max(largurasCab[i], largurasVal[i]) + sepLargura;
            const x = padding + larguraTotal;
            larguraTotal += larguraColuna + espacoEntreColunas;
            return { cabecalho: cab, valor: valores[i], x };
          });

          // Se couber na imagem, desenhar com colunas alinhadas
          if (larguraTotal <= larguraOriginal - padding) {
            // Linha 1: Cabeçalhos (fonte maior)
            ctx.font = `bold ${tamanhoFonteCabecalho}px Arial, sans-serif`;
            colunas.forEach(col => {
              ctx.fillText(col.cabecalho, col.x, linha1Y);
            });

            // Linha 2: Valores (fonte normal, mesma posição X dos cabeçalhos)
            ctx.font = `bold ${tamanhoFonte}px Arial, sans-serif`;
            colunas.forEach(col => {
              ctx.fillText(col.valor, col.x, linha2Y);
            });
          } else {
            // Fallback: se não couber, escala a fonte para caber
            const fatorReducao = (larguraOriginal - 2 * padding) / larguraTotal;
            const tamanhoReduzido = Math.max(12, Math.round(tamanhoFonte * fatorReducao));
            ctx.font = `bold ${tamanhoReduzido}px Arial, sans-serif`;

            // Recalcular com fonte menor
            const largurasCabR = cabecalhos.map(t => ctx.measureText(t).width);
            const largurasValR = valores.map(t => ctx.measureText(t).width);
            const sepLarguraR = ctx.measureText(' | ').width;
            const espacoR = tamanhoReduzido * 0.6;

            let larguraTotalR = 0;
            const colunasR = cabecalhos.map((cab, i) => {
              const larguraColuna = Math.max(largurasCabR[i], largurasValR[i]) + sepLarguraR;
              const x = padding + larguraTotalR;
              larguraTotalR += larguraColuna + espacoR;
              return { cabecalho: cab, valor: valores[i], x };
            });

            colunasR.forEach(col => {
              ctx.fillText(col.cabecalho, col.x, linha1Y);
            });
            colunasR.forEach(col => {
              ctx.fillText(col.valor, col.x, linha2Y);
            });
          }

          // Converter para base64 com qualidade reduzida
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } catch (error) {
          clearTimeout(timeout);
          reject(new Error('Erro ao processar canvas: ' + (error instanceof Error ? error.message : 'Erro desconhecido')));
        }
      };

      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Erro ao carregar imagem'));
      };

      img.src = imagemBase64;
    });
  };

  const calcularTotais = () => {
    // No modo AJUSTE, todos os totalizadores ficam zerados
    if (modoOperacao === 'AJUSTE') {
      return { entradas: 0, saidas: 0, quantidade: 0, jogado: 0, cliente: 0, debitoSaldo: 0, totalReceitas: 0, totalDespesas: 0, fechamento: 0, recebido: 0, saldoAtual: 0 };
    }
    const totais = maquinas.reduce((acc, m) => {
      const temSaida = parseInt(m.novaSaida) || 0;
      if (temSaida <= 0) return acc;
      return {
        entradas: acc.entradas + calcularValor(m.moeda, m.diferencaEntrada),
        saidas: acc.saidas + calcularValor(m.moeda, m.diferencaSaida),
        quantidade: acc.quantidade + 1,
      };
    }, { entradas: 0, saidas: 0, quantidade: 0 });

    const jogado = totais.entradas - totais.saidas;
    const acertoPct = clienteSelecionado?.acertoPercentual ?? 50;
    const cliente = jogado * (acertoPct / 100);
    const debitoSaldo = debitosVencidos;
    const totalReceitas = calcularTotalReceitas();
    const totalDespesas = calcularTotalDespesas();
    // Fechamento varia por modo de operacao
    let fechamento: number;
    if (modoOperacao === 'COBRANCA') {
      // Cobranca: jogado - cliente - debitos
      fechamento = jogado - cliente - debitoSaldo;
    } else {
      // Leitura: saídas caixa - entradas caixa
      fechamento = totalDespesas - totalReceitas;
    }

    const recebidoNum = parseFloat(recebido) || 0;
    const saldoAtual = fechamento - recebidoNum;

    return { ...totais, jogado, cliente, debitoSaldo, totalReceitas, totalDespesas, fechamento, recebido: recebidoNum, saldoAtual };
  };

  const formatNumber = (num: number, decimals: number = 2): string => {
    if (isNaN(num)) return '0,00';
    return num.toFixed(decimals).replace('.', ',');
  };

  // Auto-preencher LEITURA com total dos saldos das máquinas (readonly)
  useEffect(() => {
    if (modoOperacao !== 'LEITURA') return;
    const totalSaldo = maquinas.reduce((sum, m) => sum + (m.saldoMaquina || 0), 0);
    setReceitasItens(prev => prev.map(item =>
      item.id === 'leitura' ? { ...item, valor: formatNumber(totalSaldo) } : item
    ));
  }, [maquinas, modoOperacao]);

  const getMoedaLabel = (moeda: string) => {
    const labels: Record<string, string> = {
      M001: 'R$ 0,01',
      M005: 'R$ 0,05',
      M010: 'R$ 0,10',
      M025: 'R$ 0,25',
    };
    return labels[moeda] || 'R$ 0,10';
  };

  const formatNumberNoDecimal = (num: number): string => {
    return Math.round(num).toString();
  };

  const gerarExtrato = () => {
    const maquinasPreenchidas = maquinas.filter(m => m.novaEntrada || m.novaSaida);
    if (maquinasPreenchidas.length === 0) {
      toast.error('Preencha pelo menos uma leitura');
      return;
    }
    setExtratoVisivel(true);
  };

  const imprimirExtrato = () => {
    window.print();
  };

  // =============================================
  // EXTRATO 2a VIA — Buscar fechamentos anteriores
  // =============================================
  const abrirSegundaVia = async () => {
    if (!clienteSelecionado) return;
    setSegundaViaLoading(true);
    setSegundaViaOpen(true);
    setSegundaViaSelecionada(null);
    try {
      const res = await fetch(`/api/leituras/fechamentos-anteriores?clienteId=${clienteSelecionado.id}`);
      if (!res.ok) throw new Error('Erro ao buscar fechamentos');
      const fechamentos: { data: string; dataISO: string; operadores: string; qtdFotos: number }[] = await res.json();
      setFechamentosAnteriores(fechamentos);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao buscar fechamentos');
      setSegundaViaOpen(false);
    } finally {
      setSegundaViaLoading(false);
    }
  };

  const selecionarSegundaVia = async (fechamento: { data: string; dataISO: string }) => {
    if (!clienteSelecionado) return;
    setSegundaViaLoading(true);
    setSegundaViaSelecionada(fechamento);
    try {
      // ⚠️ BUG histórico: dataISO retornado pelo endpoint fechamentos-anteriores
      // é construído em UTC (getUTC* no servidor), mas o frontend interpretava
      // como hora local — causava "Nenhuma leitura encontrada".
      //
      // Solução: tratar tudo como UTC. Montar o range de busca em UTC e comparar
      // os timestamps em milissegundos (sem depender de getHours/getMinutes que
      // usam timezone do browser).
      const isoDate = fechamento.dataISO; // ex: '2026-06-21T17:30:00' (UTC)

      // Timestamp alvo (trata como UTC: anexa 'Z' se não tiver offset)
      const targetIso = isoDate.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(isoDate)
        ? isoDate
        : `${isoDate}Z`;
      const targetMs = new Date(targetIso).getTime();

      // Range: dia inteiro em UTC baseado no dataISO
      const [datePart] = isoDate.split('T');
      const inicioUtc = new Date(`${datePart}T00:00:00Z`);
      const fimUtc = new Date(`${datePart}T23:59:59Z`);

      const res = await fetch(`/api/leituras?clienteId=${clienteSelecionado.id}&dataInicio=${inicioUtc.toISOString()}&dataFim=${fimUtc.toISOString()}`);
      if (!res.ok) throw new Error('Erro ao carregar leituras');
      const leituras: any[] = await res.json();

      // Filtrar para o mesmo horário (±5 min) — comparando em MS (timezone-agnostic)
      const JANELA_MS = 5 * 60 * 1000; // 5 minutos
      const filtradas = leituras.filter((l: any) => {
        if (!l.dataLeitura) return false;
        const leituraMs = new Date(l.dataLeitura).getTime();
        return Math.abs(leituraMs - targetMs) <= JANELA_MS;
      });

      setSegundaViaDados(filtradas);
      setSegundaViaExtratoOpen(true);

      // Pré-carregar fotos do GCS (para exibir miniaturas no modo RELATÓRIO)
      // Apenas se houver leituras com fotoGcsPath
      const gcsPathsUnicosPre = new Set<string>();
      filtradas.forEach((l: any) => {
        if (l.fotoGcsPath) gcsPathsUnicosPre.add(l.fotoGcsPath);
      });
      if (gcsPathsUnicosPre.size > 0) {
        setSegundaViaFotos([]); // limpa anterior
        const token = useAuthStore.getState().token;
        const fotosColetadas: Array<{ maquinaId: string; codigo: string; fotoBase64: string }> = [];
        for (const gcsPath of gcsPathsUnicosPre) {
          try {
            const fotoRes = await fetch(`/api/leituras/download-fotos?gcsPath=${encodeURIComponent(gcsPath)}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (fotoRes.ok) {
              const fotoData = await fotoRes.json();
              if (fotoData.fotos && Array.isArray(fotoData.fotos)) {
                fotoData.fotos.forEach((f: any) => {
                  if (f.fotoBase64) {
                    const dataUrl = f.fotoBase64.startsWith('data:')
                      ? f.fotoBase64
                      : `data:image/jpeg;base64,${f.fotoBase64}`;
                    fotosColetadas.push({
                      maquinaId: f.maquinaId || '',
                      codigo: f.codigo || '',
                      fotoBase64: dataUrl,
                    });
                  }
                });
              }
            }
          } catch (e) { console.warn('Erro ao pré-carregar fotos 2a via:', e); }
        }
        setSegundaViaFotos(fotosColetadas);
        console.log('[2a via] Fotos pré-carregadas para relatório:', fotosColetadas.length);
      } else {
        setSegundaViaFotos([]);
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar fechamento');
    } finally {
      setSegundaViaLoading(false);
    }
  };

  const gerarWhatsAppSegundaVia = async () => {
    if (!clienteSelecionado || segundaViaDados.length === 0) return;
    const fmt = (n: number) => Math.abs(n).toFixed(2).replace('.', ',');

    const modo2via = clienteSelecionado?.formaCobranca === 'COBRANCA' ? 'COBRANCA' : 'LEITURA';

    // Agrupar por máquina e extrair receitas/despesas
    const porMaquina = new Map<string, any[]>();
    const despesaItens: { descricao: string; valor: number }[] = [];
    const receitaItens: { descricao: string; valor: number }[] = [];

    segundaViaDados.forEach((l: any) => {
      const temLeitura = l.entradaNova > 0 || l.saidaNova > 0 || l.diferencaEntrada !== 0 || l.diferencaSaida !== 0;
      if (temLeitura) {
        if (!porMaquina.has(l.maquinaId)) porMaquina.set(l.maquinaId, []);
        porMaquina.get(l.maquinaId)!.push(l);
      }
      if (l.despesa) { try { const p = JSON.parse(l.despesa); if (Array.isArray(p)) p.forEach((d: any) => { if (d.valor > 0) despesaItens.push(d); }); } catch {} }
      if (l.caixa) { try { const p = JSON.parse(l.caixa); if (Array.isArray(p)) p.forEach((r: any) => { if (r.valor > 0) receitaItens.push(r); }); } catch {} }
    });

    const despesasFinal = Array.from(new Map(despesaItens.map(d => [d.descricao, d])).values());
    const receitasFinal = Array.from(new Map(receitaItens.map(r => [r.descricao, r])).values());

    let texto = `__________________\n`;
    texto += `${clienteSelecionado.nome.toUpperCase()}\n`;
    texto += `Data: ${segundaViaSelecionada?.data}\n`;
    const operadoresSet = new Set(segundaViaDados.filter((l: any) => l.usuario?.nome).map((l: any) => l.usuario.nome));
    const opList = Array.from(operadoresSet);
    if (opList.length > 0) texto += `Operador(es): ${opList.join(', ')}\n`;
    const qtdFotos2via = segundaViaDados.filter((l: any) => l.fotoGcsPath).length;
    if (qtdFotos2via > 0) texto += `Fotos: ${qtdFotos2via} leitura${qtdFotos2via === 1 ? '' : 's'} com registro\n`;
    texto += `_____________\n`;

    let totalEntradas = 0;
    let totalSaidas = 0;
    let idx = 0;
    porMaquina.forEach((lws) => {
      const m = lws[0].maquina;
      if (idx > 0) texto += `_____________\n`;
      texto += `${m.codigo} - ${(m.tipo?.descricao || '').toUpperCase()}\n`;
      if (lws[0].usuario?.nome) texto += `Operador: ${lws[0].usuario.nome}\n`;
      lws.forEach((l: any) => {
        const e = calcularValor(l.moeda, l.diferencaEntrada);
        const s = calcularValor(l.moeda, l.diferencaSaida);
        totalEntradas += e;
        totalSaidas += s;
        texto += `E ${String(l.entradaAnterior || 0).padStart(8)} ${String(l.entradaNova || 0).padStart(8)}___${fmt(e)}\n`;
        texto += `S ${String(l.saidaAnterior || 0).padStart(8)} ${String(l.saidaNova || 0).padStart(8)}___${fmt(s)}\n`;
        texto += `Saldo: ${fmt(l.saldo)}\n`;
      });
      idx++;
    });

    texto += `_____________\n`;
    texto += `Qtde Maqs....: ${String(porMaquina.size).padStart(2, '0')}\n`;
    texto += `Entradas.....: ${fmt(totalEntradas)}\n`;
    texto += `Saídas.......: ${fmt(totalSaidas)}\n`;

    const jogado = totalEntradas - totalSaidas;
    const acertoPct = clienteSelecionado?.acertoPercentual ?? 50;
    if (modo2via === 'COBRANCA') {
      texto += `*Jogado*.....: ${fmt(jogado)}\n`;
      texto += `Cliente (${acertoPct}%): ${fmt(jogado * (acertoPct / 100))}\n`;
    }
    texto += `_____________\n`;

    const totalReceitas = receitasFinal.reduce((a, r) => a + r.valor, 0);
    const totalDespesas = despesasFinal.reduce((a, d) => a + d.valor, 0);

    if (modo2via !== 'COBRANCA' && receitasFinal.length > 0) {
      texto += `_____________\n`;
      receitasFinal.forEach(r => { texto += `  ${r.descricao.padEnd(15)}: ${fmt(r.valor)}\n`; });
      texto += `Total ENTRADAS: ${fmt(totalReceitas)}\n`;
      texto += `_____________\n`;
    }
    if (modo2via !== 'COBRANCA' && despesasFinal.length > 0) {
      despesasFinal.forEach(d => { texto += `  ${d.descricao.padEnd(15)}: ${fmt(d.valor)}\n`; });
      texto += `Total SAÍDAS: ${fmt(totalDespesas)}\n`;
      texto += `_____________\n`;
    }

    const temItensExtras = totalReceitas > 0 || totalDespesas > 0;
    const entradaFinal = modo2via === 'COBRANCA' ? jogado : (temItensExtras ? totalReceitas : jogado);
    const saidaFinal = temItensExtras ? totalDespesas : 0;
    const fechamentoFinal = temItensExtras ? saidaFinal - entradaFinal : entradaFinal;
    const labelFech = modo2via === 'COBRANCA' ? 'TOTALIZAÇÃO' : 'FECHAMENTO';
    const tagFinal = Math.abs(fechamentoFinal) < 0.01 ? '[fechou]' : fechamentoFinal >= 0 ? '[sobrou]' : '[faltou]';

    if (modo2via !== 'COBRANCA') {
      texto += `_____________\n`;
      texto += `ENTRADA......: ${fmt(entradaFinal)}\n`;
      texto += `SAÍDA........: ${fmt(saidaFinal)}\n`;
      texto += `${labelFech}.....: ${fmt(fechamentoFinal)} ${tagFinal}\n`;
    }

    // 2a via: enviar SOMENTE o extrato em texto via WhatsApp (sem fotos)
    const phone = clienteSelecionado.telefone?.replace(/\D/g, '') || '';
    await enviarWhatsAppTextoSeguro(texto, phone);
  };

  // =============================================
  // Helper: criar PDF a partir de imagem JPEG (data URL)
  // WhatsApp trata PDFs como documentos (sem compressão), permitindo zoom total.
  // Estrutura: PDF minimal com 1 página contendo a imagem JPEG via DCTDecode.
  // =============================================
  const criarPdfDeImagem = async (jpegDataUrl: string): Promise<Blob> => {
    // Extrair base64 e decodificar para Uint8Array
    const base64 = jpegDataUrl.split(',')[1];
    const binaryString = atob(base64);
    const jpegBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      jpegBytes[i] = binaryString.charCodeAt(i);
    }

    // Obter dimensões REAIS da imagem via Image element
    const img = new Image();
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = jpegDataUrl;
    });
    const pageWidth = img.naturalWidth || 1588;
    const pageHeight = img.naturalHeight || 2246;

    // Construir PDF minimal
    // Estrutura: header + 5 objects + xref + trailer
    const encoder = new TextEncoder();
    const parts: Uint8Array[] = [];
    const offsets: number[] = [];
    let currentOffset = 0;

    const pushStr = (s: string) => {
      const bytes = encoder.encode(s);
      parts.push(bytes);
      currentOffset += bytes.length;
    };

    const pushBytes = (b: Uint8Array) => {
      parts.push(b);
      currentOffset += b.length;
    };

    // Header
    pushStr('%PDF-1.4\n');

    // Object 1: Catalog
    offsets[1] = currentOffset;
    pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // Object 2: Pages
    offsets[2] = currentOffset;
    pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

    // Object 3: Page
    offsets[3] = currentOffset;
    pushStr(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);

    // Object 4: Image (JPEG via DCTDecode)
    offsets[4] = currentOffset;
    pushStr(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pageWidth} /Height ${pageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
    pushBytes(jpegBytes);
    pushStr('\nendstream\nendobj\n');

    // Object 5: Content stream (desenha a imagem na página)
    const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im1 Do\nQ\n`;
    offsets[5] = currentOffset;
    pushStr(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

    // Cross-reference table
    const xrefOffset = currentOffset;
    let xref = 'xref\n0 6\n0000000000 65535 f \n';
    for (let i = 1; i <= 5; i++) {
      xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pushStr(xref);

    // Trailer
    pushStr(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

    // Concatenar todas as partes
    const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
    const pdfBytes = new Uint8Array(totalLength);
    let pos = 0;
    for (const part of parts) {
      pdfBytes.set(part, pos);
      pos += part.length;
    }

    return new Blob([pdfBytes], { type: 'application/pdf' });
  };

  // =============================================
  // Helper: criar PDF com MÚLTIPLAS páginas a partir de array de JPEGs
  // Cada JPEG vira uma página do PDF com suas DIMENSÕES REAIS (não hardcoded).
  // Retorna Blob PDF único.
  // =============================================
  const criarPdfMultiplo = async (jpegDataUrls: string[]): Promise<Blob> => {
    if (jpegDataUrls.length === 0) {
      return new Blob([], { type: 'application/pdf' });
    }
    if (jpegDataUrls.length === 1) {
      return criarPdfDeImagem(jpegDataUrls[0]);
    }

    // Pré-carregar todas as imagens para obter dimensões reais (width/height)
    const dimensoes: Array<{ width: number; height: number; bytes: Uint8Array }> = [];
    for (let p = 0; p < jpegDataUrls.length; p++) {
      // Decodificar JPEG bytes
      const base64 = jpegDataUrls[p].split(',')[1];
      const binaryString = atob(base64);
      const jpegBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        jpegBytes[i] = binaryString.charCodeAt(i);
      }

      // Obter dimensões reais da imagem via Image element
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = jpegDataUrls[p];
      });
      const width = img.naturalWidth || 1588;
      const height = img.naturalHeight || 2246;
      dimensoes.push({ width, height, bytes: jpegBytes });
      console.log(`[PDF] Página ${p + 1}: ${width}x${height} px, ${jpegBytes.length} bytes`);
    }

    const encoder = new TextEncoder();
    const parts: Uint8Array[] = [];
    const offsets: number[] = [];
    let currentOffset = 0;

    const pushStr = (s: string) => {
      const bytes = encoder.encode(s);
      parts.push(bytes);
      currentOffset += bytes.length;
    };
    const pushBytes = (b: Uint8Array) => {
      parts.push(b);
      currentOffset += b.length;
    };

    const numPages = dimensoes.length;
    const totalObjects = 2 + numPages * 3;

    // Header
    pushStr('%PDF-1.4\n');

    // Object 1: Catalog
    offsets[1] = currentOffset;
    pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // Object 2: Pages
    const kids: string[] = [];
    for (let p = 0; p < numPages; p++) {
      kids.push(`${3 + p * 3} 0 R`);
    }
    offsets[2] = currentOffset;
    pushStr(`2 0 obj\n<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${numPages} >>\nendobj\n`);

    // Para cada página: Page + Image + Content (com dimensões REAIS)
    for (let p = 0; p < numPages; p++) {
      const pageObjNum = 3 + p * 3;
      const imageObjNum = 4 + p * 3;
      const contentObjNum = 5 + p * 3;
      const { width: imgW, height: imgH, bytes: jpegBytes } = dimensoes[p];

      // Page object — MediaBox com dimensões REAIS da imagem
      offsets[pageObjNum] = currentOffset;
      pushStr(`${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${imgW} ${imgH}] /Resources << /XObject << /Im${p + 1} ${imageObjNum} 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj\n`);

      // Image object — Width e Height REAIS
      offsets[imageObjNum] = currentOffset;
      pushStr(`${imageObjNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
      pushBytes(jpegBytes);
      pushStr('\nendstream\nendobj\n');

      // Content stream — escala com dimensões REAIS
      const content = `q\n${imgW} 0 0 ${imgH} 0 0 cm\n/Im${p + 1} Do\nQ\n`;
      offsets[contentObjNum] = currentOffset;
      pushStr(`${contentObjNum} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);
    }

    // Cross-reference table
    const xrefOffset = currentOffset;
    let xref = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= totalObjects; i++) {
      xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pushStr(xref);

    // Trailer
    pushStr(`trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

    // Concatenar
    const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
    const pdfBytes = new Uint8Array(totalLength);
    let pos = 0;
    for (const part of parts) {
      pdfBytes.set(part, pos);
      pos += part.length;
    }

    return new Blob([pdfBytes], { type: 'application/pdf' });
  };

  // 2a via: enviar RELATÓRIO via WhatsApp como PDF único (todas as páginas em 1 arquivo)
  const enviarWhatsAppRelatorio2aVia = async () => {
    if (!clienteSelecionado || segundaViaDados.length === 0) {
      toast.error('Nenhum dado de fechamento para gerar relatório');
      return;
    }

    toast.loading('Gerando PDF do relatório...', { id: 'relatorio-wa-2via' });

    try {
      // 1) Gerar PDF (cópia exata do canvas da visualização, sem paginação)
      const pdfBlob = await gerarRelatorioPdf2aVia();
      if (!pdfBlob) {
        toast.dismiss('relatorio-wa-2via');
        toast.error('Falha ao gerar relatório');
        return;
      }

      const now = new Date();
      const fileName = `relatorio_${clienteSelecionado.nome.replace(/\s+/g, '_')}_${now.getTime()}.pdf`;
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      console.log(`[WhatsApp 2a via] PDF criado: ${file.size} bytes`);

      // 3) Caption
      const modo2via = clienteSelecionado?.formaCobranca === 'COBRANCA' ? 'COBRANÇA' : 'LEITURA';
      const caption = `RELATÓRIO DE ${modo2via} - ${clienteSelecionado.nome.toUpperCase()}\nData: ${segundaViaSelecionada?.data || ''}`;

      // 4) Web Share API com o PDF (funciona em mobile)
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            title: `Relatório - ${clienteSelecionado.nome}`,
            text: caption,
            files: [file],
          });
          toast.dismiss('relatorio-wa-2via');
          toast.success('PDF do relatório enviado!');
          return;
        } catch (shareError: unknown) {
          if (shareError instanceof Error && shareError.name === 'AbortError') {
            toast.dismiss('relatorio-wa-2via');
            return;
          }
        }
      }

      // 5) Fallback: download do PDF + abrir WhatsApp
      toast.dismiss('relatorio-wa-2via');
      const whatsappOriginal = (clienteSelecionado?.whatsapp || '').trim();
      const phone = clienteSelecionado.telefone?.replace(/\D/g, '') || '';

      const downloadLink = document.createElement('a');
      downloadLink.href = URL.createObjectURL(file);
      downloadLink.download = fileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      if (whatsappOriginal && whatsappOriginal.includes('chat.whatsapp.com')) {
        const grupoUrl = whatsappOriginal.startsWith('http') ? whatsappOriginal : `https://chat.whatsapp.com/${whatsappOriginal}`;
        setTimeout(() => abrirWhatsAppLink(grupoUrl), 500);
        toast.info('PDF baixado! Anexe como documento no grupo do WhatsApp.');
      } else if (phone) {
        setTimeout(() => abrirWhatsAppLink(`https://wa.me/55${phone}`), 500);
        toast.info('PDF baixado! Anexe como documento no WhatsApp do cliente.');
      } else {
        toast.success('PDF baixado! Compartilhe manualmente.');
      }
    } catch (error) {
      toast.dismiss('relatorio-wa-2via');
      console.error('Erro ao gerar/enviar relatório WhatsApp:', error);
      toast.error('Erro ao gerar relatório');
    }
  };

  // Comprimir imagem via canvas (reduz tamanho para envio via WhatsApp)
  const comprimirImagem = (blob: Blob, maxPx = 1200, qualidade = 0.7): Promise<Blob> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          if (width > height) { height = Math.round(height * maxPx / width); width = maxPx; }
          else { width = Math.round(width * maxPx / height); height = maxPx; }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        canvas.toBlob((b) => resolve(b || blob), 'image/jpeg', qualidade);
      };
      img.onerror = () => resolve(blob); // fallback sem compressão
      img.src = URL.createObjectURL(blob);
    });
  };

  // 2a via: enviar extrato + fotos via Telegram
  const enviarTelegram2aVia = async () => {
    if (!clienteSelecionado || segundaViaDados.length === 0) return;
    const telegramGroupId = (clienteSelecionado as any).telegramGroupId;
    if (!telegramGroupId) {
      toast.error('Cliente não possui grupo Telegram cadastrado. Cadastre no formulário do cliente.');
      return;
    }
    try {
      toast.loading('Gerando PDF do relatório...', { id: 'telegram-2via' });

      // Helper: parse JSON robusto
      const parseJsonSafe = async (res: Response) => {
        try { return await res.json(); }
        catch { const text = await res.text().catch(() => ''); return { success: false, error: `HTTP ${res.status}: ${text.substring(0, 200) || res.statusText}` }; }
      };

      if (segundaViaModo === 'RELATORIO') {
        // === MODO RELATÓRIO: gerar UM PDF (cópia exata do canvas, sem paginação) ===
        const pdfBlob = await gerarRelatorioPdf2aVia();
        if (!pdfBlob) {
          toast.dismiss('telegram-2via');
          toast.error('Falha ao gerar relatório');
          return;
        }

        // Converter Blob para data URL
        const reader = new FileReader();
        const pdfDataUrl = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(pdfBlob);
        });
        console.log(`[Telegram 2a via] PDF criado: ${pdfDataUrl.length} chars`);

        // Enviar PDF como documento (sem compressão)
        const res = await fetch('/api/telegram/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            empresaId: empresa?.id,
            clienteId: clienteSelecionado?.id,
            mensagem: null,
            fotos: [pdfDataUrl],
            primeiraFotoComoDocumento: true,
          }),
        });
        const data = await parseJsonSafe(res);
        toast.dismiss('telegram-2via');
        if (res.ok && data.success) {
          toast.success('PDF do relatório enviado!');
        } else {
          toast.error(data.errorDetail || data.error || 'Erro ao enviar PDF', { duration: 10000 });
        }
      } else {
        // === MODO EXTRATO: enviar imagem do extrato + fotos das máquinas ===
        const extratoImagem = await gerarExtratoImagemSegundaVia();

        // Buscar fotos do GCS
        const fotos: string[] = [];
        const gcsPathsUnicos = new Set<string>();
        segundaViaDados.forEach((l: any) => { if (l.fotoGcsPath) gcsPathsUnicos.add(l.fotoGcsPath); });
        const token = useAuthStore.getState().token;
        for (const gcsPath of gcsPathsUnicos) {
          try {
            const fotoRes = await fetch(`/api/leituras/download-fotos?gcsPath=${encodeURIComponent(gcsPath)}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (fotoRes.ok) {
              const fotoData = await fotoRes.json();
              if (fotoData.fotos && Array.isArray(fotoData.fotos)) {
                fotoData.fotos.forEach((f: any) => {
                  if (f.fotoBase64) {
                    fotos.push(f.fotoBase64.startsWith('data:') ? f.fotoBase64 : `data:image/jpeg;base64,${f.fotoBase64}`);
                  }
                });
              }
            }
          } catch (e) { console.warn('Erro ao buscar fotos 2a via:', e); }
        }

        const fotosEnvio: string[] = [];
        if (extratoImagem) fotosEnvio.push(extratoImagem);
        fotosEnvio.push(...fotos);

        const res = await fetch('/api/telegram/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            empresaId: empresa?.id,
            clienteId: clienteSelecionado?.id,
            mensagem: null,
            fotos: fotosEnvio,
            primeiraFotoComoDocumento: false,
          }),
        });
        const data = await parseJsonSafe(res);
        toast.dismiss('telegram-2via');
        if (res.ok && data.success) {
          toast.success(`Extrato + ${fotos.length} foto(s) enviados!`);
        } else {
          toast.error(data.errorDetail || data.error || 'Erro ao enviar para Telegram', { duration: 10000 });
        }
      }
    } catch (error) {
      toast.dismiss('telegram-2via');
      const errMsg = error instanceof Error ? error.message : 'Erro ao enviar para Telegram';
      console.error('Erro Telegram 2a via:', error);
      toast.error(errMsg, { duration: 8000 });
    }
  };

  // 2a via: enviar SOMENTE as fotos via Web Share (sem texto)
  const enviarFotos2aVia = async () => {
    try {
      toast.loading('Preparando fotos...', { id: 'fotos-2via' });
      const fotosProcessadas: File[] = [];
      const gcsPath = segundaViaDados.find((l: any) => l.fotoGcsPath)?.fotoGcsPath;
      if (gcsPath) {
        try {
          const token = useAuthStore.getState().token;
          const fotoRes = await fetch(`/api/leituras/download-fotos?gcsPath=${encodeURIComponent(gcsPath)}`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (fotoRes.ok) {
            const fotoData = await fotoRes.json();
            if (fotoData.fotos && Array.isArray(fotoData.fotos)) {
              for (const f of fotoData.fotos) {
                try {
                  const b64 = f.fotoBase64 || '';
                  let blob: Blob;
                  if (b64.startsWith('data:')) {
                    const [header, data] = b64.split(',');
                    const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
                    const binary = atob(data);
                    const arr = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
                    blob = new Blob([arr], { type: mime });
                  } else {
                    const binary = atob(b64);
                    const arr = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
                    blob = new Blob([arr], { type: 'image/jpeg' });
                  }
                  // Comprimir para envio (1200px max, 70% qualidade)
                  const comprimida = await comprimirImagem(blob, 1200, 0.7);
                  fotosProcessadas.push(new File([comprimida], `leitura_2via_${f.codigo}_${Date.now()}.jpg`, { type: 'image/jpeg' }));
                } catch (err) {
                  console.error(`Erro ao processar foto da máquina ${f.codigo}:`, err);
                }
              }
            }
          }
        } catch (err) {
          console.error('Erro ao baixar fotos do GCS:', err);
          toast.error('Erro ao baixar fotos do servidor.', { id: 'fotos-2via' });
          return;
        }
      }

      toast.dismiss('fotos-2via');

      if (fotosProcessadas.length === 0) {
        toast.info('Nenhuma foto disponível para este fechamento.');
        return;
      }

      if (navigator.share && navigator.canShare && navigator.canShare({ files: fotosProcessadas })) {
        const shareData: ShareData = {
          title: `Fotos Leitura - ${clienteSelecionado?.nome}`,
        };
        (shareData as ShareData & { files: File[] }).files = fotosProcessadas;
        await navigator.share(shareData);
        toast.success('Fotos enviadas!');
      } else {
        toast.error('Seu navegador não suporta compartilhar arquivos. Tente pelo Chrome/Edge.');
      }
    } catch (shareError: unknown) {
      if (shareError instanceof Error && shareError.name === 'AbortError') return;
      console.error('Erro ao enviar fotos 2a via:', shareError);
      toast.error('Erro ao enviar fotos. Tente novamente.');
    }
  };

  // =============================================
  // LOCALSTORAGE — Salvar/Carregar/Limpar digitação
  // =============================================
  const LS_KEY = (modo: string, clienteId: string) => `cf-digitacao-${modo}-${clienteId}`;

  const salvarDigitacaoLS = useCallback(() => {
    if (!clienteSelecionado) return;
    // NAO salvar se nao ha nada digitado (evita sobrescrever dados reais com vazio)
    const temAlgo = maquinas.some(m => m.novaEntrada || m.novaSaida) || receitasItens.some(d => (parseFloat(d.valor?.replace(',', '.') || '0')) > 0) || despesasItens.some(d => (parseFloat(d.valor?.replace(',', '.') || '0')) > 0);
    if (!temAlgo) return;
    try {
      const dados = {
        maquinas: maquinas.map(m => ({
          id: m.id,
          novaEntrada: m.novaEntrada,
          novaSaida: m.novaSaida,
          diferencaEntrada: m.diferencaEntrada,
          diferencaSaida: m.diferencaSaida,
          saldoMaquina: m.saldoMaquina,
          fotoProcessada: m.fotoProcessada,
        })),
        receitasItens,
        despesasItens,
        modoOperacao,
        recebido,
        formaPagamento,
        valorPago,
        saldoAnterior,
      };
      localStorage.setItem(LS_KEY(modoOperacao, clienteSelecionado.id), JSON.stringify(dados));
    } catch {
      // localStorage cheio ou indisponivel — silencioso
    }
  }, [clienteSelecionado, maquinas, receitasItens, despesasItens, modoOperacao, recebido, formaPagamento, valorPago, saldoAnterior]);

  const carregarDigitacaoLS = useCallback(() => {
    if (!clienteSelecionado) return false;
    try {
      const raw = localStorage.getItem(LS_KEY(modoOperacao, clienteSelecionado.id));
      if (!raw) return false;
      const dados = JSON.parse(raw);
      let restaurou = false;
      // Restaurar maquinas — mesclar com dados atuais
      if (dados.maquinas && Array.isArray(dados.maquinas)) {
        setMaquinas(prev => prev.map(m => {
          const s = dados.maquinas.find((sv: any) => sv.id === m.id);
          if (!s) return m;
          restaurou = true;
          return {
            ...m,
            novaEntrada: s.novaEntrada || '',
            novaSaida: s.novaSaida || '',
            diferencaEntrada: s.diferencaEntrada || 0,
            diferencaSaida: s.diferencaSaida || 0,
            saldoMaquina: s.saldoMaquina || 0,
            fotoProcessada: s.fotoProcessada || null,
          };
        }));
      }
      if (dados.receitasItens) { setReceitasItens(dados.receitasItens); restaurou = true; }
      if (dados.despesasItens) { setDespesasItens(dados.despesasItens); restaurou = true; }
      if (dados.recebido !== undefined) { setRecebido(dados.recebido); restaurou = true; }
      if (dados.formaPagamento !== undefined) { setFormaPagamento(dados.formaPagamento); restaurou = true; }
      if (dados.valorPago !== undefined) { setValorPago(dados.valorPago); restaurou = true; }
      if (dados.saldoAnterior !== undefined) { setSaldoAnterior(dados.saldoAnterior); restaurou = true; }
      return restaurou;
    } catch {
      return false;
    }
  }, [clienteSelecionado, modoOperacao]);

  const limparDigitacaoLS = useCallback((modo?: string, clienteId?: string) => {
    try {
      const modos = modo ? [modo] : ['COBRANCA', 'LEITURA', 'AJUSTE'];
      const id = clienteId || clienteSelecionado?.id;
      if (!id) return;
      modos.forEach(m => localStorage.removeItem(LS_KEY(m, id)));
    } catch {
      // silencioso
    }
  }, [clienteSelecionado]);

  // Auto-salvar no localStorage a cada mudança de estado (so se ha dados)
  useEffect(() => {
    if (clienteSelecionado && !saving && !resumoModalOpen) {
      salvarDigitacaoLS();
    }
  }, [maquinas, receitasItens, despesasItens, recebido, formaPagamento, valorPago, clienteSelecionado, saving, resumoModalOpen, salvarDigitacaoLS]);

  // Salvar ao fechar aba/página (beforeunload)
  useEffect(() => {
    const handler = () => { salvarDigitacaoLS(); };
    window.addEventListener('beforeunload', handler);
    // Também salvar quando visibility muda para hidden (PWA em background)
    const visHandler = () => {
      if (document.visibilityState === 'hidden') salvarDigitacaoLS();
    };
    document.addEventListener('visibilitychange', visHandler);
    return () => {
      window.removeEventListener('beforeunload', handler);
      document.removeEventListener('visibilitychange', visHandler);
    };
  }, [salvarDigitacaoLS]);

  const cancelarDigitacao = () => {
    if (!clienteSelecionado) return;
    restoreDoneRef.current = '';
    // Limpar estado local antes do reload
    setMaquinas(prev => prev.map(m => ({ ...m, novaEntrada: '', novaSaida: '', diferencaEntrada: 0, diferencaSaida: 0, saldoMaquina: 0, fotoProcessada: null })));
    setExtratoVisivel(false);
    setRecebido('');
    setFormaPagamento(null);
    setValorPago('');
    resetReceitas();
    resetDespesas();
    setMaquinasAlteradas(new Map());
    limparDigitacaoLS();
    loadMaquinasCliente(clienteSelecionado.id, undefined, true); // skipRestore=true
    toast.info('Digitacao cancelada e campos limpos');
  };

  const salvarLeituras = async () => {
    const maquinasPreenchidas = maquinas.filter(m => m.novaEntrada || m.novaSaida);
    
    // Verificar se há valor de receita e despesa preenchido
    const totalRec = calcularTotalReceitas();
    const totalDesp = calcularTotalDespesas();
    const temReceita = totalRec > 0;
    const temDespesa = totalDesp > 0;
    // Coletar itens com valor > 0 para salvar
    const receitasParaSalvar = receitasItens
      .filter(d => (parseFloat(d.valor.replace(',', '.')) || 0) > 0)
      .map(d => ({ descricao: d.descricao || 'OUTROS', valor: parseFloat(d.valor.replace(',', '.')) || 0 }));
    const despesasParaSalvar = despesasItens
      .filter(d => (parseFloat(d.valor.replace(',', '.')) || 0) > 0)
      .map(d => ({ descricao: d.descricao || 'OUTROS', valor: parseFloat(d.valor.replace(',', '.')) || 0 }));

    if (maquinasPreenchidas.length === 0 && !temReceita && !temDespesa) {
      toast.error('Nenhuma leitura ou despesa para salvar');
      return;
    }

    if (!clienteSelecionado) {
      toast.error('Selecione um cliente');
      return;
    }

    setSaving(true);
    // Coletar fotos processadas das máquinas preenchidas
    const fotosParaUpload = maquinasPreenchidas
      .filter(m => m.fotoProcessada)
      .map(m => ({
        maquinaId: m.id,
        codigo: m.codigo || '',
        fotoBase64: m.fotoProcessada as string,
      }));

    let fotoGcsPath: string | null = null;

    // Upload das fotos ao GCS (criptografado) — antes de salvar leitura
    if (fotosParaUpload.length > 0) {
      try {
        const token = useAuthStore.getState().token;
        const fotoRes = await fetch('/api/leituras/upload-fotos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            fotos: fotosParaUpload,
            empresaId: empresaId,
            clienteId: clienteSelecionado.id,
          }),
        });
        if (fotoRes.ok) {
          const fotoData = await fotoRes.json();
          fotoGcsPath = fotoData.gcsPath;
          console.log(`Fotos salvas no GCS: ${fotoGcsPath} (${fotoData.fotosSalvas} fotos)`);
        } else {
          console.error('Falha ao enviar fotos ao GCS, leitura será salva sem fotos');
        }
      } catch (err) {
        console.error('Erro ao enviar fotos ao GCS:', err);
        // Continua salvando leitura mesmo sem fotos
      }
    }

    try {
      // Preparar dados para a API
      const leiturasParaSalvar = maquinasPreenchidas.map(m => {
        return {
          maquinaId: m.id,
          entradaAnterior: m.entradaAtual || 0,
          entradaNova: parseInt(m.novaEntrada) || m.entradaAtual || 0,
          saidaAnterior: m.saidaAtual || 0,
          saidaNova: parseInt(m.novaSaida) || m.saidaAtual || 0,
          diferencaEntrada: m.diferencaEntrada || 0,
          diferencaSaida: m.diferencaSaida || 0,
          saldo: m.saldoMaquina || 0,
          moeda: m.moeda,
          observacoes: undefined,
        };
      });

      const res = await fetch('/api/leituras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leituras: leiturasParaSalvar,
          clienteId: clienteSelecionado.id,
          usuarioId: usuarioId,
          despesa: despesasParaSalvar.length > 0 ? JSON.stringify(despesasParaSalvar) : null,
          valorDespesa: totalDesp > 0 ? totalDesp : null,
          receita: receitasParaSalvar.length > 0 ? JSON.stringify(receitasParaSalvar) : null,
          valorReceita: totalRec > 0 ? totalRec : null,
          fotoGcsPath: fotoGcsPath,
        }),
      });

      const data = await res.json();


      if (!res.ok) {
        throw new Error(data.details || data.error || 'Erro ao salvar leituras');
      }

      const mensagem = maquinasPreenchidas.length > 0 
        ? `${maquinasPreenchidas.length} leitura(s) salva(s) com sucesso!`
        : 'Despesa salva com sucesso!';
      toast.success(mensagem);
      
      // Guarda as máquinas salvas para o resumo
      setMaquinasSalvas([...maquinasPreenchidas]);
      // Guarda o valor da despesa para o resumo
      setValorDespesaSalva(totalDesp);
      // Guarda o valor da receita para o resumo
      setValorReceitaSalva(totalRec);
      // Guarda as descrições detalhadas das receitas e despesas
      setReceitasSalvas(receitasParaSalvar);
      setDespesasSalvas(despesasParaSalvar);
      // Guardar valor dos débitos ANTES de zerar para exibir no resumo/extrato
      setDebitosVencidosSalvos(debitosVencidos);
      setResumoModalOpen(true);
      setResumoTelegramEnviado(false);

      // Marcar débitos vencidos como pagos
      if (debitosVencidos > 0) {
        try {
          const hoje = new Date().toISOString().split('T')[0];
          const debRes = await fetch(`/api/contas?empresaId=${empresaId}&clienteId=${clienteSelecionado.id}&paga=false&tipo=1&dataMax=${hoje}`);
          const debitos = await debRes.json();
          if (Array.isArray(debitos) && debitos.length > 0) {
            await Promise.all(
              debitos.map((d: any) =>
                fetch(`/api/contas/${d.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ paga: true, dataPagamento: hoje }),
                })
              )
            );
            setDebitosVencidos(0);
          }
        } catch {
          // Falha ao marcar débitos não impede o fluxo
        }
      }

      // Gerar lancamento de conta a receber automaticamente (LEITURA)
      // Logica: jogado = total (entradas - saidas). Parte do cliente = jogado * acertoPct/100.
      // O sistema cobra o RESTANTE (jogado - parte do cliente).
      if (maquinasPreenchidas.length > 0 && clienteSelecionado) {
        try {
          const acertoPct = clienteSelecionado?.acertoPercentual ?? 50;
          const jogado = maquinasPreenchidas.reduce((acc, m) => {
            const calcVal = calcularValor(m.moeda, m.diferencaEntrada) - calcularValor(m.moeda, m.diferencaSaida);
            return acc + calcVal;
          }, 0);
          const valorConta = jogado * ((100 - acertoPct) / 100); // Restante = parte do sistema

          if (valorConta > 0) {
            await fetch('/api/contas', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                descricao: 'LEITURA',
                valor: Math.round(valorConta * 100) / 100,
                data: new Date().toISOString().split('T')[0],
                tipo: 1, // A receber
                paga: true, // Quitado
                clienteId: clienteSelecionado.id,
                empresaId: empresaId,
                dataPagamento: new Date().toISOString().split('T')[0],
              }),
            });
          }
        } catch {
          // Falha ao gerar lancamento nao impede o fluxo
        }
      }

      if (clienteSelecionado) {
        await loadMaquinasCliente(clienteSelecionado.id, undefined, true); // skipRestore=true (dados acabaram de ser salvos)
      }
      setExtratoVisivel(false);
      setRecebido('');
      setFormaPagamento(null);
      setValorPago('');
      resetReceitas();
      resetDespesas();
      setMaquinasAlteradas(new Map());
      limparDigitacaoLS();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar leituras';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  // Calcular totais das máquinas salvas
  const calcularTotaisSalvos = () => {
    const totais = maquinasSalvas.reduce((acc, m) => ({
      entradas: acc.entradas + calcularValor(m.moeda, m.diferencaEntrada),
      saidas: acc.saidas + calcularValor(m.moeda, m.diferencaSaida),
      quantidade: acc.quantidade + 1,
    }), { entradas: 0, saidas: 0, quantidade: 0 });

    const jogado = totais.entradas - totais.saidas;
    const acertoPct = clienteSelecionado?.acertoPercentual ?? 50;
    const cliente = jogado * (acertoPct / 100);
    const debitoSaldo = debitosVencidosSalvos;
    const receitaTotal = valorReceitaSalva;
    const despesaTotal = valorDespesaSalva;

    const temReceitas = receitaTotal > 0;
    const temDespesas = despesaTotal > 0;
    const temAmbos = temReceitas && temDespesas;

    // Fechamento varia por modo de operacao
    let fechamento: number;
    if (modoOperacao === 'COBRANCA') {
      // Cobranca: jogado - cliente - debitos
      fechamento = jogado - cliente - debitoSaldo;
    } else if (modoOperacao === 'LEITURA') {
      // Leitura: saídas caixa - entradas caixa
      fechamento = despesaTotal - receitaTotal;
    } else {
      // Ajuste: sem totalizacao
      fechamento = 0;
    }

    return { ...totais, jogado, cliente, receita: receitaTotal, despesa: despesaTotal, debitoSaldo, fechamento, temAmbos };
  };

  // Gerar mensagem para WhatsApp
  const gerarMensagemWhatsApp = () => {
    const totaisSalvos = calcularTotaisSalvos();
    const now = new Date();
    const dataStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear().toString().slice(-2)} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    
    let mensagem = `__________________\n`;
    mensagem += `${clienteSelecionado?.nome?.toUpperCase() || 'CLIENTE'}\n`;
    mensagem += `Data: ${dataStr}\n`;
    mensagem += `Lançado por: ${usuarioNome}\n`;
    mensagem += `_____________\n`;
    
    // Maquinas (sempre mostram todas, sem filtro > 0)
    maquinasSalvas.forEach((m, idx) => {
      if (idx > 0) {
        mensagem += `_____________\n`;
      }
      const nomeMaquina = (m.tipo?.descricao || m.codigo || 'MÁQUINA').toUpperCase();
      mensagem += `${m.codigo} - ${nomeMaquina}\n`;
      mensagem += `E ${String(m.entradaAtual || 0).padStart(8)} ${String(m.novaEntrada || m.entradaAtual || 0).padStart(8)}${modoOperacao !== 'AJUSTE' ? `___${formatNumber(calcularValor(m.moeda, m.diferencaEntrada))}` : ''}\n`;
      mensagem += `S ${String(m.saidaAtual || 0).padStart(8)} ${String(m.novaSaida || m.saidaAtual || 0).padStart(8)}${modoOperacao !== 'AJUSTE' ? `___${formatNumber(calcularValor(m.moeda, m.diferencaSaida))}` : ''}\n`;
      if (modoOperacao !== 'AJUSTE') mensagem += `Saldo: ${formatNumber(m.saldoMaquina || 0)}\n`;
    });
    
    // AJUSTE: sem totalizacao nenhuma
    if (modoOperacao === 'AJUSTE') {
      return mensagem;
    }

    mensagem += `_____________\n`;
    mensagem += `Qtde Maqs....: ${String(maquinasSalvas.length).padStart(2, '0')}\n`;
    mensagem += `Entradas.....: ${formatNumber(totaisSalvos.entradas)}\n`;
    mensagem += `Saídas.......: ${formatNumber(totaisSalvos.saidas)}\n`;

    // COBRANCA: mostra jogado, cliente e debitos
    if (modoOperacao === 'COBRANCA') {
      mensagem += `*Jogado*.....: ${formatNumber(totaisSalvos.jogado)}\n`;
      mensagem += `Cliente (${clienteSelecionado?.acertoPercentual ?? 50}%): ${formatNumber(totaisSalvos.cliente)}\n`;
      mensagem += `Débitos (Saldo): ${formatNumber(totaisSalvos.debitoSalvo || 0)}\n`;
    }
    mensagem += `_____________\n`;

    // Receitas detalhadas (so > 0)
    const recItems = receitasSalvas.filter(d => d.valor > 0);
    if (recItems.length > 0) {
      recItems.forEach(d => {
        mensagem += `  ${d.descricao.padEnd(15)}: ${formatNumber(d.valor)}\n`;
      });
      mensagem += `Total ENTRADAS: ${formatNumber(totaisSalvos.receita)}\n`;
      mensagem += `_____________\n`;
    }
    // Despesas detalhadas (so > 0)
    const despItems = despesasSalvas.filter(d => d.valor > 0);
    if (despItems.length > 0) {
      despItems.forEach(d => {
        mensagem += `  ${d.descricao.padEnd(15)}: ${formatNumber(d.valor)}\n`;
      });
      mensagem += `Total SAÍDAS: ${formatNumber(totaisSalvos.despesa)}\n`;
      mensagem += `_____________\n`;
    }
    // FECHAMENTO final: ENTRADA, SAIDA e FECHAMENTO
    mensagem += `_____________\n`;
    const label = modoOperacao === 'COBRANCA' ? 'TOTALIZAÇÃO' : 'FECHAMENTO';
    const valorEntrada = modoOperacao === 'COBRANCA' ? totaisSalvos.jogado : totaisSalvos.receita;
    const valorSaida = totaisSalvos.despesa;
    const entradaFinal = (modoOperacao === 'LEITURA' && totaisSalvos.receita === 0 && totaisSalvos.despesa === 0) ? totaisSalvos.jogado : valorEntrada;
    const saidaFinal = (modoOperacao === 'LEITURA' && totaisSalvos.receita === 0 && totaisSalvos.despesa === 0) ? 0 : valorSaida;
    mensagem += `ENTRADA......: ${formatNumber(entradaFinal)}\n`;
    mensagem += `SAÍDA........: ${formatNumber(saidaFinal)}\n`;
    const valorFechamento = (modoOperacao === 'LEITURA' && totaisSalvos.receita === 0 && totaisSalvos.despesa === 0) ? totaisSalvos.jogado : totaisSalvos.fechamento;
    const tagFinal = Math.abs(valorFechamento) < 0.01 ? '[fechou]' : valorFechamento >= 0 ? '[sobrou]' : '[faltou]';
    mensagem += `${label}.....: ${formatNumber(Math.abs(valorFechamento))} ${tagFinal}\n`;
    
    return mensagem;
  };
  // Converter extrato em imagem (canvas) para enviar junto com as fotos
  // Gerar extrato 2a via como imagem (canvas) para envio via WhatsApp
  const gerarExtratoImagemSegundaVia = (): Promise<string | null> => {
    return new Promise((resolve) => {
      try {
        const el = document.getElementById('extrato-segunda-via');
        if (!el) { resolve(null); return; }

        // Usar html2canvas ou canvas nativo do conteúdo
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }

        const fontSize = 26;
        const lineHeight = 34;
        const padding = 28;
        const larguraCanvas = 680;

        // Extrair texto do elemento
        const textContent = el.innerText || el.textContent || '';
        const linhas = textContent.split('\n').filter(l => l.trim());

        const alturaTexto = linhas.length * lineHeight + padding * 2;
        canvas.width = larguraCanvas;
        canvas.height = Math.max(alturaTexto, 200);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, larguraCanvas, canvas.height);

        ctx.fillStyle = '#000000';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';

        linhas.forEach((linha, i) => {
          const trim = linha.trim();
          // Negrito para linhas com formato de título
          const isBold = trim.includes('EXTRATO') || trim.includes('2a VIA') ||
            trim === trim.toUpperCase() && trim.length > 3 && trim.length < 40;
          ctx.font = `${isBold ? 'bold ' : ''}${fontSize}px "Courier New", Courier, monospace`;
          ctx.fillText(trim, padding, padding + i * lineHeight);
        });

        resolve(canvas.toDataURL('image/jpeg', 0.9));
      } catch (err) {
        console.error('Erro ao gerar imagem extrato 2a via:', err);
        resolve(null);
      }
    });
  };

  // Gerar RELATÓRIO 2a via em formato A4 com fotos em miniatura
  // Layout paginado: máximo 8 cards de máquinas por página
  // Cada página é uma imagem separada (melhora zoom no Telegram)
  const gerarRelatorioImagem2aVia = async (): Promise<string[] | null> => {
    try {
      if (!segundaViaDados || segundaViaDados.length === 0) {
        return null;
      }

        const SCALE = 2;
        const A4_W = 794;
        const padding = 40;

        // Configurações de fonte
        const FONT_TITLE = 'bold 26px "Arial", sans-serif';
        const FONT_SUBTITLE = '18px "Arial", sans-serif';
        const FONT_LABEL = 'bold 20px "Arial", sans-serif';
        const FONT_VALUE = '20px "Arial", sans-serif';
        const FONT_TOTAL = 'bold 28px "Arial", sans-serif';

        // Pré-processar dados
        const modo2via = clienteSelecionado?.formaCobranca === 'COBRANCA' ? 'COBRANCA' : 'LEITURA';
        const porMaquina = new Map<string, any[]>();
        const despesaItens: { descricao: string; valor: number }[] = [];
        const receitaItens: { descricao: string; valor: number }[] = [];
        segundaViaDados.forEach((l: any) => {
          const temLeitura = l.entradaNova > 0 || l.saidaNova > 0 || l.diferencaEntrada !== 0 || l.diferencaSaida !== 0;
          if (temLeitura) {
            if (!porMaquina.has(l.maquinaId)) porMaquina.set(l.maquinaId, []);
            porMaquina.get(l.maquinaId)!.push(l);
          }
          if (l.despesa) { try { const p = JSON.parse(l.despesa); if (Array.isArray(p)) p.forEach((d: any) => { if (d.valor > 0) despesaItens.push(d); }); } catch {} }
          if (l.caixa) { try { const p = JSON.parse(l.caixa); if (Array.isArray(p)) p.forEach((r: any) => { if (r.valor > 0) receitaItens.push(r); }); } catch {} }
        });
        const despesasFinal = Array.from(new Map(despesaItens.map(d => [d.descricao, d])).values());
        const receitasFinal = Array.from(new Map(receitaItens.map(r => [r.descricao, r])).values());
        const maquinasArr = Array.from(porMaquina.entries());

        // Calcular totais
        let totalEntradas = 0;
        let totalSaidas = 0;
        maquinasArr.forEach(([id, lws]) => {
          totalEntradas += calcularValor(lws[0].moeda, lws[0].diferencaEntrada);
          totalSaidas += calcularValor(lws[0].moeda, lws[0].diferencaSaida);
        });
        const totalReceitas = receitasFinal.reduce((a, r) => a + r.valor, 0);
        const totalDespesas = despesasFinal.reduce((a, d) => a + d.valor, 0);
        const jogado = totalEntradas - totalSaidas;
        const acertoPct = clienteSelecionado?.acertoPercentual ?? 50;
        const valorCliente = jogado * (acertoPct / 100);
        const temItensExtras = totalReceitas > 0 || totalDespesas > 0;
        const entradaFinal = modo2via === 'COBRANCA' ? jogado : (temItensExtras ? totalReceitas : jogado);
        const saidaFinal = temItensExtras ? totalDespesas : 0;
        const fechamentoFinal = temItensExtras ? saidaFinal - entradaFinal : entradaFinal;

        // Pré-carregar imagens
        const imagensPorMaquinaId = new Map<string, HTMLImageElement>();
        const imagensPorCodigo = new Map<string, HTMLImageElement>();
        const promessasCarregamento: Promise<void>[] = [];
        for (const [id, lws] of maquinasArr) {
          const m = lws[0].maquina;
          const fotoObj = segundaViaFotos.find(f => f.maquinaId === id || f.codigo === m.codigo);
          if (fotoObj) {
            const promise = new Promise<void>((resolveImg) => {
              const img = new Image();
              img.onload = () => { imagensPorMaquinaId.set(id, img); if (m.codigo) imagensPorCodigo.set(m.codigo, img); resolveImg(); };
              img.onerror = () => { resolveImg(); };
              img.src = fotoObj.fotoBase64;
            });
            promessasCarregamento.push(promise);
          }
        }
        await Promise.race([Promise.all(promessasCarregamento), new Promise<void>((resolve) => setTimeout(resolve, 10000))]);

        const operadores = new Set(segundaViaDados.filter((l: any) => l.usuario?.nome).map((l: any) => l.usuario.nome));
        const CARD_HEIGHT = 280;
        const MAX_CARDS_POR_PAGINA = 8;

        // Dividir máquinas em páginas
        const paginas: typeof maquinasArr[] = [];
        for (let i = 0; i < maquinasArr.length; i += MAX_CARDS_POR_PAGINA) {
          paginas.push(maquinasArr.slice(i, i + MAX_CARDS_POR_PAGINA));
        }
        // Se não há máquinas, criar pelo menos 1 página (para totais)
        if (paginas.length === 0) paginas.push([]);

        const temReceitasExtras = modo2via !== 'COBRANCA' && receitasFinal.length > 0;
        const temDespesasExtras = modo2via !== 'COBRANCA' && despesasFinal.length > 0;
        const titulo = modo2via === 'COBRANCA' ? 'RELATÓRIO DE COBRANÇA' : 'RELATÓRIO DE LEITURA';
        const nomeCliente = clienteSelecionado?.nome?.toUpperCase() || '';
        const dataRelatorio = segundaViaSelecionada?.data || '';
        const operadoresStr = operadores.size > 0 ? Array.from(operadores).join(', ') : '';

        // Função helper para desenhar o cabeçalho em uma página
        const desenharCabecalho = (ctxPag: CanvasRenderingContext2D, numPagina: number, totalPaginas: number): number => {
          let yp = padding;
          ctxPag.textAlign = 'center';
          ctxPag.fillStyle = '#000000';
          ctxPag.font = FONT_TITLE;
          ctxPag.fillText(titulo, A4_W / 2, yp);
          yp += 35;
          ctxPag.font = FONT_SUBTITLE;
          ctxPag.fillText(nomeCliente, A4_W / 2, yp);
          yp += 30;
          ctxPag.font = FONT_VALUE;
          ctxPag.fillText(`Data: ${dataRelatorio}`, A4_W / 2, yp);
          yp += 30;
          if (operadoresStr) { ctxPag.fillText(`Operador(es): ${operadoresStr}`, A4_W / 2, yp); yp += 30; }
          // Indicador de página
          if (totalPaginas > 1) {
            ctxPag.font = '14px Arial';
            ctxPag.fillText(`Página ${numPagina} de ${totalPaginas}`, A4_W / 2, yp);
            yp += 20;
          }
          // Separador
          yp += 10;
          ctxPag.strokeStyle = '#000000';
          ctxPag.lineWidth = 2;
          ctxPag.beginPath();
          ctxPag.moveTo(padding, yp);
          ctxPag.lineTo(A4_W - padding, yp);
          ctxPag.stroke();
          yp += 30;
          return yp;
        };

        // Função helper para desenhar um card de máquina
        const desenharCardMaquina = (ctxPag: CanvasRenderingContext2D, id: string, lws: any[], yCard: number): number => {
          const m = lws[0].maquina;
          const e = calcularValor(lws[0].moeda, lws[0].diferencaEntrada);
          const s = calcularValor(lws[0].moeda, lws[0].diferencaSaida);

          ctxPag.strokeStyle = '#333333';
          ctxPag.lineWidth = 2;
          ctxPag.strokeRect(padding, yCard, A4_W - padding * 2, CARD_HEIGHT - 20);

          const img = imagensPorMaquinaId.get(id) || (m.codigo ? imagensPorCodigo.get(m.codigo) : undefined);
          const fotoX = padding + 10;
          const fotoY = yCard + 10;
          const fotoW = 180;
          const fotoH = 180;

          ctxPag.fillStyle = '#f0f0f0';
          ctxPag.fillRect(fotoX, fotoY, fotoW, fotoH);

          if (img && img.complete && img.naturalWidth > 0) {
            const natW = img.naturalWidth;
            const natH = img.naturalHeight;
            const aspectRatio = natW / natH;
            let drawW = fotoW, drawH = fotoH;
            if (aspectRatio > 1) { drawW = fotoW; drawH = Math.round(fotoW / aspectRatio); }
            else { drawH = fotoH; drawW = Math.round(fotoH * aspectRatio); }
            const drawX = fotoX + Math.round((fotoW - drawW) / 2);
            const drawY = fotoY + Math.round((fotoH - drawH) / 2);
            ctxPag.drawImage(img, drawX, drawY, drawW, drawH);
          } else {
            ctxPag.fillStyle = '#999999';
            ctxPag.font = '14px Arial';
            ctxPag.textAlign = 'center';
            ctxPag.fillText('sem foto', fotoX + fotoW / 2, fotoY + fotoH / 2);
          }

          const textX = padding + 210;
          ctxPag.fillStyle = '#000000';
          const nomeMaquina = (m.tipo?.descricao || '').toUpperCase();
          const moeda = lws[0].moeda || 'M001';
          const multiplicadoresMoeda: Record<string, number> = { M001: 0.01, M005: 0.05, M010: 0.10, M025: 0.25 };
          const multiplicador = multiplicadoresMoeda[moeda] ?? 0.01;
          const moedaStr = `x${multiplicador.toString().replace('.', ',')}`;
          const parteNegrito = `${m.codigo} - ${nomeMaquina} `;
          ctxPag.font = FONT_LABEL;
          ctxPag.textAlign = 'left';
          ctxPag.fillText(parteNegrito, textX, yCard + 40);
          const larguraNegrito = ctxPag.measureText(parteNegrito).width;
          ctxPag.font = '20px "Arial", sans-serif';
          ctxPag.fillText(moedaStr, textX + larguraNegrito, yCard + 40);

          ctxPag.font = FONT_VALUE;
          const entAtual = lws[0].entradaNova || 0;
          const entAnt = lws[0].entradaAnterior || 0;
          ctxPag.fillText(`${entAtual} - ${entAnt} = ${entAtual - entAnt}`, textX, yCard + 80);
          const saiAtual = lws[0].saidaNova || 0;
          const saiAnt = lws[0].saidaAnterior || 0;
          ctxPag.fillText(`${saiAtual} - ${saiAnt} = ${saiAtual - saiAnt}`, textX, yCard + 115);
          ctxPag.font = FONT_LABEL;
          ctxPag.fillStyle = '#000000';
          ctxPag.fillText(`Saldo: ${formatNumber(lws[0].saldo)}`, textX, yCard + 155);

          return yCard + CARD_HEIGHT;
        };

        // Função helper para desenhar totais finais
        const desenharTotais = (ctxPag: CanvasRenderingContext2D, yTotais: number): number => {
          let yt = yTotais + 10;
          // Extras (lado a lado)
          if (temReceitasExtras || temDespesasExtras) {
            const colW = (A4_W - padding * 2 - 20) / 2;
            const itensReceitas = temReceitasExtras ? receitasFinal.length : 0;
            const itensDespesas = temDespesasExtras ? despesasFinal.length : 0;
            const maxItens = Math.max(itensReceitas, itensDespesas);
            const sectionH = 30 + maxItens * 30 + 40 + 20;

            if (temReceitasExtras) {
              ctxPag.strokeStyle = '#0066cc'; ctxPag.lineWidth = 3;
              ctxPag.strokeRect(padding, yt, colW, sectionH);
              ctxPag.fillStyle = '#e6f0ff'; ctxPag.fillRect(padding, yt, colW, sectionH);
              ctxPag.textAlign = 'left'; ctxPag.fillStyle = '#0066cc'; ctxPag.font = FONT_LABEL;
              ctxPag.fillText('ENTRADA', padding + 15, yt + 30);
              ctxPag.fillStyle = '#000000'; ctxPag.font = FONT_VALUE;
              let yRec = yt + 60;
              receitasFinal.forEach((r) => { ctxPag.fillText(`${r.descricao || 'OUTROS'}: ${formatNumber(r.valor)}`, padding + 15, yRec); yRec += 30; });
              ctxPag.fillStyle = '#0066cc'; ctxPag.font = FONT_LABEL;
              ctxPag.fillText(`Total: ${formatNumber(totalReceitas)}`, padding + 15, yt + sectionH - 20);
            }
            if (temDespesasExtras) {
              const col2X = padding + colW + 20;
              ctxPag.strokeStyle = '#cc3300'; ctxPag.strokeRect(col2X, yt, colW, sectionH);
              ctxPag.fillStyle = '#ffe6e6'; ctxPag.fillRect(col2X, yt, colW, sectionH);
              ctxPag.textAlign = 'left'; ctxPag.fillStyle = '#cc3300'; ctxPag.font = FONT_LABEL;
              ctxPag.fillText('SAÍDA', col2X + 15, yt + 30);
              ctxPag.fillStyle = '#000000'; ctxPag.font = FONT_VALUE;
              let yDesp = yt + 60;
              despesasFinal.forEach((d) => { ctxPag.fillText(`${d.descricao || 'OUTROS'}: ${formatNumber(d.valor)}`, col2X + 15, yDesp); yDesp += 30; });
              ctxPag.fillStyle = '#cc3300'; ctxPag.font = FONT_LABEL;
              ctxPag.fillText(`Total: ${formatNumber(totalDespesas)}`, col2X + 15, yt + sectionH - 20);
            }
            yt += sectionH + 20;
            ctxPag.fillStyle = '#000000';
          }

          // 3 cards de totais
          yt += 10;
          ctxPag.font = FONT_TITLE; ctxPag.textAlign = 'center';
          ctxPag.fillText('TOTAIS', A4_W / 2, yt); yt += 30;
          const cardW = (A4_W - padding * 2 - 20) / 3;
          const cardH = 100; const cardY = yt;
          // Card 1
          ctxPag.strokeStyle = '#0066cc'; ctxPag.lineWidth = 3;
          ctxPag.strokeRect(padding, cardY, cardW, cardH);
          ctxPag.fillStyle = '#e6f0ff'; ctxPag.fillRect(padding, cardY, cardW, cardH);
          ctxPag.fillStyle = '#0066cc'; ctxPag.font = FONT_LABEL; ctxPag.textAlign = 'center';
          ctxPag.fillText('ENTRADA', padding + cardW / 2, cardY + 35);
          ctxPag.font = FONT_TOTAL; ctxPag.fillText(formatNumber(totalReceitas), padding + cardW / 2, cardY + 75);
          // Card 2
          const c2X = padding + cardW + 10;
          ctxPag.strokeStyle = '#cc3300'; ctxPag.strokeRect(c2X, cardY, cardW, cardH);
          ctxPag.fillStyle = '#ffe6e6'; ctxPag.fillRect(c2X, cardY, cardW, cardH);
          ctxPag.fillStyle = '#cc3300'; ctxPag.font = FONT_LABEL;
          ctxPag.fillText('SAÍDA', c2X + cardW / 2, cardY + 35);
          ctxPag.font = FONT_TOTAL; ctxPag.fillText(formatNumber(totalDespesas), c2X + cardW / 2, cardY + 75);
          // Card 3
          const c3X = padding + (cardW + 10) * 2;
          let tituloFech: string, corFech: string, bgFech: string;
          if (fechamentoFinal > 0) { tituloFech = 'SOBROU'; corFech = '#008800'; bgFech = '#e6ffe6'; }
          else if (fechamentoFinal === 0) { tituloFech = 'FECHOU'; corFech = '#0066cc'; bgFech = '#e6f0ff'; }
          else { tituloFech = 'FALTOU'; corFech = '#cc0000'; bgFech = '#ffe6e6'; }
          ctxPag.strokeStyle = corFech; ctxPag.strokeRect(c3X, cardY, cardW, cardH);
          ctxPag.fillStyle = bgFech; ctxPag.fillRect(c3X, cardY, cardW, cardH);
          ctxPag.fillStyle = corFech; ctxPag.font = FONT_LABEL;
          ctxPag.fillText(tituloFech, c3X + cardW / 2, cardY + 35);
          ctxPag.font = FONT_TOTAL; ctxPag.fillText(formatNumber(fechamentoFinal), c3X + cardW / 2, cardY + 75);
          yt = cardY + cardH + 20;

          if (modo2via === 'COBRANCA') {
            ctxPag.textAlign = 'left'; ctxPag.font = FONT_VALUE; ctxPag.fillStyle = '#000000';
            ctxPag.fillText(`Cliente (${acertoPct}%): ${formatNumber(valorCliente)}`, padding, yt); yt += 30;
          }
          return yt + padding;
        };

        // === Gerar cada página ===
        const imagens: string[] = [];
        for (let pagIdx = 0; pagIdx < paginas.length; pagIdx++) {
          const maquinasPagina = paginas[pagIdx];
          const isUltimaPagina = pagIdx === paginas.length - 1;

          // Calcular altura da página
          let alturaPagina = padding + 40 + 30 + 30 + (operadoresStr ? 30 : 0) + (paginas.length > 1 ? 20 : 0) + 10 + 30;
          alturaPagina += maquinasPagina.length * (CARD_HEIGHT + 20);
          if (isUltimaPagina) {
            if (temReceitasExtras || temDespesasExtras) {
              const maxItens = Math.max(temReceitasExtras ? receitasFinal.length : 0, temDespesasExtras ? despesasFinal.length : 0);
              alturaPagina += 30 + maxItens * 30 + 40 + 20 + 20;
            }
            alturaPagina += 60 + 140 + 40 + padding;
          } else {
            alturaPagina += padding;
          }

          const canvasPag = document.createElement('canvas');
          canvasPag.width = A4_W * SCALE;
          canvasPag.height = alturaPagina * SCALE;
          const ctxPag = canvasPag.getContext('2d');
          if (!ctxPag) continue;
          ctxPag.scale(SCALE, SCALE);
          ctxPag.imageSmoothingEnabled = true;
          ctxPag.imageSmoothingQuality = 'high';

          // Fundo branco
          ctxPag.fillStyle = '#ffffff';
          ctxPag.fillRect(0, 0, A4_W, alturaPagina);

          // Cabeçalho
          let y = desenharCabecalho(ctxPag, pagIdx + 1, paginas.length);

          // Cards de máquinas
          ctxPag.textAlign = 'left';
          for (const [id, lws] of maquinasPagina) {
            y = desenharCardMaquina(ctxPag, id, lws, y);
            y += 20;
          }

          // Totais (apenas na última página)
          if (isUltimaPagina) {
            y = desenharTotais(ctxPag, y);
          }

          imagens.push(canvasPag.toDataURL('image/jpeg', 0.92));
        }

        console.log(`[Relatório 2a via] ${imagens.length} página(s) geradas (${maquinasArr.length} máquinas, máx ${MAX_CARDS_POR_PAGINA} por página)`);
        return imagens.length > 0 ? imagens : null;
      } catch (err) {
        console.error('Erro ao gerar relatório 2a via:', err);
        return null;
      }
  };

  // Gerar UMA imagem única do relatório (para WhatsApp)
  // Retorna a primeira página
  const gerarRelatorioImagemUnica = async (): Promise<string | null> => {
    const imagens = await gerarRelatorioImagem2aVia();
    if (!imagens || imagens.length === 0) return null;
    return imagens[0];
  };

  // Gerar PDF do relatório — cópia EXATA do canvas da visualização
  // Renderiza TODO o conteúdo em um único canvas (sem paginação, sem quebra)
  // e converte para PDF (1 página com a imagem inteira).
  // Retorna Blob PDF pronto para envio.
  const gerarRelatorioPdf2aVia = async (): Promise<Blob | null> => {
    try {
      if (!segundaViaDados || segundaViaDados.length === 0) return null;

      const SCALE = 2;
      const A4_W = 794;
      const padding = 40;

      const FONT_TITLE = 'bold 30px "Arial", sans-serif';
      const FONT_SUBTITLE = '22px "Arial", sans-serif';
      const FONT_LABEL = 'bold 24px "Arial", sans-serif';
      const FONT_VALUE = '24px "Arial", sans-serif';
      const FONT_TOTAL = 'bold 32px "Arial", sans-serif';

      const modo2via = clienteSelecionado?.formaCobranca === 'COBRANCA' ? 'COBRANCA' : 'LEITURA';
      const porMaquina = new Map<string, any[]>();
      const despesaItens: { descricao: string; valor: number }[] = [];
      const receitaItens: { descricao: string; valor: number }[] = [];
      segundaViaDados.forEach((l: any) => {
        const temLeitura = l.entradaNova > 0 || l.saidaNova > 0 || l.diferencaEntrada !== 0 || l.diferencaSaida !== 0;
        if (temLeitura) { if (!porMaquina.has(l.maquinaId)) porMaquina.set(l.maquinaId, []); porMaquina.get(l.maquinaId)!.push(l); }
        if (l.despesa) { try { const p = JSON.parse(l.despesa); if (Array.isArray(p)) p.forEach((d: any) => { if (d.valor > 0) despesaItens.push(d); }); } catch {} }
        if (l.caixa) { try { const p = JSON.parse(l.caixa); if (Array.isArray(p)) p.forEach((r: any) => { if (r.valor > 0) receitaItens.push(r); }); } catch {} }
      });
      const despesasFinal = Array.from(new Map(despesaItens.map(d => [d.descricao, d])).values());
      const receitasFinal = Array.from(new Map(receitaItens.map(r => [r.descricao, r])).values());
      const maquinasArr = Array.from(porMaquina.entries());

      let totalEntradas = 0, totalSaidas = 0;
      maquinasArr.forEach(([id, lws]) => {
        totalEntradas += calcularValor(lws[0].moeda, lws[0].diferencaEntrada);
        totalSaidas += calcularValor(lws[0].moeda, lws[0].diferencaSaida);
      });
      const totalReceitas = receitasFinal.reduce((a, r) => a + r.valor, 0);
      const totalDespesas = despesasFinal.reduce((a, d) => a + d.valor, 0);
      const jogado = totalEntradas - totalSaidas;
      const acertoPct = clienteSelecionado?.acertoPercentual ?? 50;
      const valorCliente = jogado * (acertoPct / 100);
      const temItensExtras = totalReceitas > 0 || totalDespesas > 0;
      const fechamentoFinal = temItensExtras ? (totalDespesas - totalReceitas) : jogado;

      // Pré-carregar imagens
      const imagensPorMaquinaId = new Map<string, HTMLImageElement>();
      const imagensPorCodigo = new Map<string, HTMLImageElement>();
      const promessas: Promise<void>[] = [];
      for (const [id, lws] of maquinasArr) {
        const m = lws[0].maquina;
        const fotoObj = segundaViaFotos.find(f => f.maquinaId === id || f.codigo === m.codigo);
        if (fotoObj) {
          promessas.push(new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => { imagensPorMaquinaId.set(id, img); if (m.codigo) imagensPorCodigo.set(m.codigo, img); resolve(); };
            img.onerror = () => resolve();
            img.src = fotoObj.fotoBase64;
          }));
        }
      }
      await Promise.race([Promise.all(promessas), new Promise<void>(r => setTimeout(r, 10000))]);

      const operadores = new Set(segundaViaDados.filter((l: any) => l.usuario?.nome).map((l: any) => l.usuario.nome));
      const CARD_HEIGHT = 320;
      const temReceitasExtras = modo2via !== 'COBRANCA' && receitasFinal.length > 0;
      const temDespesasExtras = modo2via !== 'COBRANCA' && despesasFinal.length > 0;

      // Calcular altura total (sem paginação)
      let alturaFinal = padding + 40 + 30 + 30 + (operadores.size > 0 ? 30 : 0) + 10 + 30;
      alturaFinal += maquinasArr.length * (CARD_HEIGHT + 20);
      alturaFinal += 10 + 30; // separador
      if (temReceitasExtras || temDespesasExtras) {
        const maxItens = Math.max(temReceitasExtras ? receitasFinal.length : 0, temDespesasExtras ? despesasFinal.length : 0);
        alturaFinal += 30 + maxItens * 30 + 40 + 20 + 20;
      }
      alturaFinal += 60 + 140 + 40 + padding;

      // Criar canvas único
      const canvas = document.createElement('canvas');
      canvas.width = A4_W * SCALE;
      canvas.height = alturaFinal * SCALE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.scale(SCALE, SCALE);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Fundo branco
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, A4_W, alturaFinal);

      // Cabeçalho
      let y = padding;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000000';
      ctx.font = FONT_TITLE;
      ctx.fillText(modo2via === 'COBRANCA' ? 'RELATÓRIO DE COBRANÇA' : 'RELATÓRIO DE LEITURA', A4_W / 2, y); y += 35;
      ctx.font = FONT_SUBTITLE;
      ctx.fillText(clienteSelecionado?.nome?.toUpperCase() || '', A4_W / 2, y); y += 30;
      ctx.font = FONT_VALUE;
      ctx.fillText(`Data: ${segundaViaSelecionada?.data || ''}`, A4_W / 2, y); y += 30;
      if (operadores.size > 0) { ctx.fillText(`Operador(es): ${Array.from(operadores).join(', ')}`, A4_W / 2, y); y += 30; }
      y += 10;
      ctx.strokeStyle = '#000000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(A4_W - padding, y); ctx.stroke(); y += 30;

      // Cards de máquinas
      ctx.textAlign = 'left';
      for (const [id, lws] of maquinasArr) {
        const m = lws[0].maquina;
        ctx.strokeStyle = '#333333'; ctx.lineWidth = 2;
        ctx.strokeRect(padding, y, A4_W - padding * 2, CARD_HEIGHT - 20);
        const img = imagensPorMaquinaId.get(id) || (m.codigo ? imagensPorCodigo.get(m.codigo) : undefined);
        const fotoX = padding + 10, fotoY = y + 10, fotoW = 280, fotoH = 280;
        ctx.fillStyle = '#f0f0f0'; ctx.fillRect(fotoX, fotoY, fotoW, fotoH);
        if (img && img.complete && img.naturalWidth > 0) {
          const ar = img.naturalWidth / img.naturalHeight;
          let dw = fotoW, dh = fotoH;
          if (ar > 1) { dw = fotoW; dh = Math.round(fotoW / ar); } else { dh = fotoH; dw = Math.round(fotoH * ar); }
          ctx.drawImage(img, fotoX + Math.round((fotoW - dw) / 2), fotoY + Math.round((fotoH - dh) / 2), dw, dh);
        } else {
          ctx.fillStyle = '#999999'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
          ctx.fillText('sem foto', fotoX + fotoW / 2, fotoY + fotoH / 2); ctx.textAlign = 'left';
        }
        const textX = padding + 310;
        ctx.fillStyle = '#000000';
        const nomeMaquina = (m.tipo?.descricao || '').toUpperCase();
        const moeda = lws[0].moeda || 'M001';
        const multMap: Record<string, number> = { M001: 0.01, M005: 0.05, M010: 0.10, M025: 0.25 };
        const mult = multMap[moeda] ?? 0.01;
        const moedaStr = `x${mult.toString().replace('.', ',')}`;
        const parteNegrito = `${m.codigo} - ${nomeMaquina} `;
        ctx.font = FONT_LABEL; ctx.fillText(parteNegrito, textX, y + 40);
        const larguraNegrito = ctx.measureText(parteNegrito).width;
        ctx.font = '24px "Arial", sans-serif'; ctx.fillText(moedaStr, textX + larguraNegrito, y + 40);
        ctx.font = FONT_VALUE;
        ctx.fillText(`${lws[0].entradaNova || 0} - ${lws[0].entradaAnterior || 0} = ${(lws[0].entradaNova || 0) - (lws[0].entradaAnterior || 0)}`, textX, y + 80);
        ctx.fillText(`${lws[0].saidaNova || 0} - ${lws[0].saidaAnterior || 0} = ${(lws[0].saidaNova || 0) - (lws[0].saidaAnterior || 0)}`, textX, y + 115);
        ctx.font = FONT_LABEL; ctx.fillStyle = '#000000';
        ctx.fillText(`Saldo: ${formatNumber(lws[0].saldo)}`, textX, y + 155);
        y += CARD_HEIGHT + 10;
      }

      // Separador
      y += 10;
      ctx.strokeStyle = '#000000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(A4_W - padding, y); ctx.stroke(); y += 30;

      // Extras lado a lado
      if (temReceitasExtras || temDespesasExtras) {
        const colW = (A4_W - padding * 2 - 20) / 2;
        const maxItens = Math.max(temReceitasExtras ? receitasFinal.length : 0, temDespesasExtras ? despesasFinal.length : 0);
        const sectionH = 30 + maxItens * 30 + 40 + 20;
        if (temReceitasExtras) {
          ctx.strokeStyle = '#0066cc'; ctx.lineWidth = 3; ctx.strokeRect(padding, y, colW, sectionH);
          ctx.fillStyle = '#e6f0ff'; ctx.fillRect(padding, y, colW, sectionH);
          ctx.textAlign = 'left'; ctx.fillStyle = '#0066cc'; ctx.font = FONT_LABEL;
          ctx.fillText('ENTRADA', padding + 15, y + 30);
          ctx.fillStyle = '#000000'; ctx.font = FONT_VALUE;
          let yRec = y + 60;
          receitasFinal.forEach((r) => { ctx.fillText(`${r.descricao || 'OUTROS'}: ${formatNumber(r.valor)}`, padding + 15, yRec); yRec += 30; });
          ctx.fillStyle = '#0066cc'; ctx.font = FONT_LABEL;
          ctx.fillText(`Total: ${formatNumber(totalReceitas)}`, padding + 15, y + sectionH - 20);
        }
        if (temDespesasExtras) {
          const col2X = padding + colW + 20;
          ctx.strokeStyle = '#cc3300'; ctx.strokeRect(col2X, y, colW, sectionH);
          ctx.fillStyle = '#ffe6e6'; ctx.fillRect(col2X, y, colW, sectionH);
          ctx.textAlign = 'left'; ctx.fillStyle = '#cc3300'; ctx.font = FONT_LABEL;
          ctx.fillText('SAÍDA', col2X + 15, y + 30);
          ctx.fillStyle = '#000000'; ctx.font = FONT_VALUE;
          let yDesp = y + 60;
          despesasFinal.forEach((d) => { ctx.fillText(`${d.descricao || 'OUTROS'}: ${formatNumber(d.valor)}`, col2X + 15, yDesp); yDesp += 30; });
          ctx.fillStyle = '#cc3300'; ctx.font = FONT_LABEL;
          ctx.fillText(`Total: ${formatNumber(totalDespesas)}`, col2X + 15, y + sectionH - 20);
        }
        y += sectionH + 20; ctx.fillStyle = '#000000';
      }

      // Totais finais (3 cards)
      y += 10;
      ctx.font = FONT_TITLE; ctx.textAlign = 'center';
      ctx.fillText('TOTAIS', A4_W / 2, y); y += 30;
      const cardW = (A4_W - padding * 2 - 20) / 3;
      const cardH = 100; const cardY = y;
      ctx.strokeStyle = '#0066cc'; ctx.lineWidth = 3; ctx.strokeRect(padding, cardY, cardW, cardH);
      ctx.fillStyle = '#e6f0ff'; ctx.fillRect(padding, cardY, cardW, cardH);
      ctx.fillStyle = '#0066cc'; ctx.font = FONT_LABEL; ctx.fillText('ENTRADA', padding + cardW / 2, cardY + 35);
      ctx.font = FONT_TOTAL; ctx.fillText(formatNumber(totalReceitas), padding + cardW / 2, cardY + 75);
      const c2X = padding + cardW + 10;
      ctx.strokeStyle = '#cc3300'; ctx.strokeRect(c2X, cardY, cardW, cardH);
      ctx.fillStyle = '#ffe6e6'; ctx.fillRect(c2X, cardY, cardW, cardH);
      ctx.fillStyle = '#cc3300'; ctx.font = FONT_LABEL; ctx.fillText('SAÍDA', c2X + cardW / 2, cardY + 35);
      ctx.font = FONT_TOTAL; ctx.fillText(formatNumber(totalDespesas), c2X + cardW / 2, cardY + 75);
      const c3X = padding + (cardW + 10) * 2;
      let tituloFech: string, corFech: string, bgFech: string;
      if (fechamentoFinal > 0) { tituloFech = 'SOBROU'; corFech = '#008800'; bgFech = '#e6ffe6'; }
      else if (fechamentoFinal === 0) { tituloFech = 'FECHOU'; corFech = '#0066cc'; bgFech = '#e6f0ff'; }
      else { tituloFech = 'FALTOU'; corFech = '#cc0000'; bgFech = '#ffe6e6'; }
      ctx.strokeStyle = corFech; ctx.strokeRect(c3X, cardY, cardW, cardH);
      ctx.fillStyle = bgFech; ctx.fillRect(c3X, cardY, cardW, cardH);
      ctx.fillStyle = corFech; ctx.font = FONT_LABEL; ctx.fillText(tituloFech, c3X + cardW / 2, cardY + 35);
      ctx.font = FONT_TOTAL; ctx.fillText(formatNumber(fechamentoFinal), c3X + cardW / 2, cardY + 75);
      y = cardY + cardH + 20;
      if (modo2via === 'COBRANCA') {
        ctx.textAlign = 'left'; ctx.font = FONT_VALUE; ctx.fillStyle = '#000000';
        ctx.fillText(`Cliente (${acertoPct}%): ${formatNumber(valorCliente)}`, padding, y); y += 30;
      }

      // Converter canvas para JPEG data URL
      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      console.log(`[PDF] Canvas único: ${canvas.width}x${canvas.height} px, JPEG: ${jpegDataUrl.length} chars`);

      // Criar PDF a partir do JPEG (1 página, dimensões reais)
      return await criarPdfDeImagem(jpegDataUrl);
    } catch (err) {
      console.error('Erro ao gerar PDF do relatório:', err);
      return null;
    }
  };

  const gerarExtratoImagem = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas não disponível')); return; }

      const mensagem = gerarMensagemWhatsApp();
      const linhas = mensagem.split('\n');

      // Configuração de fonte
      const fontSize = 28;
      const lineHeight = 38;
      const padding = 32;
      const larguraCanvas = 720;

      // Calcular altura necessária
      const alturaTexto = linhas.length * lineHeight + padding * 2;
      const alturaTotal = Math.max(alturaTexto, 200);

      canvas.width = larguraCanvas;
      canvas.height = alturaTotal;

      // Fundo branco
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, larguraCanvas, alturaTotal);

      // Texto
      ctx.fillStyle = '#000000';
      ctx.font = `${fontSize}px "Courier New", Courier, monospace`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';

      linhas.forEach((linha, i) => {
        // Negrito para linhas que começam com letras maiúsculas (títulos)
        if (linha.trim() && !linha.startsWith('_') && !linha.startsWith(' ') && linha.trim().charAt(0) === linha.trim().charAt(0).toUpperCase() && linha.trim().charAt(0) !== linha.trim().charAt(0).toLowerCase()) {
          ctx.font = `bold ${fontSize}px "Courier New", Courier, monospace`;
        } else {
          ctx.font = `${fontSize}px "Courier New", Courier, monospace`;
        }
        ctx.fillText(linha, padding, padding + i * lineHeight);
      });

      resolve(canvas.toDataURL('image/jpeg', 0.9));
    });
  };

  // =============================================
  // Enviar extrato + fotos processadas via Telegram (silencioso)
  // =============================================
  const enviarTelegramResumo = async () => {
    if (!empresa?.id || !clienteSelecionado?.id) {
      toast.error('Empresa ou cliente não selecionado');
      return;
    }
    const telegramGroupId = (clienteSelecionado as any).telegramGroupId;
    if (!telegramGroupId) {
      toast.error('Cliente não possui grupo Telegram cadastrado');
      return;
    }

    toast.loading('Enviando para Telegram...');

    try {
      // 1) Gerar imagem do extrato via canvas (ao invés de texto)
      const extratoImagem = await gerarExtratoImagem();
      console.log('[Telegram Resumo] Extrato imagem gerada:', extratoImagem ? `${extratoImagem.length} chars` : 'null');

      // 2) Coletar fotos processadas (com tarja)
      const fotos: string[] = [];
      for (const m of maquinasSalvas) {
        if (m.fotoProcessada) fotos.push(m.fotoProcessada);
      }
      // Adicionar foto dos canhotos de cartão
      if (cartaoFotoProcessada) fotos.push(cartaoFotoProcessada);
      console.log('[Telegram Resumo] Fotos processadas:', fotos.length);

      // 3) Montar lista final: extrato (imagem) + fotos
      const fotosEnvio: string[] = [];
      if (extratoImagem) fotosEnvio.push(extratoImagem);
      fotosEnvio.push(...fotos);

      // 4) Enviar para Telegram
      const res = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresaId: empresa.id,
          clienteId: clienteSelecionado.id,
          mensagem: null, // não enviar mais texto — extrato vai como imagem
          fotos: fotosEnvio,
        }),
      });
      toast.dismiss();
      const data = await res.json();
      if (data.success) {
        const msg = `Extrato (${extratoImagem ? '1 imagem' : '0'}) + ${fotos.length} foto(s) enviados!`;
        toast.success(msg);
        setResumoTelegramEnviado(true);
      } else {
        console.error('[Telegram Resumo] Erro:', data);
        toast.error(data.errorDetail || data.error || 'Erro ao enviar para Telegram', { duration: 8000 });
      }
    } catch (error) {
      toast.dismiss();
      console.error('Erro Telegram resumo:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar. Verifique a conexão.', { duration: 8000 });
    }
  };

  // Enviar pelo WhatsApp - SOMENTE texto do extrato (fotos pendente para versão futura)
  const enviarWhatsApp = async () => {
    try {
    const whatsappOriginal = (clienteSelecionado?.whatsapp || '').trim();
    const mensagem = gerarMensagemWhatsApp();

    // Enviar texto diretamente via wa.me
    if (whatsappOriginal && whatsappOriginal.includes('chat.whatsapp.com')) {
      // Link de grupo: copiar texto e abrir o grupo
      try {
        await navigator.clipboard.writeText(mensagem);
        toast.success('Extrato copiado! O grupo abrirá. Cole a mensagem.');
      } catch {
        toast.info('O grupo abrirá. Envie o extrato manualmente.');
      }
      setTimeout(() => abrirWhatsAppLink(whatsappOriginal), 500);
    } else if (whatsappOriginal) {
      // Convite de grupo (só o ID): copiar texto e abrir
      const grupoUrl = `https://chat.whatsapp.com/${whatsappOriginal}`;
      try {
        await navigator.clipboard.writeText(mensagem);
        toast.success('Extrato copiado! O grupo abrirá. Cole a mensagem.');
      } catch {
        toast.info('O grupo abrirá. Envie o extrato manualmente.');
      }
      setTimeout(() => abrirWhatsAppLink(grupoUrl), 500);
    } else {
      // WhatsApp individual: enviar direto via wa.me/?text=...
      await enviarWhatsAppTextoSeguro(mensagem, clienteSelecionado?.telefone?.replace(/\D/g, '') || '');
    }
    } catch (error: unknown) {
      console.error('Erro ao enviar WhatsApp:', error);
      toast.error('Erro ao enviar. Tente novamente.');
    }
  };

  // Imprimir resumo
  const imprimirResumo = async () => {
    const config = getActiveConfig() || PRINTER_PRESETS['generic-bt'];
    if (isPrinterConnected()) {
      // Imprimir via Bluetooth
      try {
        const result = await printReceipt({
          empresaNome: empresa?.nome || 'CaixaFacil',
          clienteNome: clienteSelecionado?.nome?.toUpperCase() || 'CLIENTE',
          dataHora: dataFormatada,
          usuario: usuarioNome,
          maquinas: maquinasSalvas.map(m => ({
            codigo: m.codigo || '???',
            tipo: m.tipo?.descricao || 'Tipo',
            entradaAnterior: m.entradaAtual || 0,
            entradaNova: m.novaEntrada || m.entradaAtual || 0,
            saidaAnterior: m.saidaAtual || 0,
            saidaNova: m.novaSaida || m.saidaAtual || 0,
            diferencaEntrada: m.diferencaEntrada || 0,
            diferencaSaida: m.diferencaSaida || 0,
            saldo: m.saldoMaquina || 0,
            moeda: m.moeda || 'M010',
          })),
          totais: {
            entradas: calcularTotaisSalvos().entradas,
            saidas: calcularTotaisSalvos().saidas,
            jogado: calcularTotaisSalvos().jogado,
            cliente: calcularTotaisSalvos().cliente,
            acertoPct: clienteSelecionado?.acertoPercentual ?? 50,
          },
          receitas: receitasSalvas.length > 0 ? receitasSalvas : undefined,
          despesas: despesasSalvas.length > 0 ? despesasSalvas : undefined,
          debitosVencidos: calcularTotaisSalvos().debitoSaldo || undefined,
          liquido: calcularTotaisSalvos().fechamento,
          modoOperacao: modoOperacao as 'COBRANCA' | 'LEITURA' | 'AJUSTE',
          width: config.type === '80mm' ? 80 : 58,
        }, config);
        
        if (result.success) {
          toast.success('Extrato enviado para a impressora!');
        } else {
          toast.error(`Erro ao imprimir: ${result.error}`);
          // Fallback to native print
          fallbackPrint(generateReceiptText({
            empresaNome: empresa?.nome || 'CaixaFacil',
            clienteNome: clienteSelecionado?.nome?.toUpperCase() || 'CLIENTE',
            dataHora: dataFormatada,
            usuario: usuarioNome,
            maquinas: maquinasSalvas.map(m => ({
              codigo: m.codigo || '???',
              tipo: m.tipo?.descricao || 'Tipo',
              entradaAnterior: m.entradaAtual || 0,
              entradaNova: m.novaEntrada || m.entradaAtual || 0,
              saidaAnterior: m.saidaAtual || 0,
              saidaNova: m.novaSaida || m.saidaAtual || 0,
              diferencaEntrada: m.diferencaEntrada || 0,
              diferencaSaida: m.diferencaSaida || 0,
              saldo: m.saldoMaquina || 0,
              moeda: m.moeda || 'M010',
            })),
            totais: {
              entradas: calcularTotaisSalvos().entradas,
              saidas: calcularTotaisSalvos().saidas,
              jogado: calcularTotaisSalvos().jogado,
              cliente: calcularTotaisSalvos().cliente,
              acertoPct: clienteSelecionado?.acertoPercentual ?? 50,
            },
            receitas: receitasSalvas.length > 0 ? receitasSalvas : undefined,
            despesas: despesasSalvas.length > 0 ? despesasSalvas : undefined,
            debitosVencidos: calcularTotaisSalvos().debitoSaldo || undefined,
            liquido: calcularTotaisSalvos().fechamento,
            modoOperacao: modoOperacao as 'COBRANCA' | 'LEITURA' | 'AJUSTE',
          }));
        }
      } catch (err) {
        toast.error('Erro ao enviar para impressora');
        fallbackPrint(generateReceiptText({
          empresaNome: empresa?.nome || 'CaixaFacil',
          clienteNome: clienteSelecionado?.nome?.toUpperCase() || 'CLIENTE',
          dataHora: dataFormatada,
          usuario: usuarioNome,
          maquinas: maquinasSalvas.map(m => ({
            codigo: m.codigo || '???',
            tipo: m.tipo?.descricao || 'Tipo',
            entradaAnterior: m.entradaAtual || 0,
            entradaNova: m.novaEntrada || m.entradaAtual || 0,
            saidaAnterior: m.saidaAtual || 0,
            saidaNova: m.novaSaida || m.saidaAtual || 0,
            diferencaEntrada: m.diferencaEntrada || 0,
            diferencaSaida: m.diferencaSaida || 0,
            saldo: m.saldoMaquina || 0,
            moeda: m.moeda || 'M010',
          })),
          totais: {
            entradas: calcularTotaisSalvos().entradas,
            saidas: calcularTotaisSalvos().saidas,
            jogado: calcularTotaisSalvos().jogado,
            cliente: calcularTotaisSalvos().cliente,
            acertoPct: clienteSelecionado?.acertoPercentual ?? 50,
          },
          receitas: receitasSalvas.length > 0 ? receitasSalvas : undefined,
          despesas: despesasSalvas.length > 0 ? despesasSalvas : undefined,
          debitosVencidos: calcularTotaisSalvos().debitoSaldo || undefined,
          liquido: calcularTotaisSalvos().fechamento,
          modoOperacao: modoOperacao as 'COBRANCA' | 'LEITURA' | 'AJUSTE',
        }));
      }
    } else {
      // Fallback: native print / share
      const text = generateReceiptText({
        empresaNome: empresa?.nome || 'CaixaFacil',
        clienteNome: clienteSelecionado?.nome?.toUpperCase() || 'CLIENTE',
        dataHora: dataFormatada,
        usuario: usuarioNome,
        maquinas: maquinasSalvas.map(m => ({
          codigo: m.codigo || '???',
          tipo: m.tipo?.descricao || 'Tipo',
          entradaAnterior: m.entradaAtual || 0,
          entradaNova: m.novaEntrada || m.entradaAtual || 0,
          saidaAnterior: m.saidaAtual || 0,
          saidaNova: m.novaSaida || m.saidaAtual || 0,
          diferencaEntrada: m.diferencaEntrada || 0,
          diferencaSaida: m.diferencaSaida || 0,
          saldo: m.saldoMaquina || 0,
          moeda: m.moeda || 'M010',
        })),
        totais: {
          entradas: calcularTotaisSalvos().entradas,
          saidas: calcularTotaisSalvos().saidas,
          jogado: calcularTotaisSalvos().jogado,
          cliente: calcularTotaisSalvos().cliente,
          acertoPct: clienteSelecionado?.acertoPercentual ?? 50,
        },
        receitas: receitasSalvas.length > 0 ? receitasSalvas : undefined,
        despesas: despesasSalvas.length > 0 ? despesasSalvas : undefined,
        debitosVencidos: calcularTotaisSalvos().debitoSaldo || undefined,
        liquido: calcularTotaisSalvos().fechamento,
        modoOperacao: modoOperacao as 'COBRANCA' | 'LEITURA' | 'AJUSTE',
      });
      fallbackPrint(text);
    }
  };

  // Fechar modal de resumo
  const fecharResumo = () => {
    setResumoModalOpen(false);
    setMaquinasSalvas([]);
    setValorDespesaSalva(0);
    setValorReceitaSalva(0);
  };

  const totais = calcularTotais();

  // Calculo do liquido (deve ficar APOS totais para nao causar ReferenceError TDZ)
  const valorLiquido = totais.totalReceitas - totais.totalDespesas - totais.jogado;

  // Gerar QR Code PIX quando selecionado
  useEffect(() => {
    if (formaPagamento === 'PIX_QRCODE' && empresa?.pixChave) {
      (async () => {
        try {
          const { gerarPayloadPix } = await import('@/lib/pix-payload');
          const QRCode = (await import('qrcode')).default;
          const payload = gerarPayloadPix({
            chave: empresa!.pixChave!,
            nome: empresa!.pixMerchantNome || empresa!.nome || '',
            cidade: empresa!.pixMerchantCidade || '',
            valor: valorLiquido > 0 ? valorLiquido : undefined,
          });
          const url = await QRCode.toDataURL(payload, { width: 220, margin: 1, color: { dark: '#000000', light: '#ffffff' } });
          setQrCodeDataUrl(url);
        } catch {
          setQrCodeDataUrl(null);
        }
      })();
    } else {
      setQrCodeDataUrl(null);
    }
  }, [formaPagamento, empresa?.pixChave, empresa?.pixMerchantNome, empresa?.pixMerchantCidade, valorLiquido, empresa?.nome]);

  // Resetar valorPago e MP quando trocar forma
  useEffect(() => {
    if (formaPagamento === 'DINHEIRO') {
      setValorPago(valorLiquido > 0 ? valorLiquido.toFixed(2).replace('.', ',') : '');
    } else {
      setValorPago('');
    }
    // Limpar estado MP PIX ao trocar forma de pagamento
    setMpPixData(null);
    setMpPixLoading(false);
    if (mpPixPollRef.current) { clearInterval(mpPixPollRef.current); mpPixPollRef.current = null; }
  }, [formaPagamento, valorLiquido]);

  // Polling de status do PIX Mercado Pago (verifica a cada 3s)
  useEffect(() => {
    if (!mpPixData || mpPixData.status === 'approved') {
      if (mpPixPollRef.current) { clearInterval(mpPixPollRef.current); mpPixPollRef.current = null; }
      return;
    }
    mpPixPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/mercadopago/status?id=${mpPixData.paymentId}&empresaId=${empresa?.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.payment) {
          const novoStatus = data.payment.status;
          setMpPixData(prev => prev ? { ...prev, status: novoStatus } : null);
          if (novoStatus === 'approved') {
            if (mpPixPollRef.current) { clearInterval(mpPixPollRef.current); mpPixPollRef.current = null; }
            toast.success('Pagamento PIX aprovado!');
          } else if (novoStatus === 'cancelled' || novoStatus === 'rejected') {
            if (mpPixPollRef.current) { clearInterval(mpPixPollRef.current); mpPixPollRef.current = null; }
            toast.error('Pagamento cancelado ou rejeitado');
          }
        }
      } catch { /* silencioso - tentativa proxima */ }
    }, 3000);
    return () => { if (mpPixPollRef.current) { clearInterval(mpPixPollRef.current); mpPixPollRef.current = null; } };
  }, [mpPixData?.paymentId, mpPixData?.status, empresa?.id]);

  // Inicializar Brick de cartão quando dialog abrir
  useEffect(() => {
    if (!mpBrickOpen || !empresa?.mercadopagoPublicKey || valorLiquido <= 0) return;

    const initBrick = async () => {
      try {
        // Carregar SDK MP
        const mpSdkScript = document.createElement('script');
        mpSdkScript.src = 'https://sdk.mercadopago.com/js/v2';
        mpSdkScript.async = true;
        const sdkLoaded = new Promise<void>((resolve, reject) => {
          mpSdkScript.onload = () => resolve();
          mpSdkScript.onerror = () => reject(new Error('Falha ao carregar SDK'));
          setTimeout(() => reject(new Error('Timeout SDK')), 20000);
        });
        document.head.appendChild(mpSdkScript);
        await sdkLoaded;

        // Criar preferência
        const prefRes = await fetch('/api/mercadopago/preferencia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            valor: valorLiquido,
            descricao: `Cobranca - ${clienteSelecionado?.nome || 'Cliente'} - ${new Date().toLocaleDateString('pt-BR')}`,
            nome: clienteSelecionado?.nome || '',
            cpfCnpj: clienteSelecionado?.cpfCnpj || '',
            email: clienteSelecionado?.email || '',
            empresaId: empresa?.id,
          }),
        });
        const prefData = await prefRes.json();
        if (!prefData.success || !prefData.id) {
          setMpBrickError(prefData.error || 'Erro ao criar preferencia');
          setMpBrickLoading(false);
          return;
        }

        // Inicializar Brick
        const MPClass = (window as any).MercadoPago;
        const mp = new MPClass(empresa.mercadopagoPublicKey, { locale: 'pt-BR' });
        const bricksBuilder = mp.bricks();

        // Aguardar container renderizar
        await new Promise<void>((resolve) => {
          let done = false;
          const check = () => {
            if (done) return;
            const el = document.getElementById('mpBrickCobranca_container');
            if (el && el.isConnected) { done = true; resolve(); }
            else requestAnimationFrame(check);
          };
          setTimeout(() => { done = true; resolve(); }, 3000);
          requestAnimationFrame(check);
        });

        const container = mpBrickContainerRef.current;
        if (!container) { setMpBrickError('Container nao encontrado'); setMpBrickLoading(false); return; }

        // Limpar brick anterior se existir
        try { mpBrickInstanceRef.current?.unmount(); } catch {}
        mpBrickInstanceRef.current = null;

        mpBrickInstanceRef.current = bricksBuilder.create('payment', container, {
          initialization: {
            amount: valorLiquido,
            preferenceId: prefData.id,
            payer: { email: clienteSelecionado?.email || '' },
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
                },
              },
            },
            paymentMethods: { maxInstallments: 12, minInstallments: 1 },
          },
          callbacks: {
            onReady: () => { setMpBrickReady(true); setMpBrickLoading(false); },
            onSubmit: async (formData: any) => {
              setMpBrickLoading(true);
              try {
                const res = await fetch('/api/mercadopago/processar-cartao', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    token: formData.token,
                    issuerId: formData.issuerId || '',
                    paymentMethodId: formData.paymentMethodId,
                    valor: formData.transactionAmount,
                    descricao: `Cobranca - ${clienteSelecionado?.nome || 'Cliente'}`,
                    nome: clienteSelecionado?.nome || '',
                    cpfCnpj: clienteSelecionado?.cpfCnpj || '',
                    email: clienteSelecionado?.email || '',
                    installments: formData.installments,
                    empresaId: empresa?.id,
                    clienteId: clienteSelecionado?.id,
                  }),
                });
                const data = await res.json();
                if (data.success && data.payment?.status === 'approved') {
                  toast.success('Pagamento aprovado!');
                  setMpBrickOpen(false);
                  setMpBrickLoading(false);
                  setMpBrickReady(false);
                  // Recarregar máquinas
                  if (clienteSelecionado) loadMaquinasCliente(clienteSelecionado.id, undefined, true); // skipRestore=true
                } else if (data.success) {
                  toast.info(`Pagamento ${data.payment?.status || 'processando'}...`);
                  setMpBrickOpen(false);
                  setMpBrickLoading(false);
                  setMpBrickReady(false);
                } else {
                  toast.error(data.error || 'Erro no pagamento');
                  setMpBrickLoading(false);
                }
              } catch {
                toast.error('Erro ao processar pagamento');
                setMpBrickLoading(false);
              }
            },
            onError: (error: any) => {
              console.error('[MP BRICK ERROR]', error);
              const errMsg = error?.message || error?.reason || 'Erro desconhecido';
              setMpBrickError(`Erro: ${errMsg}. Tente o fallback abaixo.`);
              setMpBrickLoading(false);
            },
          },
        });

        // Timeout de segurança
        setTimeout(() => {
          if (!mpBrickReady && !mpBrickError) {
            setMpBrickError('O formulario demorou demais. Use o fallback abaixo.');
            setMpBrickLoading(false);
          }
        }, 25000);

      } catch (err: any) {
        console.error('[MP BRICK INIT]', err);
        setMpBrickError(err.message || 'Erro ao inicializar pagamento');
        setMpBrickLoading(false);
      }
    };

    initBrick();

    return () => {
      try { mpBrickInstanceRef.current?.unmount(); } catch {}
      mpBrickInstanceRef.current = null;
    };
  }, [mpBrickOpen, empresa?.id, empresa?.mercadopagoPublicKey, valorLiquido, clienteSelecionado?.nome, clienteSelecionado?.email, clienteSelecionado?.cpfCnpj]);



  const now = new Date();
  const dataFormatada = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear().toString().slice(-2)} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">
          {modoOperacao === 'COBRANCA' ? 'COBRANÇAS' : modoOperacao === 'LEITURA' ? 'LEITURAS' : 'AJUSTES'}
        </h2>
      </div>

      {/* Seleção de Cliente + Modo de Operação */}
      <Card className="border-0 shadow-lg bg-card">
        <CardContent className="p-4 space-y-3">
          {/* Seletor de Cliente + Badge de Modo na mesma linha */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground whitespace-nowrap">Cliente</Label>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                modoOperacao === 'COBRANCA' ? 'bg-emerald-500/20 text-emerald-400' :
                modoOperacao === 'LEITURA' ? 'bg-blue-500/20 text-blue-400' :
                'bg-amber-500/20 text-amber-400'
              }`}>
                {modoOperacao === 'COBRANCA' ? <DollarSign className="w-2.5 h-2.5" /> :
                 modoOperacao === 'LEITURA' ? <ClipboardList className="w-2.5 h-2.5" /> :
                 <SlidersHorizontal className="w-2.5 h-2.5" />}
                {modoOperacao === 'COBRANCA' ? 'COBRANÇA' : modoOperacao === 'LEITURA' ? 'LEITURA' : 'AJUSTE'}
              </span>
              {clienteSelecionado && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={abrirSegundaVia}
                  className="ml-auto shrink-0 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
                >
                  <FileText className="w-3.5 h-3.5 mr-1" />
                  <span className="text-xs font-medium">2a Via</span>
                </Button>
              )}
            </div>
            <Select value={clienteSelecionado?.id || ''} onValueChange={handleClienteChange}>
              <SelectTrigger className="bg-muted border-border text-foreground">
                <SelectValue placeholder="Escolha um cliente" />
              </SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>

          </div>
        </CardContent>
      </Card>

      {/* Botão Lançamento de Lote */}
      <Button
        onClick={() => {
          setFotosLote([]);
          setLoteProgresso(0);
          setProcessandoLote(false);
          setLoteModalOpen(true);
        }}
        className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
      >
        <Layers className="w-4 h-4 mr-2" />
        LANÇAMENTO DE LOTE
      </Button>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando máquinas...</div>
      ) : clienteSelecionado && maquinas.length === 0 ? (
        <Card className="border-0 shadow-lg bg-card">
          <CardContent className="py-8 text-center text-muted-foreground">
            <Cog className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Este cliente não possui máquinas cadastradas</p>
          </CardContent>
        </Card>
      ) : maquinas.length > 0 ? (
        <>
          {/* Lista de Máquinas */}
          <div className="space-y-3">
            {maquinas.map((maquina, index) => (
              <Card key={maquina.id} className="border-0 shadow-lg bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{maquina.codigo} - {maquina.tipo?.descricao || 'Tipo não definido'}</p>
                      <p className="text-xs text-muted-foreground">Moeda: {getMoedaLabel(maquina.moeda)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                        onClick={() => repetirLeitura(index)}
                        title="Repetir leitura anterior"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-9 w-9 overflow-hidden rounded-md ${maquina.fotoProcessada ? 'p-0 hover:opacity-80' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        onClick={() => abrirModalFoto(maquina)}
                      >
                        {maquina.fotoProcessada ? (
                          <img
                            src={maquina.fotoProcessada}
                            alt="Foto com tarja"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Camera className="w-5 h-5" />
                        )}
                      </Button>
                    </div>
                  </div>
                  {/* Cabeçalho das colunas */}
                  <div className={`grid gap-2 mb-2 text-xs text-muted-foreground text-center ${modoOperacao === 'AJUSTE' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    <span>ANTERIOR</span>
                    <span>ATUAL</span>
                    {modoOperacao !== 'AJUSTE' && <span>SALDO</span>}
                  </div>
                  {/* Linha Entrada */}
                  <div className={`grid gap-2 mb-2 ${modoOperacao === 'AJUSTE' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-success font-bold">E</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={maquina.entradaAtual || 0}
                        disabled
                        className="bg-field-bg border-field-border text-success text-right pr-2 pl-6 h-10 font-mono no-spinners"
                      />
                    </div>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={maquina.novaEntrada}
                      onChange={(e) => handleNovaEntrada(index, e.target.value)}
                      onBlur={() => validateNovaEntrada(index)}
                      ref={(el) => { entradaRefs.current[index] = el; }}
                      className={`bg-muted border-border text-foreground text-right pr-2 h-10 font-mono no-spinners ${empresa?.permitirDigitacaoLeitura === false ? 'opacity-70 cursor-not-allowed' : ''}`}
                      placeholder="0"
                      readOnly={empresa?.permitirDigitacaoLeitura === false}
                    />
                    {modoOperacao !== 'AJUSTE' && (
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={maquina.novaEntrada ? maquina.diferencaEntrada : 0}
                      disabled
                      className={`text-right pr-2 h-10 font-mono no-spinners ${(maquina.novaEntrada ? maquina.diferencaEntrada : 0) >= 0 ? 'bg-success-bg border-success/30 text-success' : 'bg-danger-bg border-danger/30 text-danger'}`}
                    />
                    )}
                  </div>
                  {/* Linha Saída */}
                  <div className={`grid gap-2 ${modoOperacao === 'AJUSTE' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-danger font-bold">S</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={maquina.saidaAtual || 0}
                        disabled
                        className="bg-field-bg border-field-border text-success text-right pr-2 pl-6 h-10 font-mono no-spinners"
                      />
                    </div>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={maquina.novaSaida}
                      onChange={(e) => handleNovaSaida(index, e.target.value)}
                      onBlur={() => validateNovaSaida(index)}
                      ref={(el) => { saidaRefs.current[index] = el; }}
                      className={`bg-muted border-border text-foreground text-right pr-2 h-10 font-mono no-spinners ${empresa?.permitirDigitacaoLeitura === false ? 'opacity-70 cursor-not-allowed' : ''}`}
                      placeholder="0"
                      readOnly={empresa?.permitirDigitacaoLeitura === false}
                    />
                    {modoOperacao !== 'AJUSTE' && (
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={maquina.novaSaida ? maquina.diferencaSaida : 0}
                      disabled
                      className={`text-right pr-2 h-10 font-mono no-spinners ${(maquina.novaSaida ? maquina.diferencaSaida : 0) >= 0 ? 'bg-danger-bg border-danger/30 text-danger' : 'bg-success-bg border-success/30 text-success'}`}
                    />
                    )}
                  </div>
                  {/* Crédito e Saldo da máquina */}
                  {modoOperacao !== 'AJUSTE' && (
                  <div className="flex justify-between mt-3 text-sm">
                    <span className="text-muted-foreground">X {getMoedaLabel(maquina.moeda || 'M010')}</span>
                    <span className={(maquina.novaEntrada || maquina.novaSaida) ? (maquina.saldoMaquina >= 0 ? 'text-success' : 'text-danger') : 'text-muted-foreground'}>
                      Saldo: R$ {formatNumber((maquina.novaEntrada || maquina.novaSaida) ? (maquina.saldoMaquina || 0) : 0)}
                    </span>
                  </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ENTRADAS — disponível apenas no modo LEITURA */}
          {modoOperacao === 'LEITURA' && (
          <Collapsible open={receitasAberto} onOpenChange={setReceitasAberto}>
            <Card className="border-0 shadow-lg bg-card">
              <CollapsibleTrigger asChild>
                <CardContent className="p-4 cursor-pointer hover:bg-accent/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${receitasAberto ? 'rotate-90' : ''}`} />
                    <h3 className="font-semibold text-foreground">ENTRADAS</h3>
                  </div>
                </CardContent>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="px-4 pb-4 pt-0">
                  <div className="space-y-2">
                    {receitasItens.map((item) => (
                      <div key={item.id} className="grid grid-cols-[1fr_100px_28px] gap-2 items-center">
                        <div className="flex items-center gap-1">
                          <Input
                            type="text"
                            value={item.descricao}
                            onChange={(e) => atualizarReceita(item.id, 'descricao', e.target.value)}
                            placeholder={item.fixo ? item.descricao : 'DESCRIÇÃO...'}
                            disabled={item.fixo}
                            className={`bg-muted border-border text-foreground text-sm h-8 flex-1 min-w-0 ${item.fixo ? 'font-semibold text-muted-foreground' : ''}`}
                            style={{ textTransform: 'uppercase' }}
                          />
                          {item.id === 'leitura' && (
                            <Calculator className="w-4 h-4 text-muted-foreground shrink-0" />
                          )}
                        </div>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={item.valor}
                          onChange={(e) => atualizarReceita(item.id, 'valor', e.target.value)}
                          onBlur={(e) => formatarValorReceita(item.id, e.target.value)}
                          placeholder="0,00"
                          disabled={item.readonly || false}
                          className={`bg-muted border-border text-foreground text-sm h-8 text-right ${item.readonly ? 'bg-primary/10 border-primary/20 font-bold text-primary cursor-not-allowed' : ''}`}
                        />
                        {!item.fixo && !item.readonly ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removerReceita(item.id)}
                            className="h-8 w-7 p-0 text-muted-foreground hover:text-danger"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        ) : (
                          <div className="w-7" />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end mt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); adicionarReceita(); }}
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="w-3 h-3 mr-1" /> Outra
                    </Button>
                  </div>
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
                    <span className="text-xs font-semibold text-muted-foreground">Total ENTRADAS</span>
                    <span className="text-xs font-bold text-success">R$ {formatNumber(calcularTotalReceitas())}</span>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
          )}

          {/* SAÍDAS — disponível apenas no modo LEITURA */}
          {modoOperacao === 'LEITURA' && (
          <Collapsible open={despesasAberto} onOpenChange={setDespesasAberto}>
            <Card className="border-0 shadow-lg bg-card">
              <CollapsibleTrigger asChild>
                <CardContent className="p-4 cursor-pointer hover:bg-accent/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${despesasAberto ? 'rotate-90' : ''}`} />
                    <h3 className="font-semibold text-foreground">SAÍDAS</h3>
                  </div>
                </CardContent>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="px-4 pb-4 pt-0">
                  <div className="space-y-2">
                    {despesasItens.map((item, index) => (
                      <div key={item.id} className="grid grid-cols-[1fr_100px_28px] gap-2 items-center">
                        <div className="flex items-center gap-1">
                          <Input
                            type="text"
                            value={item.descricao}
                            onChange={(e) => atualizarDespesa(item.id, 'descricao', e.target.value)}
                            placeholder={item.fixo ? item.descricao : 'DESCRIÇÃO...'}
                            disabled={item.fixo}
                            className={`bg-muted border-border text-foreground text-sm h-8 flex-1 min-w-0 ${item.fixo ? 'font-semibold text-muted-foreground' : ''}`}
                            style={{ textTransform: 'uppercase' }}
                          />
                          {item.id === 'mercado' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => abrirModalMercado()}
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-warning shrink-0"
                              title="Capturar cupons fiscais"
                            >
                              <Camera className="w-4 h-4" />
                            </Button>
                          )}
                          {item.id === 'cartao' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => abrirModalCartao()}
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-warning shrink-0"
                              title="Capturar canhotos de cartão"
                            >
                              <Camera className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={item.valor}
                          onChange={(e) => atualizarDespesa(item.id, 'valor', e.target.value)}
                          onBlur={(e) => formatarValorDespesa(item.id, e.target.value)}
                          placeholder="0,00"
                          className="bg-muted border-border text-foreground text-sm h-8 text-right"
                        />
                        {!item.fixo ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removerDespesa(item.id)}
                            className="h-8 w-7 p-0 text-muted-foreground hover:text-danger"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        ) : (
                          <div className="w-7" />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end mt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); adicionarDespesa(); }}
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="w-3 h-3 mr-1" /> Outra
                    </Button>
                  </div>
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
                    <span className="text-xs font-semibold text-muted-foreground">Total SAÍDAS</span>
                    <span className="text-xs font-bold text-red-400">R$ {formatNumber(calcularTotalDespesas())}</span>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
          )}

          {/* Resultado da Leitura - ocultar se houver receita, despesa, e no modo AJUSTE */}
          {modoOperacao !== 'AJUSTE' && totais.totalReceitas === 0 && totais.totalDespesas === 0 && (
          <Card className="border-0 shadow-lg bg-card">
            <CardContent className="p-4">
              <h3 className="font-semibold text-foreground mb-3">
                {modoOperacao === 'COBRANCA' ? 'TOTALIZAÇÃO DA COBRANÇA' : 'RESULTADO DA LEITURA'}
              </h3>
              {modoOperacao === 'LEITURA' ? (
                /* MODO LEITURA: apenas Entradas, Saidas e Fechamento */
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total das Entradas:</span>
                    <span className="text-success font-bold">R$ {formatNumber(totais.entradas)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total das Saídas:</span>
                    <span className="text-danger font-bold">R$ {formatNumber(totais.saidas)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 mt-1">
                    <span className="text-foreground font-semibold">Fechamento:</span>
                    <div className="flex items-center gap-2">
                      <Badge className={`${Math.abs(totais.jogado) < 0.01 ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : totais.jogado > 0 ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'} text-[10px] px-1.5 py-0`}>
                        {Math.abs(totais.jogado) < 0.01 ? 'Fechou' : totais.jogado > 0 ? 'Sobrou' : 'Faltou'}
                      </Badge>
                      <span className={`font-bold ${Math.abs(totais.jogado) < 0.01 ? 'text-green-400' : totais.jogado > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                        R$ {formatNumber(Math.abs(totais.jogado))}{totais.jogado < 0 ? ' (-)' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* MODO COBRANCA: completo (Entrada, Jogado, Saida, Cliente, Debitos, Totalizacao) */
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Entrada:</span>
                    <span className="text-success">R$ {formatNumber(totais.entradas)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Jogado:</span>
                    <span className="text-foreground">R$ {formatNumber(totais.jogado)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Saída:</span>
                    <span className="text-danger">R$ {formatNumber(totais.saidas)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cliente ({clienteSelecionado?.acertoPercentual ?? 50}%):</span>
                    <span className="text-warning">R$ {formatNumber(totais.cliente)}</span>
                  </div>
                  <div className="flex justify-between col-span-2">
                    <span className="text-muted-foreground">Total dos Débitos(Saldo):</span>
                    <span className={debitosVencidos > 0 ? 'text-red-400 font-bold' : 'text-muted-foreground'}>R$ {formatNumber(debitosVencidos)}</span>
                  </div>
                  <div className="flex justify-between col-span-2 border-t border-border pt-2 mt-1">
                    <span className="text-foreground font-semibold">Totalização:</span>
                    <span className={`font-bold ${totais.fechamento >= 0 ? 'text-success' : 'text-danger'}`}>R$ {formatNumber(totais.fechamento)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {/* Resultado da Leitura (só quando houver receitas ou despesas) */}
          {modoOperacao === 'LEITURA' && (totais.totalReceitas !== 0 || totais.totalDespesas !== 0) && (
            <Card className={`border-0 shadow-lg bg-card`}>
              <CardContent className="p-4">
                <h3 className="font-semibold text-foreground mb-3">
                  RESULTADO DA LEITURA
                </h3>
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ENTRADAS:</span>
                    <span className="text-success font-bold">R$ {formatNumber(totais.totalReceitas)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SAÍDAS:</span>
                    <span className="text-danger font-bold">R$ {formatNumber(totais.totalDespesas)}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-border pt-2 mt-1">
                    <span className="text-foreground font-semibold">Resultado:</span>
                    <div className="flex items-center gap-2">
                    {(() => {
                      const resultado = totais.fechamento;
                      const isZero = Math.abs(resultado) < 0.01;
                      return (
                        <>
                          <Badge className={`${isZero ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : resultado > 0 ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'} text-[10px] px-1.5 py-0`}>
                            {isZero ? 'Fechou' : resultado > 0 ? 'Sobrou' : 'Faltou'}
                          </Badge>
                          <span className={`font-bold ${isZero ? 'text-green-400' : resultado > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                            R$ {formatNumber(Math.abs(resultado))}{resultado < 0 ? ' (-)' : ''}
                          </span>
                        </>
                      );
                    })()}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Card — Forma de Pagamento — exibir somente no modo COBRANCA quando houver valor líquido a cobrar */}
          {modoOperacao === 'COBRANCA' && valorLiquido > 0 && (
            <Card className="border-sky-500/20 bg-gradient-to-br from-sky-500/5 to-blue-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-sky-500" />
                  Forma de Pagamento
                </CardTitle>
                <CardDescription className="text-xs">
                  Selecione como o cliente ira efetuar o pagamento
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setFormaPagamento(formaPagamento === 'DINHEIRO' ? null : 'DINHEIRO')}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all ${
                      formaPagamento === 'DINHEIRO'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-sm shadow-emerald-500/20'
                        : 'border-border bg-muted/30 text-muted-foreground hover:border-emerald-500/40 hover:bg-emerald-500/5'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      formaPagamento === 'DINHEIRO' ? 'bg-emerald-500/20' : 'bg-muted'
                    }`}>
                      <DollarSign className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-medium">Dinheiro</span>
                  </button>
                  <button
                    onClick={() => empresa?.mercadopagoAccessToken && setFormaPagamento(formaPagamento === 'MERCADO_PAGO' ? null : 'MERCADO_PAGO')}
                    disabled={!empresa?.mercadopagoAccessToken}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all ${
                      !empresa?.mercadopagoAccessToken
                        ? 'border-border bg-muted/10 opacity-40 cursor-not-allowed'
                        : formaPagamento === 'MERCADO_PAGO'
                          ? 'border-sky-500 bg-sky-500/10 text-sky-400 shadow-sm shadow-sky-500/20'
                          : 'border-border bg-muted/30 text-muted-foreground hover:border-sky-500/40 hover:bg-sky-500/5'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      !empresa?.mercadopagoAccessToken
                        ? 'bg-muted/50'
                        : formaPagamento === 'MERCADO_PAGO' ? 'bg-sky-500/20' : 'bg-muted'
                    }`}>
                      <ShoppingCart className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-medium">Mercado Pago</span>
                  </button>
                  <button
                    onClick={() => empresa?.pixChave && setFormaPagamento(formaPagamento === 'PIX_QRCODE' ? null : 'PIX_QRCODE')}
                    disabled={!empresa?.pixChave}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all ${
                      !empresa?.pixChave
                        ? 'border-border bg-muted/10 opacity-40 cursor-not-allowed'
                        : formaPagamento === 'PIX_QRCODE'
                          ? 'border-violet-500 bg-violet-500/10 text-violet-400 shadow-sm shadow-violet-500/20'
                          : 'border-border bg-muted/30 text-muted-foreground hover:border-violet-500/40 hover:bg-violet-500/5'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      !empresa?.pixChave
                        ? 'bg-muted/50'
                        : formaPagamento === 'PIX_QRCODE' ? 'bg-violet-500/20' : 'bg-muted'
                    }`}>
                      <QrCode className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-medium">Pix QR Code</span>
                  </button>
                </div>
                {formaPagamento && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/50 p-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-xs text-foreground font-medium">
                      {formaPagamento === 'DINHEIRO' && 'Pagamento em dinheiro'}
                      {formaPagamento === 'MERCADO_PAGO' && 'Pagamento via Mercado Pago'}
                      {formaPagamento === 'PIX_QRCODE' && 'Pagamento via Pix QR Code'}
                    </span>
                  </div>
                )}

                {/* ===== CONTEUDO DINAMICO POR FORMA DE PAGAMENTO ===== */}

                {/* DINHEIRO — Campo Valor Pago */}
                {formaPagamento === 'DINHEIRO' && (
                  <div className="mt-3 space-y-2">
                    <Separator className="bg-border" />
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <DollarSign className="w-3 h-3" />Valor Pago
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">R$</span>
                        <Input
                          type="text"
                          value={valorPago}
                          onChange={(e) => setValorPago(e.target.value)}
                          placeholder="0,00"
                          className="bg-muted border-border pl-10 text-sm font-semibold"
                        />
                      </div>
                      {valorPago && (() => {
                        const vp = parseFloat(valorPago.replace(',', '.')) || 0;
                        const diferenca = vp - valorLiquido;
                        const temTroco = diferenca >= 0;
                        return (
                          <div className="flex items-center justify-between text-xs mt-1">
                            <span className={temTroco ? 'text-emerald-400' : 'text-amber-400'}>
                              {temTroco ? 'Troco:' : 'Saldo a lançar:'}
                            </span>
                            <span className={`font-bold ${temTroco ? 'text-emerald-400' : 'text-amber-400'}`}>
                              R$ {formatNumber(Math.abs(diferenca))}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* PIX QR CODE — QR Code gerado */}
                {formaPagamento === 'PIX_QRCODE' && (
                  <div className="mt-3 space-y-3">
                    <Separator className="bg-border" />
                    {!empresa?.pixChave ? (
                      <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 p-3">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-xs text-amber-400 font-medium">PIX nao configurado. Configure a chave PIX na Gestao de Empresas.</span>
                      </div>
                    ) : (
                      <>
                        <div className="text-center space-y-2">
                          {qrCodeDataUrl ? (
                            <img
                              src={qrCodeDataUrl}
                              alt="QR Code PIX"
                              className="mx-auto rounded-xl border-2 border-white shadow-lg"
                              style={{ width: 180, height: 180 }}
                            />
                          ) : (
                            <div className="w-[180px] h-[180px] mx-auto rounded-xl bg-muted flex items-center justify-center">
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-500" />
                            </div>
                          )}
                          <div className="space-y-0.5">
                            <p className="text-sm font-bold text-foreground">{empresa.pixMerchantNome || empresa.nome}</p>
                            <p className="text-xs text-muted-foreground">Cidade: {empresa.pixMerchantCidade || '-'}</p>
                            {empresa.pixBancoNome && (
                              <p className="text-xs text-muted-foreground">Banco: {empresa.pixBancoNome}</p>
                            )}
                          </div>
                          {valorLiquido > 0 && (
                            <div className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1">
                              <span className="text-sm font-bold text-emerald-400">R$ {formatNumber(valorLiquido)}</span>
                            </div>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
                          onClick={async () => {
                            if (!qrCodeDataUrl) return;
                            try {
                              const { gerarPayloadPix } = await import('@/lib/pix-payload');
                              const payload = gerarPayloadPix({
                                chave: empresa!.pixChave!,
                                nome: empresa!.pixMerchantNome || empresa!.nome || '',
                                cidade: empresa!.pixMerchantCidade || '',
                                valor: valorLiquido > 0 ? valorLiquido : undefined,
                              });
                              await navigator.clipboard.writeText(payload);
                              toast.success('Codigo PIX copiado!');
                            } catch { toast.error('Erro ao copiar'); }
                          }}
                        >
                          <Copy className="w-3 h-3 mr-1" />Copiar codigo PIX
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {/* MERCADO PAGO — PIX Interno + Cartão Brick + Fallback */}
                {formaPagamento === 'MERCADO_PAGO' && (
                  <div className="mt-3 space-y-3">
                    <Separator className="bg-border" />
                    {!empresa?.mercadopagoAccessToken ? (
                      <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 p-3">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-xs text-amber-400 font-medium">Mercado Pago nao configurado. Configure o Access Token nas configuracoes da empresa.</span>
                      </div>
                    ) : (
                      <div className="text-center space-y-3">
                        {/* Opções de pagamento MP */}
                        {!mpPixData && !mpPixLoading && (
                          <>
                            <div className="w-14 h-14 mx-auto rounded-full bg-sky-500/20 flex items-center justify-center">
                              <ShoppingCart className="w-7 h-7 text-sky-400" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm font-bold text-foreground">Mercado Pago</p>
                              <p className="text-xs text-muted-foreground">Escolha a forma de pagamento</p>
                            </div>
                            {valorLiquido > 0 && (
                              <div className="inline-flex items-center gap-1 bg-sky-500/10 border border-sky-500/30 rounded-full px-3 py-1">
                                <span className="text-sm font-bold text-sky-400">R$ {formatNumber(valorLiquido)}</span>
                              </div>
                            )}
                            <div className="grid grid-cols-1 gap-2">
                              {/* PIX via MP */}
                              <Button
                                className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white text-sm"
                                onClick={async () => {
                                  setMpPixLoading(true);
                                  try {
                                    const res = await fetch('/api/mercadopago/criar-pix', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        valor: valorLiquido,
                                        descricao: `Cobranca - ${clienteSelecionado?.nome || 'Cliente'} - ${new Date().toLocaleDateString('pt-BR')}`,
                                        nome: clienteSelecionado?.nome || '',
                                        cpfCnpj: clienteSelecionado?.cpfCnpj || '',
                                        email: clienteSelecionado?.email || '',
                                        empresaId: empresa?.id,
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
                                }}
                              >
                                <QrCode className="w-4 h-4 mr-2" />PIX (QR Code)
                              </Button>
                              {/* Cartão via Brick */}
                              <Button
                                className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white text-sm"
                                onClick={() => {
                                  if (!empresa?.mercadopagoPublicKey) {
                                    toast.error('Mercado Pago nao configurado. Configure nas Configuracoes da empresa.');
                                    return;
                                  }
                                  if (!valorLiquido || valorLiquido <= 0) {
                                    toast.error('Valor invalido para pagamento.');
                                    return;
                                  }
                                  setMpBrickOpen(true);
                                  setMpBrickLoading(true);
                                  setMpBrickReady(false);
                                  setMpBrickError('');
                                }}
                              >
                                <CreditCard className="w-4 h-4 mr-2" />Cartao de Credito / Debito
                              </Button>
                              {/* Fallback externo */}
                              <Button
                                variant="outline"
                                className="w-full text-xs border-sky-500/30 text-sky-400 hover:bg-sky-500/10"
                                onClick={async () => {
                                  try {
                                    toast.loading('Gerando checkout...');
                                    const res = await fetch('/api/mercadopago/preferencia', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        valor: valorLiquido,
                                        descricao: `Cobranca - ${clienteSelecionado?.nome || 'Cliente'} - ${new Date().toLocaleDateString('pt-BR')}`,
                                        nome: clienteSelecionado?.nome || '',
                                        cpfCnpj: clienteSelecionado?.cpfCnpj || '',
                                        email: clienteSelecionado?.email || '',
                                        empresaId: empresa?.id,
                                      }),
                                    });
                                    toast.dismiss();
                                    const data = await res.json();
                                    if (data.success && data.init_point) {
                                      window.open(data.init_point, '_blank');
                                      toast.success('Checkout aberto em nova aba!');
                                    } else {
                                      toast.error(data.error || 'Erro ao gerar checkout');
                                    }
                                  } catch {
                                    toast.dismiss();
                                    toast.error('Erro ao conectar com Mercado Pago');
                                  }
                                }}
                              >
                                <ExternalLink className="w-3 h-3 mr-1" />Pagar no site do Mercado Pago
                              </Button>
                            </div>
                          </>
                        )}
                        {/* Loading PIX */}
                        {mpPixLoading && (
                          <div className="py-8 flex flex-col items-center gap-3">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
                            <span className="text-xs text-muted-foreground">Gerando QR Code PIX...</span>
                          </div>
                        )}
                        {/* PIX QR Code gerado */}
                        {mpPixData && (
                          <>
                            <div className="text-center space-y-2">
                              {mpPixData.status === 'approved' ? (
                                <div className="py-4 flex flex-col items-center gap-2">
                                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                    <CheckCircle className="w-8 h-8 text-emerald-400" />
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
                                  {valorLiquido > 0 && (
                                    <div className="inline-flex items-center gap-1 bg-sky-500/10 border border-sky-500/30 rounded-full px-3 py-1">
                                      <span className="text-sm font-bold text-sky-400">R$ {formatNumber(valorLiquido)}</span>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-center gap-2">
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-sky-400" />
                                    <span className="text-xs text-muted-foreground">Aguardando pagamento...</span>
                                  </div>
                                </>
                              )}
                            </div>
                            {mpPixData.status !== 'approved' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full text-xs border-sky-500/30 text-sky-400 hover:bg-sky-500/10"
                                onClick={() => { setMpPixData(null); if (mpPixPollRef.current) clearInterval(mpPixPollRef.current); }}
                              >
                                <RotateCcw className="w-3 h-3 mr-1" />Gerar novo QR Code
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Botões de Ação */}
          <div className="flex gap-3">
            <Button
              onClick={cancelarDigitacao}
              disabled={saving}
              variant="outline"
              className="flex-1 border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
            >
              <X className="w-4 h-4 mr-2" />
              CANCELAR
            </Button>
            <Button
              onClick={salvarLeituras}
              disabled={saving}
              className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600"
            >
              <ClipboardList className="w-4 h-4 mr-2" />
              {saving ? 'Processando...' : modoOperacao === 'COBRANCA' ? 'EFETUAR COBRANÇA' : modoOperacao === 'LEITURA' ? 'PROCESSAR LEITURA' : 'SALVAR AJUSTES'}
            </Button>
          </div>

          {/* Modal de Lançamento de Lote */}
          <Dialog open={loteModalOpen} onOpenChange={(open) => {
            // Bloqueia clique fora e ESC — só fecha via botão X do Dialog
            // (data-slot="dialog-close") ou botão CONCLUIR (data-close-lote-modal)
            if (open === false) {
              const activeEl = document.activeElement as HTMLElement | null;
              const isExplicitClose =
                activeEl?.closest('[data-slot="dialog-close"]') ||
                activeEl?.closest('[data-close-lote-modal="true"]');
              if (isExplicitClose) {
                setLoteModalOpen(false);
                setFotosLote([]);
                setLoteProgresso(0);
                setProcessandoLote(false);
              }
              // Caso contrário (clique fora, ESC), não faz nada
            } else {
              setLoteModalOpen(true);
            }
          }}>
            <DialogContent className="bg-card border-border text-foreground max-w-md max-h-[92vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Layers className="w-5 h-5" />
                  Lançamento de Lote
                </DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Tire as fotos das maquinas. Elas serao processadas automaticamente.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Botoes Tirar Foto / Galeria */}
                {!processandoLote && (
                  <div className="flex gap-2">
                    <label className="cursor-pointer flex-1">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          event.target.value = '';
                          processarArquivoImagem(file, 'CÂMERA');
                        }}
                      />
                      <Button className="w-full bg-gradient-to-r from-indigo-500 to-purple-600" asChild>
                        <span>
                          <Camera className="w-4 h-4 mr-2" />
                          CÂMERA
                        </span>
                      </Button>
                    </label>
                    <label className="cursor-pointer flex-1">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          const files = event.target.files;
                          if (!files || files.length === 0) return;
                          const fileArray = Array.from(files);
                          event.target.value = '';
                          fileArray.forEach((file) => {
                            try { processarArquivoImagem(file, 'GALERIA'); } catch (err) { console.error('Erro foto:', err); }
                          });
                        }}
                      />
                      <Button className="w-full bg-gradient-to-r from-emerald-500 to-teal-600" asChild>
                        <span>
                          <ImageIcon className="w-4 h-4 mr-2" />
                          GALERIA
                        </span>
                      </Button>
                    </label>
                  </div>
                )}

                {/* Lista de fotos enfileiradas */}
                {fotosLote.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-muted-foreground">
                        {fotosLote.length} foto(s) na fila
                      </p>
                      {!processandoLote && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300 h-7"
                          onClick={() => setFotosLote([])}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Limpar
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                      {fotosLote.map((foto, idx) => (
                        <div
                          key={foto.id}
                          className={`flex items-center gap-3 p-2 rounded-lg border ${
                            foto.status === 'concluido' ? 'bg-success-bg border-success/30' :
                            foto.status === 'erro' ? 'bg-danger-bg border-danger/30' :
                            foto.status === 'processando' ? 'bg-amber-500/10 border-amber-500/30' :
                            'bg-muted border-border'
                          }`}
                        >
                          <img
                            src={foto.imagem}
                            alt={`Foto ${idx + 1}`}
                            className="w-14 h-14 object-cover rounded border border-border flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">Foto {idx + 1}</p>
                            {foto.status === 'pendente' && (
                              <p className="text-xs text-muted-foreground">Aguardando processamento...</p>
                            )}
                            {foto.status === 'processando' && (
                              <p className="text-xs text-amber-400">Processando...</p>
                            )}
                            {foto.status === 'concluido' && foto.resultado && (
                              <div className="text-xs space-y-0.5">
                                <p className={foto.resultado.codigoReconhecido ? 'text-success' : 'text-warning'}>
                                  Maq: {foto.resultado.codigoMaquina} {!foto.resultado.codigoReconhecido && '(nao encontrada)'}
                                </p>
                                <p className="text-muted-foreground">
                                  E: {foto.resultado.entrada ?? '-'} / S: {foto.resultado.saida ?? '-'} ({foto.resultado.confianca}%)
                                </p>
                              </div>
                            )}
                            {foto.status === 'erro' && (
                              <>
                                <p className="text-xs text-danger break-words max-w-full">{foto.erro || 'Erro'}</p>
                                <button
                                  className="text-xs text-amber-400 hover:text-amber-300 underline mt-0.5"
                                  onClick={() => setFotosLote(prev => prev.map(f =>
                                    f.id === foto.id ? { ...f, status: 'pendente' as const, erro: undefined } : f
                                  ))}
                                >
                                  Tentar novamente
                                </button>
                              </>
                            )}
                          </div>
                          {foto.status === 'pendente' && !processandoLote && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-400 hover:text-red-300 flex-shrink-0"
                              onClick={() => setFotosLote(prev => prev.filter(f => f.id !== foto.id))}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          )}
                          {foto.status === 'concluido' && (
                            <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                          )}
                          {foto.status === 'erro' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-amber-400 hover:text-amber-300 flex-shrink-0"
                              onClick={() => setFotosLote(prev => prev.map(f =>
                                f.id === foto.id ? { ...f, status: 'pendente' as const, erro: undefined } : f
                              ))}
                              title="Tentar novamente"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {fotosLote.length === 0 && !processandoLote && (
                  <div className="text-center py-6 text-muted-foreground">
                    <Layers className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Nenhuma foto na fila</p>
                    <p className="text-xs mt-1">Tire foto das maquinas para processar em lote</p>
                  </div>
                )}

                {/* Barra de Progresso durante processamento (automatico ou manual) */}
                {(processandoLote || fotosLote.some(f => f.status === 'processando')) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {processandoLote ? 'Processando lote...' : 'Processando em background...'}
                      </span>
                      <span className="font-medium text-foreground">
                        {fotosLote.filter(f => f.status === 'concluido' || f.status === 'erro').length}/{fotosLote.length}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ease-out ${processandoLote ? 'bg-gradient-to-r from-amber-500 to-orange-600' : 'bg-gradient-to-r from-indigo-500 to-purple-600'}`}
                        style={{ width: `${fotosLote.length > 0 ? (fotosLote.filter(f => f.status === 'concluido' || f.status === 'erro').length / fotosLote.length) * 100 : 0}%` }}
                      />
                    </div>
                    {!processandoLote && (
                      <p className="text-xs text-center text-muted-foreground">Voce pode continuar tirando fotos. Proxima foto em ate 30s.</p>
                    )}
                  </div>
                )}

                {/* Resultado do lote */}
                {!processandoLote && fotosLote.length > 0 && fotosLote.every(f => f.status === 'concluido' || f.status === 'erro') && (
                  <div className="space-y-3">
                    <Separator />
                    <div className="text-center">
                      <p className="font-medium text-foreground">
                        {fotosLote.filter(f => f.status === 'concluido').length} de {fotosLote.length} processadas
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Valores aplicados as maquinas correspondentes</p>
                    </div>

                    <Button
                      data-close-lote-modal="true"
                      onClick={() => {
                        setLoteModalOpen(false);
                        setFotosLote([]);
                        setLoteProgresso(0);
                      }}
                      className="w-full bg-gradient-to-r from-green-500 to-emerald-600"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      CONCLUIR
                    </Button>
                  </div>
                )}

                {/* Botao Processar Lote - so aparece se ainda ha pendentes e nada esta processando */}
                {!processandoLote && fotosLote.some(f => f.status === 'pendente') && !fotosLote.some(f => f.status === 'processando') && (
                  <Button
                    onClick={processarLote}
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-600"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    PROCESSAR LOTE ({fotosLote.filter(f => f.status === 'pendente').length})
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Modal de Captura de Foto */}
          <Dialog open={fotoModalOpen} onOpenChange={(open) => {
            // Permite fechar pelo X do Dialog (radix-ui chama onOpenChange(false))
            // quando o usuario explicitamente clica no botao de fechar.
            // Continua bloqueando clique fora e ESC — ambos tambem chamam
            // onOpenChange(false), mas o X do Dialog tem data-slot="dialog-close"
            // que e detectado abaixo.
            if (open === false) {
              // Verifica se o evento foi disparado pelo botao X do Dialog
              // (DialogPrimitive.Close tem data-slot="dialog-close")
              // ou por um botao com data-close-foto-modal="true"
              const activeEl = document.activeElement as HTMLElement | null;
              const isExplicitClose =
                activeEl?.closest('[data-slot="dialog-close"]') ||
                activeEl?.closest('[data-close-foto-modal="true"]');
              if (isExplicitClose) {
                setFotoModalOpen(false);
                setFotoCapturada(null);
                setLeituraExtraida(null);
              }
              // Caso contrario (clique fora, ESC), nao faz nada
            } else {
              setFotoModalOpen(true);
            }
          }}>
            <DialogContent className="bg-card border-border text-foreground max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Capturar Foto - {maquinaFoto?.codigo}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  {maquinaFoto?.nome}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Preview da foto capturada */}
                {fotoCapturada ? (
                  <div className="relative">
                    <img
                      src={fotoCapturada}
                      alt="Foto capturada - clique duplo para ampliar"
                      className="w-full max-h-[40vh] object-contain rounded-lg border border-border cursor-zoom-in hover:border-amber-500/50 transition-colors mx-auto"
                      onDoubleClick={handleDuploCliqueFoto}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 bg-background/80 hover:bg-card"
                      onClick={() => setFotoCapturada(null)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    <div className="absolute bottom-2 left-2 bg-background/80 px-2 py-1 rounded text-xs text-muted-foreground">
                      Duplo clique para ampliar
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                    <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground text-sm">Nenhuma foto capturada</p>
                  </div>
                )}

                {/* Botões de ação */}
                {!fotoCapturada ? (
                  <div className="grid grid-cols-2 gap-3">
                    {/* Botão Tirar Foto */}
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handleFileChange(e, 'CÂMERA')}
                        className="hidden"
                      />
                      <div className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 hover:from-amber-500/30 hover:to-orange-500/30 transition-colors">
                        <Camera className="w-6 h-6 text-warning" />
                        <span className="text-sm text-warning font-medium">Tirar Foto</span>
                      </div>
                    </label>

                    {/* Botão Galeria */}
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileChange(e, 'GALERIA')}
                        className="hidden"
                      />
                      <div className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg bg-muted border-border hover:bg-accent transition-colors">
                        <ImageIcon className="w-6 h-6 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground font-medium">Galeria</span>
                      </div>
                    </label>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Botão Extraír Leitura */}
                    <Button
                      className="w-full bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700"
                      onClick={extrairLeitura}
                      disabled={extraindoLeitura}
                    >
                      {extraindoLeitura ? (
                        <>
                          <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Analisando...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          EXTRAIR LEITURA
                        </>
                      )}
                    </Button>

                    {/* Valores Extraídos */}
                    {leituraExtraida && (
                      <div className="bg-card rounded-lg p-3 border border-border">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-muted-foreground">Valores identificados:</p>
                          {leituraExtraida.confianca !== undefined && (
                            <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
                              leituraExtraida.confianca >= 90 ? 'bg-success-bg text-success' :
                              leituraExtraida.confianca >= 70 ? 'bg-warning-bg text-warning' :
                              'bg-danger-bg text-danger'
                            }`}>
                              <span>{leituraExtraida.confianca}%</span>
                              <span className="text-muted-foreground">conf.</span>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="text-center p-2 bg-success-bg rounded border border-success/30">
                            <p className="text-xs text-success">{maquinaFoto?.tipo?.nomeEntrada || 'E'}</p>
                            <p className="text-xl font-bold text-success">{leituraExtraida.entrada ?? '-'}</p>
                          </div>
                          <div className="text-center p-2 bg-danger-bg rounded border border-danger/30">
                            <p className="text-xs text-danger">{maquinaFoto?.tipo?.nomeSaida || 'S'}</p>
                            <p className="text-xl font-bold text-danger">{leituraExtraida.saida ?? '-'}</p>
                          </div>
                        </div>
                        {leituraExtraida.confianca !== undefined && leituraExtraida.confianca < 70 && (
                          <p className="text-xs text-warning mt-2 text-center">
                            ⚠️ Baixa confiança - verifique os valores antes de aplicar
                          </p>
                        )}
                        <Button
                          className="w-full mt-3 bg-gradient-to-r from-green-500 to-emerald-600"
                          onClick={aplicarLeituraExtraida}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          APLICAR VALORES
                        </Button>
                      </div>
                    )}

                    {/* Botões Cancelar */}
                    <div className="flex gap-3">
                      <Button
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                        onClick={() => {
                          setFotoCapturada(null);
                          setLeituraExtraida(null);
                        }}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Nova Foto
                      </Button>
                    </div>


                  </div>
                )}
              </div>

              {/* Botão Sair — sempre visível no rodapé */}
              <DialogFooter className="mt-4">
                <Button
                  variant="outline"
                  data-close-foto-modal="true"
                  onClick={() => {
                    setFotoModalOpen(false);
                    setFotoCapturada(null);
                    setLeituraExtraida(null);
                  }}
                >
                  Sair
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Modal Capturar Canhotos de Cartão */}
          <Dialog open={cartaoModalOpen} onOpenChange={setCartaoModalOpen}>
            <DialogContent className="bg-card border-border text-foreground max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Capturar Canhotos de Cartão
                </DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Tire uma foto dos canhotos ou selecione da galeria. A IA irá identificar e totalizar os valores.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Preview da foto */}
                {cartaoFotoCapturada ? (
                  <div className="relative">
                    <img
                      src={cartaoFotoProcessada || cartaoFotoCapturada}
                      alt="Canhotos capturados"
                      className="w-full max-h-[40vh] object-contain rounded-lg border border-border mx-auto"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 bg-background/80 hover:bg-card"
                      onClick={() => { setCartaoFotoCapturada(null); setCartaoFotoProcessada(null); setCartaoResultado(null); }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                    <CreditCard className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground text-sm">Nenhum canhoto capturado</p>
                    <p className="text-muted-foreground text-xs mt-1">Fotografe todos os canhotos de uma vez</p>
                  </div>
                )}

                {/* Botões de captura */}
                {!cartaoFotoCapturada ? (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handleFileChangeCartao(e, 'CÂMERA')}
                        className="hidden"
                      />
                      <div className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 hover:from-amber-500/30 hover:to-orange-500/30 transition-colors">
                        <Camera className="w-6 h-6 text-warning" />
                        <span className="text-sm text-warning font-medium">Câmera</span>
                      </div>
                    </label>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileChangeCartao(e, 'GALERIA')}
                        className="hidden"
                      />
                      <div className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg bg-muted border-border hover:bg-accent transition-colors">
                        <ImageIcon className="w-6 h-6 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground font-medium">Galeria</span>
                      </div>
                    </label>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Botão Extrair Valores */}
                    <Button
                      className="w-full bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700"
                      onClick={extrairValoresCartao}
                      disabled={extraindoCartao}
                    >
                      {extraindoCartao ? (
                        <>
                          <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Analisando canhotos...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          EXTRAIR VALORES
                        </>
                      )}
                    </Button>

                    {/* Resultado da extração */}
                    {cartaoResultado && (
                      <div className="bg-card rounded-lg p-3 border border-border space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">Resultado da leitura:</p>
                          <span className="text-xs text-success font-medium">{cartaoResultado.quantidade} ticket(s)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="text-center p-2 bg-success-bg rounded border border-success/30">
                            <p className="text-xs text-success">TICKETS</p>
                            <p className="text-lg font-bold text-success">{cartaoResultado.quantidade}</p>
                          </div>
                          {cartaoResultado.totalConferido ? (
                            <div className="text-center p-2 bg-blue-50 rounded border border-blue-300">
                              <p className="text-xs text-blue-600">TOTAL</p>
                              <p className="text-lg font-bold text-blue-600">R$ {cartaoResultado.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                          ) : (
                            <div className="text-center p-2 bg-amber-50 rounded border border-amber-300">
                              <p className="text-xs text-amber-600">TOTAL (CORRIGIDO)</p>
                              <p className="text-lg font-bold text-amber-600">R$ {cartaoResultado.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                          )}
                        </div>
                        {/* Build 130: Aviso de discrepancia na soma da IA */}
                        {!cartaoResultado.totalConferido && cartaoResultado.totalIA !== undefined && (
                          <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-300 rounded-lg">
                            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                            <p className="text-xs text-amber-700">
                              A IA informou R$ {cartaoResultado.totalIA!.toFixed(2)} mas a soma dos valores e R$ {cartaoResultado.total.toFixed(2)}. O total foi corrigido automaticamente.
                            </p>
                          </div>
                        )}
                        {cartaoResultado.tickets.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {cartaoResultado.tickets.map((t, i) => (
                              <span key={i} className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                R$ {t.toFixed(2)}
                              </span>
                            ))}
                          </div>
                        )}
                        <Button
                          className="w-full mt-2 bg-gradient-to-r from-green-500 to-emerald-600"
                          onClick={aplicarValoresCartao}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          APLICAR AO CAMPO CARTÃO
                        </Button>
                      </div>
                    )}

                    {/* Botão Nova Foto */}
                    <Button
                      className="w-full bg-red-600 hover:bg-red-700 text-white"
                      onClick={() => { setCartaoFotoCapturada(null); setCartaoFotoProcessada(null); setCartaoResultado(null); }}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Nova Foto
                    </Button>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Modal de Cupons Fiscais do Mercado */}
          <Dialog open={mercadoModalOpen} onOpenChange={setMercadoModalOpen}>
            <DialogContent className="bg-card border-border text-foreground max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  Capturar Cupons Fiscais
                </DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Tire uma foto dos cupons fiscais ou selecione da galeria. A IA ira identificar e totalizar os valores.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {mercadoFotoCapturada ? (
                  <div className="relative">
                    <img
                      src={mercadoFotoProcessada || mercadoFotoCapturada}
                      alt="Cupons fiscais"
                      className="w-full max-h-[40vh] object-contain rounded-lg border border-border mx-auto"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 bg-background/80 hover:bg-card"
                      onClick={() => { setMercadoFotoCapturada(null); setMercadoFotoProcessada(null); setMercadoResultado(null); }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                    <ShoppingCart className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground text-sm">Nenhum cupom capturado</p>
                    <p className="text-muted-foreground text-xs mt-1">Fotografe todos os cupons de uma vez</p>
                  </div>
                )}

                {!mercadoFotoCapturada ? (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" capture="environment" onChange={(e) => handleFileChangeMercado(e, 'CAMERA')} className="hidden" />
                      <div className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 hover:from-amber-500/30 hover:to-orange-500/30 transition-colors">
                        <Camera className="w-6 h-6 text-warning" />
                        <span className="text-sm text-warning font-medium">Camera</span>
                      </div>
                    </label>
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" onChange={(e) => handleFileChangeMercado(e, 'GALERIA')} className="hidden" />
                      <div className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg bg-muted border-border hover:bg-accent transition-colors">
                        <ImageIcon className="w-6 h-6 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground font-medium">Galeria</span>
                      </div>
                    </label>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Button className="w-full bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700" onClick={extrairValoresMercado} disabled={extraindoMercado}>
                      {extraindoMercado ? (
                        <><div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />Analisando cupons...</>
                      ) : (
                        <><Sparkles className="w-4 h-4 mr-2" />EXTRAIR VALORES</>
                      )}
                    </Button>

                    {mercadoResultado && (
                      <div className="bg-card rounded-lg p-3 border border-border space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">Resultado da leitura:</p>
                          <span className="text-xs text-success font-medium">{mercadoResultado.quantidade} cupom(ns)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="text-center p-2 bg-success-bg rounded border border-success/30">
                            <p className="text-xs text-success">CUPONS</p>
                            <p className="text-lg font-bold text-success">{mercadoResultado.quantidade}</p>
                          </div>
                          {mercadoResultado.totalConferido ? (
                            <div className="text-center p-2 bg-blue-50 rounded border border-blue-300">
                              <p className="text-xs text-blue-600">TOTAL</p>
                              <p className="text-lg font-bold text-blue-600">R$ {mercadoResultado.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                          ) : (
                            <div className="text-center p-2 bg-amber-50 rounded border border-amber-300">
                              <p className="text-xs text-amber-600">TOTAL (CORRIGIDO)</p>
                              <p className="text-lg font-bold text-amber-600">R$ {mercadoResultado.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                          )}
                        </div>
                        {!mercadoResultado.totalConferido && mercadoResultado.totalIA !== undefined && (
                          <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-300 rounded-lg">
                            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                            <p className="text-xs text-amber-700">
                              A IA informou R$ {mercadoResultado.totalIA!.toFixed(2)} mas a soma dos valores e R$ {mercadoResultado.total.toFixed(2)}. O total foi corrigido automaticamente.
                            </p>
                          </div>
                        )}
                        {mercadoResultado.tickets.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {mercadoResultado.tickets.map((t, i) => (
                              <span key={i} className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">R$ {t.toFixed(2)}</span>
                            ))}
                          </div>
                        )}
                        <Button className="w-full mt-2 bg-gradient-to-r from-green-500 to-emerald-600" onClick={aplicarValoresMercado}>
                          <CheckCircle className="w-4 h-4 mr-2" />APLICAR AO CAMPO MERCADO
                        </Button>
                      </div>
                    )}

                    <Button className="w-full bg-red-600 hover:bg-red-700 text-white" onClick={() => { setMercadoFotoCapturada(null); setMercadoFotoProcessada(null); setMercadoResultado(null); }}>
                      <X className="w-4 h-4 mr-2" />Nova Foto
                    </Button>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Modal de Visualização em Tela Cheia */}
          <Dialog open={fotoTelaCheia} onOpenChange={(open) => { 
            if (!open) {
              setFotoTelaCheia(false); 
              setZoomFoto(1);
            }
          }}>
            <DialogContent className="bg-black border-0 p-0 max-w-none w-screen h-screen m-0 flex flex-col" style={{ width: '100vw', height: '100vh' }}>
              {/* Botão fechar */}
              <button
                className="absolute top-4 right-4 z-50 p-3 rounded-full bg-white/20 hover:bg-white/30 text-white"
                onClick={() => {
                  setFotoTelaCheia(false);
                  setZoomFoto(1);
                }}
              >
                <X className="w-6 h-6" />
              </button>

              {/* Indicador de zoom */}
              <div className="absolute top-4 left-4 z-50">
                <span className="text-sm text-white bg-white/20 px-3 py-2 rounded-lg font-medium">
                  {Math.round(zoomFoto * 100)}%
                </span>
              </div>

              {/* Container da imagem */}
              <div
                ref={imageContainerRef}
                className="flex-1 overflow-auto"
              >
                {fotoCapturada && (
                  <div
                    className="min-w-full min-h-full flex items-center justify-center p-4"
                    style={{
                      width: `${zoomFoto * 100}%`,
                      height: `${zoomFoto * 100}%`,
                    }}
                  >
                    <img
                      src={fotoCapturada}
                      alt="Foto ampliada"
                      className="max-w-full max-h-full object-contain select-none"
                      draggable={false}
                      onWheel={(e) => {
                        e.preventDefault();
                        const delta = e.deltaY > 0 ? -0.2 : 0.2;
                        setZoomFoto(prev => Math.min(5, Math.max(0.5, prev + delta)));
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Instrução */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-sm text-center px-4 pointer-events-none">
                Arraste para mover • Scroll/pinch para zoom
              </div>
            </DialogContent>
          </Dialog>

          {/* Modal do Extrato */}
          <Dialog open={extratoVisivel} onOpenChange={setExtratoVisivel}>
            <DialogContent className="bg-card border-border text-foreground max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{modoOperacao === 'COBRANCA' ? 'Totalização da Cobrança' : modoOperacao === 'LEITURA' ? 'Fechamento de Caixa' : 'Ajuste de Leitura'}</DialogTitle>
              </DialogHeader>
              
              {/* Extrato para impressão */}
              <div className="bg-white text-black p-4 rounded-lg font-mono text-sm" id="extrato-impressao">
                <div className="text-center mb-2">
                  <p className="font-bold">{clienteSelecionado?.nome?.toUpperCase()}</p>
                </div>
                <p>Data: {dataFormatada}</p>
                <p>Lançado por: {usuarioNome}</p>
                <p className="border-b border-black my-2">_____________</p>
                
                {maquinas.filter(m => m.novaEntrada || m.novaSaida).map((m) => (
                  <div key={m.id}>
                    <p className="font-bold">{m.codigo} - {m.nome?.toUpperCase()}</p>
                    <p>E {String(m.entradaAtual || 0).padStart(10)} {String(m.novaEntrada || m.entradaAtual || 0).padStart(10)}{modoOperacao !== 'AJUSTE' ? `___${formatNumber(calcularValor(m.moeda, m.diferencaEntrada))}` : ''}</p>
                    <p>S {String(m.saidaAtual || 0).padStart(10)} {String(m.novaSaida || m.saidaAtual || 0).padStart(10)}{modoOperacao !== 'AJUSTE' ? `___${formatNumber(calcularValor(m.moeda, m.diferencaSaida))}` : ''}</p>
                    {modoOperacao !== 'AJUSTE' && <p>Saldo: {formatNumber(m.saldoMaquina)}</p>}
                    <p className="border-b border-black my-2">_____________</p>
                  </div>
                ))}

                {/* Totalizacao das maquinas - logo apos as maquinas */}
                {modoOperacao !== 'AJUSTE' && (
                <div className="mt-1 space-y-1">
                  <p>Qtde Maqs....: {String(totais.quantidade).padStart(2, '0')}</p>
                  <p>Entradas.....: {formatNumber(totais.entradas)}</p>
                  <p>Saídas.......: {formatNumber(totais.saidas)}</p>
                  {modoOperacao === 'COBRANCA' && <p className="font-bold">Jogado.......: {formatNumber(totais.jogado)}</p>}
                  {modoOperacao === 'COBRANCA' && <p>Cliente ({clienteSelecionado?.acertoPercentual ?? 50}%): {formatNumber(totais.cliente)}</p>}
                  {modoOperacao === 'COBRANCA' && <p>Débitos (Saldo): {formatNumber(totais.debitoSaldo)}</p>}
                  <p className="border-b border-black my-2">_____________</p>
                </div>
                )}

                {/* Receitas detalhadas (so > 0) */}
                {receitasItens.filter(d => (parseFloat(d.valor.replace(',', '.')) || 0) > 0).length > 0 && (
                  <div>
                    <p className="border-b border-black my-2">_____________</p>
                    {receitasItens.filter(d => (parseFloat(d.valor.replace(',', '.')) || 0) > 0).map((d) => (
                      <p key={d.id}>  {(d.descricao || 'OUTROS').padEnd(13)}: {formatNumber(parseFloat(d.valor.replace(',', '.')) || 0)}</p>
                    ))}
                    <p className="font-bold text-green-700">Total ENTRADAS: {formatNumber(calcularTotalReceitas())}</p>
                    <p className="border-b border-black my-2">_____________</p>
                  </div>
                )}

                {/* Despesas detalhadas (so > 0) */}
                {despesasItens.filter(d => (parseFloat(d.valor.replace(',', '.')) || 0) > 0).length > 0 && (
                  <div>
                    {despesasItens.filter(d => (parseFloat(d.valor.replace(',', '.')) || 0) > 0).map((d) => (
                      <p key={d.id}>  {(d.descricao || 'OUTROS').padEnd(13)}: {formatNumber(parseFloat(d.valor.replace(',', '.')) || 0)}</p>
                    ))}
                    <p className="font-bold">Total SAÍDAS: {formatNumber(calcularTotalDespesas())}</p>
                    <p className="border-b border-black my-2">_____________</p>
                  </div>
                )}

                {/* FECHAMENTO final */}
                {modoOperacao !== 'AJUSTE' && (
                <div className="mt-3 space-y-1">
                  <p>ENTRADA......: {formatNumber(modoOperacao === 'COBRANCA' ? totais.jogado : totais.totalReceitas)}</p>
                  <p>SAÍDA........: {formatNumber(totais.totalDespesas)}</p>
                  <p className="font-bold">{modoOperacao === 'COBRANCA' ? 'TOTALIZAÇÃO' : 'FECHAMENTO'}..: {formatNumber(totais.fechamento)} {totais.fechamento >= 0 ? '[sobrou]' : '[faltou]'}</p>
                  <p>Saldo Anterior: {formatNumber(saldoAnterior)}</p>
                  <p>Recebido......: {formatNumber(totais.recebido)}</p>
                  <p>Saldo Atual...: {formatNumber(totais.saldoAtual)}</p>
                </div>
                )}
              </div>

              {/* Campo Recebido */}
              <div className="space-y-2 mt-4">
                <Label>Valor Recebido</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={recebido}
                  onChange={(e) => setRecebido(e.target.value)}
                  className="bg-muted border-border"
                  placeholder="0.00"
                />
              </div>

              <DialogFooter className="flex gap-2 mt-4">
                <Button variant="outline" onClick={imprimirExtrato}>
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimir
                </Button>
                <Button
                  onClick={cancelarDigitacao}
                  disabled={saving}
                  variant="outline"
                  className="border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
                >
                  <X className="w-4 h-4 mr-2" />
                  CANCELAR
                </Button>
                <Button 
                  onClick={salvarLeituras} 
                  disabled={saving}
                  className="bg-gradient-to-r from-green-500 to-emerald-600"
                >
                  {saving ? 'Processando...' : modoOperacao === 'COBRANCA' ? 'EFETUAR COBRANÇA' : modoOperacao === 'LEITURA' ? 'PROCESSAR LEITURA' : 'SALVAR AJUSTES'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Modal de Resumo após Salvar */}

          {/* Modal Extrato 2a Via — Lista de Fechamentos */}
          <Dialog open={segundaViaOpen} onOpenChange={setSegundaViaOpen}>
            <DialogContent className="bg-card border-border text-foreground max-w-sm max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-center text-base">Extrato 2a Via</DialogTitle>
              </DialogHeader>
              {segundaViaLoading ? (
                <div className="text-center py-8 text-muted-foreground">Carregando fechamentos...</div>
              ) : fechamentosAnteriores.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum fechamento encontrado para este cliente.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground mb-2">Selecione um fechamento:</p>
                  {fechamentosAnteriores.map((f) => (
                    <button
                      key={f.dataISO}
                      onClick={() => selecionarSegundaVia(f)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors text-sm ${
                        segundaViaSelecionada?.dataISO === f.dataISO
                          ? 'border-amber-500/50 bg-amber-500/10 text-amber-500'
                          : 'border-border hover:bg-muted/50 text-foreground'
                      }`}
                    >
                      <span className="font-medium">{f.data}</span>
                      {f.operadores && <p className="text-xs opacity-60 mt-0.5">{f.operadores}</p>}
                      {f.qtdFotos > 0 && <p className="text-xs opacity-60">{f.qtdFotos} foto{f.qtdFotos === 1 ? '' : 's'}</p>}
                    </button>
                  ))}
                </div>
              )}
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setSegundaViaOpen(false)}>Sair</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Modal Extrato 2a Via — Extrato Selecionado */}
          <Dialog open={segundaViaExtratoOpen} onOpenChange={setSegundaViaExtratoOpen}>
            <DialogContent className="bg-card border-border text-foreground max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-center text-base">Extrato 2a Via</DialogTitle>
              </DialogHeader>

              {/* Seletor EXTRATO / RELATÓRIO — última seleção persiste em localStorage */}
              {!segundaViaLoading && segundaViaDados.length > 0 && (
                <div className="flex gap-2 p-1 bg-muted rounded-lg">
                  <button
                    onClick={() => {
                      setSegundaViaModo('EXTRATO');
                      try { localStorage.setItem('caixafacil-2via-modo', 'EXTRATO'); } catch {}
                    }}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                      segundaViaModo === 'EXTRATO'
                        ? 'bg-amber-500 text-white shadow'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    EXTRATO
                  </button>
                  <button
                    onClick={() => {
                      setSegundaViaModo('RELATORIO');
                      try { localStorage.setItem('caixafacil-2via-modo', 'RELATORIO'); } catch {}
                    }}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                      segundaViaModo === 'RELATORIO'
                        ? 'bg-amber-500 text-white shadow'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    RELATÓRIO
                  </button>
                </div>
              )}

              {segundaViaLoading ? (
                <div className="text-center py-8 text-muted-foreground">Carregando...</div>
              ) : segundaViaDados.length > 0 ? (
                <>
                  {segundaViaModo === 'EXTRATO' ? (
                    <div className="bg-white text-black p-4 rounded-lg font-mono text-sm" id="extrato-segunda-via">
                    <div className="text-center mb-2">
                      <p className="font-bold text-xs opacity-60 mb-1">EXTRATO DE {clienteSelecionado?.formaCobranca === 'COBRANCA' ? 'COBRANÇA' : 'LEITURA'} 2a VIA</p>
                      <p className="font-bold">{clienteSelecionado?.nome?.toUpperCase()}</p>
                    </div>
                    <p>Data: {segundaViaSelecionada?.data}</p>
                    {(() => {
                      const operadores = new Set(segundaViaDados.filter(l => l.usuario?.nome).map(l => l.usuario.nome));
                      const qtdFotos = segundaViaDados.filter(l => l.fotoGcsPath).length;
                      const opTexto = Array.from(operadores).join(', ');
                      return opTexto ? <p>Operador(es): {opTexto}</p> : null;
                    })()}
                    {(() => {
                      const qtdFotos = segundaViaDados.filter(l => l.fotoGcsPath).length;
                      return qtdFotos > 0 ? <p>Fotos: {qtdFotos} leitura{qtdFotos === 1 ? '' : 's'} com registro</p> : null;
                    })()}
                    <p className="border-b border-black my-2">_____________</p>

                    {/* Agrupar por máquina — formato idêntico ao extrato original */}
                    {(() => {
                      const modo2via = clienteSelecionado?.formaCobranca === 'COBRANCA' ? 'COBRANCA' : 'LEITURA';
                      const porMaquina = new Map<string, any[]>();
                      const despesaItens: { descricao: string; valor: number }[] = [];
                      const receitaItens: { descricao: string; valor: number }[] = [];

                      segundaViaDados.forEach((l: any) => {
                        const temLeitura = l.entradaNova > 0 || l.saidaNova > 0 || l.diferencaEntrada !== 0 || l.diferencaSaida !== 0;
                        if (temLeitura) {
                          if (!porMaquina.has(l.maquinaId)) porMaquina.set(l.maquinaId, []);
                          porMaquina.get(l.maquinaId)!.push(l);
                        }
                        if (l.despesa) { try { const p = JSON.parse(l.despesa); if (Array.isArray(p)) p.forEach((d: any) => { if (d.valor > 0) despesaItens.push(d); }); } catch {} }
                        if (l.caixa) { try { const p = JSON.parse(l.caixa); if (Array.isArray(p)) p.forEach((r: any) => { if (r.valor > 0) receitaItens.push(r); }); } catch {} }
                      });

                      // Deduplicar despesas/receitas
                      const despesasFinal = Array.from(new Map(despesaItens.map(d => [d.descricao, d])).values());
                      const receitasFinal = Array.from(new Map(receitaItens.map(r => [r.descricao, r])).values());

                      const maquinasArr = Array.from(porMaquina.entries());
                      let totalEntradas = 0;
                      let totalSaidas = 0;
                      maquinasArr.forEach(([id, lws]) => {
                        totalEntradas += calcularValor(lws[0].moeda, lws[0].diferencaEntrada);
                        totalSaidas += calcularValor(lws[0].moeda, lws[0].diferencaSaida);
                      });

                      const totalReceitas = receitasFinal.reduce((a, r) => a + r.valor, 0);
                      const totalDespesas = despesasFinal.reduce((a, d) => a + d.valor, 0);
                      const jogado = totalEntradas - totalSaidas;
                      const acertoPct = clienteSelecionado?.acertoPercentual ?? 50;
                      const valorCliente = jogado * (acertoPct / 100);
                      const temItensExtras = totalReceitas > 0 || totalDespesas > 0;
                      const entradaFinal = modo2via === 'COBRANCA' ? jogado : (temItensExtras ? totalReceitas : jogado);
                      const saidaFinal = temItensExtras ? totalDespesas : 0;
                      const fechamentoFinal = temItensExtras ? saidaFinal - entradaFinal : entradaFinal;
                      const labelFech = modo2via === 'COBRANCA' ? 'TOTALIZAÇÃO' : 'FECHAMENTO';

                      return (
                        <>
                          {maquinasArr.map(([id, lws]) => {
                            const m = lws[0].maquina;
                            const e = calcularValor(lws[0].moeda, lws[0].diferencaEntrada);
                            const s = calcularValor(lws[0].moeda, lws[0].diferencaSaida);
                            return (
                              <div key={id}>
                                <p className="font-bold">{m.codigo} - {(m.tipo?.descricao || '').toUpperCase()}</p>
                                {lws[0].usuario?.nome && <p className="text-xs opacity-70">Operador: {lws[0].usuario.nome}</p>}
                                <p>E {String(lws[0].entradaAnterior || 0).padStart(10)} {String(lws[0].entradaNova || 0).padStart(10)}___{formatNumber(e)}</p>
                                <p>S {String(lws[0].saidaAnterior || 0).padStart(10)} {String(lws[0].saidaNova || 0).padStart(10)}___{formatNumber(s)}</p>
                                <p>Saldo: {formatNumber(lws[0].saldo)}</p>
                                <p className="border-b border-black my-2">_____________</p>
                              </div>
                            );
                          })}

                          <div className="mt-1 space-y-1">
                            <p>Qtde Maqs....: {String(maquinasArr.length).padStart(2, '0')}</p>
                            <p>Entradas.....: {formatNumber(totalEntradas)}</p>
                            <p>Saídas.......: {formatNumber(totalSaidas)}</p>
                            {modo2via === 'COBRANCA' && <p className="font-bold">Jogado.......: {formatNumber(jogado)}</p>}
                            {modo2via === 'COBRANCA' && <p>Cliente ({acertoPct}%): {formatNumber(valorCliente)}</p>}
                            <p className="border-b border-black my-2">_____________</p>
                          </div>

                          {modo2via !== 'COBRANCA' && receitasFinal.length > 0 && (
                            <div>
                              <p className="border-b border-black my-2">_____________</p>
                              {receitasFinal.map((r, i) => (
                                <p key={i}>  {(r.descricao || 'OUTROS').padEnd(13)}: {formatNumber(r.valor)}</p>
                              ))}
                              <p className="font-bold text-green-700">Total ENTRADAS: {formatNumber(totalReceitas)}</p>
                              <p className="border-b border-black my-2">_____________</p>
                            </div>
                          )}

                          {modo2via !== 'COBRANCA' && despesasFinal.length > 0 && (
                            <div>
                              {despesasFinal.map((d, i) => (
                                <p key={i}>  {(d.descricao || 'OUTROS').padEnd(13)}: {formatNumber(d.valor)}</p>
                              ))}
                              <p className="font-bold">Total SAÍDAS: {formatNumber(totalDespesas)}</p>
                              <p className="border-b border-black my-2">_____________</p>
                            </div>
                          )}

                          {modo2via !== 'COBRANCA' && (
                          <div className="mt-3 space-y-1">
                            <p>ENTRADA......: {formatNumber(entradaFinal)}</p>
                            <p>SAÍDA........: {formatNumber(saidaFinal)}</p>
                            <p className="font-bold">{labelFech}..: {formatNumber(fechamentoFinal)} {fechamentoFinal >= 0 ? '[sobrou]' : '[faltou]'}</p>
                          </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  ) : (
                    /* MODO RELATÓRIO — preview HTML do que será gerado no canvas A4 */
                    <div className="bg-white text-black p-3 rounded-lg" id="relatorio-segunda-via">
                      <div className="text-center mb-3">
                        <p className="font-bold text-base mb-1">
                          {clienteSelecionado?.formaCobranca === 'COBRANCA' ? 'RELATÓRIO DE COBRANÇA' : 'RELATÓRIO DE LEITURA'}
                        </p>
                        <p className="font-bold text-sm">{clienteSelecionado?.nome?.toUpperCase()}</p>
                        <p className="text-sm">Data: {segundaViaSelecionada?.data}</p>
                        {(() => {
                          const operadores = new Set(segundaViaDados.filter((l: any) => l.usuario?.nome).map((l: any) => l.usuario.nome));
                          return operadores.size > 0 ? <p className="text-sm">Operador(es): {Array.from(operadores).join(', ')}</p> : null;
                        })()}
                      </div>

                      {/* Cards de máquinas com foto em miniatura */}
                      {(() => {
                        const modo2via = clienteSelecionado?.formaCobranca === 'COBRANCA' ? 'COBRANCA' : 'LEITURA';
                        const porMaquina = new Map<string, any[]>();
                        const despesaItens: { descricao: string; valor: number }[] = [];
                        const receitaItens: { descricao: string; valor: number }[] = [];
                        segundaViaDados.forEach((l: any) => {
                          const temLeitura = l.entradaNova > 0 || l.saidaNova > 0 || l.diferencaEntrada !== 0 || l.diferencaSaida !== 0;
                          if (temLeitura) {
                            if (!porMaquina.has(l.maquinaId)) porMaquina.set(l.maquinaId, []);
                            porMaquina.get(l.maquinaId)!.push(l);
                          }
                          if (l.despesa) { try { const p = JSON.parse(l.despesa); if (Array.isArray(p)) p.forEach((d: any) => { if (d.valor > 0) despesaItens.push(d); }); } catch {} }
                          if (l.caixa) { try { const p = JSON.parse(l.caixa); if (Array.isArray(p)) p.forEach((r: any) => { if (r.valor > 0) receitaItens.push(r); }); } catch {} }
                        });
                        const despesasFinal = Array.from(new Map(despesaItens.map(d => [d.descricao, d])).values());
                        const receitasFinal = Array.from(new Map(receitaItens.map(r => [r.descricao, r])).values());
                        const maquinasArr = Array.from(porMaquina.entries());
                        let totalEntradas = 0;
                        let totalSaidas = 0;
                        maquinasArr.forEach(([id, lws]) => {
                          totalEntradas += calcularValor(lws[0].moeda, lws[0].diferencaEntrada);
                          totalSaidas += calcularValor(lws[0].moeda, lws[0].diferencaSaida);
                        });
                        const totalReceitas = receitasFinal.reduce((a, r) => a + r.valor, 0);
                        const totalDespesas = despesasFinal.reduce((a, d) => a + d.valor, 0);
                        const jogado = totalEntradas - totalSaidas;
                        const acertoPct = clienteSelecionado?.acertoPercentual ?? 50;
                        const valorCliente = jogado * (acertoPct / 100);
                        const temItensExtras = totalReceitas > 0 || totalDespesas > 0;
                        const fechamentoFinal = temItensExtras ? (totalDespesas - totalReceitas) : jogado;

                        return (
                          <>
                            {/* Cards de cada máquina */}
                            <div className="space-y-2 mb-3">
                              {maquinasArr.map(([id, lws]) => {
                                const m = lws[0].maquina;
                                const e = calcularValor(lws[0].moeda, lws[0].diferencaEntrada);
                                const s = calcularValor(lws[0].moeda, lws[0].diferencaSaida);
                                const foto = segundaViaFotos.find(f => f.maquinaId === id || f.codigo === m.codigo);
                                return (
                                  <div key={id} className="border border-gray-700 rounded p-2 flex gap-3">
                                    {/* Miniatura da foto — object-contain para não cortar a tarja vermelha */}
                                    <div className="w-24 h-24 flex-shrink-0 bg-gray-200 rounded overflow-hidden flex items-center justify-center">
                                      {foto ? (
                                        <img src={foto.fotoBase64} alt={m.codigo} className="w-full h-full object-contain" />
                                      ) : (
                                        <span className="text-xs text-gray-500">sem foto</span>
                                      )}
                                    </div>
                                    {/* Dados da máquina */}
                                    <div className="flex-1 text-sm">
                                      {/* Linha 1: Código + Nome (negrito) + Moeda (sem negrito) */}
                                      <p className="text-base">
                                        <span className="font-bold">
                                          {m.codigo} - {(m.tipo?.descricao || '').toUpperCase()}
                                        </span>{' '}
                                        <span className="font-normal">
                                          {(() => {
                                            const multMap: Record<string, number> = { M001: 0.01, M005: 0.05, M010: 0.10, M025: 0.25 };
                                            const mult = multMap[lws[0].moeda || 'M001'] ?? 0.01;
                                            return `x${mult.toString().replace('.', ',')}`;
                                          })()}
                                        </span>
                                      </p>
                                      {/* Linha 2: Entrada — apenas números, sem prefixo */}
                                      <p>
                                        {lws[0].entradaNova || 0} - {lws[0].entradaAnterior || 0} = {(lws[0].entradaNova || 0) - (lws[0].entradaAnterior || 0)}
                                      </p>
                                      {/* Linha 3: Saída — apenas números, sem prefixo */}
                                      <p>
                                        {lws[0].saidaNova || 0} - {lws[0].saidaAnterior || 0} = {(lws[0].saidaNova || 0) - (lws[0].saidaAnterior || 0)}
                                      </p>
                                      {/* Linha 4: Saldo (total entradas - total saídas × moeda) */}
                                      <p className="font-medium">Saldo: {formatNumber(lws[0].saldo)}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Receitas/Despesas extras — lado a lado com moldura */}
                            {modo2via !== 'COBRANCA' && (receitasFinal.length > 0 || despesasFinal.length > 0) && (
                              <div className="grid grid-cols-2 gap-2 mb-3">
                                {receitasFinal.length > 0 && (
                                  <div className="border-2 border-blue-700 bg-blue-50 rounded p-2 text-sm">
                                    <p className="font-bold text-blue-700 mb-1">ENTRADA</p>
                                    {receitasFinal.map((r, i) => <p key={i}>  {r.descricao}: {formatNumber(r.valor)}</p>)}
                                    <p className="font-bold text-blue-700 mt-1">Total: {formatNumber(totalReceitas)}</p>
                                  </div>
                                )}
                                {despesasFinal.length > 0 && (
                                  <div className="border-2 border-red-700 bg-red-50 rounded p-2 text-sm">
                                    <p className="font-bold text-red-700 mb-1">SAÍDA</p>
                                    {despesasFinal.map((d, i) => <p key={i}>  {d.descricao}: {formatNumber(d.valor)}</p>)}
                                    <p className="font-bold text-red-700 mt-1">Total: {formatNumber(totalDespesas)}</p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Cards de totais em molduras (3 lado a lado) — ENTRADA, SAÍDA, FECHAMENTO */}
                            <div className="grid grid-cols-3 gap-2 mt-3">
                              {/* Card 1: Total Entrada (azul) */}
                              <div className="border-2 border-blue-700 bg-blue-50 rounded p-2 text-center">
                                <p className="font-bold text-blue-700 text-xs">ENTRADA</p>
                                <p className="font-bold text-base text-blue-900">{formatNumber(totalReceitas)}</p>
                              </div>
                              {/* Card 2: Total Saída (vermelho) */}
                              <div className="border-2 border-red-700 bg-red-50 rounded p-2 text-center">
                                <p className="font-bold text-red-700 text-xs">SAÍDA</p>
                                <p className="font-bold text-base text-red-900">{formatNumber(totalDespesas)}</p>
                              </div>
                              {/* Card 3: Fechamento — título dinâmico (SOBROU/FECHOU/FALTOU) e cor conforme valor */}
                              {(() => {
                                // > 0 → SOBROU (verde)
                                // = 0 → FECHOU (azul)
                                // < 0 → FALTOU (vermelho)
                                if (fechamentoFinal > 0) {
                                  return (
                                    <div className="border-2 border-green-700 bg-green-50 rounded p-2 text-center">
                                      <p className="font-bold text-green-700 text-xs">SOBROU</p>
                                      <p className="font-bold text-base text-green-900">{formatNumber(fechamentoFinal)}</p>
                                    </div>
                                  );
                                } else if (fechamentoFinal === 0) {
                                  return (
                                    <div className="border-2 border-blue-700 bg-blue-50 rounded p-2 text-center">
                                      <p className="font-bold text-blue-700 text-xs">FECHOU</p>
                                      <p className="font-bold text-base text-blue-900">{formatNumber(fechamentoFinal)}</p>
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div className="border-2 border-red-700 bg-red-50 rounded p-2 text-center">
                                      <p className="font-bold text-red-700 text-xs">FALTOU</p>
                                      <p className="font-bold text-base text-red-900">{formatNumber(fechamentoFinal)}</p>
                                    </div>
                                  );
                                }
                              })()}
                            </div>

                            {modo2via === 'COBRANCA' && (
                              <p className="text-center mt-2 text-sm">Cliente ({acertoPct}%): {formatNumber(valorCliente)}</p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  <DialogFooter className="flex gap-2 mt-4">
                    <Button variant="outline" onClick={() => window.print()}>
                      <Printer className="w-4 h-4 mr-2" />
                      Imprimir
                    </Button>
                    <Button
                      onClick={segundaViaModo === 'RELATORIO' ? enviarWhatsAppRelatorio2aVia : gerarWhatsAppSegundaVia}
                      className="bg-gradient-to-r from-green-500 to-emerald-600"
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />
                      {segundaViaModo === 'RELATORIO' ? 'WhatsApp (Relatório PDF)' : 'WhatsApp (Somente Extrato)'}
                    </Button>
                    <Button
                      onClick={enviarTelegram2aVia}
                      className="bg-sky-500 hover:bg-sky-600 text-white"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Telegram (Fotos + Extrato)
                    </Button>
                    <Button variant="outline" onClick={() => { setSegundaViaExtratoOpen(false); setSegundaViaSelecionada(null); }}>
                      <X className="w-4 h-4 mr-2" />
                      Sair
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">Nenhuma leitura encontrada.</div>
              )}
            </DialogContent>
          </Dialog>
          <Dialog open={resumoModalOpen} onOpenChange={setResumoModalOpen}>
            <DialogContent className="bg-card border-border text-foreground max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-center text-xl">{modoOperacao === 'COBRANCA' ? '✅ Cobrança Salva!' : modoOperacao === 'LEITURA' ? '✅ Leitura Processada!' : '✅ Ajustes Salvos!'}</DialogTitle>
              </DialogHeader>
              
              {/* Resumo das Máquinas Salvas - Formato Extrato */}
              <div className="bg-white text-black p-4 rounded-lg font-mono text-sm">
                <div className="text-center mb-2">
                  <p className="font-bold">{clienteSelecionado?.nome?.toUpperCase()}</p>
                </div>
                <p>Data: {dataFormatada}</p>
                <p>Lançado por: {usuarioNome}</p>
                <div className="border-b border-black my-2"></div>
                
                {maquinasSalvas.map((m) => {
                  const nomeMaquina = (m.tipo?.descricao || m.codigo || 'MÁQUINA').toUpperCase();
                  return (
                    <div key={m.id}>
                      <p className="font-bold">{m.codigo} - {nomeMaquina}</p>
                      <p>E {String(m.entradaAtual || 0).padStart(8)} {String(m.novaEntrada || m.entradaAtual || 0).padStart(8)}{modoOperacao !== 'AJUSTE' ? `___${formatNumber(calcularValor(m.moeda, m.diferencaEntrada))}` : ''}</p>
                      <p>S {String(m.saidaAtual || 0).padStart(8)} {String(m.novaSaida || m.saidaAtual || 0).padStart(8)}{modoOperacao !== 'AJUSTE' ? `___${formatNumber(calcularValor(m.moeda, m.diferencaSaida))}` : ''}</p>
                      {modoOperacao !== 'AJUSTE' && <p>Saldo: {formatNumber(m.saldoMaquina || 0)}</p>}
                    </div>
                  );
                })}

                {/* Separador apos cards das maquinas */}
                <div className="border-b border-black my-2"></div>

                {/* Totalizacao das maquinas - logo apos as maquinas */}
                {modoOperacao !== 'AJUSTE' && (() => {
                  const ts = calcularTotaisSalvos();
                  return (
                <div className="mt-1 space-y-1">
                  <p>Qtde Maqs....: {String(maquinasSalvas.length).padStart(2, '0')}</p>
                  <p>Entradas.....: {formatNumber(ts.entradas)}</p>
                  <p>Saídas.......: {formatNumber(ts.saidas)}</p>
                  <p className="font-bold">Jogado.......: {formatNumber(ts.jogado)}</p>
                  {modoOperacao === 'COBRANCA' && <p>Cliente ({clienteSelecionado?.acertoPercentual ?? 50}%): {formatNumber(ts.cliente)}</p>}
                  {modoOperacao === 'COBRANCA' && <p>Débitos (Saldo): {formatNumber(ts.debitoSalvo || 0)}</p>}
                  <div className="border-b border-black my-2"></div>
                </div>
                  );
                })()}

                {/* Receitas detalhadas (so > 0) */}
                {receitasSalvas.filter(d => d.valor > 0).length > 0 && (
                  <div>
                    {receitasSalvas.filter(d => d.valor > 0).map((d, i) => (
                      <p key={`rec-${i}`}>  {d.descricao.padEnd(13)}: {formatNumber(d.valor)}</p>
                    ))}
                    <p className="font-bold">Total ENTRADAS: {formatNumber(calcularTotaisSalvos().receita)}</p>
                    <div className="border-b border-black my-2"></div>
                  </div>
                )}
                {/* Despesas detalhadas (so > 0) */}
                {despesasSalvas.filter(d => d.valor > 0).length > 0 && (
                  <div>
                    {despesasSalvas.filter(d => d.valor > 0).map((d, i) => (
                      <p key={`desp-${i}`}>  {d.descricao.padEnd(13)}: {formatNumber(d.valor)}</p>
                    ))}
                    <p className="font-bold">Total SAÍDAS: {formatNumber(calcularTotaisSalvos().despesa)}</p>
                    <div className="border-b border-black my-2"></div>
                  </div>
                )}
                {/* FECHAMENTO final */}
                {modoOperacao !== 'AJUSTE' && (() => {
                  const ts = calcularTotaisSalvos();
                  return (
                <div className="mt-3 space-y-1">
                  <p>ENTRADA......: {formatNumber(modoOperacao === 'COBRANCA' ? ts.jogado : ts.receita)}</p>
                  <p>SAÍDA........: {formatNumber(ts.despesa)}</p>
                  <p className="font-bold">{modoOperacao === 'COBRANCA' ? 'TOTALIZAÇÃO' : 'FECHAMENTO'}..: {formatNumber(ts.fechamento)} {ts.fechamento >= 0 ? '[sobrou]' : '[faltou]'}</p>
                </div>
                  );
                })()}
              </div>

              {/* Botões de Ação */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                <Button 
                  variant="outline" 
                  onClick={imprimirResumo}
                  className="flex flex-col items-center justify-center min-h-[4.5rem] py-3 px-2"
                >
                  <Printer className="w-7 h-7 mb-1" />
                  <span className="text-xs">Imprimir</span>
                </Button>
                <Button 
                  onClick={enviarWhatsApp}
                  className="bg-green-600 hover:bg-green-700 flex flex-col items-center justify-center min-h-[4.5rem] py-3 px-2"
                >
                  <svg className="w-7 h-7 mb-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  <span className="text-xs">WhatsApp (Somente Extrato)</span>
                </Button>
                <Button 
                  onClick={enviarTelegramResumo}
                  disabled={resumoTelegramEnviado}
                  className={`flex flex-col items-center justify-center min-h-[4.5rem] py-3 px-2 text-white ${resumoTelegramEnviado ? 'bg-sky-300 cursor-not-allowed' : 'bg-sky-500 hover:bg-sky-600'}`}
                >
                  <Send className="w-7 h-7 mb-1" />
                  <span className="text-xs">{resumoTelegramEnviado ? 'Enviado' : 'Telegram (Fotos + Extrato)'}</span>
                </Button>
                <Button 
                  variant="secondary" 
                  onClick={fecharResumo}
                  className="flex flex-col items-center justify-center min-h-[4.5rem] py-3 px-2"
                >
                  <X className="w-7 h-7 mb-1" />
                  <span className="text-xs">Sair</span>
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          {/* Dialog — Cartão via Brick Mercado Pago */}
          <Dialog open={mpBrickOpen} onOpenChange={(open) => {
            if (!open) {
              setMpBrickOpen(false);
              setMpBrickLoading(false);
              setMpBrickReady(false);
              setMpBrickError('');
              try { mpBrickInstanceRef.current?.unmount(); } catch {}
              mpBrickInstanceRef.current = null;
            }
          }}>
            <DialogContent className="bg-card border-border text-foreground max-w-lg max-h-[92vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-sky-400" />
                  Pagamento com Cartao
                  {mpBrickLoading && (
                    <Badge variant="outline" className="ml-auto text-[10px] text-sky-400 border-sky-500/30 bg-sky-500/10">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Carregando
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {valorLiquido > 0 && <span className="font-bold text-sky-400">R$ {formatNumber(valorLiquido)}</span>}
                </DialogDescription>
              </DialogHeader>

              {mpBrickError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 mb-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span className="text-xs text-red-400 font-medium">{mpBrickError}</span>
                </div>
              )}

              {/* Loading state */}
              {mpBrickLoading && !mpBrickReady && !mpBrickError && (
                <div className="py-8 flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-500" />
                  <span className="text-xs text-muted-foreground">Carregando formulario de pagamento...</span>
                </div>
              )}

              {/* Brick container */}
              <div id="mpBrickCobranca_container" ref={mpBrickContainerRef} className="min-h-[300px]" />

              {/* Fallback quando Brick falha */}
              {mpBrickError && (
                <div className="space-y-2 mt-3">
                  <Button
                    variant="outline"
                    className="w-full border-sky-500/30 text-sky-400 hover:bg-sky-500/10"
                    onClick={async () => {
                      try {
                        toast.loading('Gerando checkout...');
                        const res = await fetch('/api/mercadopago/preferencia', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            valor: valorLiquido,
                            descricao: `Cobranca - ${clienteSelecionado?.nome || 'Cliente'} - ${new Date().toLocaleDateString('pt-BR')}`,
                            nome: clienteSelecionado?.nome || '',
                            cpfCnpj: clienteSelecionado?.cpfCnpj || '',
                            email: clienteSelecionado?.email || '',
                            empresaId: empresa?.id,
                          }),
                        });
                        toast.dismiss();
                        const data = await res.json();
                        if (data.success && data.init_point) {
                          window.open(data.init_point, '_blank');
                          setMpBrickOpen(false);
                        } else {
                          toast.error(data.error || 'Erro ao gerar checkout');
                        }
                      } catch {
                        toast.dismiss();
                        toast.error('Erro ao conectar com Mercado Pago');
                      }
                    }}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Pagar no site do Mercado Pago
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setMpBrickOpen(false);
                      setMpBrickLoading(false);
                      setMpBrickReady(false);
                      setMpBrickError('');
                    }}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />Voltar
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}

// ============================================
// TIPOS DE MÁQUINA COMPONENT
// ============================================
function TiposMaquinaPage({ empresaId, isAdmin }: { empresaId: string; isAdmin: boolean }) {
  const [tipos, setTipos] = useState<TipoMaquina[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tipoEditando, setTipoEditando] = useState<TipoMaquina | null>(null);
  const [formData, setFormData] = useState({
    descricao: '',
    nomeEntrada: 'E',
    nomeSaida: 'S',
    classe: 0,
  });

  useEffect(() => {
    loadTipos();
  }, [empresaId]);

  const loadTipos = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tipos-maquina?empresaId=${empresaId}`);
      if (!res.ok) {
        toast.error('Erro ao carregar tipos de máquina');
        setTipos([]);
        return;
      }
      const data = await res.json();

      setTipos(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('Erro ao carregar tipos de máquina');
      setTipos([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.descricao) {
      toast.error('Descrição é obrigatória');
      return;
    }

    try {
      if (tipoEditando) {
        const res = await fetch(`/api/tipos-maquina/${tipoEditando.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        if (!res.ok) throw new Error();
        toast.success('Tipo atualizado!');
      } else {
        const res = await fetch('/api/tipos-maquina', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, empresaId }),
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error);
        }
        toast.success('Tipo cadastrado!');
      }
      setDialogOpen(false);
      resetForm();
      loadTipos();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar tipo';
      toast.error(message);
    }
  };

  const handleExcluir = async (tipo: TipoMaquina) => {
    if (!confirm(`Deseja excluir o tipo "${tipo.descricao}"?`)) return;

    try {
      const res = await fetch(`/api/tipos-maquina/${tipo.id}`, { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);
      toast.success('Tipo excluído');
      loadTipos();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao excluir tipo';
      toast.error(message);
    }
  };

  const resetForm = () => {
    setFormData({
      descricao: '',
      nomeEntrada: 'E',
      nomeSaida: 'S',
      classe: 0,
    });
    setTipoEditando(null);
  };

  const openEditDialog = (tipo: TipoMaquina) => {
    setTipoEditando(tipo);
    setFormData({
      descricao: tipo.descricao,
      nomeEntrada: tipo.nomeEntrada || 'E',
      nomeSaida: tipo.nomeSaida || 'S',
      classe: tipo.classe ?? 0,
    });
    setDialogOpen(true);
  };

  if (!isAdmin) {
    return (
      <Card className="border-0 shadow-lg bg-card">
        <CardContent className="py-8 text-center text-muted-foreground">
          <Settings className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Acesso restrito a administradores</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Tipos de Máquina</h2>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-gradient-to-r from-amber-500 to-orange-600">
              <Plus className="w-4 h-4 mr-1" /> Novo
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border text-foreground max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{tipoEditando ? 'Editar Tipo' : 'Novo Tipo de Máquina'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Descrição *</Label>
                <Input
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  className="bg-muted border-border"
                  placeholder="Ex: Música, Sinuca, Urso..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome Entrada</Label>
                  <Input
                    value={formData.nomeEntrada}
                    onChange={(e) => setFormData({ ...formData, nomeEntrada: e.target.value })}
                    className="bg-muted border-border"
                    placeholder="E"
                    maxLength={21}
                  />
                  <p className="text-xs text-muted-foreground">Label do campo de entrada</p>
                </div>
                <div className="space-y-2">
                  <Label>Nome Saída</Label>
                  <Input
                    value={formData.nomeSaida}
                    onChange={(e) => setFormData({ ...formData, nomeSaida: e.target.value })}
                    className="bg-muted border-border"
                    placeholder="S"
                    maxLength={21}
                  />
                  <p className="text-xs text-muted-foreground">Label do campo de saída</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Classe</Label>
                <select
                  value={formData.classe}
                  onChange={(e) => setFormData({ ...formData, classe: parseInt(e.target.value) })}
                  className="w-full h-9 rounded-md border border-border bg-muted px-3 text-sm text-foreground"
                >
                  <option value={0}>Primária</option>
                  <option value={1}>Secundária</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} className="bg-gradient-to-r from-amber-500 to-orange-600">
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : tipos.length === 0 ? (
        <Card className="border-0 shadow-lg bg-card">
          <CardContent className="py-8 text-center text-muted-foreground">
            <Layers className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum tipo de máquina cadastrado</p>
            <p className="text-sm mt-2">Cadastre tipos para usar nas máquinas</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tipos.map((tipo) => (
            <Card key={tipo.id} className={`border-0 shadow-lg ${!tipo.ativo ? 'bg-accent/50' : 'bg-card'}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{tipo.descricao}</p>
                      <Badge variant={tipo.classe === 0 ? 'default' : 'secondary'} className={tipo.classe === 0 ? 'bg-emerald-600 text-white' : ''}>
                        {tipo.classe === 0 ? 'Primária' : 'Secundária'}
                      </Badge>
                      {!tipo.ativo && (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span>Entrada: <strong className="text-green-400">{tipo.nomeEntrada}</strong></span>
                      <span>Saída: <strong className="text-red-400">{tipo.nomeSaida}</strong></span>
                      <span>{tipo._count?.maquinas || 0} máquinas</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => openEditDialog(tipo)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-400"
                      onClick={() => handleExcluir(tipo)}
                      disabled={(tipo._count?.maquinas || 0) > 0}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// PAGAMENTOS COMPONENT
// ============================================
function PagamentosPage({ empresaId, isSupervisor }: { empresaId: string; isSupervisor: boolean }) {
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');

  useEffect(() => {
    loadPagamentos();
  }, [empresaId]);

  useEffect(() => {
    loadPagamentos();
  }, [filtroStatus]);

  const loadPagamentos = async () => {
    setLoading(true);
    try {
      let url = `/api/pagamentos?empresaId=${empresaId}`;
      if (filtroStatus !== 'todos') url += `&status=${filtroStatus}`;
      const res = await fetch(url);
      const data = await res.json();

      setPagamentos(data);
    } catch (error) {
      toast.error('Erro ao carregar pagamentos');
    } finally {
      setLoading(false);
    }
  };

  const handleMarcarPago = async (pagamento: Pagamento) => {
    try {
      await fetch(`/api/pagamentos/${pagamento.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'PAGO',
          dataPagamento: new Date().toISOString(),
          formaPagamento: 'PIX',
        }),
      });
      toast.success('Pagamento marcado como pago!');
      loadPagamentos();
    } catch {
      toast.error('Erro ao atualizar pagamento');
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; color: string }> = {
      PENDENTE: { variant: 'outline', color: 'text-amber-400 border-amber-500/50' },
      PAGO: { variant: 'default', color: 'bg-green-600' },
      ATRASADO: { variant: 'destructive', color: '' },
      CANCELADO: { variant: 'secondary', color: '' },
    };
    const c = config[status] || config.PENDENTE;
    return (
      <Badge variant={c.variant} className={c.color}>
        {status}
      </Badge>
    );
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Pagamentos</h2>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-32 bg-card border-border">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="PENDENTE">Pendente</SelectItem>
            <SelectItem value="PAGO">Pago</SelectItem>
            <SelectItem value="ATRASADO">Atrasado</SelectItem>
            <SelectItem value="CANCELADO">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : pagamentos.length === 0 ? (
        <Card className="border-0 shadow-lg bg-card">
          <CardContent className="py-8 text-center text-muted-foreground">
            <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum pagamento encontrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {pagamentos.map((pagamento) => (
            <Card key={pagamento.id} className={`border-0 shadow-lg ${
              pagamento.status === 'ATRASADO' ? 'bg-destructive/10 border-destructive/30' :
              pagamento.status === 'PENDENTE' ? 'bg-amber-900/20' :
              'bg-card'
            }`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    pagamento.status === 'PAGO' ? 'bg-green-600' :
                    pagamento.status === 'ATRASADO' ? 'bg-red-600' :
                    'bg-amber-600'
                  }`}>
                    <DollarSign className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-foreground">{formatCurrency(pagamento.valor)}</p>
                      {getStatusBadge(pagamento.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">{pagamento.cliente?.nome || 'Cliente'}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Venc: {formatDate(pagamento.dataVencimento)}
                      </span>
                      {pagamento.dataPagamento && (
                        <span>Pago: {formatDate(pagamento.dataPagamento)}</span>
                      )}
                    </div>
                  </div>
                  {isSupervisor && pagamento.status !== 'PAGO' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-green-600 text-green-400 hover:bg-green-600 hover:text-foreground"
                      onClick={() => handleMarcarPago(pagamento)}
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Pago
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// GESTÃO DE EMPRESAS COMPONENT
// ============================================
interface EmpresaGestao {
  id: string;
  nome: string;
  cnpj?: string;
  email?: string;
  telefone?: string;
  cidade?: string;
  estado?: string;
  plano: string;
  isDemo: boolean;
  diasDemo: number;
  dataVencimento?: string;
  ativa: boolean;
  bloqueada: boolean;
  motivoBloqueio?: string;
  createdAt: string;
  diasRestantes?: number | null;
  status: string;
  _count?: { usuarios: number; clientes: number };
  // PIX Banco (cobrador POS)
  pixChaveTipo?: string;
  pixChave?: string;
  pixMerchantNome?: string;
  pixMerchantCidade?: string;
  pixBancoNome?: string;
  // Telegram Bot
  telegramBotToken?: string;
  // MP (cobrador POS)
  mercadopagoAccessToken?: string;
  mercadopagoPublicKey?: string;
  // Configuração de operação
  permitirDigitacaoLeitura?: boolean;  // Permitir digitação manual? Se false, só OCR
}

// ============================================
// RELATÓRIOS COMPONENT
// ============================================
// RelatoriosPage moved to /src/components/RelatoriosPage.tsx
// (empty - function removed from this file, imported instead)

// ============================================
// BACKUP & RESTORE COMPONENT (Admin Only)
// ============================================
function BackupRestorePage({ empresaId, nomeEmpresa }: { empresaId: string; nomeEmpresa: string }) {
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [loadingRestore, setLoadingRestore] = useState(false);
  const [backupInfo, setBackupInfo] = useState<{ dataBackup: string; resumo: Record<string, number> } | null>(null);
  const [restoredInfo, setRestoredInfo] = useState<Record<string, number> | null>(null);
  const [fileSelected, setFileSelected] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  const handleBackup = async () => {
    setLoadingBackup(true);
    setBackupInfo(null);
    try {
      const res = await fetch(`/api/backup?empresaId=${empresaId}`);
      if (!res.ok) {
        const data = await res.json();

        throw new Error(data.error || 'Erro ao gerar backup');
      }
      const data = await res.json();


      setBackupInfo({
        dataBackup: data.dataBackup,
        resumo: data.resumo,
      });

      // Download do arquivo JSON
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_${nomeEmpresa.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Backup gerado e baixado com sucesso!');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao gerar backup';
      toast.error(message);
    } finally {
      setLoadingBackup(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setRestoreFile(file);
      setFileSelected(true);
      setConfirmRestore(false);
      setRestoredInfo(null);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile) {
      toast.error('Selecione um arquivo de backup primeiro');
      return;
    }

    // Validação do arquivo
    let backupData;
    try {
      const text = await restoreFile.text();
      backupData = JSON.parse(text);

      if (!backupData.versao || !backupData.dados) {
        toast.error('Formato de backup inválido. O arquivo não contém a estrutura esperada.');
        return;
      }
    } catch {
      toast.error('O arquivo selecionado não é um backup válido. Selecione um arquivo .json de backup.');
      return;
    }

    setLoadingRestore(true);
    try {
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupData, empresaId }),
      });

      const data = await res.json();


      if (!res.ok) {
        throw new Error(data.error || 'Erro ao restaurar backup');
      }

      setRestoredInfo(data.restaurados);
      setConfirmRestore(false);
      setConfirmText('');
      setFileSelected(false);
      setRestoreFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      toast.success('Backup restaurado com sucesso!');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao restaurar backup';
      toast.error(message);
    } finally {
      setLoadingRestore(false);
    }
  };

  const handleConfirmRestore = () => {
    if (confirmText === 'RESTAURAR') {
      handleRestore();
    }
  };

  const formatNumber = (n: number) => n.toLocaleString('pt-BR');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-foreground">Backup e Restauração</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie backups dos dados da empresa <span className="font-medium text-foreground">{nomeEmpresa}</span>
        </p>
      </div>

      {/* Alerta Importante */}
      <Card className="border-0 shadow-lg bg-amber-500/10 border border-amber-500/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-amber-400">Atenção</p>
              <p className="mt-1">O backup contém todos os dados da empresa incluindo clientes, máquinas, leituras e pagamentos. A restauração <span className="text-foreground font-medium">substituirá todos os dados atuais</span> pelo conteúdo do backup.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backup Section */}
      <Card className="border-0 shadow-lg bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Download className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base text-foreground">Gerar Backup</CardTitle>
              <CardDescription className="text-xs">Exporte todos os dados da empresa em um arquivo JSON</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleBackup}
            disabled={loadingBackup}
            className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
          >
            {loadingBackup ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                Gerando backup...
              </>
            ) : (
              <>
                <DatabaseBackup className="w-4 h-4 mr-2" />
                Gerar e Baixar Backup
              </>
            )}
          </Button>

          {backupInfo && (
            <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <p className="text-sm font-medium text-emerald-400 mb-2">Backup gerado com sucesso!</p>
              <p className="text-xs text-muted-foreground mb-2">Data: {new Date(backupInfo.dataBackup).toLocaleString('pt-BR')}</p>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {Object.entries(backupInfo.resumo).map(([key, value]) => (
                  <div key={key} className="text-center">
                    <p className="text-sm font-bold text-foreground">{formatNumber(value)}</p>
                    <p className="text-xs text-muted-foreground capitalize">{key}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore Section */}
      <Card className="border-0 shadow-lg bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
              <Upload className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base text-foreground">Restaurar Backup</CardTitle>
              <CardDescription className="text-xs">Importe um arquivo de backup para restaurar os dados</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Seleção de arquivo */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              fileSelected
                ? 'border-emerald-500/50 bg-emerald-500/5'
                : 'border-border hover:border-amber-500/50 hover:bg-muted/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <HardDrive className={`w-8 h-8 mx-auto mb-2 ${fileSelected ? 'text-emerald-400' : 'text-muted-foreground'}`} />
            <p className="text-sm font-medium text-foreground">
              {fileSelected ? restoreFile?.name : 'Clique para selecionar o arquivo de backup'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {fileSelected ? 'Arquivo selecionado' : 'Formato aceito: .json'}
            </p>
          </div>

          {/* Botão de restaurar */}
          {fileSelected && !confirmRestore && (
            <Button
              onClick={() => setConfirmRestore(true)}
              variant="outline"
              className="w-full border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
            >
              <Upload className="w-4 h-4 mr-2" />
              Iniciar Restauração
            </Button>
          )}

          {/* Confirmação de restauração */}
          {confirmRestore && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <p className="font-medium text-destructive">Confirmação Necessária</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Esta ação irá <span className="text-foreground font-medium">apagar todos os dados atuais</span> da empresa e substituir pelo conteúdo do backup. Esta operação não pode ser desfeita.
              </p>
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Digite <span className="font-mono font-bold text-foreground">RESTAURAR</span> para confirmar:
                </Label>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="RESTAURAR"
                  className="bg-muted border-border font-mono"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setConfirmRestore(false); setConfirmText(''); }}
                  className="flex-1"
                  disabled={loadingRestore}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirmRestore}
                  disabled={confirmText !== 'RESTAURAR' || loadingRestore}
                  className="flex-1 bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700"
                >
                  {loadingRestore ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                      Restaurando...
                    </>
                  ) : (
                    'Confirmar Restauração'
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Resultado da restauração */}
          {restoredInfo && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <p className="text-sm font-medium text-emerald-400 mb-2">Dados restaurados com sucesso!</p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {Object.entries(restoredInfo).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between p-2 rounded bg-muted/30">
                    <span className="text-xs text-muted-foreground capitalize">{key}</span>
                    <span className="text-sm font-bold text-foreground">{formatNumber(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GestaoEmpresasPage({ adminEmail }: { adminEmail: string }) {
  const [empresas, setEmpresas] = useState<EmpresaGestao[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [empresaEditando, setEmpresaEditando] = useState<EmpresaGestao | null>(null);
  const [showMpToken, setShowMpToken] = useState(false);
  const [showMpKey, setShowMpKey] = useState(false);
  const [formData, setFormData] = useState({
    nome: '',
    cnpj: '',
    email: '',
    telefone: '',
    cidade: '',
    estado: '',
    plano: 'BASICO',
    isDemo: false,
    diasDemo: 7,
    dataVencimento: '',
    ativa: true,
    // MP (cobrador POS)
    mercadopagoAccessToken: '',
    mercadopagoPublicKey: '',
    // PIX Banco (cobrador POS)
    pixChaveTipo: 'CPF',
    pixChave: '',
    pixMerchantNome: '',
    pixMerchantCidade: '',
    pixBancoNome: '',
    // Telegram Bot
    telegramBotToken: '',
    // Configuração de operação
    permitirDigitacaoLeitura: true,
    // Cielo (Cartão)
    cieloMerchantId: '',
    cieloMerchantKey: '',
    cieloAmbiente: 'sandbox' as 'sandbox' | 'production',
    cieloEstabelecimento: '',
    cieloMcc: '',
    cieloClientId: '',
    cieloClientSecret: '',
  });
  const [showCieloKey, setShowCieloKey] = useState(false);

  useEffect(() => {
    loadEmpresas();
  }, []);

  const loadEmpresas = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/empresas/gestao?adminEmail=${adminEmail}`);
      const data = await res.json();

      if (res.ok) {
        setEmpresas(data);
      } else {
        toast.error(data.error || 'Erro ao carregar empresas');
      }
    } catch {
      toast.error('Erro ao carregar empresas');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.nome) {
      toast.error('Nome é obrigatório');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        adminEmail,
      };

      if (empresaEditando) {
        const res = await fetch(`/api/empresas/gestao/${empresaEditando.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Erro ao atualizar');
        }
        // Sincronizar plano no authStore se a empresa editada for a do usuário logado
        const empresaLogada = useAuthStore.getState().empresa;
        if (empresaLogada && empresaEditando.id === empresaLogada.id && formData.plano) {
          useAuthStore.getState().updateEmpresa({ plano: formData.plano });
        }
        toast.success('Empresa atualizada!');
      } else {
        const res = await fetch('/api/empresas/gestao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Erro ao criar');
        }
        toast.success('Empresa criada!');
      }
      setDialogOpen(false);
      resetForm();
      loadEmpresas();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleBloquear = async (empresa: EmpresaGestao, bloquear: boolean) => {
    try {
      const motivo = bloquear ? prompt('Motivo do bloqueio:') : undefined;
      if (bloquear && !motivo) return;

      await fetch(`/api/empresas/gestao/${empresa.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail,
          bloqueada: bloquear,
          motivoBloqueio: motivo,
        }),
      });
      toast.success(bloquear ? 'Empresa bloqueada' : 'Empresa desbloqueada');
      loadEmpresas();
    } catch {
      toast.error('Erro ao atualizar empresa');
    }
  };

  const handleExcluir = async (empresa: EmpresaGestao) => {
    if (!confirm(`Deseja excluir a empresa "${empresa.nome}"? Esta ação não pode ser desfeita!`)) return;

    try {
      const res = await fetch(`/api/empresas/gestao/${empresa.id}?adminEmail=${adminEmail}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('Empresa excluída');
        loadEmpresas();
      } else {
        toast.error('Erro ao excluir');
      }
    } catch {
      toast.error('Erro ao excluir empresa');
    }
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      cnpj: '',
      email: '',
      telefone: '',
      cidade: '',
      estado: '',
      plano: 'BASICO',
      isDemo: false,
      diasDemo: 7,
      dataVencimento: '',
      ativa: true,
      mercadopagoAccessToken: '',
      mercadopagoPublicKey: '',
      pixChaveTipo: 'CPF',
      pixChave: '',
      pixMerchantNome: '',
      pixMerchantCidade: '',
      pixBancoNome: '',
      telegramBotToken: '',
      permitirDigitacaoLeitura: true,
      cieloMerchantId: '',
      cieloMerchantKey: '',
      cieloAmbiente: 'sandbox' as 'sandbox' | 'production',
      cieloEstabelecimento: '',
      cieloMcc: '',
      cieloClientId: '',
      cieloClientSecret: '',
    });
    setEmpresaEditando(null);
  };

  const openEditDialog = (empresa: EmpresaGestao) => {
    setEmpresaEditando(empresa);
    setFormData({
      nome: empresa.nome,
      cnpj: empresa.cnpj || '',
      email: empresa.email || '',
      telefone: empresa.telefone || '',
      cidade: empresa.cidade || '',
      estado: empresa.estado || '',
      plano: empresa.plano,
      isDemo: empresa.isDemo,
      diasDemo: empresa.diasDemo,
      dataVencimento: empresa.dataVencimento ? empresa.dataVencimento.split('T')[0] : '',
      ativa: empresa.ativa,
      mercadopagoAccessToken: empresa.mercadopagoAccessToken || '',
      mercadopagoPublicKey: empresa.mercadopagoPublicKey || '',
      pixChaveTipo: empresa.pixChaveTipo || 'CPF',
      pixChave: empresa.pixChave || '',
      pixMerchantNome: empresa.pixMerchantNome || '',
      pixMerchantCidade: empresa.pixMerchantCidade || '',
      pixBancoNome: empresa.pixBancoNome || '',
      telegramBotToken: empresa.telegramBotToken || '',
      permitirDigitacaoLeitura: empresa.permitirDigitacaoLeitura ?? true,
      cieloMerchantId: empresa.cieloMerchantId || '',
      cieloMerchantKey: empresa.cieloMerchantKey || '',
      cieloAmbiente: (empresa.cieloAmbiente as 'sandbox' | 'production') || 'sandbox',
      cieloEstabelecimento: empresa.cieloEstabelecimento || '',
      cieloMcc: empresa.cieloMcc || '',
      cieloClientId: empresa.cieloClientId || '',
      cieloClientSecret: empresa.cieloClientSecret || '',
    });
    setDialogOpen(true);
  };

  const getStatusBadge = (empresa: EmpresaGestao) => {
    if (empresa.bloqueada) {
      return <Badge variant="destructive">Bloqueada</Badge>;
    }
    if (empresa.status === 'expirado') {
      return <Badge variant="destructive">Expirado</Badge>;
    }
    if (empresa.status === 'expirando') {
      return <Badge className="bg-amber-500">Expirando ({empresa.diasRestantes}d)</Badge>;
    }
    if (empresa.isDemo) {
      return <Badge className="bg-blue-500">Demo ({empresa.diasRestantes}d)</Badge>;
    }
    return <Badge className="bg-green-500">Ativo</Badge>;
  };

  const getPlanoLabel = (plano: string) => {
    const labels: Record<string, string> = {
      BASICO: 'Básico',
      PROFISSIONAL: 'Profissional',
      PREMIUM: 'Premium',
      ENTERPRISE: 'Enterprise',
    };
    return labels[plano] || plano;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Gestão de Empresas</h2>
          <p className="text-sm text-muted-foreground">Gerencie todas as empresas do sistema</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-gradient-to-r from-amber-500 to-orange-600" onClick={() => { resetForm(); setEmpresaEditando(null); }}>
              <Plus className="w-4 h-4 mr-1" /> Nova Empresa
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border text-foreground max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{empresaEditando ? 'Editar Empresa' : 'Nova Empresa'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  className="bg-muted border-border"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>CNPJ</Label>
                  <Input
                    value={formData.cnpj}
                    onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                    className="bg-muted border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Plano</Label>
                  <Select value={formData.plano} onValueChange={(v) => setFormData({ ...formData, plano: v })}>
                    <SelectTrigger className="bg-muted border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BASICO">Básico</SelectItem>
                      <SelectItem value="PROFISSIONAL">Profissional</SelectItem>
                      <SelectItem value="PREMIUM">Premium</SelectItem>
                      <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="bg-muted border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input
                    value={formData.telefone}
                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                    className="bg-muted border-border"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input
                    value={formData.cidade}
                    onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                    className="bg-muted border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Input
                    value={formData.estado}
                    onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                    className="bg-muted border-border"
                    maxLength={2}
                  />
                </div>
              </div>
              <Separator className="bg-border" />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Versão Demo</Label>
                  <p className="text-xs text-muted-foreground">Teste gratuito com limite de dias</p>
                </div>
                <Switch
                  checked={formData.isDemo}
                  onCheckedChange={(checked) => setFormData({ ...formData, isDemo: checked })}
                />
              </div>
              {formData.isDemo && (
                <div className="space-y-2">
                  <Label>Dias de Demo</Label>
                  <Input
                    type="number"
                    value={formData.diasDemo}
                    onChange={(e) => setFormData({ ...formData, diasDemo: Number(e.target.value) })}
                    className="bg-muted border-border"
                    min={1}
                    placeholder="7"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Data de Vencimento</Label>
                <Input
                  type="date"
                  value={formData.dataVencimento}
                  onChange={(e) => setFormData({ ...formData, dataVencimento: e.target.value })}
                  className="bg-muted border-border"
                />
                <p className="text-xs text-muted-foreground">Deixe em branco para usar dias de demo</p>
              </div>

              {/* ========== SEPARATOR — Integracao MP (Cobrador POS) ========== */}
              <Separator className="bg-border" />
              <div className="flex items-center gap-2 pt-1">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Mercado Pago (Cobrador POS)</p>
                  <p className="text-[11px] text-muted-foreground">Credenciais MP para cobrancas no app — PIX, cartao, NFC</p>
                </div>
                {formData.mercadopagoAccessToken && formData.mercadopagoPublicKey ? (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30 ml-auto text-[11px]">
                    <CheckCircle className="w-3 h-3 mr-1" />Configurado
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="ml-auto text-[11px]">
                    <Circle className="w-3 h-3 mr-1" />Opcional
                  </Badge>
                )}
              </div>

              {/* MP Access Token */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Lock className="w-3 h-3" />Access Token (Privada)
                </Label>
                <div className="relative">
                  <Input
                    type={showMpToken ? 'text' : 'password'}
                    value={formData.mercadopagoAccessToken}
                    onChange={(e) => setFormData({ ...formData, mercadopagoAccessToken: e.target.value })}
                    placeholder="APP_USR-xxxxxxxxxxxxxxxxxxxxxxxx"
                    className="bg-muted border-border text-sm pr-10"
                  />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5" onClick={() => setShowMpToken(!showMpToken)}>
                    {showMpToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">Token secreto do servidor. Usado para criar cobrancas PIX, processar cartoes.</p>
              </div>

              {/* MP Public Key */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Globe className="w-3 h-3" />Public Key (Publica)
                </Label>
                <div className="relative">
                  <Input
                    type={showMpKey ? 'text' : 'password'}
                    value={formData.mercadopagoPublicKey}
                    onChange={(e) => setFormData({ ...formData, mercadopagoPublicKey: e.target.value })}
                    placeholder="APP_USR-xxxxxxxxxxxxxxxxxxxxxxxx"
                    className="bg-muted border-border text-sm pr-10"
                  />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5" onClick={() => setShowMpKey(!showMpKey)}>
                    {showMpKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">Chave publica usada no app Android para identificar a integracao.</p>
              </div>

              {/* ========== SEPARATOR — PIX Banco (Cobrador POS) ========== */}
              <Separator className="bg-border" />
              <div className="flex items-center gap-2 pt-1">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <QrCode className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">PIX Banco (Cobrador POS)</p>
                  <p className="text-[11px] text-muted-foreground">QR Code estatico direto no banco — sem intermediario</p>
                </div>
                {formData.pixChave && formData.pixMerchantNome && formData.pixMerchantCidade ? (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30 ml-auto text-[11px]">
                    <CheckCircle className="w-3 h-3 mr-1" />Configurado
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="ml-auto text-[11px]">
                    <Circle className="w-3 h-3 mr-1" />Opcional
                  </Badge>
                )}
              </div>

              {/* Banco */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Landmark className="w-3 h-3" />Banco
                </Label>
                <Input
                  type="text"
                  value={formData.pixBancoNome}
                  onChange={(e) => setFormData({ ...formData, pixBancoNome: e.target.value })}
                  placeholder="Ex: Nubank, Itau, Bradesco..."
                  className="bg-muted border-border text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Apenas para identificacao. Nao afeta o QR Code gerado.</p>
              </div>

              {/* Tipo da Chave PIX */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Key className="w-3 h-3" />Tipo da Chave PIX
                </Label>
                <select
                  value={formData.pixChaveTipo}
                  onChange={(e) => setFormData({ ...formData, pixChaveTipo: e.target.value })}
                  className="w-full h-9 rounded-md border border-border bg-muted px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="CPF">CPF</option>
                  <option value="CNPJ">CNPJ</option>
                  <option value="TELEFONE">Telefone</option>
                  <option value="EMAIL">E-mail</option>
                  <option value="ALEATORIA">Chave Aleatoria</option>
                </select>
              </div>

              {/* Chave PIX */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Key className="w-3 h-3" />Chave PIX
                </Label>
                <Input
                  type="text"
                  value={formData.pixChave}
                  onChange={(e) => setFormData({ ...formData, pixChave: e.target.value })}
                  placeholder={formData.pixChaveTipo === 'CPF' ? '000.000.000-00' : formData.pixChaveTipo === 'CNPJ' ? '00.000.000/0000-00' : formData.pixChaveTipo === 'TELEFONE' ? '(00) 00000-0000' : formData.pixChaveTipo === 'EMAIL' ? 'email@exemplo.com' : 'Chave aleatoria'}
                  className="bg-muted border-border text-sm font-mono"
                />
              </div>

              {/* Nome e Cidade do Recebedor */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <User className="w-3 h-3" />Recebedor (max 25)
                  </Label>
                  <Input
                    type="text"
                    value={formData.pixMerchantNome}
                    onChange={(e) => setFormData({ ...formData, pixMerchantNome: e.target.value.substring(0, 25) })}
                    placeholder="Nome no QR Code"
                    className="bg-muted border-border text-sm"
                    maxLength={25}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" />Cidade (max 15)
                  </Label>
                  <Input
                    type="text"
                    value={formData.pixMerchantCidade}
                    onChange={(e) => setFormData({ ...formData, pixMerchantCidade: e.target.value.substring(0, 15) })}
                    placeholder="Cidade"
                    className="bg-muted border-border text-sm"
                    maxLength={15}
                  />
                </div>
              </div>
            </div>

              {/* ========== SEPARATOR — Telegram Bot ========== */}
              <Separator className="bg-border" />
              <div className="flex items-center gap-2 pt-1">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
                  <Send className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Telegram Bot</p>
                  <p className="text-[11px] text-muted-foreground">Envio silencioso de extrato e fotos para grupos</p>
                </div>
                {formData.telegramBotToken ? (
                  <Badge className="bg-sky-500/20 text-sky-400 border-sky-500/30 ml-auto text-[11px]">Ativo</Badge>
                ) : (
                  <Badge variant="secondary" className="ml-auto text-[11px]">Opcional</Badge>
                )}
              </div>

              {/* Telegram Bot Token */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Bot className="w-3 h-3" />Bot Token
                </Label>
                <Input
                  type="text"
                  value={formData.telegramBotToken || ''}
                  onChange={(e) => setFormData({ ...formData, telegramBotToken: e.target.value })}
                  placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                  className="bg-muted border-border text-sm font-mono"
                />
                <p className="text-[10px] text-muted-foreground">Token do bot criado pelo @BotFather no Telegram. O bot precisa ser admin do grupo.</p>
              </div>

              {/* Permitir digitação da leitura atual */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Lock className="w-3 h-3" />Permitir digitação da leitura atual?
                </Label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, permitirDigitacaoLeitura: !(formData.permitirDigitacaoLeitura ?? true) })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.permitirDigitacaoLeitura ?? true ? 'bg-amber-500' : 'bg-muted'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.permitirDigitacaoLeitura ?? true ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span className="text-xs text-foreground">
                    {(formData.permitirDigitacaoLeitura ?? true) ? 'Sim — operador pode digitar/editar valores' : 'Não — apenas preenchimento via OCR da foto'}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Se ativado, o operador pode editar manualmente os valores de entrada/saída na tela de leituras.
                  Se desativado, os campos só serão preenchidos pelo processamento da foto (OCR) e não poderão ser modificados.
                </p>
              </div>

              {/* ========== SEPARATOR — Cielo (Cartão) ========== */}
              <Separator className="bg-border" />
              <div className="flex items-center gap-2 pt-1">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Cielo - Cartão de Crédito/Débito</p>
                  <p className="text-[11px] text-muted-foreground">API E-commerce 3.0 — Visa, Master, Elo</p>
                </div>
                {formData.cieloMerchantId ? (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ml-auto text-[11px]">
                    {formData.cieloAmbiente === 'production' ? 'PRODUÇÃO' : 'SANDBOX'}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="ml-auto text-[11px]">Opcional</Badge>
                )}
              </div>

              {/* Cielo - Ambiente */}
              <div className="flex items-center gap-3">
                <Label className="text-xs text-muted-foreground w-24 shrink-0">Ambiente</Label>
                <div className="flex bg-muted rounded-lg p-0.5">
                  <button type="button" className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${formData.cieloAmbiente === 'sandbox' ? 'bg-card text-amber-400 shadow-sm' : 'text-muted-foreground'}`} onClick={() => setFormData({ ...formData, cieloAmbiente: 'sandbox' })}>Sandbox</button>
                  <button type="button" className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${formData.cieloAmbiente === 'production' ? 'bg-card text-blue-400 shadow-sm' : 'text-muted-foreground'}`} onClick={() => setFormData({ ...formData, cieloAmbiente: 'production' })}>Produção</button>
                </div>
              </div>

              {/* Cielo - Merchant ID */}
              <div className="flex items-center gap-3">
                <Label className="text-xs text-muted-foreground w-24 shrink-0">Merchant ID</Label>
                <Input type="text" value={formData.cieloMerchantId} onChange={(e) => setFormData({ ...formData, cieloMerchantId: e.target.value })} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="h-9 text-sm font-mono" />
              </div>

              {/* Cielo - Merchant Key */}
              <div className="flex items-center gap-3">
                <Label className="text-xs text-muted-foreground w-24 shrink-0">Merchant Key</Label>
                <div className="relative flex-1">
                  <Input type={showCieloKey ? 'text' : 'password'} value={formData.cieloMerchantKey} onChange={(e) => setFormData({ ...formData, cieloMerchantKey: e.target.value })} placeholder="Chave do Merchant" className="h-9 text-sm font-mono pr-10" />
                  <button type="button" onClick={() => setShowCieloKey(!showCieloKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showCieloKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Cielo - Estabelecimento + MCC */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Estabelecimento</Label>
                  <Input type="text" value={formData.cieloEstabelecimento} onChange={(e) => setFormData({ ...formData, cieloEstabelecimento: e.target.value })} placeholder="Nome na fatura (max 13)" maxLength={13} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">MCC</Label>
                  <Input type="text" value={formData.cieloMcc} onChange={(e) => setFormData({ ...formData, cieloMcc: e.target.value })} placeholder="Ex: 7299" maxLength={4} className="h-9 text-sm" />
                </div>
              </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
              <Button type="button" onClick={handleSave} className="bg-gradient-to-r from-amber-500 to-orange-600" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : empresas.length === 0 ? (
        <Card className="border-0 shadow-lg bg-card">
          <CardContent className="py-8 text-center text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhuma empresa cadastrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {empresas.map((empresa) => (
            <Card key={empresa.id} className={`border-0 shadow-lg ${empresa.bloqueada ? 'bg-destructive/10 border-destructive/30' : empresa.status === 'expirado' ? 'bg-orange-900/20' : 'bg-card'}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-lg">
                    {empresa.nome.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground">{empresa.nome}</p>
                      {getStatusBadge(empresa)}
                      {empresa.isDemo && <Badge variant="outline" className="text-blue-400 border-blue-400">Demo</Badge>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>Plano: {getPlanoLabel(empresa.plano)}</span>
                      {empresa.cnpj && <span>CNPJ: {empresa.cnpj}</span>}
                      {empresa.email && <span>{empresa.email}</span>}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs">
                      <span className="text-muted-foreground">
                        <Users className="w-3 h-3 inline mr-1" />
                        {empresa._count?.usuarios || 0} usuários
                      </span>
                      <span className="text-muted-foreground">
                        <Building2 className="w-3 h-3 inline mr-1" />
                        {empresa._count?.clientes || 0} clientes
                      </span>
                      {empresa.diasRestantes !== null && empresa.diasRestantes !== undefined && (
                        <span className={empresa.diasRestantes <= 7 ? 'text-amber-400' : 'text-green-400'}>
                          <CalendarDays className="w-3 h-3 inline mr-1" />
                          {empresa.diasRestantes > 0 ? `${empresa.diasRestantes} dias restantes` : 'Expirado'}
                        </span>
                      )}
                    </div>
                    {/* Badges de integracao POS */}
                    {(empresa.pixChave || empresa.mercadopagoAccessToken) && (
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {empresa.pixChave && empresa.pixMerchantNome && empresa.pixMerchantCidade ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] py-0">
                            <QrCode className="w-3 h-3 mr-1" />PIX Banco
                          </Badge>
                        ) : null}
                        {empresa.mercadopagoAccessToken && (
                          <Badge className="bg-sky-500/20 text-sky-400 border-sky-500/30 text-[10px] py-0">
                            <CreditCard className="w-3 h-3 mr-1" />MP
                          </Badge>
                        )}
                      </div>
                    )}
                    {empresa.motivoBloqueio && (
                      <p className="text-xs text-red-400 mt-2">
                        <ShieldAlert className="w-3 h-3 inline mr-1" />
                        {empresa.motivoBloqueio}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => openEditDialog(empresa)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {empresa.bloqueada ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-green-400 hover:text-green-300"
                        onClick={() => handleBloquear(empresa, false)}
                      >
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-400 hover:text-red-300"
                        onClick={() => handleBloquear(empresa, true)}
                      >
                        <Ban className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-400"
                      onClick={() => handleExcluir(empresa)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// INTEGRACAO MERCADO PAGO — PAGAMENTOS (COBRANCAS)
// ============================================
function IntegracaoMPPage({ empresaId }: { empresaId: string }) {
  const [mpAccessToken, setMpAccessToken] = useState('');
  const [mpPublicKey, setMpPublicKey] = useState('');
  const [showMpAccessToken, setShowMpAccessToken] = useState(false);
  const [showMpPublicKey, setShowMpPublicKey] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<{ sucesso: boolean; mensagem: string; detalhe?: string; tempoMs?: number; conta?: any; publicKey?: boolean; publicKeyAlert?: string | null } | null>(null);
  const [showAjuda, setShowAjuda] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    setCarregando(true);
    fetch(`/api/configuracoes?empresaId=${empresaId}`)
      .then((res) => res.json())
      .then((data) => {
        setMpAccessToken(data.mercadopagoAccessToken || '');
        setMpPublicKey(data.mercadopagoPublicKey || '');
      })
      .catch((err) => console.error('Erro ao carregar configs MP:', err))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      const bodyPayload: Record<string, string | number> = {
        empresaId,
        mercadopagoAccessToken: mpAccessToken,
        mercadopagoPublicKey: mpPublicKey,
      };
      const res = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
      toast.success('Configuracoes salvas com sucesso!');
      setResultadoTeste(null);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const handleTestar = async () => {
    setTestando(true);
    setResultadoTeste(null);
    try {
      const inicio = performance.now();
      const res = await fetch('/api/mercadopago/testar-empresa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaId })
      });
      const data = await res.json();
      const tempoMs = Math.round(performance.now() - inicio);
      setResultadoTeste({
        sucesso: data.success,
        mensagem: data.mensagem,
        detalhe: data.detalhe,
        tempoMs,
        conta: data.conta,
        publicKey: data.publicKey,
        publicKeyAlert: data.publicKeyAlert
      });
    } catch (err: any) {
      setResultadoTeste({ sucesso: false, mensagem: 'Erro de conexao', detalhe: err.message });
    } finally {
      setTestando(false);
    }
  };

  const isConfigured = !!(mpAccessToken && mpPublicKey);

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
          <CreditCard className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Integracao Mercado Pago</h2>
          <p className="text-xs text-muted-foreground">Configure para receber pagamentos nas cobrancas</p>
        </div>
        {isConfigured && (
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30 ml-auto">
            <CheckCircle className="w-3 h-3 mr-1" />
            Configurado
          </Badge>
        )}
        {!mpAccessToken && !mpPublicKey && (
          <Badge variant="secondary" className="ml-auto">
            <Circle className="w-3 h-3 mr-1" />
            Nao configurado
          </Badge>
        )}
      </div>

      {/* Card principal — Credenciais */}
      <Card className="border-sky-500/20 bg-gradient-to-br from-sky-500/5 to-blue-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Key className="w-4 h-4 text-sky-500" />
            Credenciais da Empresa
          </CardTitle>
          <CardDescription className="text-xs">
            Insira as credenciais do Mercado Pago da sua empresa para processar pagamentos de cobranca (PIX, cartao de credito, debito e aproximacao).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Access Token */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              Access Token (Privada)
            </Label>
            <div className="relative">
              <Input
                type={showMpAccessToken ? 'text' : 'password'}
                value={mpAccessToken}
                onChange={(e) => setMpAccessToken(e.target.value)}
                placeholder="APP_USR-xxxxxxxxxxxxxxxxxxxxxxxx"
                className="bg-muted border-border pr-10 text-sm"
              />
              <button type="button" onClick={() => setShowMpAccessToken(!showMpAccessToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showMpAccessToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Token secreto do servidor. Usado para criar cobrancas PIX, processar cartoes e gerenciar pagamentos. Nunca exposto ao cliente.
            </p>
          </div>

          {/* Public Key */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Globe className="w-3 h-3" />
              Public Key (Publica)
            </Label>
            <div className="relative">
              <Input
                type={showMpPublicKey ? 'text' : 'password'}
                value={mpPublicKey}
                onChange={(e) => setMpPublicKey(e.target.value)}
                placeholder="APP_USR-xxxxxxxxxxxxxxxxxxxxxxxx"
                className="bg-muted border-border pr-10 text-sm"
              />
              <button type="button" onClick={() => setShowMpPublicKey(!showMpPublicKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showMpPublicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Chave publica usada no frontend (app Android) para identificar a integracao. Nao e sensivel como o Access Token.
            </p>
          </div>

          {/* Status rapido */}
          <div className="flex items-center gap-2 flex-wrap">
            {mpAccessToken && mpPublicKey ? (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30 text-xs">
                <CheckCircle className="w-3 h-3 mr-1" />
                Pronto para receber pagamentos
              </Badge>
            ) : mpAccessToken || mpPublicKey ? (
              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30 text-xs">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Preencha os dois campos
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-muted-foreground text-xs">
                <Circle className="w-3 h-3 mr-1" />
                Nenhuma credencial configurada
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Botoes de acao */}
      <div className="flex gap-2">
        <Button onClick={handleSalvar} disabled={salvando}
          className="flex-1 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white">
          {salvando ? (
            <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" /> Salvando...</>
          ) : (
            <><Save className="w-4 h-4 mr-2" /> Salvar MP</>
          )}
        </Button>
        <Button variant="outline" onClick={handleTestar} disabled={testando || !mpAccessToken}
          className="flex-1 border-sky-500/30 text-sky-500 hover:bg-sky-500/10">
          {testando ? (
            <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" /> Testando...</>
          ) : (
            <><Zap className="w-4 h-4 mr-2" /> Testar Conexao</>
          )}
        </Button>
      </div>

      {/* Resultado do teste */}
      {resultadoTeste && (
        <Card className={resultadoTeste.sucesso
          ? 'border-green-500/30 bg-gradient-to-r from-green-500/5 to-emerald-500/5'
          : 'border-red-500/30 bg-gradient-to-r from-red-500/5 to-orange-500/5'}>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center gap-2">
              {resultadoTeste.sucesso
                ? <CheckCircle className="w-5 h-5 text-green-400" />
                : <XCircle className="w-5 h-5 text-red-400" />
              }
              <span className={`font-semibold text-sm ${resultadoTeste.sucesso ? 'text-green-400' : 'text-red-400'}`}>
                {resultadoTeste.mensagem}
              </span>
              {resultadoTeste.tempoMs && (
                <span className="text-xs text-muted-foreground ml-auto">{resultadoTeste.tempoMs}ms</span>
              )}
            </div>
            {resultadoTeste.detalhe && (
              <p className="text-xs text-muted-foreground">{resultadoTeste.detalhe}</p>
            )}
            {resultadoTeste.sucesso && resultadoTeste.conta && (
              <div className="bg-muted/50 rounded-lg p-2 mt-1">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Conta MP:</span> {resultadoTeste.conta.nickname || resultadoTeste.conta.email}
                  {resultadoTeste.conta.email && <span className="ml-2">({resultadoTeste.conta.email})</span>}
                </p>
              </div>
            )}
            {resultadoTeste.publicKeyAlert && (
              <div className="flex items-center gap-2 bg-yellow-500/10 rounded-lg p-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
                <p className="text-xs text-yellow-400">{resultadoTeste.publicKeyAlert}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Card — Ajuda para configuracao */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <button onClick={() => setShowAjuda(!showAjuda)}
            className="w-full flex items-center justify-between text-left">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-sky-500" />
              Como configurar o Mercado Pago
            </CardTitle>
            {showAjuda ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
        </CardHeader>
        {showAjuda && (
          <CardContent className="space-y-3">
            <div className="bg-muted/50 rounded-lg p-3 space-y-3">
              <p className="text-xs text-muted-foreground font-medium">PASSO A PASSO:</p>

              <div className="flex gap-2">
                <div className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs font-bold shrink-0">1</div>
                <p className="text-xs text-muted-foreground">Acesse o painel de desenvolvedores do Mercado Pago e crie sua conta (ou faca login).</p>
              </div>

              <div className="flex gap-2">
                <div className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs font-bold shrink-0">2</div>
                <p className="text-xs text-muted-foreground">Va em &quot;Suas aplicacoes&quot; e crie uma nova aplicacao. Escolha o tipo &quot;Pagamentos na web&quot; ou &quot;Pagamentos presencial&quot;.</p>
              </div>

              <div className="flex gap-2">
                <div className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs font-bold shrink-0">3</div>
                <p className="text-xs text-muted-foreground">Apos criar a aplicacao, clique nela para ver as credenciais. Copie o <span className="font-mono text-foreground">Production Access Token</span> e cole no campo acima.</p>
              </div>

              <div className="flex gap-2">
                <div className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs font-bold shrink-0">4</div>
                <p className="text-xs text-muted-foreground">Copie a <span className="font-mono text-foreground">Public Key</span> e cole no campo correspondente acima.</p>
              </div>

              <div className="flex gap-2">
                <div className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs font-bold shrink-0">5</div>
                <p className="text-xs text-muted-foreground">Clique em <span className="font-medium text-foreground">Testar Conexao</span> para verificar se as credenciais estao corretas.</p>
              </div>

              <div className="flex gap-2">
                <div className="w-5 h-5 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-xs font-bold shrink-0">6</div>
                <p className="text-xs text-muted-foreground">Pronto! As cobranças via PIX, cartao de credito, debito e aproximacao NFC ja podem ser processadas.</p>
              </div>
            </div>

            <Separator className="bg-border" />

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">LINKS UTEIS:</p>
              <div className="flex flex-col gap-1.5">
                <a href="https://www.mercadopago.com.br/developers/panel/app"
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs text-sky-500 hover:text-sky-400 transition-colors py-1">
                  <ExternalLink className="w-3 h-3" />
                  Painel de Desenvolvedores MP
                </a>
                <a href="https://www.mercadopago.com.br/developers/panel/app/credentials"
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs text-sky-500 hover:text-sky-400 transition-colors py-1">
                  <Key className="w-3 h-3" />
                  Gerenciar Credenciais
                </a>
                <a href="https://www.mercadopago.com.br/developers/pt/docs/payments/api/getting-started"
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs text-sky-500 hover:text-sky-400 transition-colors py-1">
                  <BookOpen className="w-3 h-3" />
                  Documentacao de Pagamentos
                </a>
                <a href="https://www.mercadopago.com.br/developers/pt/guides/online-payments/qr-code"
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs text-sky-500 hover:text-sky-400 transition-colors py-1">
                  <QrCode className="w-3 h-3" />
                  Guia de PIX e QR Code
                </a>
              </div>
            </div>

            <Separator className="bg-border" />

            <div className="bg-amber-500/10 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-amber-400">Importante</p>
                  <p>Estas credenciais sao da <span className="font-medium text-foreground">sua empresa</span> e serao usadas exclusivamente para processar <span className="font-medium text-foreground">pagamentos de cobranca</span> dos seus clientes (PIX, cartao, NFC).</p>
                  <p>A integracao Mercado Pago do sistema CaixaFacil SaaS (assinaturas do plano) utiliza credenciais separadas do servidor.</p>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// ============================================
// CONFIGURACOES EMPRESA PAGE (Admin — Permissões, Plano, PIX, MP, Cielo)
// ============================================
function ConfiguracoesEmpresaPage({ empresaId }: { empresaId: string }) {
  // ===== Permissões por nível de acesso =====
  const [permNivelSelecionado, setPermNivelSelecionado] = useState<string>('ADMINISTRADOR');
  const [permMenuPermitidos, setPermMenuPermitidos] = useState<string[]>([]);
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permTodos, setPermTodos] = useState<Record<string, string[]>>({});
  const [permCarregando, setPermCarregando] = useState(true);

  // ===== Plano de Assinatura =====
  const [planoInfo, setPlanoInfo] = useState<any>(null);
  const [planoLoading, setPlanoLoading] = useState(true);

  // ===== Configurações (PIX, MP, Cielo) =====
  const [carregandoConfig, setCarregandoConfig] = useState(true);
  const [salvandoConfig, setSalvandoConfig] = useState<string>('');
  // PIX
  const [pixChaveTipo, setPixChaveTipo] = useState('CPF');
  const [pixChave, setPixChave] = useState('');
  const [pixMerchantNome, setPixMerchantNome] = useState('');
  const [pixMerchantCidade, setPixMerchantCidade] = useState('');
  const [pixBancoNome, setPixBancoNome] = useState('');
  // MercadoPago
  const [mpAccessToken, setMpAccessToken] = useState('');
  const [mpPublicKey, setMpPublicKey] = useState('');
  const [showMpAccessToken, setShowMpAccessToken] = useState(false);
  const [showMpPublicKey, setShowMpPublicKey] = useState(false);
  // Cielo
  const [cieloMerchantId, setCieloMerchantId] = useState('');
  const [cieloMerchantKey, setCieloMerchantKey] = useState('');
  const [cieloAmbiente, setCieloAmbiente] = useState<'sandbox' | 'production'>('sandbox');
  const [cieloClientId, setCieloClientId] = useState('');
  const [cieloClientSecret, setCieloClientSecret] = useState('');
  const [cieloMcc, setCieloMcc] = useState('');
  const [cieloEstabelecimento, setCieloEstabelecimento] = useState('');
  const [showCieloKey, setShowCieloKey] = useState(false);
  const [showCieloSecret, setShowCieloSecret] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Início' },
    { id: 'clientes', label: 'Clientes' },
    { id: 'maquinas', label: 'Máquinas' },
    { id: 'tipos-maquina', label: 'Tipos de Máquina' },
    { id: 'leituras', label: 'Cobrança' },
    { id: 'ajuste-leitura', label: 'Ajuste de Leitura' },
    { id: 'receber', label: 'Receber' },
    { id: 'fluxo-caixa', label: 'Fluxo de Caixa' },
    { id: 'usuarios', label: 'Usuários' },
    { id: 'relatorios', label: 'Relatórios' },
    { id: 'assinatura', label: 'Minha Assinatura' },
    { id: 'grua', label: 'GRUA' },
    { id: 'backup-restore', label: 'Backup / Restaurar' },
    { id: 'configuracoes-empresa', label: 'Configurações' },
  ];

  // ===== Permissões =====
  const loadPermissoes = async (nivel: string) => {
    setPermLoading(true);
    try {
      const res = await fetch(`/api/saas-permissoes?nivel=${nivel}`);
      if (res.ok) {
        const data = await res.json();
        if (data.permissoes) {
          setPermMenuPermitidos(typeof data.permissoes === 'string' ? JSON.parse(data.permissoes) : data.permissoes);
        } else {
          setPermMenuPermitidos(menuItems.map(m => m.id));
        }
      }
      // Carregar todos os niveis
      const allRes = await fetch('/api/saas-permissoes');
      if (allRes.ok) {
        const allData = await allRes.json();
        const mapa: Record<string, string[]> = {};
        for (const row of (allData.permissoes || [])) {
          mapa[row.nivel] = typeof row.menuPermitidos === 'string' ? JSON.parse(row.menuPermitidos) : (row.menuPermitidos || []);
        }
        setPermTodos(mapa);
      }
    } catch {}
    finally { setPermLoading(false); }
  };

  const handlePermToggle = (menuId: string) => {
    // ADMINISTRADOR cannot remove 'configuracoes-empresa'
    if (menuId === 'configuracoes-empresa' && permNivelSelecionado === 'ADMINISTRADOR') return;
    setPermMenuPermitidos(prev =>
      prev.includes(menuId) ? prev.filter(id => id !== menuId) : [...prev, menuId]
    );
  };

  const handleSalvarPermissoes = async () => {
    setPermSaving(true);
    try {
      const res = await fetch('/api/saas-permissoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nivel: permNivelSelecionado, menuPermitidos: permMenuPermitidos }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
      toast.success(`Permissões de ${permNivelSelecionado} salvas!`);
      loadPermissoes(permNivelSelecionado);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar permissões');
    } finally { setPermSaving(false); }
  };

  useEffect(() => { loadPermissoes(permNivelSelecionado); }, [permNivelSelecionado]);

  // ===== Plano =====
  useEffect(() => {
    if (!empresaId) return;
    setPlanoLoading(true);
    fetch(`/api/meu-plano?empresaId=${empresaId}`)
      .then(r => r.json())
      .then(data => { if (data.planoNome) setPlanoInfo(data); })
      .catch(() => {})
      .finally(() => setPlanoLoading(false));
  }, [empresaId]);

  // ===== Configurações =====
  useEffect(() => {
    if (!empresaId) return;
    setCarregandoConfig(true);
    fetch(`/api/configuracoes?empresaId=${empresaId}`)
      .then(r => r.json())
      .then(data => {
        // PIX
        if (data.pixChaveTipo) setPixChaveTipo(data.pixChaveTipo);
        if (data.pixChave) setPixChave(data.pixChave);
        if (data.pixMerchantNome) setPixMerchantNome(data.pixMerchantNome);
        if (data.pixMerchantCidade) setPixMerchantCidade(data.pixMerchantCidade);
        if (data.pixBancoNome) setPixBancoNome(data.pixBancoNome);
        // MercadoPago
        if (data.mercadopagoAccessToken) setMpAccessToken(data.mercadopagoAccessToken);
        if (data.mercadopagoPublicKey) setMpPublicKey(data.mercadopagoPublicKey);
        // Cielo
        if (data.cieloMerchantId) setCieloMerchantId(data.cieloMerchantId);
        if (data.cieloMerchantKey) setCieloMerchantKey(data.cieloMerchantKey);
        if (data.cieloAmbiente) setCieloAmbiente(data.cieloAmbiente === 'production' ? 'production' : 'sandbox');
        if (data.cieloClientId) setCieloClientId(data.cieloClientId);
        if (data.cieloClientSecret) setCieloClientSecret(data.cieloClientSecret);
        if (data.cieloMcc) setCieloMcc(data.cieloMcc);
        if (data.cieloEstabelecimento) setCieloEstabelecimento(data.cieloEstabelecimento);
      })
      .catch(() => {})
      .finally(() => { setCarregandoConfig(false); setPermCarregando(false); });
  }, [empresaId]);

  const handleSalvarPix = async () => {
    setSalvandoConfig('pix');
    try {
      const res = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaId, pixChaveTipo, pixChave, pixMerchantNome, pixMerchantCidade, pixBancoNome }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar PIX');
      toast.success('Configurações PIX salvas!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar PIX');
    } finally { setSalvandoConfig(''); }
  };

  const handleSalvarMP = async () => {
    setSalvandoConfig('mp');
    try {
      const res = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaId, mercadopagoAccessToken: mpAccessToken, mercadopagoPublicKey: mpPublicKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar MercadoPago');
      toast.success('Configurações MercadoPago salvas!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar MercadoPago');
    } finally { setSalvandoConfig(''); }
  };

  const handleSalvarCielo = async () => {
    setSalvandoConfig('cielo');
    try {
      const res = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaId, cieloMerchantId, cieloMerchantKey, cieloAmbiente, cieloClientId, cieloClientSecret, cieloMcc, cieloEstabelecimento }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar Cielo');
      toast.success('Configurações Cielo salvas!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar Cielo');
    } finally { setSalvandoConfig(''); }
  };

  if (carregandoConfig || permCarregando) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    );
  }

  const niveis = ['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR'] as const;
  const nivelColors: Record<string, string> = {
    ADMINISTRADOR: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    SUPERVISOR: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    OPERADOR: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Configurações da Empresa</h2>
        <p className="text-sm text-muted-foreground mt-1">Gerencie permissões, integrações e plano da sua empresa</p>
      </div>

      {/* ========== CARD 1: NÍVEIS DE ACESSO (PERMISSÕES) ========== */}
      <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-500" />
            Níveis de Acesso (Permissões)
          </CardTitle>
          <CardDescription className="text-xs">
            Defina quais menus cada nível de acesso pode visualizar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tabs de nível */}
          <div className="flex gap-2">
            {niveis.map(n => (
              <button
                key={n}
                onClick={() => setPermNivelSelecionado(n)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                  permNivelSelecionado === n
                    ? nivelColors[n]
                    : 'border-border text-muted-foreground hover:bg-muted/50'
                }`}
              >
                {n}
                {permTodos[n] && (
                  <span className="ml-1 opacity-70">({permTodos[n].length})</span>
                )}
              </button>
            ))}
          </div>

          {/* Lista de checkboxes */}
          {permLoading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-500" />
            </div>
          ) : (
            <div className="space-y-2">
              {menuItems.map(item => {
                const isChecked = permMenuPermitidos.includes(item.id);
                const isLocked = item.id === 'configuracoes-empresa' && permNivelSelecionado === 'ADMINISTRADOR';
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors ${
                      isChecked ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-muted/30 border border-transparent'
                    } ${isLocked ? 'opacity-90' : 'cursor-pointer hover:bg-muted/50'}`}
                    onClick={() => !isLocked && handlePermToggle(item.id)}
                  >
                    <span className={`text-sm ${isChecked ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                      {item.label}
                    </span>
                    <div className="flex items-center gap-2">
                      {isLocked && (
                        <Lock className="w-3 h-3 text-amber-500/60" />
                      )}
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                          isChecked
                            ? 'bg-amber-500 border-amber-500'
                            : 'border-border bg-background'
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Info about locked permission */}
          {permNivelSelecionado === 'ADMINISTRADOR' && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Lock className="w-3 h-3" />
              &quot;Configurações&quot; é obrigatório para o ADMINISTRADOR e não pode ser removido.
            </p>
          )}

          {/* Botão salvar permissões */}
          <Button
            onClick={handleSalvarPermissoes}
            disabled={permSaving || permLoading}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-sm"
          >
            {permSaving ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />Salvando...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" />Salvar Permissões de {permNivelSelecionado}</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ========== CARD 2: PLANO DE ASSINATURA ========== */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-violet-500" />
            Plano de Assinatura
          </CardTitle>
          <CardDescription className="text-xs">
            Informações do plano contratado pela sua empresa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {planoLoading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-violet-500" />
            </div>
          ) : planoInfo ? (
            <>
              {/* Nome e Status */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold text-foreground">{planoInfo.planoNome}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={`text-xs ${
                      planoInfo.statusAssinatura === 'ATIVA'
                        ? 'bg-green-500/20 text-green-400 border-green-500/30'
                        : planoInfo.statusAssinatura === 'VENCIDA'
                        ? 'bg-red-500/20 text-red-400 border-red-500/30'
                        : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                    }`}>
                      {planoInfo.statusAssinatura}
                    </Badge>
                    {planoInfo.recSuporte && (
                      <Badge variant="secondary" className="text-xs text-muted-foreground">
                        Suporte: {planoInfo.recSuporte}
                      </Badge>
                    )}
                  </div>
                </div>
                {planoInfo.bloqueada && (
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                )}
              </div>

              {/* Limites */}
              {planoInfo.limites && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">LIMITES DE USO</p>
                  {Object.entries(planoInfo.limites).map(([key, val]: [string, any]) => {
                    const labels: Record<string, string> = { clientes: 'Clientes', usuarios: 'Usuários', maquinas: 'Máquinas' };
                    const pct = val.limite > 0 ? Math.min(100, Math.round((val.usado / val.limite) * 100)) : 0;
                    const isNearLimit = pct >= 90;
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{labels[key] || key}</span>
                          <span className={isNearLimit ? 'text-red-400 font-medium' : 'text-foreground'}>
                            {val.usado} / {val.limite === 999999 ? '∞' : val.limite}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isNearLimit ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${val.limite === 999999 ? 10 : pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Features */}
              {planoInfo.features && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">RECURSOS INCLUSOS</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'recIA', label: 'IA Vision' },
                      { key: 'recChatIA', label: 'Chat IA' },
                      { key: 'recRelatorios', label: 'Relatórios' },
                      { key: 'recBackup', label: 'Backup' },
                      { key: 'recAPI', label: 'API' },
                    ].map(f => (
                      <div key={f.key} className="flex items-center gap-2">
                        {planoInfo.features[f.key] ? (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-muted-foreground/40" />
                        )}
                        <span className={`text-xs ${planoInfo.features[f.key] ? 'text-foreground' : 'text-muted-foreground/60 line-through'}`}>
                          {f.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Não foi possível carregar as informações do plano.</p>
          )}
        </CardContent>
      </Card>

      {/* ========== CARD 3: INTEGRAÇÃO PIX ========== */}
      <Card className="border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-purple-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <QrCode className="w-5 h-5 text-violet-500" />
            Integração PIX
          </CardTitle>
          <CardDescription className="text-xs">
            Configure a chave PIX para geração de QR Code de cobrança.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Banco</Label>
            <Input
              type="text"
              value={pixBancoNome}
              onChange={(e) => setPixBancoNome(e.target.value)}
              placeholder="Ex: Nubank, Itaú..."
              className="bg-muted border-border text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tipo da Chave PIX</Label>
            <select
              value={pixChaveTipo}
              onChange={(e) => setPixChaveTipo(e.target.value)}
              className="w-full h-8 rounded-md border border-border bg-muted px-2 text-sm text-foreground"
            >
              <option value="CPF">CPF</option>
              <option value="CNPJ">CNPJ</option>
              <option value="TELEFONE">Telefone</option>
              <option value="EMAIL">E-mail</option>
              <option value="ALEATORIA">Aleatória</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Chave PIX</Label>
            <Input
              type="text"
              value={pixChave}
              onChange={(e) => setPixChave(e.target.value)}
              placeholder={pixChaveTipo === 'CPF' ? '000.000.000-00' : pixChaveTipo === 'EMAIL' ? 'email@exemplo.com' : 'Chave PIX'}
              className="bg-muted border-border text-sm font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Recebedor (max 25)</Label>
              <Input
                type="text"
                value={pixMerchantNome}
                onChange={(e) => setPixMerchantNome(e.target.value.substring(0, 25))}
                maxLength={25}
                placeholder="Nome"
                className="bg-muted border-border text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Cidade (max 15)</Label>
              <Input
                type="text"
                value={pixMerchantCidade}
                onChange={(e) => setPixMerchantCidade(e.target.value.substring(0, 15))}
                maxLength={15}
                placeholder="Cidade"
                className="bg-muted border-border text-sm"
              />
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            {pixChave && pixMerchantNome && pixMerchantCidade ? (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30 text-xs">
                <CheckCircle className="w-3 h-3 mr-1" />PIX configurado
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-muted-foreground text-xs">
                <Circle className="w-3 h-3 mr-1" />Preencha chave, nome e cidade
              </Badge>
            )}
          </div>

          <Button
            onClick={handleSalvarPix}
            disabled={salvandoConfig === 'pix'}
            className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white text-sm"
          >
            {salvandoConfig === 'pix' ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />Salvando...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" />Salvar PIX</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ========== CARD 4: INTEGRAÇÃO MERCADOPAGO ========== */}
      <Card className="border-sky-500/20 bg-gradient-to-br from-sky-500/5 to-blue-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-sky-500" />
            Integração MercadoPago
          </CardTitle>
          <CardDescription className="text-xs">
            Credenciais do MercadoPago para processar pagamentos (POS / QR Code).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Lock className="w-3 h-3" />Access Token
            </Label>
            <div className="relative">
              <Input
                type={showMpAccessToken ? 'text' : 'password'}
                value={mpAccessToken}
                onChange={(e) => setMpAccessToken(e.target.value)}
                placeholder="APP_USR-xxxxxxxxxxxxxxxx"
                className="bg-muted border-border pr-10 text-sm font-mono"
              />
              <button
                type="button"
                onClick={() => setShowMpAccessToken(!showMpAccessToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showMpAccessToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Globe className="w-3 h-3" />Public Key
            </Label>
            <div className="relative">
              <Input
                type={showMpPublicKey ? 'text' : 'password'}
                value={mpPublicKey}
                onChange={(e) => setMpPublicKey(e.target.value)}
                placeholder="APP_USR-xxxxxxxxxxxxxxxx"
                className="bg-muted border-border pr-10 text-sm font-mono"
              />
              <button
                type="button"
                onClick={() => setShowMpPublicKey(!showMpPublicKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showMpPublicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            {mpAccessToken && mpPublicKey ? (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30 text-xs">
                <CheckCircle className="w-3 h-3 mr-1" />MercadoPago configurado
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-muted-foreground text-xs">
                <Circle className="w-3 h-3 mr-1" />Preencha Access Token e Public Key
              </Badge>
            )}
          </div>

          <Button
            onClick={handleSalvarMP}
            disabled={salvandoConfig === 'mp'}
            className="w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white text-sm"
          >
            {salvandoConfig === 'mp' ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />Salvando...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" />Salvar MercadoPago</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ========== CARD 5: INTEGRAÇÃO CIELO ========== */}
      <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-green-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-500" />
            Integração Cielo
          </CardTitle>
          <CardDescription className="text-xs">
            Configure a integração com a Cielo para pagamentos com cartão (POS).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Merchant ID</Label>
              <Input
                type="text"
                value={cieloMerchantId}
                onChange={(e) => setCieloMerchantId(e.target.value)}
                placeholder="Merchant ID"
                className="bg-muted border-border text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Lock className="w-3 h-3" />Merchant Key
              </Label>
              <div className="relative">
                <Input
                  type={showCieloKey ? 'text' : 'password'}
                  value={cieloMerchantKey}
                  onChange={(e) => setCieloMerchantKey(e.target.value)}
                  placeholder="Merchant Key"
                  className="bg-muted border-border pr-8 text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowCieloKey(!showCieloKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCieloKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Ambiente</Label>
            <select
              value={cieloAmbiente}
              onChange={(e) => setCieloAmbiente(e.target.value as 'sandbox' | 'production')}
              className="w-full h-8 rounded-md border border-border bg-muted px-2 text-sm text-foreground"
            >
              <option value="sandbox">Sandbox (Teste)</option>
              <option value="production">Produção</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Client ID</Label>
              <Input
                type="text"
                value={cieloClientId}
                onChange={(e) => setCieloClientId(e.target.value)}
                placeholder="Client ID"
                className="bg-muted border-border text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Lock className="w-3 h-3" />Client Secret
              </Label>
              <div className="relative">
                <Input
                  type={showCieloSecret ? 'text' : 'password'}
                  value={cieloClientSecret}
                  onChange={(e) => setCieloClientSecret(e.target.value)}
                  placeholder="Client Secret"
                  className="bg-muted border-border pr-8 text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowCieloSecret(!showCieloSecret)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCieloSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">MCC</Label>
              <Input
                type="text"
                value={cieloMcc}
                onChange={(e) => setCieloMcc(e.target.value)}
                placeholder="Ex: 5411"
                className="bg-muted border-border text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Estabelecimento</Label>
              <Input
                type="text"
                value={cieloEstabelecimento}
                onChange={(e) => setCieloEstabelecimento(e.target.value)}
                placeholder="Nome do estabelecimento"
                className="bg-muted border-border text-sm"
              />
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            {cieloMerchantId && cieloMerchantKey ? (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30 text-xs">
                <CheckCircle className="w-3 h-3 mr-1" />Cielo {cieloAmbiente === 'production' ? 'produção' : 'sandbox'} configurado
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-muted-foreground text-xs">
                <Circle className="w-3 h-3 mr-1" />Preencha Merchant ID e Key
              </Badge>
            )}
          </div>

          <Button
            onClick={handleSalvarCielo}
            disabled={salvandoConfig === 'cielo'}
            className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white text-sm"
          >
            {salvandoConfig === 'cielo' ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />Salvando...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" />Salvar Cielo</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// CONFIGURACOES PAGE (SuperAdmin — IA, Impressora, etc.)
// ============================================
function ConfiguracoesPage({ empresaId, onShowGestao }: { empresaId: string; onShowGestao: () => void }) {
  const { updateEmpresa } = useAuthStore();
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [savedKeyGemini, setSavedKeyGemini] = useState('');
  const [savedKeyGlm, setSavedKeyGlm] = useState('');
  const [savedKeyOpenrouter, setSavedKeyOpenrouter] = useState('');
  const [mpAccessToken, setMpAccessToken] = useState('');
  const [mpPublicKey, setMpPublicKey] = useState('');
  const [showMpAccessToken, setShowMpAccessToken] = useState(false);
  const [showMpPublicKey, setShowMpPublicKey] = useState(false);
  // Config SaaS — MP + PIX para assinaturas (separado do cadastro empresa)
  const [saasMpAccessToken, setSaasMpAccessToken] = useState('');
  const [saasMpPublicKey, setSaasMpPublicKey] = useState('');
  const [saasShowAccessToken, setSaasShowAccessToken] = useState(false);
  const [saasShowPublicKey, setSaasShowPublicKey] = useState(false);
  const [saasPixChaveTipo, setSaasPixChaveTipo] = useState('CPF');
  const [saasPixChave, setSaasPixChave] = useState('');
  const [saasPixMerchantNome, setSaasPixMerchantNome] = useState('');
  const [saasPixMerchantCidade, setSaasPixMerchantCidade] = useState('');
  const [saasPixBancoNome, setSaasPixBancoNome] = useState('');
  const [saasLlmModel, setSaasLlmModel] = useState('gemini-2.5-flash');
  const [showAjudaSaasPix, setShowAjudaSaasPix] = useState(false);
  const [salvandoSaas, setSalvandoSaas] = useState(false);
  const [testandoSaas, setTestandoSaas] = useState(false);
  const [resultadoTesteSaas, setResultadoTesteSaas] = useState<{ sucesso: boolean; mensagem: string; detalhe?: string; tempoMs?: number } | null>(null);
  // Permissoes por nivel de acesso
  const [permNivelSelecionado, setPermNivelSelecionado] = useState<string>('ADMINISTRADOR');
  const [permMenuPermitidos, setPermMenuPermitidos] = useState<string[]>([]);
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permTodos, setPermTodos] = useState<Record<string, string[]>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<{ sucesso: boolean; mensagem: string; detalhe?: string; tempoMs?: number } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [salvandoIA, setSalvandoIA] = useState(false);
  // Estado para ENV config flags (SaaS)
  const [envConfig, setEnvConfig] = useState({ llmModel: false, mercadopagoAccessToken: false, mercadopagoPublicKey: false });
  // (WhatsApp Business API removido — integração inativa, foi substituída por Telegram)
  // Cielo Config
  const [cieloMerchantId, setCieloMerchantId] = useState('');
  const [cieloMerchantKey, setCieloMerchantKey] = useState('');
  const [cieloAmbiente, setCieloAmbiente] = useState<'sandbox' | 'production'>('sandbox');
  const [cieloClientId, setCieloClientId] = useState('');
  const [cieloClientSecret, setCieloClientSecret] = useState('');
  const [cieloMcc, setCieloMcc] = useState('');
  const [cieloEstabelecimento, setCieloEstabelecimento] = useState('');
  const [showCieloKey, setShowCieloKey] = useState(false);
  const [showCieloSecret, setShowCieloSecret] = useState(false);
  const [salvandoCielo, setSalvandoCielo] = useState(false);
  const [testandoCielo, setTestandoCielo] = useState(false);
  const [resultadoTesteCielo, setResultadoTesteCielo] = useState<{ sucesso: boolean; mensagem: string; detalhe?: string; tempoMs?: number } | null>(null);

  // Funções auxiliares
  const getProviderLocal = (m: string) => m.includes('/') ? 'openrouter' : m.startsWith('glm-') ? 'glm' : 'gemini';

  const modelosIA = [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Padrão - Equilibrado)', provider: 'gemini' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Mais preciso - Mais lento)', provider: 'gemini' },
  ];

  useEffect(() => {
    if (!empresaId) return;
    setCarregando(true);
    Promise.all([
      fetch(`/api/configuracoes?empresaId=${empresaId}`).then(r => r.json()),
      fetch('/api/saas-config').then(r => r.json()).catch(() => ({}))
    ])
      .then(([data, saasData]) => {
        setLlmApiKey(data.llmApiKey || '');
        setLlmModel(data.llmModel || data.modeloPadrao || 'gemini-2.5-flash');
        setSavedKeyGemini(data.llmApiKeyGemini || '');
        setSavedKeyGlm(data.llmApiKeyGlm || '');
        setSavedKeyOpenrouter(data.llmApiKeyOpenrouter || '');
        setMpAccessToken(data.mercadopagoAccessToken || '');
        setMpPublicKey(data.mercadopagoPublicKey || '');
        if (data.cieloMerchantId) setCieloMerchantId(data.cieloMerchantId);
        if (data.cieloAmbiente) setCieloAmbiente(data.cieloAmbiente === 'production' ? 'production' : 'sandbox');
        if (data.cieloClientId) setCieloClientId(data.cieloClientId);
        if (data.cieloClientSecret) setCieloClientSecret(data.cieloClientSecret);
        if (data.cieloMcc) setCieloMcc(data.cieloMcc);
        if (data.cieloEstabelecimento) setCieloEstabelecimento(data.cieloEstabelecimento);
        if (data.envConfig) setEnvConfig(data.envConfig);
        // SaaS config (assinaturas)
        setSaasMpAccessToken(saasData.mpAccessToken || '');
        setSaasMpPublicKey(saasData.mpPublicKey || '');
        setSaasPixChaveTipo(saasData.pixChaveTipo || 'CPF');
        setSaasPixChave(saasData.pixChave || '');
        setSaasPixMerchantNome(saasData.pixMerchantNome || '');
        setSaasPixMerchantCidade(saasData.pixMerchantCidade || '');
        setSaasPixBancoNome(saasData.pixBancoNome || '');
        setSaasLlmModel(saasData.llmModel || 'gemini-2.5-flash');
      })
      .catch((err) => {
        console.error('Erro ao carregar configurações:', err);
        toast.error('Erro ao carregar configurações');
      })
      .finally(() => setCarregando(false));
  }, [empresaId]);

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      const bodyPayload: Record<string, string | number | boolean> = { empresaId };

      bodyPayload.mercadopagoAccessToken = mpAccessToken;
      bodyPayload.mercadopagoPublicKey = mpPublicKey;

      const res = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Erro ao salvar configurações');
      toast.success('Configurações salvas com sucesso!');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar configurações';
      toast.error(message);
    } finally {
      setSalvando(false);
    }
  };

  // ===== Estrutura de Menu (arvore de permissoes) =====
  const menuTree = [
    { id: 'dashboard', label: 'Início', icon: 'TrendingUp', grupo: null },
    { id: 'clientes', label: 'Clientes', icon: 'Users', grupo: null },
    { id: 'maquinas', label: 'Maquinas', icon: 'Cog', grupo: null },
    { id: 'tipos-maquina', label: 'Tipos de Maquina', icon: 'Settings', grupo: 'admin' },
    { id: 'leituras', label: 'Cobranca', icon: 'ClipboardList', grupo: null },
    { id: 'ajuste-leitura', label: 'Ajuste de Leitura', icon: 'SlidersHorizontal', grupo: 'admin' },
    { id: 'receber', label: 'Receber', icon: 'DollarSign', grupo: null },
    { id: 'fluxo-caixa', label: 'Fluxo de Caixa', icon: 'Receipt', grupo: null },
    { id: 'usuarios', label: 'Usuarios', icon: 'Settings', grupo: 'admin' },
    { id: 'relatorios', label: 'Relatorios', icon: 'FileText', grupo: null },
    { id: 'assinatura', label: 'Minha Assinatura', icon: 'CreditCard', grupo: null },
    { id: 'grua', label: 'GRUA', icon: 'Gamepad2', grupo: null },
    { id: 'backup-restore', label: 'Backup / Restaurar', icon: 'DatabaseBackup', grupo: 'admin' },
  ];

  const loadPermissoes = async (nivel: string) => {
    setPermLoading(true);
    try {
      const res = await fetch(`/api/saas-permissoes?nivel=${nivel}`);
      if (res.ok) {
        const data = await res.json();
        if (data.permissoes) {
          setPermMenuPermitidos(typeof data.permissoes === 'string' ? JSON.parse(data.permissoes) : data.permissoes);
        } else {
          // Default: tudo permitido para o nivel selecionado
          const todos = menuTree.map(m => m.id);
          setPermMenuPermitidos(todos);
        }
      }
      // Carregar todos os niveis para o resumo
      const allRes = await fetch('/api/saas-permissoes');
      if (allRes.ok) {
        const allData = await allRes.json();
        const mapa: Record<string, string[]> = {};
        for (const row of (allData.permissoes || [])) {
          mapa[row.nivel] = typeof row.menuPermitidos === 'string' ? JSON.parse(row.menuPermitidos) : (row.menuPermitidos || []);
        }
        setPermTodos(mapa);
      }
    } catch {}
    finally { setPermLoading(false); }
  };

  const handlePermToggle = (menuId: string) => {
    setPermMenuPermitidos(prev =>
      prev.includes(menuId) ? prev.filter(id => id !== menuId) : [...prev, menuId]
    );
  };

  const handlePermToggleGrupo = (grupo: string, checked: boolean) => {
    const idsGrupo = menuTree.filter(m => m.grupo === grupo).map(m => m.id);
    setPermMenuPermitidos(prev => {
      const semGrupo = prev.filter(id => !idsGrupo.includes(id));
      return checked ? [...semGrupo, ...idsGrupo] : semGrupo;
    });
  };

  const handlePermSelectAll = (checked: boolean) => {
    setPermMenuPermitidos(checked ? menuTree.map(m => m.id) : []);
  };

  const handleSalvarPermissoes = async () => {
    setPermSaving(true);
    try {
      const res = await fetch('/api/saas-permissoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nivel: permNivelSelecionado, menuPermitidos: permMenuPermitidos }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
      toast.success(`Permissões de ${permNivelSelecionado} salvas!`);
      loadPermissoes(permNivelSelecionado);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar permissões');
    } finally { setPermSaving(false); }
  };

  useEffect(() => { loadPermissoes(permNivelSelecionado); }, [permNivelSelecionado]);

  // ===== SaaS Config — Salvar (assinaturas) =====
  const handleSalvarSaaS = async () => {
    setSalvandoSaas(true);
    try {
      const res = await fetch('/api/saas-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mpAccessToken: saasMpAccessToken,
          mpPublicKey: saasMpPublicKey,
          pixChaveTipo: saasPixChaveTipo,
          pixChave: saasPixChave,
          pixMerchantNome: saasPixMerchantNome,
          pixMerchantCidade: saasPixMerchantCidade,
          pixBancoNome: saasPixBancoNome,
          llmModel: saasLlmModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar config SaaS');
      toast.success('Configuracoes SaaS (assinaturas) salvas com sucesso!');
      setResultadoTesteSaas(null);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar config SaaS');
    } finally {
      setSalvandoSaas(false);
    }
  };

  // ===== SaaS Config — Testar MP =====
  const handleTestarSaaS = async () => {
    setTestandoSaas(true);
    setResultadoTesteSaas(null);
    try {
      const inicio = performance.now();
      const res = await fetch('https://api.mercadopago.com/v1/users/me', {
        headers: { 'Authorization': `Bearer ${saasMpAccessToken}` },
      });
      const tempoMs = Math.round(performance.now() - inicio);
      if (res.ok) {
        const data = await res.json();
        setResultadoTesteSaas({ sucesso: true, mensagem: `Conexao OK — ${data.nickname || data.email}`, detalhe: `ID: ${data.id}`, tempoMs });
      } else {
        const err = await res.json().catch(() => ({}));
        setResultadoTesteSaas({ sucesso: false, mensagem: `Erro ${res.status}`, detalhe: err.message || 'Credencial invalida', tempoMs });
      }
    } catch (err: any) {
      setResultadoTesteSaas({ sucesso: false, mensagem: 'Erro de conexao', detalhe: err.message });
    } finally {
      setTestandoSaas(false);
    }
  };

  const isSaasMpConfigured = !!(saasMpAccessToken && saasMpPublicKey);
  const isSaasPixConfigured = !!(saasPixChave && saasPixMerchantNome && saasPixMerchantCidade);

  const handleSalvarIA = async () => {
    setSalvandoIA(true);
    try {
      const res = await fetch('/api/saas-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mpAccessToken: saasMpAccessToken || null,
          mpPublicKey: saasMpPublicKey || null,
          pixChaveTipo: saasPixChaveTipo || null,
          pixChave: saasPixChave || null,
          pixMerchantNome: saasPixMerchantNome || null,
          pixMerchantCidade: saasPixMerchantCidade || null,
          pixBancoNome: saasPixBancoNome || null,
          llmModel: saasLlmModel || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
      toast.success('Configuracao de IA salva com sucesso!');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar configuracao de IA';
      toast.error(message);
    } finally {
      setSalvandoIA(false);
    }
  };

  const handleTestarConexao = async () => {
    setTestando(true);
    setResultadoTeste(null);
    try {
      const inicio = performance.now();
      const res = await fetch('/api/configuracoes/testar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaId, llmModel: saasLlmModel }),
      });
      const data = await res.json();

      const tempoMs = Math.round(performance.now() - inicio);
      setResultadoTeste({
        sucesso: res.ok,
        mensagem: res.ok ? (data.mensagem || 'Conexão realizada com sucesso!') : (data.error || 'Erro ao testar conexão'),
        detalhe: !res.ok ? (data.detalhe || data.status ? `HTTP ${data.status}` : undefined) : undefined,
        tempoMs,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao testar conexão';
      setResultadoTeste({ sucesso: false, mensagem: message });
    } finally {
      setTestando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Configurações</h2>
        <p className="text-sm text-muted-foreground mt-1">Configuração da IA Vision para extração de leituras</p>
      </div>

      {/* Card - Configuração de IA (Vertex AI) */}
      <Card className="border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Cog className="w-5 h-5 text-amber-500" />
            Configuração de IA (Vertex AI)
          </CardTitle>
          <CardDescription className="text-sm">
            Chave global de IA para todo o sistema. Armazenada no banco de dados (Config SaaS).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={saasLlmModel || 'gemini-2.5-flash'} onValueChange={(v) => setSaasLlmModel(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione um modelo..." />
            </SelectTrigger>
            <SelectContent>
              {modelosIA.filter(m => m.provider === 'gemini').map((modelo) => (
                <SelectItem key={modelo.value} value={modelo.value}>
                  {modelo.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status */}
          <div className="flex items-center gap-2">
            {saasLlmModel && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30">
                <CheckCircle className="w-3 h-3 mr-1" />
                {modelosIA.find(m => m.value === saasLlmModel)?.label || saasLlmModel}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Botão Salvar IA + Testar Conexão */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <Button onClick={handleSalvarIA} disabled={salvandoIA} className="flex-1">
            {salvandoIA ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Salvar IA
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleTestarConexao}
            disabled={testando}
          >
            {testando ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
            ) : (
              <Wifi className="w-4 h-4" />
            )}
          </Button>
        </div>
        {resultadoTeste && (
          <div className={`text-sm p-3 rounded-lg ${resultadoTeste.sucesso ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
            <div className="flex items-start gap-2">
              {resultadoTeste.sucesso ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <X className="w-4 h-4 mt-0.5 shrink-0" />}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p>{resultadoTeste.mensagem}</p>
                  {resultadoTeste.tempoMs != null && (
                    <span className="text-xs opacity-60 shrink-0">{resultadoTeste.tempoMs}ms</span>
                  )}
                </div>
                {resultadoTeste.detalhe && (
                  <p className="mt-1 text-xs opacity-70 font-mono break-all">{resultadoTeste.detalhe}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========== SECAO — PAGAMENTO DE ASSINATURAS (SaaS) ========== */}
      <div className="flex items-center gap-3 mt-4 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <CreditCard className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Pagamento de Assinaturas</h2>
          <p className="text-xs text-muted-foreground">Configuracoes usadas para cobranca de planos SaaS (nao afeta o cobrador POS)</p>
        </div>
      </div>

      {/* Card MP — Assinaturas SaaS */}
      <Card className="border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-purple-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-violet-500" />
            Mercado Pago (Assinaturas)
          </CardTitle>
          <CardDescription className="text-xs">
            Credenciais do Mercado Pago para processar pagamentos de assinaturas de plano. Substitui as ENV vars do servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Lock className="w-3 h-3" />Access Token (Privada)</Label>
            <div className="relative">
              <Input type={saasShowAccessToken ? 'text' : 'password'} value={saasMpAccessToken} onChange={(e) => setSaasMpAccessToken(e.target.value)} placeholder="APP_USR-xxxxxxxxxxxxxxxx" className="bg-muted border-border pr-10 text-sm" />
              <button type="button" onClick={() => setSaasShowAccessToken(!saasShowAccessToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {saasShowAccessToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Globe className="w-3 h-3" />Public Key</Label>
            <div className="relative">
              <Input type={saasShowPublicKey ? 'text' : 'password'} value={saasMpPublicKey} onChange={(e) => setSaasMpPublicKey(e.target.value)} placeholder="APP_USR-xxxxxxxxxxxxxxxx" className="bg-muted border-border pr-10 text-sm" />
              <button type="button" onClick={() => setSaasShowPublicKey(!saasShowPublicKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {saasShowPublicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isSaasMpConfigured ? (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30 text-xs"><CheckCircle className="w-3 h-3 mr-1" />MP configurado para assinaturas</Badge>
            ) : (
              <Badge variant="secondary" className="text-muted-foreground text-xs"><Circle className="w-3 h-3 mr-1" />MP nao configurado</Badge>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={handleSalvarSaaS} disabled={salvandoSaas} size="sm" className="flex-1 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white text-xs">
              {salvandoSaas ? <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current mr-1" />Salvando...</> : <><Save className="w-3 h-3 mr-1" />Salvar</>}
            </Button>
            <Button variant="outline" onClick={handleTestarSaaS} disabled={testandoSaas || !saasMpAccessToken} size="sm" className="flex-1 border-violet-500/30 text-violet-500 hover:bg-violet-500/10 text-xs">
              {testandoSaas ? <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current mr-1" />Testando...</> : <><Zap className="w-3 h-3 mr-1" />Testar</>}
            </Button>
          </div>
          {resultadoTesteSaas && (
            <div className={`flex items-center gap-2 rounded-lg p-2 text-xs ${resultadoTesteSaas.sucesso ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              {resultadoTesteSaas.sucesso ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
              <span className="font-medium">{resultadoTesteSaas.mensagem}</span>
              {resultadoTesteSaas.tempoMs && <span className="ml-auto text-muted-foreground">{resultadoTesteSaas.tempoMs}ms</span>}
            </div>
          )}
          <Separator className="bg-border" />
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">LINKS UTEIS:</p>
            <div className="flex flex-col gap-1.5">
              <a href="https://www.mercadopago.com.br/developers/panel/app"
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs text-sky-500 hover:text-sky-400 transition-colors py-1">
                <ExternalLink className="w-3 h-3" />
                Painel de Desenvolvedores MP
              </a>
              <a href="https://www.mercadopago.com.br/developers/panel/app/credentials"
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs text-sky-500 hover:text-sky-400 transition-colors py-1">
                <Key className="w-3 h-3" />
                Gerenciar Credenciais
              </a>
              <a href="https://www.mercadopago.com.br/developers/pt/docs/payments/api/getting-started"
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs text-sky-500 hover:text-sky-400 transition-colors py-1">
                <BookOpen className="w-3 h-3" />
                Documentacao de Pagamentos
              </a>
              <a href="https://www.mercadopago.com.br/developers/pt/guides/online-payments/qr-code"
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs text-sky-500 hover:text-sky-400 transition-colors py-1">
                <QrCode className="w-3 h-3" />
                Guia de PIX e QR Code
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card PIX Banco — Assinaturas SaaS */}
      <Card className="border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-purple-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <QrCode className="w-4 h-4 text-violet-500" />
            PIX Banco (Assinaturas)
          </CardTitle>
          <CardDescription className="text-xs">
            Chave PIX alternativa para recebimento de assinaturas direto no banco, sem intermediacao.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Banco</Label>
            <Input type="text" value={saasPixBancoNome} onChange={(e) => setSaasPixBancoNome(e.target.value)} placeholder="Ex: Nubank, Itau..." className="bg-muted border-border text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tipo da Chave PIX</Label>
            <select value={saasPixChaveTipo} onChange={(e) => setSaasPixChaveTipo(e.target.value)} className="w-full h-8 rounded-md border border-border bg-muted px-2 text-sm text-foreground">
              <option value="CPF">CPF</option><option value="CNPJ">CNPJ</option><option value="TELEFONE">Telefone</option><option value="EMAIL">E-mail</option><option value="ALEATORIA">Aleatoria</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Chave PIX</Label>
            <Input type="text" value={saasPixChave} onChange={(e) => setSaasPixChave(e.target.value)} placeholder={saasPixChaveTipo === 'CPF' ? '000.000.000-00' : saasPixChaveTipo === 'EMAIL' ? 'email@exemplo.com' : 'Chave PIX'} className="bg-muted border-border text-sm font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Recebedor (max 25)</Label>
              <Input type="text" value={saasPixMerchantNome} onChange={(e) => setSaasPixMerchantNome(e.target.value.substring(0, 25))} maxLength={25} placeholder="Nome" className="bg-muted border-border text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Cidade (max 15)</Label>
              <Input type="text" value={saasPixMerchantCidade} onChange={(e) => setSaasPixMerchantCidade(e.target.value.substring(0, 15))} maxLength={15} placeholder="Cidade" className="bg-muted border-border text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isSaasPixConfigured ? (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30 text-xs"><CheckCircle className="w-3 h-3 mr-1" />PIX Banco configurado</Badge>
            ) : (
              <Badge variant="secondary" className="text-muted-foreground text-xs"><Circle className="w-3 h-3 mr-1" />Preencha chave, nome e cidade</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* (Secção WhatsApp Business API removida — integração inativa, foi substituída por Telegram) */}

      {/* Gestão de Empresas */}

      {/* Gestao de Planos SaaS */}
      <div className="pt-4">
        <Separator className="bg-border mb-6" />
        <GestaoPlanosSaaS />
      </div>

      {/* Gestão de Empresas */}
      <div className="pt-4">
        <Separator className="bg-border mb-6" />
        <Card className="border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-orange-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Building2 className="w-5 h-5 text-amber-500" />
              Gestão de Empresas
            </CardTitle>
            <CardDescription className="text-sm">
              Cadastro e administração das empresas do sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={onShowGestao}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
            >
              <Building2 className="w-4 h-4 mr-2" />
              Abrir Gestão de Empresas
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================
// ASSINATURA TAB COMPONENT
// ============================================
interface PlanoSaaS {
  id: string;
  nome: string;
  descricao: string | null;
  valorMensal: number;
  valorAnual: number | null;
  moeda: string;
  limiteClientes: number;
  limiteUsuarios: number;
  limiteMaquinas: number;
  recIA: boolean;
  recChatIA: boolean;
  recRelatorios: boolean;
  recBackup: boolean;
  recAPI: boolean;
  recSuporte: string;
  ordem: number;
  ativo: boolean;
  popular: boolean;
}

interface AssinaturaSaaS {
  id: string;
  empresaId: string;
  planoSaaSId: string;
  status: string;
  dataInicio: string;
  dataFim: string | null;
  dataCancelamento: string | null;
  valorPago: number | null;
  formaPagamento: string | null;
  planoSaaS?: PlanoSaaS;
}

interface AssinaturaStatusData {
  assinatura: AssinaturaSaaS | null;
  empresa: { id: string; nome: string; plano: string | null; dataVencimento: string | null; isDemo: boolean; bloqueada: boolean; diasDemo: number; createdAt: string } | null;
  planosDisponiveis: PlanoSaaS[];
}

function AssinaturaTab() {
  const token = useAuthStore.getState().token;
  const [statusData, setStatusData] = useState<AssinaturaStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [tipoDialogOpen, setTipoDialogOpen] = useState(false);
  const [planoSelecionado, setPlanoSelecionado] = useState<PlanoSaaS | null>(null);
  const [planoTipo, setPlanoTipo] = useState<'mensal' | 'anual'>('mensal');
  // Feedback de retorno do MercadoPago
  const [paymentReturn, setPaymentReturn] = useState<'success' | 'failure' | 'pending' | null>(null);
  const [paymentChecking, setPaymentChecking] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadStatus();
    // Detectar retorno do MercadoPago via URL params
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    if (paymentStatus === 'success' || paymentStatus === 'failure' || paymentStatus === 'pending') {
      setPaymentReturn(paymentStatus as 'success' | 'failure' | 'pending');
      // Limpar params da URL
      window.history.replaceState({}, '', window.location.pathname);
      // Se aprovado/pendente, iniciar polling para detectar webhook
      if (paymentStatus === 'success' || paymentStatus === 'pending') {
        startPolling();
      }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Polling: verifica se o webhook ativou a assinatura
  const startPolling = () => {
    setPaymentChecking(true);
    let attempts = 0;
    const maxAttempts = 20; // 20 x 3s = 60s
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch('/api/assinatura-saas/status', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();

          if (data.assinatura?.status === 'ATIVA') {
            // Webhook ativou a assinatura!
            setStatusData(data);
            setPaymentReturn('success');
            setPaymentChecking(false);
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            // Sincronizar plano do authStore
            if (data.empresa?.plano) {
              useAuthStore.getState().updateEmpresa({ plano: data.empresa.plano });
            }
            toast.success('Pagamento confirmado! Assinatura ativada.');
            return;
          }
        }
      } catch { /* silencioso */ }
      if (attempts >= maxAttempts) {
        setPaymentChecking(false);
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    }, 3000);
  };


  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/assinatura-saas/status', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || `Erro HTTP ${res.status}`);
      }
      const data = await res.json();

      setStatusData(data);
      // Sincronizar plano do authStore com o do backend
      if (data.empresa?.plano) {
        const empresaAtual = useAuthStore.getState().empresa;
        if (empresaAtual && empresaAtual.plano !== data.empresa.plano) {
          useAuthStore.getState().updateEmpresa({ plano: data.empresa.plano });
        }
      }
    } catch (error) {
      console.error('Erro ao carregar status da assinatura:', error);
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(`Erro ao carregar informações da assinatura: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ATIVA':
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Ativa</Badge>;
      case 'TRIAL':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Trial</Badge>;
      case 'VENCIDA':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Vencida</Badge>;
      case 'CANCELADA':
        return <Badge className="bg-zinc-500/20 text-zinc-400 border-zinc-500/30">Cancelada</Badge>;
      case 'SUSPENSA':
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Suspensa</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleAssinarClick = (plano: PlanoSaaS) => {
    setPlanoSelecionado(plano);
    setTipoDialogOpen(true);
  };

  const handleCheckout = async () => {
    if (!planoSelecionado) return;
    setCheckoutLoading(planoSelecionado.id);
    const result = await redirectToCheckout({
      planoSaaSId: planoSelecionado.id,
      planoTipo,
    });
    if (!result.success) {
      toast.error(result.error || 'Erro ao iniciar pagamento');
      setCheckoutLoading(null);
    }
    // Se sucesso, a pagina vai redirecionar (não precisa fazer mais nada)
  };

  const getSuporteLabel = (tipo: string) => {
    switch (tipo) {
      case '24h': return 'Suporte 24h';
      case 'prioritario': return 'Suporte Prioritário';
      default: return 'Suporte por Email';
    }
  };

  const isCurrentPlan = (planoId: string) => {
    return statusData?.assinatura?.planoSaaSId === planoId && 
           statusData?.assinatura?.status !== 'CANCELADA' &&
           statusData?.assinatura?.status !== 'VENCIDA';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-foreground">Minha Assinatura</h2>
        <div className="flex items-center justify-center py-12">
          <div className="text-center text-muted-foreground">
            <CreditCard className="w-8 h-8 mx-auto mb-2 animate-pulse opacity-50" />
            <p>Carregando informações...</p>
          </div>
        </div>
      </div>
    );
  }

  const assinatura = statusData?.assinatura;
  const planos = (statusData?.planosDisponiveis || []).filter(p => p.valorMensal > 0);
  const empresa = statusData?.empresa;

  // Calcular dados do trial
  const isTrial = !assinatura || assinatura.status === 'TRIAL';
  const trialDataInicio = empresa?.createdAt ? new Date(empresa.createdAt) : null;
  const trialDataFim = empresa?.dataVencimento ? new Date(empresa.dataVencimento) : null;
  const trialDiasTotais = empresa?.diasDemo || 7;
  const diasRestantes = trialDataFim ? Math.max(0, Math.ceil((trialDataFim.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-foreground">Minha Assinatura</h2>

      {/* Current Subscription Card */}
      <Card className="border-0 shadow-lg bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                {assinatura ? (
                  <Crown className="w-6 h-6 text-white" />
                ) : (
                  <Sparkles className="w-6 h-6 text-white" />
                )}
              </div>
              <div>
                <CardTitle className="text-lg text-foreground">
                  {assinatura ? assinatura.planoSaaS?.nome || 'Plano Atual' : 'Período de Testes'}
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  {assinatura ? `Assinante desde ${formatDate(assinatura.dataInicio)}` : 'Explore todas as funcionalidades gratuitamente'}
                </CardDescription>
              </div>
            </div>
            {assinatura && getStatusBadge(assinatura.status)}
            {isTrial && !assinatura && getStatusBadge('TRIAL')}
          </div>
        </CardHeader>
        {assinatura && (
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {assinatura.dataInicio && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Início</p>
                  <p className="text-sm font-medium text-foreground">{formatDate(assinatura.dataInicio)}</p>
                </div>
              )}
              {assinatura.dataFim && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Vencimento</p>
                  <p className="text-sm font-medium text-foreground">{formatDate(assinatura.dataFim)}</p>
                </div>
              )}
              {assinatura.valorPago && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Último Pagamento</p>
                  <p className="text-sm font-medium text-foreground">{formatCurrency(assinatura.valorPago)}</p>
                </div>
              )}
              {assinatura.formaPagamento && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Forma de Pagamento</p>
                  <p className="text-sm font-medium text-foreground">{assinatura.formaPagamento}</p>
                </div>
              )}
            </div>

            {/* Warning for expired/cancelled */}
            {(assinatura.status === 'VENCIDA' || assinatura.status === 'CANCELADA') && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mt-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  <p className="font-semibold text-red-400">Sua assinatura expirou</p>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  Renove sua assinatura para continuar usando todas as funcionalidades do sistema.
                </p>
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-amber-500 to-orange-600"
                  onClick={() => {
                    const currentPlano = planos.find(p => p.id === assinatura.planoSaaSId);
                    if (currentPlano) {
                      handleAssinarClick(currentPlano);
                    } else if (planos.length > 0) {
                      handleAssinarClick(planos[planos.length - 1]);
                    }
                  }}
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Renovar Agora
                </Button>
              </div>
            )}

            {/* Trial info */}
            {isTrial && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mt-3">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-5 h-5 text-blue-400" />
                  <p className="font-semibold text-blue-400">Período de Testes</p>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="bg-background/50 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">Início</p>
                    <p className="text-sm font-medium text-foreground">{trialDataInicio ? formatDate(trialDataInicio.toISOString()) : '—'}</p>
                  </div>
                  <div className="bg-background/50 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">Expira em</p>
                    <p className="text-sm font-medium text-foreground">{trialDataFim ? formatDate(trialDataFim.toISOString()) : '—'}</p>
                  </div>
                  <div className="bg-background/50 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">Dias restantes</p>
                    <p className={`text-sm font-bold ${diasRestantes !== null && diasRestantes <= 3 ? 'text-red-400' : diasRestantes !== null && diasRestantes <= 7 ? 'text-amber-400' : 'text-blue-400'}`}>
                      {diasRestantes !== null ? `${diasRestantes} dia${diasRestantes !== 1 ? 's' : ''}` : '—'}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Escolha um plano abaixo para continuar usando o sistema após o trial.
                </p>
              </div>
            )}
          </CardContent>
        )}
        {!assinatura && (
          <CardContent>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-blue-400" />
                <p className="font-semibold text-blue-400">Período de Testes</p>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-background/50 rounded-lg p-2.5">
                  <p className="text-xs text-muted-foreground">Início</p>
                  <p className="text-sm font-medium text-foreground">{trialDataInicio ? formatDate(trialDataInicio.toISOString()) : '—'}</p>
                </div>
                <div className="bg-background/50 rounded-lg p-2.5">
                  <p className="text-xs text-muted-foreground">Expira em</p>
                  <p className="text-sm font-medium text-foreground">{trialDataFim ? formatDate(trialDataFim.toISOString()) : '—'}</p>
                </div>
                <div className="bg-background/50 rounded-lg p-2.5">
                  <p className="text-xs text-muted-foreground">Dias restantes</p>
                  <p className={`text-sm font-bold ${diasRestantes !== null && diasRestantes <= 3 ? 'text-red-400' : diasRestantes !== null && diasRestantes <= 7 ? 'text-amber-400' : 'text-blue-400'}`}>
                    {diasRestantes !== null ? `${diasRestantes} dia${diasRestantes !== 1 ? 's' : ''}` : '—'}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Escolha um plano abaixo para continuar usando o sistema após o trial.
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Available Plans */}
      <div>
        <h3 className="text-lg font-bold text-foreground mb-4">Planos Disponíveis</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {planos.map((plano) => {
            const current = isCurrentPlan(plano.id);
            const descontoAnual = plano.valorAnual && plano.valorMensal
              ? Math.round((1 - plano.valorAnual / (plano.valorMensal * 12)) * 100)
              : 0;

            return (
              <Card
                key={plano.id}
                className={`border-0 shadow-lg relative overflow-hidden transition-all ${
                  plano.popular
                    ? 'bg-gradient-to-b from-amber-500/10 to-card ring-2 ring-amber-500/50'
                    : current
                    ? 'bg-card ring-2 ring-emerald-500/50'
                    : 'bg-card'
                }`}
              >
                {/* Popular badge */}
                {plano.popular && (
                  <div className="absolute top-0 right-0">
                    <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                      MAIS POPULAR
                    </div>
                  </div>
                )}

                {/* Current plan badge */}
                {current && (
                  <div className="absolute top-0 right-0">
                    <div className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      PLANO ATUAL
                    </div>
                  </div>
                )}

                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-foreground flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-400" />
                    {plano.nome}
                  </CardTitle>
                  {plano.descricao && (
                    <CardDescription className="text-muted-foreground text-sm">{plano.descricao}</CardDescription>
                  )}
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Pricing */}
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-foreground">{formatCurrency(plano.valorMensal)}</span>
                      <span className="text-sm text-muted-foreground">/mês</span>
                    </div>
                    {plano.valorAnual && (
                      <div className="mt-1">
                        <span className="text-sm text-muted-foreground line-through">{formatCurrency(plano.valorMensal * 12)}/ano</span>
                        <span className="ml-2 text-sm font-semibold text-emerald-400">
                          {formatCurrency(plano.valorAnual)}/ano
                          {descontoAnual > 0 && (
                            <Badge className="ml-1 bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                              -{descontoAnual}%
                            </Badge>
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  <Separator className="bg-border" />

                  {/* Limits */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Limites</p>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Users className="w-4 h-4" /> Clientes
                        </span>
                        <span className="font-medium text-foreground">{plano.limiteClientes === -1 ? 'Ilimitado' : plano.limiteClientes}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Shield className="w-4 h-4" /> Usuários
                        </span>
                        <span className="font-medium text-foreground">{plano.limiteUsuarios === -1 ? 'Ilimitado' : plano.limiteUsuarios}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Cog className="w-4 h-4" /> Máquinas
                        </span>
                        <span className="font-medium text-foreground">{plano.limiteMaquinas === -1 ? 'Ilimitado' : plano.limiteMaquinas}</span>
                      </div>
                    </div>
                  </div>

                  <Separator className="bg-border" />

                  {/* Resources */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recursos</p>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">IA Vision (OCR)</span>
                        {plano.recIA ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <X className="w-4 h-4 text-zinc-500" />
                        )}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Chat IA</span>
                        {plano.recChatIA ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <X className="w-4 h-4 text-zinc-500" />
                        )}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Relatórios Avançados</span>
                        {plano.recRelatorios ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <X className="w-4 h-4 text-zinc-500" />
                        )}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Backup Automático</span>
                        {plano.recBackup ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <X className="w-4 h-4 text-zinc-500" />
                        )}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">API Dedicada</span>
                        {plano.recAPI ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <X className="w-4 h-4 text-zinc-500" />
                        )}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Suporte</span>
                        <span className="font-medium text-foreground text-xs">{getSuporteLabel(plano.recSuporte)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action button */}
                  {current ? (
                    <div className="pt-2">
                      <Button
                        className="w-full bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                        disabled
                      >
                        <Check className="w-4 h-4 mr-2" />
                        Plano Atual
                      </Button>
                    </div>
                  ) : (
                    <div className="pt-2">
                      <Button
                        className={`w-full ${
                          plano.popular
                            ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700'
                            : 'bg-muted hover:bg-muted/80 text-foreground'
                        }`}
                        onClick={() => handleAssinarClick(plano)}
                        disabled={checkoutLoading === plano.id}
                      >
                        {checkoutLoading === plano.id ? (
                          <>
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                            Processando...
                          </>
                        ) : (
                          <>
                            <CreditCard className="w-4 h-4 mr-2" />
                            Assinar
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {planos.length === 0 && (
          <Card className="border-0 shadow-lg bg-card">
            <CardContent className="py-8 text-center text-muted-foreground">
              <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum plano disponível no momento.</p>
              <p className="text-sm mt-1">Entre em contato com o suporte.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Painel Financeiro SaaS */}
      <PainelFinanceiroSaaS />

      {/* Payment Return Banner */}
      {paymentReturn && (
        <div className={`rounded-lg border p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${
          paymentReturn === 'success' ? 'bg-emerald-500/10 border-emerald-500/30' :
          paymentReturn === 'pending' ? 'bg-amber-500/10 border-amber-500/30' :
          'bg-red-500/10 border-red-500/30'
        }`}>
          {paymentReturn === 'success' && (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          )}
          {paymentReturn === 'pending' && (
            <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          )}
          {paymentReturn === 'failure' && (
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            {paymentReturn === 'success' && (
              <p className="text-sm font-semibold text-emerald-400">Pagamento confirmado!</p>
            )}
            {paymentReturn === 'pending' && (
              <div>
                <p className="text-sm font-semibold text-amber-400">
                  {paymentChecking ? 'Aguardando confirmação...' : 'Pagamento pendente'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {paymentChecking
                    ? 'Estamos processando seu pagamento. A assinatura será ativada automaticamente.'
                    : 'O pagamento ainda não foi confirmado. Sua assinatura será ativada quando o pagamento for compensado.'}
                </p>
              </div>
            )}
            {paymentReturn === 'failure' && (
              <div>
                <p className="text-sm font-semibold text-red-400">Pagamento não realizado</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  O pagamento foi cancelado ou recusado. Tente novamente com outro método.
                </p>
              </div>
            )}
          </div>
          <button onClick={() => setPaymentReturn(null)} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Billing Type Dialog */}
      <Dialog open={tipoDialogOpen} onOpenChange={(open) => { setTipoDialogOpen(open); if (!open) { setPlanoSelecionado(null); setCheckoutLoading(null); } }}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-amber-400" />
              Assinar {planoSelecionado?.nome}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Escolha o ciclo e será redirecionado ao MercadoPago para finalizar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            {/* Mensal */}
            <button
              onClick={() => setPlanoTipo('mensal')}
              className={`w-full flex items-center justify-between p-4 rounded-lg border transition-all ${
                planoTipo === 'mensal'
                  ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30'
                  : 'border-border bg-muted/50 hover:bg-muted'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  planoTipo === 'mensal' ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground'
                }`}>
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-foreground">Mensal</p>
                  <p className="text-xs text-muted-foreground">Cobrado todo mês</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-foreground">{planoSelecionado ? formatCurrency(planoSelecionado.valorMensal) : ''}</p>
                <p className="text-xs text-muted-foreground">/mês</p>
              </div>
            </button>

            {/* Anual */}
            {planoSelecionado?.valorAnual && (
              <button
                onClick={() => setPlanoTipo('anual')}
                className={`w-full flex items-center justify-between p-4 rounded-lg border transition-all relative ${
                  planoTipo === 'anual'
                    ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30'
                    : 'border-border bg-muted/50 hover:bg-muted'
                }`}
              >
                <div className="absolute -top-2 right-4">
                  <Badge className="bg-emerald-500 text-white text-xs">
                    Economia de {Math.round((1 - planoSelecionado.valorAnual! / (planoSelecionado.valorMensal * 12)) * 100)}%
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    planoTipo === 'anual' ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground'
                  }`}>
                    <CalendarDays className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-foreground">Anual</p>
                    <p className="text-xs text-muted-foreground">Cobrado uma vez ao ano</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-foreground">{formatCurrency(planoSelecionado.valorAnual!)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(planoSelecionado.valorAnual! / 12)}/mês
                  </p>
                </div>
              </button>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTipoDialogOpen(false)} disabled={!!checkoutLoading}>
              Cancelar
            </Button>
            <Button
              className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
              onClick={handleCheckout}
              disabled={!!checkoutLoading}
            >
              {checkoutLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  Redirecionando...
                </>
              ) : (
                <>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Pagar no MercadoPago
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================
// DESPESAS PAGE COMPONENT
// ============================================
interface ContaItem {
  id: string;
  descricao: string;
  valor: number;
  data: string;
  paga: boolean;
  dataPagamento?: string;
  observacoes?: string;
  tipo: number;
  empresaId: string;
  clienteId: string;
  createdAt: string;
  updatedAt: string;
  cliente?: { id: string; nome: string };
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

function FluxoCaixaPage({ empresaId, isAdmin, isSupervisor }: { empresaId: string; isAdmin: boolean; isSupervisor: boolean }) {
  const { empresa } = useAuthStore();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteSelecionado, setClienteSelecionado] = useState<string>('');
  const [contas, setContas] = useState<ContaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingConta, setEditingConta] = useState<ContaItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const formCardRef = useRef<HTMLDivElement>(null);

  // Form state
  const [formDescricao, setFormDescricao] = useState('');
  const [formValor, setFormValor] = useState('');
  const [formData, setFormData] = useState(new Date().toISOString().split('T')[0]);
  const [formObservacoes, setFormObservacoes] = useState('');
  const [formTipo, setFormTipo] = useState<number>(1); // 0 = A Pagar, 1 = A Receber

  // Filter
  const [filtroTipo, setFiltroTipo] = useState<number | null>(null); // null = todos

  useEffect(() => {
    loadClientes();
  }, [empresaId]);

  useEffect(() => {
    if (clienteSelecionado) {
      loadContas();
    } else {
      setContas([]);
      setLoading(false);
    }
  }, [clienteSelecionado, empresaId]);

  const loadClientes = async () => {
    try {
      const res = await fetch(`/api/clientes?empresaId=${empresaId}`);
      const data = await res.json();
      console.log("[FLUXO-CAIXA] Response:", res.status, JSON.stringify(data).substring(0, 300));
      setClientes(data.filter((c: Cliente) => !c.bloqueado && c.ativo));
    } catch (error) {
      toast.error('Erro ao carregar clientes');
    }
  };

  const loadContas = async () => {
    setLoading(true);
    try {
      let url = `/api/contas?empresaId=${empresaId}&clienteId=${clienteSelecionado}`;
      if (filtroTipo !== null) url += `&tipo=${filtroTipo}`;
      url += `&_t=${Date.now()}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Erro ao carregar contas');
        setContas([]);
        return;
      }
      const data = await res.json();
      console.log("[FLUXO-CAIXA] Response:", res.status, JSON.stringify(data).substring(0, 300));
      setContas(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('Erro ao carregar contas');
      setContas([]);
    } finally {
      setLoading(false);
    }
  };

  // Reload when filter changes
  useEffect(() => {
    if (clienteSelecionado) loadContas();
  }, [filtroTipo]);

  const resetForm = () => {
    setFormDescricao('');
    setFormValor('');
    setFormData(new Date().toISOString().split('T')[0]);
    setFormObservacoes('');
    setFormTipo(1);
    setEditingConta(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!formDescricao.trim() || !formValor || !clienteSelecionado) {
      toast.error('Preencha descrição, valor e selecione um cliente');
      return;
    }

    const valorNum = parseFloat(String(formValor).replace(',', '.'));
    if (isNaN(valorNum) || valorNum <= 0) {
      toast.error('Valor inválido');
      return;
    }

    setSaving(true);
    try {
      if (editingConta) {
        const res = await fetch(`/api/contas/${editingConta.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            descricao: formDescricao.trim(),
            valor: valorNum,
            data: formData,
            observacoes: formObservacoes.trim() || null,
            tipo: formTipo,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          toast.error(errData.error || 'Erro ao atualizar conta');
          return;
        }
        const contaAtualizada = await res.json().catch(() => null);
        if (contaAtualizada) {
          setContas(prev => prev.map(c => c.id === editingConta.id ? contaAtualizada : c));
        }
        toast.success('Conta atualizada!');
      } else {
        const res = await fetch('/api/contas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            descricao: formDescricao.trim(),
            valor: valorNum,
            data: formData,
            observacoes: formObservacoes.trim() || null,
            tipo: formTipo,
            empresaId,
            clienteId: clienteSelecionado,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          toast.error(errData.error || 'Erro ao adicionar conta');
          return;
        }
        toast.success('Conta adicionada!');
      }
      resetForm();
      setShowForm(false);
      loadContas();
    } catch (error) {
      console.error('Erro ao salvar conta:', error);
      toast.error('Erro ao salvar conta');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (conta: ContaItem) => {
    setEditingConta(conta);
    setFormDescricao(conta.descricao);
    setFormValor(conta.valor.toString());
    setFormData(new Date(conta.data).toISOString().split('T')[0]);
    setFormObservacoes(conta.observacoes || '');
    setFormTipo(conta.tipo);
    setShowForm(true);
    // Rolar ate o card de edicao apos renderizar
    setTimeout(() => {
      formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta conta?')) return;
    try {
      await fetch(`/api/contas/${id}`, { method: 'DELETE' });
      toast.success('Conta removida!');
      loadContas();
    } catch (error) {
      toast.error('Erro ao remover conta');
    }
  };

  const handleTogglePaga = async (conta: ContaItem) => {
    try {
      const res = await fetch(`/api/contas/${conta.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paga: !conta.paga }),
      });
      if (res.ok) {
        const contaAtualizada = await res.json().catch(() => null);
        if (contaAtualizada) {
          setContas(prev => prev.map(c => c.id === conta.id ? contaAtualizada : c));
        }
      }
      toast.success(conta.paga ? 'Conta marcada como pendente' : 'Conta liquidada!');
      loadContas();
    } catch (error) {
      toast.error('Erro ao atualizar conta');
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Totals
  const totalReceber = contas.filter(c => c.tipo === 1).reduce((sum, c) => sum + c.valor, 0);
  const totalPagar = contas.filter(c => c.tipo === 0).reduce((sum, c) => sum + c.valor, 0);
  const totalReceberPago = contas.filter(c => c.tipo === 1 && c.paga).reduce((sum, c) => sum + c.valor, 0);
  const totalPagarPago = contas.filter(c => c.tipo === 0 && c.paga).reduce((sum, c) => sum + c.valor, 0);
  const totalReceberPendente = totalReceber - totalReceberPago;
  const totalPagarPendente = totalPagar - totalPagarPago;
  const saldo = totalReceber - totalPagar;
  const totalPendente = contas.filter(c => !c.paga).reduce((sum, c) => sum + c.valor, 0);

  // Chat IA state (moved out of component for floating widget)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _chatRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Fluxo de Caixa</h2>
        <Button
          onClick={() => {
            if (!clienteSelecionado) {
              toast.error('Selecione um cliente primeiro');
              return;
            }
            resetForm();
            setShowForm(true);
          }}
          className="bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova Conta
        </Button>
      </div>

      {/* Client Selector */}
      <Card className="border-0 shadow-lg bg-card">
        <CardContent className="p-4">
          <Label className="text-muted-foreground">Cliente</Label>
          <Select value={clienteSelecionado} onValueChange={setClienteSelecionado}>
            <SelectTrigger className="bg-muted border-border text-foreground mt-1.5">
              <SelectValue placeholder="Selecione um cliente..." />
            </SelectTrigger>
            <SelectContent>
              {clientes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Filter by tipo */}
      {clienteSelecionado && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={filtroTipo === null ? 'default' : 'outline'}
            onClick={() => setFiltroTipo(null)}
            className={filtroTipo === null ? 'bg-amber-500 text-white hover:bg-amber-600' : 'border-border text-muted-foreground'}
          >
            Todas
          </Button>
          <Button
            size="sm"
            variant={filtroTipo === 1 ? 'default' : 'outline'}
            onClick={() => setFiltroTipo(1)}
            className={filtroTipo === 1 ? 'bg-green-600 text-white hover:bg-green-700' : 'border-green-500/50 text-green-400'}
          >
            A Receber
          </Button>
          <Button
            size="sm"
            variant={filtroTipo === 0 ? 'default' : 'outline'}
            onClick={() => setFiltroTipo(0)}
            className={filtroTipo === 0 ? 'bg-red-600 text-white hover:bg-red-700' : 'border-red-500/50 text-red-400'}
          >
            A Pagar
          </Button>
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <Card ref={formCardRef} className="border-0 shadow-lg bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-foreground">
              {editingConta ? 'Editar Conta' : 'Nova Conta'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Tipo Toggle */}
            <div className="space-y-2">
              <Label className="text-muted-foreground">Tipo *</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormTipo(1)}
                  className={`p-3 rounded-lg border-2 transition-all text-center ${
                    formTipo === 1
                      ? 'border-green-500 bg-green-500/10 text-green-400'
                      : 'border-border bg-muted text-muted-foreground hover:border-green-500/50'
                  }`}
                >
                  <p className="font-semibold text-sm">A Receber</p>
                  <p className="text-xs mt-0.5">Entrada de dinheiro</p>
                </button>
                <button
                  type="button"
                  onClick={() => setFormTipo(0)}
                  className={`p-3 rounded-lg border-2 transition-all text-center ${
                    formTipo === 0
                      ? 'border-red-500 bg-red-500/10 text-red-400'
                      : 'border-border bg-muted text-muted-foreground hover:border-red-500/50'
                  }`}
                >
                  <p className="font-semibold text-sm">A Pagar</p>
                  <p className="text-xs mt-0.5">Saída de dinheiro</p>
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Descrição *</Label>
              <Input
                value={formDescricao}
                onChange={(e) => setFormDescricao(e.target.value)}
                placeholder="Ex: Aluguel máquina, Manutenção, Venda..."
                className="bg-muted border-border text-foreground"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Valor (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formValor}
                  onChange={(e) => setFormValor(e.target.value)}
                  placeholder="0,00"
                  className="bg-muted border-border text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Data</Label>
                <Input
                  type="date"
                  value={formData}
                  onChange={(e) => setFormData(e.target.value)}
                  className="bg-muted border-border text-foreground"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Observações</Label>
              <Textarea
                value={formObservacoes}
                onChange={(e) => setFormObservacoes(e.target.value)}
                placeholder="Observações opcionais..."
                className="bg-muted border-border text-foreground min-h-[60px]"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700"
              >
                {saving ? 'Salvando...' : editingConta ? 'Atualizar' : 'Adicionar'}
              </Button>
              <Button variant="outline" onClick={resetForm} className="border-border text-muted-foreground">
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saldo Card */}
      {clienteSelecionado && contas.length > 0 && (
        <Card className="border-0 shadow-lg bg-gradient-to-r from-amber-500/10 to-orange-600/10">
          <CardContent className="p-4 space-y-2">
            {filtroTipo !== 0 && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-green-400">A Receber:</span>
                  <span className="font-medium text-green-400">{formatCurrency(totalReceber)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">  Recebido:</span>
                  <span className="text-sm text-muted-foreground">{formatCurrency(totalReceberPago)}</span>
                </div>
                {filtroTipo === null && <Separator className="bg-border" />}
              </>
            )}
            {filtroTipo !== 1 && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-red-400">A Pagar:</span>
                  <span className="font-medium text-red-400">{formatCurrency(totalPagar)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">  Pago:</span>
                  <span className="text-sm text-muted-foreground">{formatCurrency(totalPagarPago)}</span>
                </div>
                {filtroTipo === null && <Separator className="bg-border" />}
              </>
            )}
            {filtroTipo === null && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-foreground">Saldo:</span>
                  <span className={`font-bold text-lg ${saldo >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(saldo)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-amber-400">Total Pendente:</span>
                  <span className="font-bold text-amber-400">{formatCurrency(totalPendente)}</span>
                </div>
              </>
            )}
            {filtroTipo === 1 && (
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-green-400">Pendente a Receber:</span>
                <span className="font-bold text-green-400">{formatCurrency(totalReceberPendente)}</span>
              </div>
            )}
            {filtroTipo === 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-red-400">Pendente a Pagar:</span>
                <span className="font-bold text-red-400">{formatCurrency(totalPagarPendente)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Contas List */}
      {!clienteSelecionado ? (
        <Card className="border-0 shadow-lg bg-card">
          <CardContent className="py-8 text-center text-muted-foreground">
            <Receipt className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Selecione um cliente para ver o fluxo de caixa</p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : contas.length === 0 ? (
        <Card className="border-0 shadow-lg bg-card">
          <CardContent className="py-8 text-center text-muted-foreground">
            <Receipt className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhuma conta encontrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {contas.map((conta) => (
            <Card key={conta.id} className={`border-0 shadow-lg ${
              conta.paga ? 'bg-card opacity-70' : 'bg-card'
            }`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    conta.tipo === 0
                      ? 'bg-red-600/20'
                      : 'bg-green-600/20'
                  }`}>
                    {conta.tipo === 0 ? (
                      <TrendingDown className={`w-5 h-5 ${conta.paga ? 'text-red-400/60' : 'text-red-400'}`} />
                    ) : (
                      <TrendingUp className={`w-5 h-5 ${conta.paga ? 'text-green-400/60' : 'text-green-400'}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-bold text-foreground ${conta.paga ? 'line-through opacity-60' : ''}`}>
                        {conta.tipo === 0 ? '-' : '+'}{formatCurrency(conta.valor)}
                      </p>
                      <Badge variant="outline" className={
                        conta.tipo === 0
                          ? 'bg-red-600/20 text-red-400 border-red-500/50'
                          : 'bg-green-600/20 text-green-400 border-green-500/50'
                      }>
                        {conta.tipo === 0 ? 'A Pagar' : 'A Receber'}
                      </Badge>
                      <Badge variant={conta.paga ? 'default' : 'outline'} className={
                        conta.paga ? 'bg-blue-600 text-white' : 'text-amber-400 border-amber-500/50'
                      }>
                        {conta.paga ? 'Liquidada' : 'Pendente'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{conta.descricao}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {formatDate(conta.data)}
                      </span>
                      {conta.dataPagamento && (
                        <span className="text-green-400">Liquidada em {formatDate(conta.dataPagamento)}</span>
                      )}
                    </div>
                    {conta.observacoes && (
                      <p className="text-xs text-muted-foreground mt-1 italic">{conta.observacoes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleTogglePaga(conta)}
                      className={`p-2 rounded-lg transition-colors ${
                        conta.paga
                          ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                          : 'bg-muted text-muted-foreground hover:bg-green-600/20 hover:text-green-400'
                      }`}
                      title={conta.paga ? 'Marcar como pendente' : 'Liquidar'}
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    {(isAdmin || isSupervisor) && (
                      <>
                        <button
                          onClick={() => handleEdit(conta)}
                          className="p-2 rounded-lg bg-muted text-muted-foreground hover:bg-amber-600/20 hover:text-amber-400 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(conta.id)}
                          className="p-2 rounded-lg bg-muted text-muted-foreground hover:bg-red-600/20 hover:text-red-400 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// PWA INSTALL BANNER
// ============================================
function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Não mostrar se já instalou
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        const dismissed = localStorage.getItem('pwa-install-dismissed');
        if (!dismissed) {
          // Esperar 3 segundos para mostrar
          setTimeout(() => setShowBanner(true), 3000);
        }
      }
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  if (!showBanner) return null;

  return (
    <div className="fixed left-0 right-0 z-[100] bg-gradient-to-r from-[#1e3a5f] to-[#0f172a] border-t border-[#00d4aa]/30 px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom duration-300" style={{ bottom: 'calc(80px + env(safe-area-inset-bottom, 0px) + 16px)' }}>
      <img src="/logo-caixafacil-icon.svg" alt="CaixaFácil" className="w-10 h-10 rounded-lg flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">Instalar CaixaFácil</p>
        <p className="text-xs text-gray-300">Acesse como app no seu celular</p>
      </div>
      <button
        onClick={handleDismiss}
        className="text-gray-400 hover:text-white p-1 flex-shrink-0"
        aria-label="Fechar"
      >
        <X className="w-5 h-5" />
      </button>
      <button
        onClick={handleInstall}
        className="bg-[#00d4aa] hover:bg-[#00b894] text-[#0f172a] font-bold text-sm px-4 py-2 rounded-lg flex-shrink-0 transition-colors"
      >
        Instalar
      </button>
    </div>
  );
}

// ============================================
// MAIN APP COMPONENT
// ============================================
// v2.41.0.263
export default function App() {
  const { usuario, empresa, isAuthenticated, logout, updateEmpresa, preferencias, updatePreferencias } = useAuthStore();
  // Modo quiosque: fullscreen automático após login, re-entra se usuário sair
  // requestFullscreenOnLogin: chamar DENTRO do clique do botão login (mantém user gesture)
  const { requestFullscreenOnLogin } = useKioskMode(isAuthenticated);
  // Disponibiliza globalmente para o componente LoginPage usar
  // (LoginPage é renderizado quando !isAuthenticated, dentro do mesmo escopo App)
  useEffect(() => {
    (window as any).__caixafacil_requestFullscreenOnLogin = requestFullscreenOnLogin;
    return () => { delete (window as any).__caixafacil_requestFullscreenOnLogin; };
  }, [requestFullscreenOnLogin]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [assinaturaPlanoNome, setAssinaturaPlanoNome] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPreferencias, setShowPreferencias] = useState(false);
  const [prefsUiScale, setPrefsUiScale] = useState(1.0);
  const [prefsImpressoraPreset, setPrefsImpressoraPreset] = useState('none');
  const [prefsSalvando, setPrefsSalvando] = useState(false);
  const [prefsTargetUserId, setPrefsTargetUserId] = useState<string | null>(null);
  const [prefsTargetUserName, setPrefsTargetUserName] = useState<string>('');

  // Tabs da tab bar inferior (ordem de swipe)
  const tabOrder = ['dashboard', 'receber', 'fluxo-caixa', 'leituras', 'relatorios', 'chat-ia'];

  // Hook de swipe horizontal para navegação entre tabs
  const swipeHandlers = useSwipeNavigation({
    tabs: tabOrder,
    activeTab,
    onTabChange: setActiveTab,
    onEdgeSwipeRight: () => setMenuOpen(true),
  });

  // PWA: entrar em tela cheia automaticamente ao abrir pelo app instalado
  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone) {
      const tryFullscreen = async () => {
        try {
          if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen?.() || await (document.documentElement as any).webkitRequestFullscreen?.();
          }
        } catch {}
      };
      // Aguardar interação do usuário antes de solicitar fullscreen
      const onFirstInteraction = () => {
        tryFullscreen();
        document.removeEventListener('click', onFirstInteraction);
        document.removeEventListener('touchstart', onFirstInteraction);
      };
      document.addEventListener('click', onFirstInteraction, { once: true });
      document.addEventListener('touchstart', onFirstInteraction, { once: true });
    }
  }, []);


  // Abrir dialog de preferencias com valores atuais (para o usuario logado ou outro usuario)
  const handleOpenPreferencias = async (targetUserId?: string, targetUserName?: string) => {
    if (targetUserId) {
      // Carregar preferencias de outro usuario via API
      setPrefsTargetUserId(targetUserId);
      setPrefsTargetUserName(targetUserName || '');
      try {
        const res = await fetch(`/api/usuarios/${targetUserId}/preferencias`);
        const data = await res.json();
        setPrefsUiScale(data?.uiScale ?? 1.0);
        setPrefsImpressoraPreset(data?.impressoraPreset || 'none');
      } catch {
        setPrefsUiScale(1.0);
        setPrefsImpressoraPreset('none');
      }
    } else {
      // Preferencias do usuario logado (do Zustand store)
      setPrefsTargetUserId(null);
      setPrefsTargetUserName('');
      setPrefsUiScale(preferencias?.uiScale ?? 1.0);
      setPrefsImpressoraPreset(preferencias?.impressoraPreset || 'none');
    }
    setShowPreferencias(true);
  };

  // Salvar preferencias do usuario (logado ou outro)
  const handleSalvarPreferencias = async () => {
    const targetId = prefsTargetUserId || usuario?.id;
    if (!targetId) return;
    setPrefsSalvando(true);
    try {
      const res = await fetch(`/api/usuarios/${targetId}/preferencias`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uiScale: prefsUiScale,
          impressoraPreset: prefsImpressoraPreset,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
      // Se for o proprio usuario, atualizar store
      if (!prefsTargetUserId) {
        updatePreferencias(data);
      }
      toast.success('Preferencias salvas!');
      setShowPreferencias(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar preferencias');
    } finally {
      setPrefsSalvando(false);
    }
  };

  // Aplicar escala de UI (acessibilidade) — fontes + ícones + espaçamentos
  // Usa apenas preferencias.usuario.uiScale (sem fallback para empresa)
  useEffect(() => {
    const applyScale = (scale: number) => {
      const clamped = Math.min(2.0, Math.max(0.8, scale));
      document.documentElement.style.fontSize = `${16 * clamped}px`;
      try { localStorage.setItem('cf-ui-scale', String(clamped)); } catch {}
    };

    const userScale = preferencias?.uiScale;

    if (userScale && userScale !== 1.0) {
      applyScale(userScale);
    } else {
      // Reset para padrão
      document.documentElement.style.fontSize = '';
    }
  }, [preferencias?.uiScale]);
  const [planoFeatures, setPlanoFeatures] = useState<{ recIA: boolean; recChatIA: boolean } | null>(null);
  const [menusPermitidos, setMenusPermitidos] = useState<string[] | null>(null);

  // Carregar info do plano SaaS (features)
  useEffect(() => {
    if (isAuthenticated && empresa?.id) {
      fetch(`/api/meu-plano?empresaId=${empresa.id}`)
        .then(r => r.json())
        .then(data => {
          if (data && data.features) {
            setPlanoFeatures({ recIA: data.features.recIA, recChatIA: data.features.recChatIA });
          }
        })
        .catch(() => {}); // Falha silenciosa = nao bloqueia UI
    }
  }, [isAuthenticated, empresa?.id]);

  // Carregar permissoes do nivel de acesso do usuario (config_saas)
  useEffect(() => {
    if (!isAuthenticated || !usuario?.nivelAcesso) return;
    const nivel = usuario.nivelAcesso; // ADMINISTRADOR, SUPERVISOR ou OPERADOR
    fetch(`/api/saas-permissoes?nivel=${nivel}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && Array.isArray(data.permissoes)) {
          setMenusPermitidos(data.permissoes);
        } else {
          // Fallback: permitir tudo se nao conseguir carregar
          setMenusPermitidos(null);
        }
      })
      .catch(() => { setMenusPermitidos(null); });
  }, [isAuthenticated, usuario?.nivelAcesso]);

  // Super Admin tem acesso total ao sistema (declarado antes de hasPermissao)
  const isSuperAdmin = usuario?.email === SUPER_ADMIN_EMAIL;
  const isAdmin = isSuperAdmin || usuario?.nivelAcesso === 'ADMINISTRADOR';
  const isSupervisor = isSuperAdmin || usuario?.nivelAcesso === 'SUPERVISOR' || isAdmin;

  // Verifica se o usuario tem permissao para acessar um menu
  const hasPermissao = (menuId: string): boolean => {
    if (isSuperAdmin) return true;
    // Se menusPermitidos ainda carregando (null), permite por seguranca (nao bloqueia)
    if (menusPermitidos === null) return true;
    return menusPermitidos.includes(menuId);
  };

  // Redirecionar para dashboard se a tab atual nao for permitida
  useEffect(() => {
    if (!isAuthenticated || isSuperAdmin || menusPermitidos === null) return;
    const tabsProtegidas = ['dashboard', 'clientes', 'maquinas', 'tipos-maquina', 'leituras', 'receber', 'fluxo-caixa', 'usuarios', 'relatorios', 'assinatura', 'grua', 'backup-restore'];
    if (tabsProtegidas.includes(activeTab) && !menusPermitidos.includes(activeTab)) {
      setActiveTab('dashboard');
    }
  }, [isAuthenticated, isSuperAdmin, menusPermitidos, activeTab]);

  const loadDashboard = async () => {
    setLoadingDashboard(true);
    try {
      const res = await fetch(`/api/dashboard?empresaId=${empresa?.id}`);
      if (!res.ok) {
        console.error('Dashboard API error:', res.status);
        setDashboardData(null);
        return;
      }
      const data = await res.json();

      if (data && data.clientes && data.maquinas && data.financeiro) {
        setDashboardData(data);
      } else {
        console.error('Dashboard data missing expected fields');
        setDashboardData(null);
      }
    } catch (error) {
      console.error('Erro ao carregar dashboard');
      setDashboardData(null);
    } finally {
      setLoadingDashboard(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && empresa?.id) {
      loadDashboard();
      // Sincronizar plano do rodapé com o cadastro da empresa no backend
      (async () => {
        try {
          const token = useAuthStore.getState().token;
          const res = await fetch('/api/assinatura-saas/status', {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.assinatura?.planoSaaS?.nome) {
              setAssinaturaPlanoNome(data.assinatura.planoSaaS.nome);
            }
            if (data.empresa?.plano && empresa?.plano !== data.empresa.plano) {
              updateEmpresa({ plano: data.empresa.plano });
            }
          }
        } catch { /* silencioso */ }
      })();
    }
  }, [isAuthenticated, empresa?.id]);

  // Tabs ordenadas para a tab bar inferior (filtra por permissoes)
  const filteredTabOrder = tabOrder.filter(tab => {
    if (tab === 'chat-ia') return planoFeatures?.recChatIA || isSuperAdmin;
    return true; // tabs fixas (dashboard, fluxo-caixa, leituras, relatorios) sempre visiveis na tab bar
  });

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className={`safe-area-top ${activeTab === 'chat-ia' || activeTab === 'grua' ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'} bg-background flex flex-col`}>
      <PWAInstallBanner />
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-foreground">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="bg-background border-border w-72 flex flex-col overflow-hidden">
                <SheetHeader className="shrink-0">
                  <SheetTitle className="text-foreground">Menu</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-2 flex-1 overflow-y-auto">
                  {/* Menu items filtrados por permissoes do config_saas */}
                  {[
                    { id: 'dashboard', icon: TrendingUp, label: 'Início' },
                    { id: 'clientes', icon: Users, label: 'Clientes' },
                    { id: 'maquinas', icon: Cog, label: 'Máquinas' },
                    { id: 'tipos-maquina', icon: Settings, label: 'Tipos de Máquina' },
                    { id: 'leituras', icon: ClipboardList, label: 'Cobrança' },
                    { id: 'receber', icon: DollarSign, label: 'Receber' },
                    { id: 'fluxo-caixa', icon: Receipt, label: 'Fluxo de Caixa' },
                    { id: 'usuarios', icon: Settings, label: 'Usuários' },
                  ]
                    .filter(item => hasPermissao(item.id))
                    .map(item => (
                      <button
                        key={item.id}
                        onClick={() => { setActiveTab(item.id as any); setMenuOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === item.id ? 'bg-amber-500/20 text-amber-400' : 'text-muted-foreground hover:bg-card'}`}
                      >
                        <item.icon className="w-5 h-5" />
                        <span>{item.label}</span>
                      </button>
                    ))
                  }
                  {/* Ajuste de Leitura — somente supervisor/admin */}
                  {isSupervisor && (
                    <button
                      onClick={() => { setActiveTab('ajuste-leitura'); setMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'ajuste-leitura' ? 'bg-amber-500/20 text-amber-400' : 'text-muted-foreground hover:bg-card'}`}
                    >
                      <SlidersHorizontal className="w-5 h-5" />
                      <span>Ajuste de Leitura</span>
                    </button>
                  )}
                  <Separator className="my-2 bg-border" />
                  {[
                    { id: 'relatorios', icon: FileText, label: 'Relatórios' },
                  ]
                    .filter(item => hasPermissao(item.id))
                    .map(item => (
                      <button
                        key={item.id}
                        onClick={() => { setActiveTab(item.id as any); setMenuOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === item.id ? 'bg-amber-500/20 text-amber-400' : 'text-muted-foreground hover:bg-card'}`}
                      >
                        <item.icon className="w-5 h-5" />
                        <span>{item.label}</span>
                      </button>
                    ))
                  }
                  {!isSuperAdmin && hasPermissao('assinatura') && (
                  <button
                    onClick={() => { setActiveTab('assinatura'); setMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'assinatura' ? 'bg-amber-500/20 text-amber-400' : 'text-muted-foreground hover:bg-card'}`}
                  >
                    <CreditCard className="w-5 h-5" />
                    <span>Minha Assinatura</span>
                  </button>
                  )}
                  {hasPermissao('grua') && (
                  <button
                    onClick={() => { setActiveTab('grua'); setMenuOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'grua' ? 'bg-violet-500/20 text-violet-400' : 'text-muted-foreground hover:bg-card'}`}
                  >
                    <Gamepad2 className="w-5 h-5" />
                    <span>GRUA</span>
                  </button>
                  )}
                  {hasPermissao('backup-restore') && (
                    <>
                      <Separator className="my-2 bg-border" />
                      <button
                        onClick={() => { setActiveTab('backup-restore'); setMenuOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'backup-restore' ? 'bg-amber-500/20 text-amber-400' : 'text-muted-foreground hover:bg-card'}`}
                      >
                        <DatabaseBackup className="w-5 h-5" />
                        <span>Backup / Restaurar</span>
                      </button>
                    </>
                  )}
                  {isAdmin && !isSuperAdmin && (
                    <>
                      <Separator className="my-2 bg-border" />
                      <button
                        onClick={() => { setActiveTab('configuracoes-empresa'); setMenuOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'configuracoes-empresa' ? 'bg-amber-500/20 text-amber-400' : 'text-muted-foreground hover:bg-card'}`}
                      >
                        <Settings className="w-5 h-5" />
                        <span>Configurações</span>
                      </button>
                    </>
                  )}
                  {isSuperAdmin && (
                    <>
                      <Separator className="my-2 bg-border" />
                      <button
                        onClick={() => { setActiveTab('configuracoes'); setMenuOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'configuracoes' ? 'bg-amber-500/20 text-amber-400' : 'text-muted-foreground hover:bg-card'}`}
                      >
                        <SlidersHorizontal className="w-5 h-5" />
                        <span>CONFIG SAAS</span>
                      </button>
                    </>
                  )}
                  <Separator className="my-2 bg-border" />
                  <ThemeToggle />
                </div>
                <div className="shrink-0 pt-2 border-t border-border">
                  <div className="px-4 pb-2">
                    <div className="flex items-center gap-3">
                      <img src="/logo-caixafacil-icon.svg" alt="CaixaFácil" className="w-10 h-10 rounded-lg" />
                      <div>
                        <p className="font-medium text-foreground text-sm">{empresa?.nome}</p>
                        <p className="text-xs text-muted-foreground">Plano: {{BASICO:'Básico',PROFISSIONAL:'Profissional',PREMIUM:'Premium',ENTERPRISE:'Enterprise'}[empresa?.plano || ''] || empresa?.plano || '-'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <span className="font-extrabold text-lg tracking-tight select-none" style={{ lineHeight: '1.1' }}><span className="text-gray-400">Caixa</span><span className="text-amber-400">Fácil</span></span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleOpenPreferencias}
              className="text-right mr-1 hover:opacity-80 transition-opacity"
              title="Minhas Preferências"
            >
              <p className="text-sm font-medium text-foreground">{usuario?.nome}</p>
              <p className="text-xs text-muted-foreground">{usuario?.nivelAcesso}</p>
            </button>
            <div className="flex flex-col">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  logout();
                  // PWA: tentar fechar a janela/app com múltiplos métodos
                  setTimeout(() => {
                    try { window.close(); } catch {}
                    try { (window as any).history.back(); } catch {}
                    setTimeout(() => {
                      try { (window as any).location.replace('about:blank'); } catch {}
                    }, 300);
                  }, 300);
                }}
                className="text-muted-foreground hover:text-foreground h-8 w-8"
                title="Sair"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={`flex-1 p-4 main-content-with-tab-bar ${activeTab === 'chat-ia' ? 'min-h-0 overflow-hidden' : ''}`} {...swipeHandlers}>
        {activeTab === 'dashboard' && hasPermissao('dashboard') && (
          loadingDashboard ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : (
            <DashboardPage data={dashboardData} onNavigate={setActiveTab} />
          )
        )}
        {activeTab === 'clientes' && hasPermissao('clientes') && (
          <ClientesPage empresaId={empresa?.id || ''} isAdmin={isAdmin} isSupervisor={isSupervisor} />
        )}
        {activeTab === 'maquinas' && hasPermissao('maquinas') && (
          <MaquinasPage empresaId={empresa?.id || ''} isAdmin={isAdmin} />
        )}
        {activeTab === 'tipos-maquina' && hasPermissao('tipos-maquina') && (
          <TiposMaquinaPage empresaId={empresa?.id || ''} isAdmin={isAdmin} />
        )}
        {activeTab === 'leituras' && hasPermissao('leituras') && (
          <LeiturasPage empresaId={empresa?.id || ''} isSupervisor={isSupervisor} usuarioId={usuario?.id || ''} usuarioNome={usuario?.nome || 'OPERADOR'} />
        )}
        {activeTab === 'ajuste-leitura' && (isSupervisor || isAdmin) && (
          <LeiturasPage empresaId={empresa?.id || ''} isSupervisor={isSupervisor} usuarioId={usuario?.id || ''} usuarioNome={usuario?.nome || 'OPERADOR'} ajusteMode={true} />
        )}
        {activeTab === 'receber' && hasPermissao('receber') && (
          <ReceberPage empresaId={empresa?.id || ''} />
        )}
        {activeTab === 'pagamentos' && (
          <PagamentosPage empresaId={empresa?.id || ''} isSupervisor={isSupervisor} />
        )}
        {activeTab === 'fluxo-caixa' && hasPermissao('fluxo-caixa') && (
          <FluxoCaixaPage empresaId={empresa?.id || ''} isAdmin={isAdmin} isSupervisor={isSupervisor} />
        )}
        {activeTab === 'usuarios' && hasPermissao('usuarios') && (
          <UsuariosPage empresaId={empresa?.id || ''} isAdmin={isAdmin} onOpenPreferencias={handleOpenPreferencias} />
        )}
        {activeTab === 'relatorios' && hasPermissao('relatorios') && (
          <RelatoriosPage empresaId={empresa?.id || ''} />
        )}
        {activeTab === 'backup-restore' && hasPermissao('backup-restore') && (
          <BackupRestorePage empresaId={empresa?.id || ''} nomeEmpresa={empresa?.nome || ''} />
        )}
        {activeTab === 'configuracoes-empresa' && isAdmin && !isSuperAdmin && (
          <ConfiguracoesEmpresaPage empresaId={empresa?.id || ''} />
        )}
        {activeTab === 'configuracoes' && isSuperAdmin && (
          <ConfiguracoesPage empresaId={empresa?.id || ''} onShowGestao={() => setActiveTab('gestao-empresas')} />
        )}
        {activeTab === 'gestao-empresas' && isSuperAdmin && (
          <GestaoEmpresasPage adminEmail={usuario.email} />
        )}
        {activeTab === 'chat-ia' && (
          <ChatIAPage />
        )}
        {activeTab === 'assinatura' && !isSuperAdmin && hasPermissao('assinatura') && (
          <AssinaturaTab />
        )}
        {activeTab === 'grua' && hasPermissao('grua') && (
          <GruaDashboard empresaId={empresa?.id || ''} isAdmin={isAdmin} />
        )}
      </main>

      {/* Floating Tab Bar — oculta na tela de cobrança/leitura */}
      {activeTab !== 'leituras' && (
      <nav className="floating-tab-bar">
        <div className="floating-tab-bar-inner">
          {/* Dot indicator animado */}
          <div className="tab-dot-indicator">
            <div
              className="tab-dot"
              style={{ transform: `translateX(${tabOrder.indexOf(activeTab) * 100}%)` }}
            />
          </div>
          <div className="flex justify-around items-center">
            {[
              { id: 'dashboard', icon: TrendingUp, label: 'Início' },
              { id: 'receber', icon: DollarSign, label: 'Receber' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); if (navigator.vibrate) navigator.vibrate(10); }}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200 ${
                  activeTab === item.id ? 'text-amber-400 tab-item-active' : 'text-muted-foreground'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            ))}

            {/* Botão Central — Câmera OCR */}
            <button
              onClick={() => { setActiveTab('leituras'); if (navigator.vibrate) navigator.vibrate(15); }}
              className="tab-center-button"
              title="Cobrança (OCR)"
            >
              <Camera className="w-6 h-6" />
            </button>

            {[
              { id: 'relatorios', icon: FileText, label: 'Relatórios' },
              ...(planoFeatures?.recChatIA || isSuperAdmin ? [{ id: 'chat-ia' as const, icon: MessageCircle, label: 'IA' }] : []),
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); if (navigator.vibrate) navigator.vibrate(10); }}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200 ${
                  activeTab === item.id ? 'text-amber-400 tab-item-active' : 'text-muted-foreground'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            ))}
            {/* Botão Sair — exibido quando Chat IA não está disponível */}
            {!(planoFeatures?.recChatIA || isSuperAdmin) && (
              <button
                onClick={() => {
                  logout();
                  setTimeout(() => {
                    try { window.close(); } catch {}
                    try { (window as any).history.back(); } catch {}
                    setTimeout(() => {
                      try { (window as any).location.replace('about:blank'); } catch {}
                    }, 300);
                  }, 300);
                }}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200 text-muted-foreground hover:text-red-400"
                title="Sair"
              >
                <LogOut className="w-5 h-5" />
                <span className="text-[10px] font-medium">Sair</span>
              </button>
            )}
          </div>
        </div>
      </nav>
      )}
      
      {/* Dialog - Minhas Preferencias */}
      <Dialog open={showPreferencias} onOpenChange={setShowPreferencias}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-amber-500" />
              {prefsTargetUserId ? 'Preferências do Usuário' : 'Meu Perfil'}
            </DialogTitle>
            <DialogDescription>
              {prefsTargetUserId ? prefsTargetUserName : <>{usuario?.nome} &middot; {usuario?.email}</>}
              {!prefsTargetUserId && usuario?.nivelAcesso && <span className="block text-xs mt-1 opacity-70">Nível: {usuario?.nivelAcesso}</span>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Escala Visual */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Maximize2 className="w-4 h-4 text-amber-500" />
                Escala Padrão do Usuário
              </h3>
              <p className="text-xs text-muted-foreground">
                Ajuste o tamanho proporcional de fontes e ícones. Útil para usuários com dificuldade visual.
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tamanho</span>
                <span className="text-sm font-bold text-foreground tabular-nums">
                  {Math.round(prefsUiScale * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.8"
                max="1.5"
                step="0.05"
                value={prefsUiScale}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setPrefsUiScale(val);
                  document.documentElement.style.fontSize = `${16 * val}px`;
                }}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>80%</span>
                <span className="text-amber-500 font-medium">Padrão: 100%</span>
                <span>150%</span>
              </div>
              {/* Preview */}
              <div className="rounded-lg border border-border p-3 space-y-1">
                <p className="text-[10px] text-muted-foreground">Pré-visualização:</p>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-500" />
                  <span className="font-semibold text-foreground text-sm">Exemplo de texto</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Texto normal para verificar a legibilidade.
                </p>
              </div>
            </div>

            <Separator />

            {/* Impressora */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Printer className="w-4 h-4 text-amber-500" />
                Impressora Térmica
              </h3>
              <p className="text-xs text-muted-foreground">
                Configure a impressora Bluetooth para este dispositivo.
              </p>
              <div className="space-y-2">
                <Label className="text-xs">Modelo da Impressora</Label>
                <Select value={prefsImpressoraPreset} onValueChange={setPrefsImpressoraPreset}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma (usar impressão do navegador)</SelectItem>
                    <SelectItem value="goojprt-58mm">Goojprt 58mm</SelectItem>
                    <SelectItem value="goojprt-80mm">Goojprt 80mm</SelectItem>
                    <SelectItem value="mtp-ii">MTP-II</SelectItem>
                    <SelectItem value="generic-bt">Genérica Bluetooth</SelectItem>
                    <SelectItem value="sunmi-inner">Sunmi InnerPrinter</SelectItem>
                    <SelectItem value="moderninha-a930">Moderninha A930</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {prefsImpressoraPreset !== 'none' && (
                <p className="text-xs text-muted-foreground">
                  A conexão com a impressora é feita ao gerar um cupom. Certifique-se de que a impressora está ligada e pareada.
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowPreferencias(false)}
              disabled={prefsSalvando}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSalvarPreferencias}
              disabled={prefsSalvando}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {prefsSalvando ? 'Salvando...' : 'Salvar Preferências'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
