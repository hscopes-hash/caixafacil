'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  FileText, Download, Printer, Share2, Clock, TrendingUp, TrendingDown,
  DollarSign, Users, Cog, BarChart3, ChevronDown, ChevronUp,
  Filter, Eye, Send, FileDown, Receipt, ArrowUpRight, ArrowDownRight,
  Wallet, AlertCircle, CheckCircle, XCircle, Loader2, Calendar,
} from 'lucide-react';
import {
  connectPrinter, disconnectPrinter, isBluetoothAvailable, isPrinterConnected,
  getConnectedDeviceName, getActiveConfig, printReceipt, fallbackPrint,
  generateReceiptText, type PrinterConfig, PRINTER_PRESETS,
} from '@/lib/printer-bluetooth';

// ============================================
// TYPES
// ============================================
type TipoRelatorio =
  | 'movimentacao'
  | 'pagamentos'
  | 'clientes'
  | 'maquinas'
  | 'contas'
  | 'fluxo-caixa';

interface RelatorioConfig {
  id: TipoRelatorio;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  precisaPeriodo: boolean;
  precisaCliente: boolean;
  precisaStatus: boolean;
  precisaTipoMaquina: boolean;
}

const RELATORIOS_CONFIG: RelatorioConfig[] = [
  {
    id: 'movimentacao',
    label: 'Movimentação',
    description: 'Extrato de leituras e cobranças',
    icon: BarChart3,
    color: 'from-blue-500 to-indigo-600',
    precisaPeriodo: true,
    precisaCliente: true,
    precisaStatus: false,
    precisaTipoMaquina: true,
  },
  {
    id: 'pagamentos',
    label: 'Pagamentos',
    description: 'Histórico de pagamentos',
    icon: DollarSign,
    color: 'from-green-500 to-emerald-600',
    precisaPeriodo: true,
    precisaCliente: true,
    precisaStatus: true,
    precisaTipoMaquina: false,
  },
  {
    id: 'clientes',
    label: 'Clientes',
    description: 'Cadastro de clientes',
    icon: Users,
    color: 'from-purple-500 to-violet-600',
    precisaPeriodo: false,
    precisaCliente: false,
    precisaStatus: true,
    precisaTipoMaquina: false,
  },
  {
    id: 'maquinas',
    label: 'Máquinas',
    description: 'Inventário de máquinas',
    icon: Cog,
    color: 'from-cyan-500 to-teal-600',
    precisaPeriodo: false,
    precisaCliente: true,
    precisaStatus: true,
    precisaTipoMaquina: true,
  },
  {
    id: 'contas',
    label: 'Contas',
    description: 'Contas a pagar e receber',
    icon: Wallet,
    color: 'from-orange-500 to-amber-600',
    precisaPeriodo: true,
    precisaCliente: true,
    precisaStatus: true,
    precisaTipoMaquina: false,
  },
  {
    id: 'fluxo-caixa',
    label: 'Fluxo de Caixa',
    description: 'Resumo financeiro',
    icon: TrendingUp,
    color: 'from-rose-500 to-pink-600',
    precisaPeriodo: true,
    precisaCliente: true,
    precisaStatus: false,
    precisaTipoMaquina: false,
  },
];

interface Cliente {
  id: string;
  nome: string;
  telefone?: string;
  ativo: boolean;
  bloqueado: boolean;
}

interface TipoMaquina {
  id: string;
  descricao: string;
  ativo: boolean;
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function RelatoriosPage({ empresaId }: { empresaId: string }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tiposMaquina, setTiposMaquina] = useState<TipoMaquina[]>([]);

  // Filtros
  const [tipoRelatorio, setTipoRelatorio] = useState<TipoRelatorio | null>(null);
  const [clienteId, setClienteId] = useState<string>('todos');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [tipoMaquinaId, setTipoMaquinaId] = useState<string>('todos');

  // Resultado
  const [dados, setDados] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [gerado, setGerado] = useState(false);

  // Preview expandido
  const [showPreview, setShowPreview] = useState(false);

  // Impresora
  const [printerConnected, setPrinterConnected] = useState(false);
  const [printerName, setPrinterName] = useState<string | null>(null);

  // Config atual do relatório
  const configAtual = RELATORIOS_CONFIG.find(r => r.id === tipoRelatorio);

  useEffect(() => {
    if (empresaId) {
      loadClientes();
      loadTiposMaquina();
      checkPrinter();
    }
  }, [empresaId]);

  // Ajustar datas padrão ao trocar tipo
  useEffect(() => {
    if (configAtual?.precisaPeriodo && !dataInicio && !dataFim) {
      const hoje = new Date();
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      setDataInicio(formatDateISO(inicio));
      setDataFim(formatDateISO(hoje));
    }
  }, [tipoRelatorio]);

  const checkPrinter = () => {
    setPrinterConnected(isPrinterConnected());
    setPrinterName(getConnectedDeviceName());
  };

  const loadClientes = async () => {
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`/api/clientes?empresaId=${empresaId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) setClientes(data);
    } catch { /* silent */ }
  };

  const loadTiposMaquina = async () => {
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`/api/tipos-maquina?empresaId=${empresaId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) setTiposMaquina(data);
    } catch { /* silent */ }
  };

  const formatDateISO = (d: Date) => d.toISOString().split('T')[0];

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('pt-BR');

  // ============================================
  // GERAR RELATÓRIO
  // ============================================
  const gerarRelatorio = async () => {
    if (!tipoRelatorio) {
      toast.error('Selecione um tipo de relatório');
      return;
    }
    if (configAtual?.precisaPeriodo && (!dataInicio || !dataFim)) {
      toast.error('Selecione o período');
      return;
    }

    setLoading(true);
    setGerado(false);
    setDados(null);

    try {
      const params = new URLSearchParams({
        empresaId,
        tipo: tipoRelatorio,
      });
      if (dataInicio) params.set('dataInicio', dataInicio);
      if (dataFim) params.set('dataFim', dataFim);
      if (clienteId !== 'todos') params.set('clienteId', clienteId);
      if (statusFilter !== 'todos') params.set('status', statusFilter);
      if (tipoMaquinaId !== 'todos') params.set('tipoMaquinaId', tipoMaquinaId);

      const token = useAuthStore.getState().token;
      const res = await fetch(`/api/relatorios/gerar?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Erro ao gerar relatório');

      setDados(data);
      setGerado(true);
      setShowPreview(true);
      toast.success('Relatório gerado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar relatório');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // LIMPAR
  // ============================================
  const limparFiltros = () => {
    setTipoRelatorio(null);
    setClienteId('todos');
    setDataInicio('');
    setDataFim('');
    setStatusFilter('todos');
    setTipoMaquinaId('todos');
    setDados(null);
    setGerado(false);
    setShowPreview(false);
  };

  // ============================================
  // EXPORTAR WHATSAPP
  // ============================================
  const exportarWhatsApp = () => {
    if (!dados || !configAtual) return;

    let msg = `📊 *RELATÓRIO: ${configAtual.label.toUpperCase()}*\n`;
    msg += `━━━━━━━━━━━━━━━━━\n`;
    if (configAtual.precisaPeriodo && dataInicio && dataFim) {
      msg += `📅 Período: ${formatDate(dataInicio)} a ${formatDate(dataFim)}\n`;
    }
    if (clienteId !== 'todos') {
      const cl = clientes.find(c => c.id === clienteId);
      msg += `👤 Cliente: ${cl?.nome || '-'}\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━\n\n`;

    switch (tipoRelatorio) {
      case 'movimentacao': {
        const t = dados.totais;
        msg += `📋 *Resumo:*\n`;
        msg += `• Lançamentos: ${dados.totalRegistros}\n`;
        msg += `• Entradas: ${formatCurrency(t.totalEntradas)}\n`;
        msg += `• Saídas: ${formatCurrency(t.totalSaidas)}\n`;
        msg += `• Jogado: ${formatCurrency(t.totalJogado)}\n`;
        if (t.totalDespesas > 0) msg += `• Despesas: ${formatCurrency(t.totalDespesas)}\n`;
        msg += `\n`;
        dados.leituras.slice(0, 30).forEach((l: any) => {
          msg += `${formatDate(l.dataLeitura)} | ${l.cliente.nome} | ${l.maquina.codigo}\n`;
          msg += `  Entradas:${l.diferencaEntrada} Saídas:${l.diferencaSaida} Saldo:${formatCurrency(l.saldo)}\n`;
          if (l.valorDespesa) msg += `  Despesa: ${formatCurrency(l.valorDespesa)}\n`;
          msg += `───────────────\n`;
        });
        if (dados.leituras.length > 30) msg += `... +${dados.leituras.length - 30} registros\n`;
        break;
      }
      case 'pagamentos': {
        const t = dados.totais;
        msg += `📋 *Resumo:*\n`;
        msg += `• Total: ${formatCurrency(t.totalValor)}\n`;
        msg += `• Pago: ${formatCurrency(t.totalPago)}\n`;
        msg += `• Pendente: ${formatCurrency(t.totalPendente)}\n`;
        msg += `• Atrasado: ${formatCurrency(t.totalAtrasado)}\n`;
        msg += `\n`;
        dados.pagamentos.slice(0, 30).forEach((p: any) => {
          const statusIcon = p.status === 'PAGO' ? '✅' : p.status === 'ATRASADO' ? '🔴' : '⏳';
          msg += `${statusIcon} ${formatDate(p.dataVencimento)} | ${p.cliente.nome} | ${formatCurrency(p.valor)} | ${p.status}\n`;
        });
        break;
      }
      case 'clientes': {
        const t = dados.totais;
        msg += `📋 *Resumo:*\n`;
        msg += `• Total: ${t.totalClientes}\n`;
        msg += `• Máquinas: ${t.totalMaquinas}\n`;
        msg += `• Pagamentos Pendentes: ${t.totalPagamentosPendentes}\n`;
        msg += `\n`;
        dados.clientes.forEach((c: any) => {
          msg += `${c.ativo ? '✅' : '❌'} ${c.nome} (${c._count.maquinas} máquinas)\n`;
        });
        break;
      }
      case 'maquinas': {
        const t = dados.totais;
        msg += `📋 *Resumo:*\n`;
        msg += `• Total: ${t.totalMaquinas} (Ativas: ${t.ativas})\n`;
        msg += `• Faturamento Mensal: ${formatCurrency(t.faturamentoMensal)}\n`;
        msg += `\n`;
        dados.maquinas.forEach((m: any) => {
          const statusIcon = m.status === 'ATIVA' ? '🟢' : m.status === 'MANUTENCAO' ? '🟡' : '🔴';
          msg += `${statusIcon} ${m.codigo} | ${m.tipo.descricao} | ${m.cliente.nome}\n`;
        });
        break;
      }
      case 'contas': {
        const t = dados.totais;
        msg += `📋 *Resumo:*\n`;
        msg += `• A Pagar: ${formatCurrency(t.totalAPagar)}\n`;
        msg += `• A Receber: ${formatCurrency(t.totalAReceber)}\n`;
        msg += `• Pagas: ${formatCurrency(t.totalPagas)}\n`;
        msg += `• Pendentes: ${formatCurrency(t.totalPendentes)}\n`;
        msg += `\n`;
        dados.contas.slice(0, 30).forEach((c: any) => {
          msg += `${c.paga ? '✅' : '⏳'} ${formatDate(c.data)} | ${c.descricao} | ${formatCurrency(c.valor)} | ${c.tipo === 0 ? 'Pagar' : 'Receber'}\n`;
        });
        break;
      }
      case 'fluxo-caixa': {
        const t = dados.totais;
        msg += `📋 *Resumo:*\n`;
        msg += `💰 Entradas: ${formatCurrency(t.totalEntradas)}\n`;
        msg += `📤 Saídas: ${formatCurrency(t.totalSaidas)}\n`;
        msg += `📊 Saldo: ${formatCurrency(t.saldo)}\n`;
        msg += `\n`;
        dados.lancamentos.slice(0, 30).forEach((l: any) => {
          msg += `${l.tipo === 'entrada' ? '💰' : '📤'} ${formatDate(l.data)} | ${l.descricao} | ${formatCurrency(l.valor)}\n`;
        });
        break;
      }
    }

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // ============================================
  // EXPORTAR PDF (via window.print com CSS especial)
  // ============================================
  const exportarPDF = () => {
    if (!dados || !configAtual) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Permita popups para exportar PDF');
      return;
    }

    let html = generatePrintHTML();
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const generatePrintHTML = () => {
    const title = `${configAtual?.label || 'Relatório'} - Caixa Fácil`;
    let tableRows = '';

    switch (tipoRelatorio) {
      case 'movimentacao':
        dados.leituras.forEach((l: any) => {
          tableRows += `<tr>
            <td>${formatDate(l.dataLeitura)}</td>
            <td>${l.cliente?.nome || '-'}</td>
            <td>${l.maquina?.codigo || '-'}</td>
            <td>${l.diferencaEntrada}</td>
            <td>${l.diferencaSaida}</td>
            <td>${formatCurrency(l.saldo)}</td>
            ${l.valorDespesa ? `<td>${formatCurrency(l.valorDespesa)}</td>` : ''}
          </tr>`;
        });
        break;
      case 'pagamentos':
        dados.pagamentos.forEach((p: any) => {
          tableRows += `<tr>
            <td>${formatDate(p.dataVencimento)}</td>
            <td>${p.cliente?.nome || '-'}</td>
            <td>${formatCurrency(p.valor)}</td>
            <td>${p.status}</td>
            <td>${p.formaPagamento || '-'}</td>
          </tr>`;
        });
        break;
      case 'clientes':
        dados.clientes.forEach((c: any) => {
          tableRows += `<tr>
            <td>${c.nome}</td>
            <td>${c.telefone || '-'}</td>
            <td>${c._count.maquinas}</td>
            <td>${c.ativo ? 'Sim' : 'Não'}</td>
          </tr>`;
        });
        break;
      case 'maquinas':
        dados.maquinas.forEach((m: any) => {
          tableRows += `<tr>
            <td>${m.codigo}</td>
            <td>${m.tipo?.descricao || '-'}</td>
            <td>${m.cliente?.nome || '-'}</td>
            <td>${m.status}</td>
            <td>${m.localizacao || '-'}</td>
          </tr>`;
        });
        break;
      case 'contas':
        dados.contas.forEach((c: any) => {
          tableRows += `<tr>
            <td>${formatDate(c.data)}</td>
            <td>${c.descricao}</td>
            <td>${c.cliente?.nome || '-'}</td>
            <td>${formatCurrency(c.valor)}</td>
            <td>${c.tipo === 0 ? 'A Pagar' : 'A Receber'}</td>
            <td>${c.paga ? 'Sim' : 'Não'}</td>
          </tr>`;
        });
        break;
      case 'fluxo-caixa':
        dados.lancamentos.forEach((l: any) => {
          tableRows += `<tr>
            <td>${formatDate(l.data)}</td>
            <td>${l.descricao}</td>
            <td>${l.cliente || '-'}</td>
            <td>${l.categoria || '-'}</td>
            <td class="${l.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}">${l.tipo === 'entrada' ? '+' : '-'} ${formatCurrency(l.valor)}</td>
          </tr>`;
        });
        break;
    }

    let summaryHTML = '';
    if (dados?.totais) {
      summaryHTML = '<div class="summary-grid">';
      Object.entries(dados.totais).forEach(([key, val]) => {
        if (key.startsWith('total') || key === 'saldo') {
          const label = key.replace('total', '').replace(/([A-Z])/g, ' $1').trim();
          summaryHTML += `<div class="summary-item">
            <span class="summary-label">${label || key}</span>
            <span class="summary-value">${typeof val === 'number' ? formatCurrency(val) : val}</span>
          </div>`;
        }
      });
      summaryHTML += '</div>';
    }

    return `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; color: #1a1a2e; font-size: 12px; }
    .header { text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e2e8f0; }
    .header h1 { font-size: 20px; color: #1a1a2e; margin-bottom: 4px; }
    .header p { color: #64748b; font-size: 11px; }
    .header .period { font-weight: 600; color: #334155; margin-top: 6px; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 20px; }
    .summary-item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center; }
    .summary-label { display: block; font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-value { display: block; font-size: 16px; font-weight: 700; color: #1e293b; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #f1f5f9; color: #475569; font-weight: 600; text-align: left; padding: 8px 6px; border-bottom: 2px solid #e2e8f0; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; }
    td { padding: 6px; border-bottom: 1px solid #f1f5f9; }
    tr:hover td { background: #fafbfc; }
    .text-green-600 { color: #16a34a; }
    .text-red-600 { color: #dc2626; }
    .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 9px; }
    @media print { body { padding: 10px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 ${title}</h1>
    <p>Caixa Fácil - Sistema de Gestão</p>
    ${configAtual?.precisaPeriodo && dataInicio ? `<p class="period">Período: ${formatDate(dataInicio)} a ${formatDate(dataFim)}</p>` : ''}
    ${clienteId !== 'todos' ? `<p class="period">Cliente: ${clientes.find(c => c.id === clienteId)?.nome || '-'}</p>` : ''}
    <p style="font-size:10px;color:#94a3b8;margin-top:4px;">Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
  </div>
  ${summaryHTML}
  <table>
    <thead>${getPrintHeaders()}</thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="footer">
    <p>Relatório gerado automaticamente pelo Caixa Fácil</p>
  </div>
</body>
</html>`;
  };

  const getPrintHeaders = () => {
    switch (tipoRelatorio) {
      case 'movimentacao':
        return '<tr><th>Data</th><th>Cliente</th><th>Máquina</th><th>Entradas</th><th>Saídas</th><th>Saldo</th></tr>';
      case 'pagamentos':
        return '<tr><th>Vencimento</th><th>Cliente</th><th>Valor</th><th>Status</th><th>Forma</th></tr>';
      case 'clientes':
        return '<tr><th>Nome</th><th>Telefone</th><th>Máquinas</th><th>Ativo</th></tr>';
      case 'maquinas':
        return '<tr><th>Código</th><th>Tipo</th><th>Cliente</th><th>Status</th><th>Localização</th></tr>';
      case 'contas':
        return '<tr><th>Data</th><th>Descrição</th><th>Cliente</th><th>Valor</th><th>Tipo</th><th>Paga</th></tr>';
      case 'fluxo-caixa':
        return '<tr><th>Data</th><th>Descrição</th><th>Cliente</th><th>Categoria</th><th>Valor</th></tr>';
      default:
        return '';
    }
  };

  // ============================================
  // EXPORTAR TEXTO
  // ============================================
  const exportarTexto = () => {
    if (!dados || !configAtual) return;

    let text = generatePrintHTML();
    // Extract text from HTML
    const div = document.createElement('div');
    div.innerHTML = text;
    const plainText = div.textContent || div.innerText || '';

    const blob = new Blob([plainText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-${tipoRelatorio}-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Texto exportado!');
  };

  // ============================================
  // IMPRIMIR PADRÃO
  // ============================================
  const imprimirPadrao = () => {
    exportarPDF(); // Uses window.print()
  };

  // ============================================
  // IMPRESSORA TÉRMICA
  // ============================================
  const imprimirTermica = async () => {
    if (!dados || !configAtual) return;

    const empresaNome = 'Caixa Fácil';
    const sep = '-'.repeat(32);
    let text = '';
    text += `* ${configAtual.label} *\n`;
    text += sep + '\n';
    if (configAtual.precisaPeriodo && dataInicio) {
      text += `Periodo: ${formatDate(dataInicio)} a ${formatDate(dataFim)}\n`;
    }
    if (clienteId !== 'todos') {
      text += `Cliente: ${clientes.find(c => c.id === clienteId)?.nome || '-'}\n`;
    }
    text += `Gerado: ${new Date().toLocaleString('pt-BR')}\n`;
    text += sep + '\n\n';

    // Totais resumo
    if (dados.totais) {
      Object.entries(dados.totais).forEach(([key, val]) => {
        if (typeof val === 'number') {
          const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
          text += `${label.padEnd(18)} ${formatCurrency(val)}\n`;
        }
      });
      text += '\n' + sep + '\n';
    }

    // Limitar linhas para impressora térmica
    const maxItems = 15;
    const items = dados.leituras || dados.pagamentos || dados.clientes || dados.maquinas || dados.contas || dados.lancamentos || [];
    items.slice(0, maxItems).forEach((item: any) => {
      const data = item.dataLeitura || item.dataVencimento || item.data || item.createdAt || '';
      const nome = item.cliente?.nome || item.descricao || item.nome || '-';
      const valor = item.valor !== undefined ? formatCurrency(item.valor) :
                    item.saldo !== undefined ? formatCurrency(item.saldo) : '';
      const codigo = item.codigo || item.maquina?.codigo || '';

      if (data) text += `${formatDate(data)}\n`;
      if (codigo) text += `  ${codigo} `;
      text += `${nome}\n`;
      if (valor) text += `  Valor: ${valor}\n`;
      text += '\n';
    });

    if (items.length > maxItems) {
      text += `... +${items.length - maxItems} registros\n`;
    }

    text += sep + '\n';
    text += `Total: ${dados.totalRegistros} registros\n`;

    // Try Bluetooth printer first
    if (printerConnected) {
      const config = getActiveConfig();
      if (config) {
        try {
          await printReceipt({
            empresaNome,
            clienteNome: clienteId !== 'todos' ? (clientes.find(c => c.id === clienteId)?.nome || 'Todos') : 'Todos',
            dataHora: new Date().toLocaleString('pt-BR'),
            usuario: 'Operador',
            maquinas: [],
            totais: { entradas: 0, saidas: 0, jogado: 0, cliente: 0, acertoPct: 0 },
          }, config);
          toast.success('Enviado para impressora térmica!');
          return;
        } catch {
          // Fall through to fallback
        }
      }
    }

    // Fallback: share or native print
    fallbackPrint(text);
    toast.success('Texto enviado para impressão!');
  };

  // ============================================
  // CONECTAR IMPRESSORA
  // ============================================
  const handleConectarImpressora = async () => {
    const empresaPreset = typeof window !== 'undefined'
      ? localStorage.getItem('cf-printer-preset')
      : null;
    const config: PrinterConfig = empresaPreset && PRINTER_PRESETS[empresaPreset]
      ? PRINTER_PRESETS[empresaPreset]
      : PRINTER_PRESETS['goojprt-58mm'];

    const result = await connectPrinter(config);
    if (result.success) {
      setPrinterConnected(true);
      setPrinterName(result.deviceName || null);
      toast.success(`Impressora conectada: ${result.deviceName}`);
    } else {
      toast.error(result.error || 'Erro ao conectar');
    }
  };

  const handleDesconectarImpressora = () => {
    disconnectPrinter();
    setPrinterConnected(false);
    setPrinterName(null);
    toast.info('Impressora desconectada');
  };

  // ============================================
  // STATUS BADGES
  // ============================================
  const StatusBadge = ({ status }: { status: string }) => {
    const config: Record<string, { color: string; icon: React.ElementType }> = {
      PAGO: { color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: CheckCircle },
      PENDENTE: { color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Clock },
      ATRASADO: { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: AlertCircle },
      CANCELADO: { color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: XCircle },
      ATIVA: { color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: CheckCircle },
      INATIVA: { color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: XCircle },
      MANUTENCAO: { color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: AlertCircle },
      VENDIDA: { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: CheckCircle },
    };
    const c = config[status] || { color: 'bg-gray-500/20 text-gray-400', icon: FileText };
    const Icon = c.icon;
    return (
      <Badge variant="outline" className={`${c.color} text-xs gap-1`}>
        <Icon className="w-3 h-3" />
        {status}
      </Badge>
    );
  };

  // ============================================
  // RENDER TABELA DE DADOS
  // ============================================
  const renderTabelaDados = () => {
    if (!dados) return null;

    switch (tipoRelatorio) {
      case 'movimentacao': {
        const items = dados.leituras || [];
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">Data</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">Cliente</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">Máquina</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs">Entradas</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs">Saídas</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l: any) => (
                  <tr key={l.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="py-2.5 px-2 text-foreground text-xs">{formatDate(l.dataLeitura)}</td>
                    <td className="py-2.5 px-2 text-foreground text-xs font-medium">{l.cliente?.nome || '-'}</td>
                    <td className="py-2.5 px-2 text-muted-foreground text-xs">{l.maquina?.codigo || '-'} {l.maquina?.tipo?.descricao || ''}</td>
                    <td className="py-2.5 px-2 text-right text-xs">
                      <span className="text-green-400">{l.diferencaEntrada}</span>
                    </td>
                    <td className="py-2.5 px-2 text-right text-xs">
                      <span className="text-red-400">{l.diferencaSaida}</span>
                    </td>
                    <td className="py-2.5 px-2 text-right text-xs font-bold">
                      <span className={l.saldo >= 0 ? 'text-green-400' : 'text-red-400'}>{formatCurrency(l.saldo)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      case 'pagamentos': {
        const items = dados.pagamentos || [];
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">Vencimento</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">Cliente</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs">Valor</th>
                  <th className="text-center py-2 px-2 text-muted-foreground font-medium text-xs">Status</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">Forma</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p: any) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="py-2.5 px-2 text-foreground text-xs">{formatDate(p.dataVencimento)}</td>
                    <td className="py-2.5 px-2 text-foreground text-xs font-medium">{p.cliente?.nome || '-'}</td>
                    <td className="py-2.5 px-2 text-right text-xs font-bold text-foreground">{formatCurrency(p.valor)}</td>
                    <td className="py-2.5 px-2 text-center"><StatusBadge status={p.status} /></td>
                    <td className="py-2.5 px-2 text-muted-foreground text-xs">{p.formaPagamento || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      case 'clientes': {
        const items = dados.clientes || [];
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">Nome</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">Telefone</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs">Máquinas</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs">Pendentes</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c: any) => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="py-2.5 px-2 text-foreground text-xs font-medium">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${c.ativo && !c.bloqueado ? 'bg-green-400' : c.bloqueado ? 'bg-red-400' : 'bg-gray-400'}`} />
                        {c.nome}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-muted-foreground text-xs">{c.telefone || '-'}</td>
                    <td className="py-2.5 px-2 text-right text-xs">{c._count.maquinas}</td>
                    <td className="py-2.5 px-2 text-right text-xs">
                      {c._count.pagamentos > 0 && (
                        <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                          {c._count.pagamentos}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      case 'maquinas': {
        const items = dados.maquinas || [];
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">Código</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">Tipo</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">Cliente</th>
                  <th className="text-center py-2 px-2 text-muted-foreground font-medium text-xs">Status</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">Local</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs">Mensal</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m: any) => (
                  <tr key={m.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="py-2.5 px-2 text-foreground text-xs font-bold">{m.codigo}</td>
                    <td className="py-2.5 px-2 text-muted-foreground text-xs">{m.tipo?.descricao || '-'}</td>
                    <td className="py-2.5 px-2 text-foreground text-xs">{m.cliente?.nome || '-'}</td>
                    <td className="py-2.5 px-2 text-center"><StatusBadge status={m.status} /></td>
                    <td className="py-2.5 px-2 text-muted-foreground text-xs">{m.localizacao || '-'}</td>
                    <td className="py-2.5 px-2 text-right text-xs font-medium">{m.valorMensal ? formatCurrency(m.valorMensal) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      case 'contas': {
        const items = dados.contas || [];
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">Data</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">Descrição</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">Cliente</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs">Valor</th>
                  <th className="text-center py-2 px-2 text-muted-foreground font-medium text-xs">Tipo</th>
                  <th className="text-center py-2 px-2 text-muted-foreground font-medium text-xs">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c: any) => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="py-2.5 px-2 text-foreground text-xs">{formatDate(c.data)}</td>
                    <td className="py-2.5 px-2 text-foreground text-xs font-medium">{c.descricao}</td>
                    <td className="py-2.5 px-2 text-muted-foreground text-xs">{c.cliente?.nome || '-'}</td>
                    <td className="py-2.5 px-2 text-right text-xs font-bold text-foreground">{formatCurrency(c.valor)}</td>
                    <td className="py-2.5 px-2 text-center">
                      <Badge variant="outline" className={`text-xs ${c.tipo === 0 ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'}`}>
                        {c.tipo === 0 ? 'Pagar' : 'Receber'}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <Badge variant="outline" className={`text-xs ${c.paga ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}>
                        {c.paga ? 'Pago' : 'Pendente'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      case 'fluxo-caixa': {
        const items = dados.lancamentos || [];
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">Data</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">Descrição</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">Cliente</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium text-xs">Categoria</th>
                  <th className="text-right py-2 px-2 text-muted-foreground font-medium text-xs">Valor</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l: any) => (
                  <tr key={l.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="py-2.5 px-2 text-foreground text-xs">{formatDate(l.data)}</td>
                    <td className="py-2.5 px-2 text-foreground text-xs font-medium">{l.descricao}</td>
                    <td className="py-2.5 px-2 text-muted-foreground text-xs">{l.cliente || '-'}</td>
                    <td className="py-2.5 px-2 text-muted-foreground text-xs">{l.categoria || '-'}</td>
                    <td className="py-2.5 px-2 text-right text-xs font-bold">
                      <span className={`flex items-center justify-end gap-1 ${l.tipo === 'entrada' ? 'text-green-400' : 'text-red-400'}`}>
                        {l.tipo === 'entrada' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {formatCurrency(l.valor)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      default:
        return null;
    }
  };

  // ============================================
  // RENDER CARDS DE TOTAIS
  // ============================================
  const renderTotais = () => {
    if (!dados?.totais) return null;

    const cards: { label: string; value: string; color?: string; icon: React.ElementType }[] = [];

    switch (tipoRelatorio) {
      case 'movimentacao':
        cards.push(
          { label: 'Lançamentos', value: String(dados.totalRegistros), icon: BarChart3 },
          { label: 'Entradas', value: formatCurrency(dados.totais.totalEntradas), color: 'text-green-400', icon: ArrowUpRight },
          { label: 'Saídas', value: formatCurrency(dados.totais.totalSaidas), color: 'text-red-400', icon: ArrowDownRight },
          { label: 'Jogado', value: formatCurrency(dados.totais.totalJogado), color: 'text-blue-400', icon: TrendingUp },
        );
        if (dados.totais.totalDespesas > 0) {
          cards.push({ label: 'Despesas', value: formatCurrency(dados.totais.totalDespesas), color: 'text-orange-400', icon: TrendingDown });
        }
        break;
      case 'pagamentos':
        cards.push(
          { label: 'Total', value: formatCurrency(dados.totais.totalValor), icon: DollarSign },
          { label: 'Pago', value: formatCurrency(dados.totais.totalPago), color: 'text-green-400', icon: CheckCircle },
          { label: 'Pendente', value: formatCurrency(dados.totais.totalPendente), color: 'text-amber-400', icon: Clock },
          { label: 'Atrasado', value: formatCurrency(dados.totais.totalAtrasado), color: 'text-red-400', icon: AlertCircle },
        );
        break;
      case 'clientes':
        cards.push(
          { label: 'Clientes', value: String(dados.totais.totalClientes), icon: Users },
          { label: 'Máquinas', value: String(dados.totais.totalMaquinas), icon: Cog },
          { label: 'Assinaturas', value: String(dados.totais.totalAssinaturas), icon: FileText },
          { label: 'Pendentes', value: String(dados.totais.totalPagamentosPendentes), color: 'text-amber-400', icon: AlertCircle },
        );
        break;
      case 'maquinas':
        cards.push(
          { label: 'Total', value: String(dados.totais.totalMaquinas), icon: Cog },
          { label: 'Ativas', value: String(dados.totais.ativas), color: 'text-green-400', icon: CheckCircle },
          { label: 'Manutenção', value: String(dados.totais.manutencao), color: 'text-amber-400', icon: AlertCircle },
          { label: 'Faturamento', value: formatCurrency(dados.totais.faturamentoMensal), color: 'text-blue-400', icon: TrendingUp },
        );
        break;
      case 'contas':
        cards.push(
          { label: 'A Pagar', value: formatCurrency(dados.totais.totalAPagar), color: 'text-red-400', icon: ArrowDownRight },
          { label: 'A Receber', value: formatCurrency(dados.totais.totalAReceber), color: 'text-green-400', icon: ArrowUpRight },
          { label: 'Pagas', value: formatCurrency(dados.totais.totalPagas), icon: CheckCircle },
          { label: 'Pendentes', value: formatCurrency(dados.totais.totalPendentes), color: 'text-amber-400', icon: Clock },
        );
        break;
      case 'fluxo-caixa':
        cards.push(
          { label: 'Entradas', value: formatCurrency(dados.totais.totalEntradas), color: 'text-green-400', icon: ArrowUpRight },
          { label: 'Saídas', value: formatCurrency(dados.totais.totalSaidas), color: 'text-red-400', icon: ArrowDownRight },
          { label: 'Saldo', value: formatCurrency(dados.totais.saldo), color: dados.totais.saldo >= 0 ? 'text-green-400' : 'text-red-400', icon: Wallet },
        );
        break;
    }

    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((card, i) => (
          <Card key={i} className="border-0 shadow-lg bg-card">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className={`text-lg font-bold mt-1 ${card.color || 'text-foreground'}`}>{card.value}</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-accent/50 flex items-center justify-center">
                  <card.icon className={`w-4 h-4 ${card.color || 'text-muted-foreground'}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  // ============================================
  // STATUS OPTIONS PER TIPO
  // ============================================
  const getStatusOptions = (): { value: string; label: string }[] => {
    switch (tipoRelatorio) {
      case 'pagamentos':
        return [
          { value: 'todos', label: 'Todos' },
          { value: 'PENDENTE', label: 'Pendentes' },
          { value: 'PAGO', label: 'Pagos' },
          { value: 'ATRASADO', label: 'Atrasados' },
          { value: 'CANCELADO', label: 'Cancelados' },
        ];
      case 'clientes':
        return [
          { value: 'todos', label: 'Todos' },
          { value: 'ativos', label: 'Ativos' },
          { value: 'bloqueados', label: 'Bloqueados' },
          { value: 'inativos', label: 'Inativos' },
        ];
      case 'maquinas':
        return [
          { value: 'todos', label: 'Todos' },
          { value: 'ATIVA', label: 'Ativas' },
          { value: 'INATIVA', label: 'Inativas' },
          { value: 'MANUTENCAO', label: 'Manutenção' },
          { value: 'VENDIDA', label: 'Vendidas' },
        ];
      case 'contas':
        return [
          { value: 'todos', label: 'Todas' },
          { value: 'pendentes', label: 'Pendentes' },
          { value: 'pagas', label: 'Pagas' },
        ];
      default:
        return [];
    }
  };

  // ============================================
  // MAIN RENDER
  // ============================================
  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-500" />
            Relatórios
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Gere e exporte relatórios detalhados</p>
        </div>
        {gerado && (
          <Button variant="ghost" size="sm" onClick={limparFiltros} className="text-muted-foreground hover:text-foreground">
            <Filter className="w-4 h-4 mr-1" />
            Novo
          </Button>
        )}
      </div>

      {/* Seletor de Tipo de Relatório */}
      {!gerado && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {RELATORIOS_CONFIG.map((rel) => {
              const Icon = rel.icon;
              const selected = tipoRelatorio === rel.id;
              return (
                <button
                  key={rel.id}
                  onClick={() => setTipoRelatorio(rel.id)}
                  className={`relative p-4 rounded-xl border transition-all duration-200 text-left group ${
                    selected
                      ? 'border-amber-500/60 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                      : 'border-border bg-card hover:border-muted-foreground/30 hover:bg-accent/30'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${rel.color} flex items-center justify-center mb-3 transition-transform group-hover:scale-110`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="font-semibold text-sm text-foreground">{rel.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{rel.description}</p>
                  {selected && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                      <CheckCircle className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Filtros Dinâmicos */}
          {tipoRelatorio && configAtual && (
            <Card className="border-0 shadow-lg bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  Filtros
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {configAtual.precisaPeriodo && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Data Início</Label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            type="date"
                            value={dataInicio}
                            onChange={(e) => setDataInicio(e.target.value)}
                            className="bg-muted border-border text-foreground pl-9"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Data Fim</Label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            type="date"
                            value={dataFim}
                            onChange={(e) => setDataFim(e.target.value)}
                            className="bg-muted border-border text-foreground pl-9"
                          />
                        </div>
                      </div>
                    </>
                  )}
                  {configAtual.precisaCliente && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Cliente</Label>
                      <Select value={clienteId} onValueChange={setClienteId}>
                        <SelectTrigger className="bg-muted border-border text-foreground">
                          <SelectValue placeholder="Todos..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos os Clientes</SelectItem>
                          {clientes.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {configAtual.precisaStatus && getStatusOptions().length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="bg-muted border-border text-foreground">
                          <SelectValue placeholder="Todos..." />
                        </SelectTrigger>
                        <SelectContent>
                          {getStatusOptions().map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {configAtual.precisaTipoMaquina && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Tipo Máquina</Label>
                      <Select value={tipoMaquinaId} onValueChange={setTipoMaquinaId}>
                        <SelectTrigger className="bg-muted border-border text-foreground">
                          <SelectValue placeholder="Todos..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos os Tipos</SelectItem>
                          {tiposMaquina.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.descricao}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Botão Gerar */}
                <div className="mt-4 flex gap-2">
                  <Button
                    onClick={gerarRelatorio}
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Gerando...
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4 mr-2" />
                        Gerar e Visualizar
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={limparFiltros} className="text-muted-foreground">
                    Limpar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Resultado */}
      {gerado && dados && (
        <>
          {/* Resumo / Cards de Totais */}
          {renderTotais()}

          {/* Tabela de Dados */}
          <Card className="border-0 shadow-lg bg-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Dados do Relatório
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {dados.totalRegistros} registros
                  </Badge>
                </CardTitle>
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {showPreview ? 'Ocultar' : 'Expandir'}
                </button>
              </div>
            </CardHeader>
            {showPreview && (
              <CardContent className="pt-0">
                {dados.totalRegistros === 0 ? (
                  <div className="py-12 text-center">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-muted-foreground">Nenhum registro encontrado</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[500px]">
                    {renderTabelaDados()}
                  </ScrollArea>
                )}
              </CardContent>
            )}
          </Card>

          {/* Botões de Exportação */}
          {dados.totalRegistros > 0 && (
            <Card className="border-0 shadow-lg bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Exportar / Enviar
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {/* WhatsApp */}
                  <Button
                    onClick={exportarWhatsApp}
                    variant="outline"
                    className="h-auto py-3 flex flex-col items-center gap-2 border-green-500/30 hover:bg-green-500/10 hover:border-green-500/50 transition-all"
                  >
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </div>
                    <span className="text-xs font-medium text-foreground">WhatsApp</span>
                  </Button>

                  {/* PDF */}
                  <Button
                    onClick={exportarPDF}
                    variant="outline"
                    className="h-auto py-3 flex flex-col items-center gap-2 border-red-500/30 hover:bg-red-500/10 hover:border-red-500/50 transition-all"
                  >
                    <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                      <FileDown className="w-5 h-5 text-red-400" />
                    </div>
                    <span className="text-xs font-medium text-foreground">PDF / Imprimir</span>
                  </Button>

                  {/* Texto */}
                  <Button
                    onClick={exportarTexto}
                    variant="outline"
                    className="h-auto py-3 flex flex-col items-center gap-2 border-blue-500/30 hover:bg-blue-500/10 hover:border-blue-500/50 transition-all"
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-blue-400" />
                    </div>
                    <span className="text-xs font-medium text-foreground">Texto</span>
                  </Button>

                  {/* Impressora Padrão */}
                  <Button
                    onClick={imprimirPadrao}
                    variant="outline"
                    className="h-auto py-3 flex flex-col items-center gap-2 border-purple-500/30 hover:bg-purple-500/10 hover:border-purple-500/50 transition-all"
                  >
                    <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <Printer className="w-5 h-5 text-purple-400" />
                    </div>
                    <span className="text-xs font-medium text-foreground">Impressora</span>
                  </Button>

                  {/* Impressora Térmica */}
                  <Button
                    onClick={printerConnected ? imprimirTermica : handleConectarImpressora}
                    variant="outline"
                    className={`h-auto py-3 flex flex-col items-center gap-2 transition-all ${
                      printerConnected
                        ? 'border-cyan-500/30 hover:bg-cyan-500/10 hover:border-cyan-500/50'
                        : 'border-orange-500/30 hover:bg-orange-500/10 hover:border-orange-500/50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      printerConnected ? 'bg-cyan-500/20' : 'bg-orange-500/20'
                    }`}>
                      <Receipt className={`w-5 h-5 ${printerConnected ? 'text-cyan-400' : 'text-orange-400'}`} />
                    </div>
                    <span className="text-xs font-medium text-foreground">
                      {printerConnected ? `Térmica ${printerName ? `(${printerName})` : ''}` : 'Conectar Térmica'}
                    </span>
                  </Button>

                  {/* Compartilhar */}
                  <Button
                    onClick={async () => {
                      if (!dados || !configAtual) return;
                      let text = `📊 ${configAtual.label}\n`;
                      text += `Registros: ${dados.totalRegistros}\n`;
                      if (dados.totais) {
                        Object.entries(dados.totais).forEach(([k, v]) => {
                          if (typeof v === 'number') text += `${k}: ${formatCurrency(v)}\n`;
                        });
                      }
                      if (typeof navigator !== 'undefined' && !!(navigator as any).share) {
                        try {
                          await (navigator as any).share({ title: configAtual.label, text });
                        } catch { /* user cancelled */ }
                      } else {
                        toast.info('Compartilhamento não disponível neste navegador');
                      }
                    }}
                    variant="outline"
                    className="h-auto py-3 flex flex-col items-center gap-2 border-teal-500/30 hover:bg-teal-500/10 hover:border-teal-500/50 transition-all"
                  >
                    <div className="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center">
                      <Share2 className="w-5 h-5 text-teal-400" />
                    </div>
                    <span className="text-xs font-medium text-foreground">Compartilhar</span>
                  </Button>
                </div>

                {/* Status da impressora */}
                {printerConnected && (
                  <div className="mt-3 flex items-center justify-between px-2 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                      <span className="text-xs text-cyan-400">Impressora conectada{printerName ? `: ${printerName}` : ''}</span>
                    </div>
                    <button
                      onClick={handleDesconectarImpressora}
                      className="text-xs text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      Desconectar
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Botão Voltar */}
          <div className="text-center">
            <Button variant="ghost" onClick={limparFiltros} className="text-muted-foreground hover:text-foreground">
              <ChevronDown className="w-4 h-4 mr-1 rotate-180" />
              Gerar outro relatório
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
