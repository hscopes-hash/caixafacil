'use client';

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { toast } from 'sonner';
import {
  Gamepad2, MapPin, Wifi, WifiOff, Settings, Plus, Trash2, Pencil,
  RotateCcw, DollarSign, Zap, Battery, Thermometer, Signal,
  ChevronUp, ChevronDown, X, Save, RefreshCw, AlertCircle, History,
  Shield, ShieldAlert, TrendingUp, Coins, CreditCard
} from 'lucide-react';

// ============== TYPES ==============
interface Grua {
  id: string;
  nome: string;
  empresaId: string;
  clienteId?: string | null;
  cliente?: { id: string; nome: string } | null;
  ativa: boolean;
  dispositivoId?: string | null;
  relayIp?: string | null;
  relayPort: number;
  mpAccessToken?: string | null;
  mpPublicKey?: string | null;
  endereco?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  contadorParcial: number;
  contadorTotal: number;
  ultimoResetAt?: string | null;
  valorPulso?: number;
  ultimaTelemetria?: string | null;
  createdAt: string;
  updatedAt: string;
  // computed
  status?: 'ONLINE' | 'OFFLINE';
  faturamentoParcial?: number;
  faturamentoTotal?: number;
  vendasHoje?: number;
  pulsosHoje?: number;
  valorHoje?: number;
  // auditoria
  faturamentoDigital?: number;
  faturamentoFisico?: number;
  pulsosCedulas?: number;
  statusCofre?: string;
  contadorHardwareAtual?: number;
  contadorPixAcumulado?: number;
  marcoZeroHardware?: number;
  marcoZeroPix?: number;
}

interface TelemetryData {
  id: string;
  gruaId: string;
  bateria?: number | null;
  sinal4g?: number | null;
  sinalWifi?: number | null;
  temperatura?: number | null;
  memoriaLivre?: number | null;
  versaoApp?: string | null;
  relayOnline?: boolean | null;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  createdAt: string;
}

interface VendaGrua {
  id: string;
  valor: number;
  pulsos: number;
  mpStatus?: string | null;
  relayOk: boolean;
  createdAt: string;
}

interface GruaFormData {
  nome: string;
  clienteId: string;
  relayIp: string;
  relayPort: number;
  mpAccessToken: string;
  mpPublicKey: string;
  endereco: string;
  latitude: string;
  longitude: string;
  valorPulso: string;
}

const EMPTY_FORM: GruaFormData = {
  nome: '',
  clienteId: '',
  relayIp: '',
  relayPort: 80,
  mpAccessToken: '',
  mpPublicKey: '',
  endereco: '',
  latitude: '',
  longitude: '',
  valorPulso: '2.00',
};

export default function GruaDashboard({ empresaId, isAdmin }: { empresaId: string; isAdmin: boolean }) {
  const [gruas, setGruas] = useState<Grua[]>([]);
  const [telemetryMap, setTelemetryMap] = useState<Record<string, TelemetryData>>({});
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGrua, setSelectedGrua] = useState<Grua | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingGrua, setEditingGrua] = useState<Grua | null>(null);
  const [formData, setFormData] = useState<GruaFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [vendas, setVendas] = useState<VendaGrua[]>([]);
  const [loadingVendas, setLoadingVendas] = useState(false);
  const [showVendas, setShowVendas] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Load clientes for dropdown
  useEffect(() => {
    fetch(`/api/clientes?empresaId=${empresaId}`)
      .then(r => r.json())
      .then(data => setClientes(Array.isArray(data) ? data : data.clientes || []))
      .catch(() => {});
  }, [empresaId]);

  // Load gruas
  const loadGruas = useCallback(async () => {
    try {
      const res = await fetch(`/api/gruas?empresaId=${empresaId}`);
      if (!res.ok) throw new Error('Erro ao carregar');
      const data = await res.json();
      setGruas(data.gruas || []);
      setTelemetryMap(data.telemetry || {});
    } catch (err) {
      console.error('[GRUA] Erro ao carregar gruas:', err);
      toast.error('Erro ao carregar gruas');
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => { loadGruas(); }, [loadGruas, refreshKey]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      loadGruas();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadGruas]);

  // Load vendas when grua selected
  const loadVendas = async (gruaId: string) => {
    setLoadingVendas(true);
    setShowVendas(true);
    try {
      const res = await fetch(`/api/gruas/${gruaId}/vendas?limit=30`);
      if (res.ok) {
        const data = await res.json();
        setVendas(data.vendas || []);
      }
    } catch (e) {
      console.error('[GRUA] Erro ao carregar vendas:', e);
    } finally {
      setLoadingVendas(false);
    }
  };

  // Stats
  const totalGruas = gruas.length;
  const onlineGruas = gruas.filter(g => g.status === 'ONLINE').length;
  const offlineGruas = gruas.filter(g => g.status === 'OFFLINE').length;
  const totalFaturamento = gruas.reduce((sum, g) => sum + ((g.faturamentoDigital || 0) + (g.faturamentoFisico || 0)), 0);

  // Save grua
  const handleSave = async () => {
    if (!formData.nome.trim()) {
      toast.error('Nome obrigatorio');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        empresaId,
        nome: formData.nome,
        clienteId: formData.clienteId || null,
        relayIp: formData.relayIp || null,
        relayPort: formData.relayPort || 80,
        mpAccessToken: formData.mpAccessToken || null,
        mpPublicKey: formData.mpPublicKey || null,
        endereco: formData.endereco || null,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        valorPulso: formData.valorPulso ? parseFloat(formData.valorPulso) : 2.00,
      };

      if (editingGrua) {
        const res = await fetch(`/api/gruas/${editingGrua.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Erro ao atualizar');
        toast.success('Grua atualizada!');
      } else {
        const res = await fetch('/api/gruas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Erro ao criar');
        toast.success('Grua criada!');
      }
      setShowForm(false);
      setEditingGrua(null);
      setFormData(EMPTY_FORM);
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  // Delete grua
  const handleDelete = async (grua: Grua) => {
    if (!confirm(`Excluir grua "${grua.nome}"?`)) return;
    try {
      await fetch(`/api/gruas/${grua.id}`, { method: 'DELETE' });
      toast.success('Grua excluida');
      setRefreshKey(k => k + 1);
      if (selectedGrua?.id === grua.id) setSelectedGrua(null);
    } catch {
      toast.error('Erro ao excluir');
    }
  };

  // Reset counter
  const handleReset = async (grua: Grua) => {
    const valorPulso = grua.valorPulso || 2.00;
    const fatDigital = grua.faturamentoDigital || 0;
    const fatFisico = grua.faturamentoFisico || 0;
    const fatTotal = fatDigital + fatFisico;
    if (!confirm(
      `Zerar acerto de "${grua.nome}"?\n\n` +
      `Digital (PIX): R$ ${fatDigital.toFixed(2)} (${grua.contadorParcial} pulsos)\n` +
      `Fisico (Cedulas): R$ ${fatFisico.toFixed(2)} (${grua.pulsosCedulas || 0} pulsos)\n` +
      `Total: R$ ${fatTotal.toFixed(2)}\n\n` +
      `Os contadores de hardware (Counter1) serao capturados como novos marcos zero.\n` +
      `O hardware NAO sera resetado.`
    )) return;
    try {
      const res = await fetch(`/api/gruas/${grua.id}/reset`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(data.mensagem);
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao resetar');
    }
  };

  // Open edit form
  const openEdit = (grua: Grua) => {
    setEditingGrua(grua);
    setFormData({
      nome: grua.nome,
      clienteId: grua.clienteId || '',
      relayIp: grua.relayIp || '',
      relayPort: grua.relayPort || 80,
      mpAccessToken: grua.mpAccessToken || '',
      mpPublicKey: grua.mpPublicKey || '',
      endereco: grua.endereco || '',
      latitude: grua.latitude?.toString() || '',
      longitude: grua.longitude?.toString() || '',
      valorPulso: (grua.valorPulso || 2.00).toString(),
    });
    setShowForm(true);
  };

  const formatDate = (d: string | null | undefined) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const formatCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // ============== MAP COMPONENT ==============
  const GruaMap = () => {
    const gruasWithCoords = gruas.filter(g => g.latitude && g.longitude);
    const center = gruasWithCoords.length > 0
      ? { lat: gruasWithCoords[0].latitude!, lng: gruasWithCoords[0].longitude! }
      : { lat: -23.5505, lng: -46.6333 }; // Default: Sao Paulo

    return (
      <div className="relative w-full h-full bg-black/40 rounded-3xl overflow-hidden border border-white/10">
        {gruasWithCoords.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma grua com coordenadas</p>
              <p className="text-xs mt-1 opacity-60">Configure latitude/longitude nas gruas</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
                  <MapPin className="w-8 h-8 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-black animate-pulse" />
              </div>
              <div>
                <p className="text-foreground font-semibold">{gruasWithCoords.length} grua(s) no mapa</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Centro: {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 max-w-xs mx-auto">
                {gruasWithCoords.slice(0, 4).map(g => (
                  <div key={g.id} className={`px-3 py-2 rounded-xl border backdrop-blur-md ${
                    g.status === 'ONLINE'
                      ? 'bg-green-500/10 border-green-500/30'
                      : 'bg-red-500/10 border-red-500/30'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${g.status === 'ONLINE' ? 'bg-green-400' : 'bg-red-400'}`} />
                      <span className="text-xs text-foreground font-medium truncate">{g.nome}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground ml-3.5">
                      {formatCurrency(g.faturamentoParcial || 0)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/50">
                Google Maps sera integrado com a API Key
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============== GRUA CARD ==============
  const GruaCard = ({ grua }: { grua: Grua }) => {
    const telemetry = telemetryMap[grua.id];
    const isOnline = grua.status === 'ONLINE';
    const valorPulso = grua.valorPulso || 2.00;

    return (
      <div
        onClick={() => { setSelectedGrua(grua); setShowVendas(false); if (isMobile) setBottomSheetOpen(true); }}
        className={`p-4 rounded-3xl border cursor-pointer transition-all duration-300 ${
          selectedGrua?.id === grua.id
            ? 'bg-violet-500/10 border-violet-500/40 shadow-lg shadow-violet-500/10'
            : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
        } backdrop-blur-md`}
      >
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
            isOnline
              ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/30'
              : 'bg-gradient-to-br from-red-500/80 to-orange-600/80 shadow-lg shadow-red-500/20'
          }`}>
            <Gamepad2 className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground truncate">{grua.nome}</h3>
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isOnline ? 'bg-green-400 shadow-sm shadow-green-400/50' : 'bg-red-400'}`} />
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isOnline ? (
                <Wifi className="w-3 h-3 text-green-400" />
              ) : (
                <WifiOff className="w-3 h-3 text-red-400" />
              )}
              <span className={`text-[11px] ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
                {isOnline ? 'Online' : 'Offline'}
              </span>
              {telemetry?.bateria !== undefined && telemetry.bateria !== null && (
                <span className="text-[10px] text-muted-foreground ml-1">
                  <Battery className="w-3 h-3 inline mr-0.5" />
                  {telemetry.bateria}%
                </span>
              )}
            </div>
            {grua.cliente && (
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{grua.cliente.nome}</p>
            )}
          </div>
          {/* Revenue with audit */}
          <div className="text-right shrink-0">
            <p className="text-base font-bold text-foreground">{formatCurrency((grua.faturamentoDigital || 0) + (grua.faturamentoFisico || 0))}</p>
            <div className="flex items-center gap-1 justify-end">
              <CreditCard className="w-2.5 h-2.5 text-violet-400" />
              <span className="text-[10px] text-violet-400">PIX {formatCurrency(grua.faturamentoDigital || 0)}</span>
            </div>
            {(grua.pulsosCedulas || 0) > 0 && (
              <div className="flex items-center gap-1 justify-end">
                <Coins className="w-2.5 h-2.5 text-amber-400" />
                <span className="text-[10px] text-amber-400">Ced {formatCurrency(grua.faturamentoFisico || 0)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
          <div className="text-[10px] text-muted-foreground">
            {grua.ultimoResetAt ? `Desde ${formatDate(grua.ultimoResetAt)}` : 'Sem reset'}
          </div>
          <div className="flex items-center gap-1">
            {grua.endereco && (
              <MapPin className="w-3 h-3 text-muted-foreground" />
            )}
            <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
              {grua.endereco || grua.relayIp || '-'}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // ============== DETAIL PANEL ==============
  const GruaDetail = ({ grua }: { grua: Grua }) => {
    const telemetry = telemetryMap[grua.id];
    const isOnline = grua.status === 'ONLINE';
    const valorPulso = grua.valorPulso || 2.00;

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
            isOnline ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-red-500/80 to-orange-600/80'
          }`}>
            <Gamepad2 className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-foreground">{grua.nome}</h2>
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'}`} />
              <span className={`text-xs ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
                {isOnline ? 'Online' : `Offline - Ultimo sinal: ${formatDate(grua.ultimaTelemetria)}`}
              </span>
            </div>
            {grua.cliente && (
              <p className="text-xs text-muted-foreground mt-0.5">Cliente: {grua.cliente.nome}</p>
            )}
          </div>
        </div>

        {/* Today Stats */}
        {(grua.vendasHoje !== undefined && grua.vendasHoje > 0) && (
          <div className="p-4 rounded-3xl bg-blue-500/10 border border-blue-500/20 backdrop-blur-md">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-blue-400 font-medium">Hoje</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-lg font-bold text-foreground">{formatCurrency(grua.valorHoje || 0)}</p>
                <p className="text-[10px] text-muted-foreground">PIX hoje</p>
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">{grua.pulsosHoje || 0}</p>
                <p className="text-[10px] text-muted-foreground">Pulsos hoje</p>
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">{grua.vendasHoje || 0}</p>
                <p className="text-[10px] text-muted-foreground">Transacoes</p>
              </div>
            </div>
          </div>
        )}

        {/* Auditoria e Conciliacao - Painel Principal */}
        <div className="p-4 rounded-3xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 border border-violet-500/20 backdrop-blur-md">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-violet-400" />
              <span className="text-xs text-violet-400 font-semibold uppercase tracking-wider">Auditoria</span>
            </div>
            <div className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold ${
              grua.statusCofre === 'ALERTA_FRAUDE'
                ? 'bg-red-500/20 text-red-400'
                : grua.statusCofre === 'DIVERGENTE'
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-green-500/20 text-green-400'
            }`}>
              {grua.statusCofre || 'SEM_DADOS'}
            </div>
          </div>

          {/* Faturamento Total */}
          <p className="text-3xl font-bold text-foreground">{formatCurrency((grua.faturamentoDigital || 0) + (grua.faturamentoFisico || 0))}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {grua.ultimoResetAt ? `Desde ${formatDate(grua.ultimoResetAt)}` : 'Sem reset'}
          </p>

          {/* Breakdown */}
          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-white/10">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <CreditCard className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-[11px] text-muted-foreground">Digital (PIX)</span>
              </div>
              <p className="text-lg font-bold text-foreground">{formatCurrency(grua.faturamentoDigital || 0)}</p>
              <p className="text-[10px] text-muted-foreground">{grua.contadorParcial} pulsos</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px] text-muted-foreground">Fisico (Cedulas)</span>
              </div>
              <p className="text-lg font-bold text-foreground">{formatCurrency(grua.faturamentoFisico || 0)}</p>
              <p className="text-[10px] text-muted-foreground">{grua.pulsosCedulas || 0} pulsos</p>
            </div>
          </div>

          {/* Contadores Hardware (T) vs Software (P) */}
          <div className="mt-3 pt-3 border-t border-white/10">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">T (Hardware): <span className="text-foreground font-mono">{grua.contadorHardwareAtual || 0}</span></span>
              <span className="text-muted-foreground">P (PIX): <span className="text-foreground font-mono">{grua.contadorPixAcumulado || 0}</span></span>
            </div>
            <div className="flex items-center justify-between text-[10px] mt-1">
              <span className="text-muted-foreground">T zero: <span className="text-foreground font-mono">{grua.marcoZeroHardware || 0}</span></span>
              <span className="text-muted-foreground">P zero: <span className="text-foreground font-mono">{grua.marcoZeroPix || 0}</span></span>
            </div>
          </div>
        </div>

        {/* Alerta de Fraude */}
        {grua.statusCofre === 'ALERTA_FRAUDE' && (
          <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <span className="text-xs text-red-400 font-semibold">Alerta de Seguranca</span>
            </div>
            <p className="text-[11px] text-red-300/80 mt-1">
              Divergencia detectada entre contadores. Possivel inducao de pulso externo.
            </p>
          </div>
        )}

        {/* Total Card */}
        <div className="p-4 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Total Acumulado</span>
          </div>
          <p className="text-xl font-bold text-foreground">{formatCurrency(grua.contadorTotal * valorPulso)}</p>
          <p className="text-xs text-muted-foreground mt-1">{grua.contadorTotal} pulsos totais</p>
        </div>

        {/* Telemetry */}
        {telemetry && (
          <div className="p-4 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md">
            <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Telemetria</p>
            <div className="grid grid-cols-2 gap-3">
              {telemetry.bateria !== null && telemetry.bateria !== undefined && (
                <div className="flex items-center gap-2">
                  <Battery className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-foreground">{telemetry.bateria}%</span>
                </div>
              )}
              {telemetry.temperatura !== null && telemetry.temperatura !== undefined && (
                <div className="flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-red-400" />
                  <span className="text-sm text-foreground">{telemetry.temperatura}°C</span>
                </div>
              )}
              {telemetry.sinal4g !== null && telemetry.sinal4g !== undefined && (
                <div className="flex items-center gap-2">
                  <Signal className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-foreground">4G: {telemetry.sinal4g}%</span>
                </div>
              )}
              {telemetry.sinalWifi !== null && telemetry.sinalWifi !== undefined && (
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-purple-400" />
                  <span className="text-sm text-foreground">Wi-Fi: {telemetry.sinalWifi}%</span>
                </div>
              )}
              {telemetry.versaoApp && (
                <div className="flex items-center gap-2 col-span-2">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">App v{telemetry.versaoApp}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Vend History */}
        <div className="p-4 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md">
          <button
            onClick={() => showVendas ? setShowVendas(false) : loadVendas(grua.id)}
            className="flex items-center gap-2 w-full text-left"
          >
            <History className="w-4 h-4 text-violet-400" />
            <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">Historico PIX</span>
            <ChevronDown className={`w-4 h-4 text-violet-400 ml-auto transition-transform ${showVendas ? 'rotate-180' : ''}`} />
          </button>

          {showVendas && (
            <div className="mt-3 space-y-1.5 max-h-[200px] overflow-y-auto">
              {loadingVendas ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-violet-500" />
                </div>
              ) : vendas.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhuma venda registrada</p>
              ) : (
                vendas.map(v => (
                  <div key={v.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${v.mpStatus === 'approved' ? 'bg-green-400' : v.mpStatus === 'pending' ? 'bg-amber-400' : 'bg-red-400'}`} />
                      <span className="text-xs text-foreground font-medium">{formatCurrency(v.valor)}</span>
                      <span className="text-[10px] text-muted-foreground">{v.pulsos} pulso{(v.pulsos || 0) > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {v.relayOk && <Zap className="w-3 h-3 text-emerald-400" />}
                      <span className="text-[10px] text-muted-foreground">{formatDate(v.createdAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={() => handleReset(grua)} className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:from-amber-600 hover:to-orange-700 transition-all shadow-lg shadow-amber-500/20">
              <RotateCcw className="w-4 h-4" /> Zerar Acerto
            </button>
            <button onClick={() => openEdit(grua)} className="flex-1 py-3 rounded-2xl bg-white/10 border border-white/20 text-foreground text-sm font-semibold flex items-center justify-center gap-2 hover:bg-white/15 transition-all">
              <Pencil className="w-4 h-4" /> Editar
            </button>
            <button onClick={() => handleDelete(grua)} className="py-3 px-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-all">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  // ============== FORM MODAL ==============
  const GruaFormModal = () => {
    if (!showForm) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => { setShowForm(false); setEditingGrua(null); setFormData(EMPTY_FORM); }}>
        <div className="w-full max-w-md bg-card/95 border border-border rounded-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto backdrop-blur-xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-foreground">
              {editingGrua ? 'Editar Grua' : 'Nova Grua'}
            </h2>
            <button onClick={() => { setShowForm(false); setEditingGrua(null); setFormData(EMPTY_FORM); }} className="p-2 rounded-xl hover:bg-white/10 text-muted-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Nome *</label>
              <input className="w-full h-11 bg-white/5 border border-white/10 rounded-2xl px-4 text-sm text-foreground focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30" value={formData.nome} onChange={e => setFormData({ ...formData, nome: e.target.value })} placeholder="GRUA-01 Shopping Center" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Cliente (proprietario)</label>
              <select
                className="w-full h-11 bg-white/5 border border-white/10 rounded-2xl px-4 text-sm text-foreground focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30"
                value={formData.clienteId}
                onChange={e => setFormData({ ...formData, clienteId: e.target.value })}
              >
                <option value="" className="bg-card">Nenhum</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id} className="bg-card">{c.nome}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Valor por Pulso (R$)</label>
              <input className="w-full h-11 bg-white/5 border border-white/10 rounded-2xl px-4 text-sm text-foreground font-mono focus:outline-none focus:border-violet-500/50" type="number" step="0.01" min="0.01" value={formData.valorPulso} onChange={e => setFormData({ ...formData, valorPulso: e.target.value })} placeholder="2.00" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Relay IP</label>
                <input className="w-full h-11 bg-white/5 border border-white/10 rounded-2xl px-4 text-sm text-foreground font-mono focus:outline-none focus:border-violet-500/50" value={formData.relayIp} onChange={e => setFormData({ ...formData, relayIp: e.target.value })} placeholder="192.168.1.100" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Relay Porta</label>
                <input className="w-full h-11 bg-white/5 border border-white/10 rounded-2xl px-4 text-sm text-foreground font-mono focus:outline-none focus:border-violet-500/50" type="number" value={formData.relayPort} onChange={e => setFormData({ ...formData, relayPort: parseInt(e.target.value) || 80 })} />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">MP Access Token</label>
              <input className="w-full h-11 bg-white/5 border border-white/10 rounded-2xl px-4 text-sm text-foreground font-mono focus:outline-none focus:border-violet-500/50" type="password" value={formData.mpAccessToken} onChange={e => setFormData({ ...formData, mpAccessToken: e.target.value })} placeholder="APP_USR-xxxxx" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">MP Public Key</label>
              <input className="w-full h-11 bg-white/5 border border-white/10 rounded-2xl px-4 text-sm text-foreground font-mono focus:outline-none focus:border-violet-500/50" type="text" value={formData.mpPublicKey} onChange={e => setFormData({ ...formData, mpPublicKey: e.target.value })} placeholder="APP_USR-xxxxx" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Endereco</label>
              <input className="w-full h-11 bg-white/5 border border-white/10 rounded-2xl px-4 text-sm text-foreground focus:outline-none focus:border-violet-500/50" value={formData.endereco} onChange={e => setFormData({ ...formData, endereco: e.target.value })} placeholder="Shopping Center - Piso 1" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Latitude</label>
                <input className="w-full h-11 bg-white/5 border border-white/10 rounded-2xl px-4 text-sm text-foreground font-mono focus:outline-none focus:border-violet-500/50" value={formData.latitude} onChange={e => setFormData({ ...formData, latitude: e.target.value })} placeholder="-23.5505" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Longitude</label>
                <input className="w-full h-11 bg-white/5 border border-white/10 rounded-2xl px-4 text-sm text-foreground font-mono focus:outline-none focus:border-violet-500/50" value={formData.longitude} onChange={e => setFormData({ ...formData, longitude: e.target.value })} placeholder="-46.6333" />
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={() => { setShowForm(false); setEditingGrua(null); setFormData(EMPTY_FORM); }} className="flex-1 h-12 rounded-2xl border border-white/10 text-muted-foreground font-semibold hover:bg-white/5 transition-all">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving} className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold flex items-center justify-center gap-2 hover:from-violet-600 hover:to-purple-700 transition-all shadow-lg shadow-violet-500/30 disabled:opacity-50">
              {saving ? (
                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" /> Salvando...</>
              ) : (
                <><Save className="w-4 h-4" /> {editingGrua ? 'Atualizar' : 'Criar'}</>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ============== MAIN RENDER ==============
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-500" />
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Stats Bar */}
      <div className="sticky top-0 z-40 px-4 py-3 backdrop-blur-xl bg-background/80 border-b border-border/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <Gamepad2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">GRUA</h1>
              <p className="text-[11px] text-muted-foreground">Monitoramento de gruas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setRefreshKey(k => k + 1); toast.info('Atualizando...'); }} className="p-2.5 rounded-xl hover:bg-white/10 text-muted-foreground transition-all">
              <RefreshCw className="w-4 h-4" />
            </button>
            {isAdmin && (
              <button onClick={() => { setEditingGrua(null); setFormData(EMPTY_FORM); setShowForm(true); }} className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold flex items-center gap-1.5 hover:from-violet-600 hover:to-purple-700 transition-all shadow-lg shadow-violet-500/30">
                <Plus className="w-4 h-4" /> Nova
              </button>
            )}
          </div>
        </div>

        {/* Summary Badges */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-1.5 shrink-0">
            <Gamepad2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{totalGruas} total</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-1.5 shrink-0">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-xs text-green-400">{onlineGruas} online</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-1.5 shrink-0">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-xs text-red-400">{offlineGruas} offline</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-1.5 shrink-0">
            <DollarSign className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs text-amber-400 font-semibold">{formatCurrency(totalFaturamento)}</span>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className={`relative ${isMobile ? 'flex flex-col' : 'grid grid-cols-[400px_1fr] gap-0'} min-h-[calc(100dvh-140px)]`}>
        {/* Left Panel / Bottom Sheet */}
        {isMobile ? (
          <>
            {/* Mobile: Map Full Screen */}
            <div className="flex-1 min-h-[50vh]">
              {GruaMap()}
            </div>
            {/* Mobile: Draggable Bottom Sheet */}
            <div className={`fixed bottom-0 left-0 right-0 z-30 transition-transform duration-300 ${bottomSheetOpen ? 'translate-y-0' : 'translate-y-[calc(100%-80px)]'} backdrop-blur-xl bg-card/95 border-t border-white/10 rounded-t-3xl shadow-2xl max-h-[60vh]`}>
              {/* Drag Handle */}
              <button onClick={() => setBottomSheetOpen(!bottomSheetOpen)} className="w-full flex justify-center pt-3 pb-2">
                <div className={`w-10 h-1 rounded-full bg-white/30 transition-all ${bottomSheetOpen ? 'rotate-0' : ''}`}>
                  <ChevronDown className={`w-4 h-4 mx-auto text-muted-foreground transition-transform ${bottomSheetOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>
              <div className="px-4 pb-4 overflow-y-auto max-h-[55vh] space-y-2">
                {gruas.map(grua => <Fragment key={grua.id}>{GruaCard({ grua })}</Fragment>)}
              </div>
            </div>
            {/* Tap overlay to close */}
            {bottomSheetOpen && <div className="fixed inset-0 z-20" onClick={() => setBottomSheetOpen(false)} />}
          </>
        ) : (
          <>
            {/* Desktop: List Left */}
            <div className="h-full overflow-y-auto p-4 space-y-2 border-r border-border/50 bg-background/50">
              {gruas.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Gamepad2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Nenhuma grua cadastrada</p>
                  {isAdmin && (
                    <button onClick={() => { setEditingGrua(null); setFormData(EMPTY_FORM); setShowForm(true); }} className="mt-3 text-xs text-violet-400 hover:text-violet-300">
                      + Adicionar primeira grua
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {gruas.map(grua => <Fragment key={grua.id}>{GruaCard({ grua })}</Fragment>)}
                </>
              )}
            </div>
            {/* Desktop: Map + Detail Right */}
            <div className="h-full flex flex-col">
              <div className="flex-1 p-4 pb-0">
                {GruaMap()}
              </div>
              {/* Detail Panel */}
              {selectedGrua && (
                <div className="p-4 overflow-y-auto max-h-[50vh] border-t border-border/50">
                  {GruaDetail({ grua: selectedGrua })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Form Modal */}
      {GruaFormModal()}
    </div>
  );
}
