/**
 * Geração dinâmica de planilhas Excel a partir de gabarito.
 *
 * O cliente faz upload de uma planilha .xlsx com placeholders entre colchetes
 * (ex: [caixainicial], [reforço], [cliente]) e o aplicativo substitui os
 * placeholders pelos valores reais do relatório de leitura.
 *
 * Biblioteca: SheetJS (xlsx) — funciona no browser.
 */

import * as XLSX from 'xlsx';

// ============================================
// MOEDA — multiplicadores
// ============================================
// Mapeia código de moeda → valor do multiplicador (R$ por crédito)
const MOEDA_MULT: Record<string, number> = {
  M001: 0.01,
  M005: 0.05,
  M010: 0.10,
  M025: 0.25,
};

// ============================================
// TIPOS
// ============================================

export interface PlanilhaData {
  // Dados gerais
  cliente: string;
  data: string;
  turno: string;
  operador: string;
  modoOperacao: string;

  // Totais
  jogado: number;
  clienteParte: number;
  receita: number;
  despesa: number;
  debitoSaldo: number;
  fechamento: number;
  acertoPercentual: number;
  leituraAtual: number;   // Valor da LEITURA atual = jogado × (100 - acertoPct)/100 (parte do sistema)
  leituraAnterior: number; // LEITURA anterior acumulada (saldo anterior)

  // Pagamento
  recebido: number;
  formaPagamento: string;
  valorPago: number;
  saldoAnterior: number;

  // Receitas (por descrição normalizada)
  receitas: Record<string, number>;

  // Despesas (por descrição normalizada)
  despesas: Record<string, number>;

  // Máquinas (por código)
  maquinas: Array<{
    codigo: string;
    tipo: string;
    entradaAnterior: number;
    entradaNova: number;
    diferencaEntrada: number;
    saidaAnterior: number;
    saidaNova: number;
    diferencaSaida: number;
    saldo: number;      // Movimento em valor monetário (entrada - saída × moeda)
    moeda: string;
  }>;
}

// ============================================
// NORMALIZAÇÃO DE CHAVES
// ============================================

/**
 * Normaliza uma string para usar como chave de placeholder:
 * - lowercase
 * - sem acentos
 * - espaços e hífens → underscore
 * - remove caracteres especiais
 *
 * Ex: "Caixa Inicial" → "caixa_inicial"
 *     "REFORÇO" → "reforco"
 *     "HORAS EXTRAS" → "horas_extras"
 */
export function normalizarChave(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]+/g, '_')     // não-alfanumérico → underscore
    .replace(/^_+|_+$/g, '');        // remove underscores nas pontas
}

// ============================================
// LISTA DE CAMPOS DISPONÍVEIS (para o guia)
// ============================================

export interface CampoGuia {
  placeholder: string;
  descricao: string;
  exemplo: string;
  categoria: 'Geral' | 'Totais' | 'Receitas' | 'Despesas' | 'Máquinas';
}

/**
 * Retorna a lista de todos os campos disponíveis para uso na planilha gabarito.
 * Usado para exibir o guia ao cliente no cadastro.
 *
 * Campos dinâmicos de máquinas dependem dos códigos das máquinas do cliente —
 * são listados separadamente.
 */
export function listarCamposDisponiveis(codigosMaquinas: string[] = []): CampoGuia[] {
  const campos: CampoGuia[] = [
    // Geral
    { placeholder: '[cliente]', descricao: 'Nome do cliente', exemplo: 'João Silva', categoria: 'Geral' },
    { placeholder: '[data]', descricao: 'Data do relatório', exemplo: '01/08/2026', categoria: 'Geral' },
    { placeholder: '[turno]', descricao: 'Turno da leitura', exemplo: 'MANHÃ', categoria: 'Geral' },
    { placeholder: '[operador]', descricao: 'Nome do operador', exemplo: 'Maria', categoria: 'Geral' },
    { placeholder: '[modo_operacao]', descricao: 'Modo de operação', exemplo: 'COBRANCA', categoria: 'Geral' },
    { placeholder: '[acerto_percentual]', descricao: 'Percentual de acerto do cliente', exemplo: '50', categoria: 'Geral' },

    // Totais
    { placeholder: '[jogado]', descricao: 'Total jogado (entradas - saídas das máquinas)', exemplo: '1500.00', categoria: 'Totais' },
    { placeholder: '[cliente_parte]', descricao: 'Parte do cliente (jogado × acerto%)', exemplo: '750.00', categoria: 'Totais' },
    { placeholder: '[leituraatual]', descricao: 'LEITURA atual — parte do sistema (jogado × (100 - acerto%))', exemplo: '750.00', categoria: 'Totais' },
    { placeholder: '[leituraanterior]', descricao: 'LEITURA anterior acumulada (saldo anterior)', exemplo: '320.00', categoria: 'Totais' },
    { placeholder: '[receita]', descricao: 'Total de receitas extras', exemplo: '200.00', categoria: 'Totais' },
    { placeholder: '[despesa]', descricao: 'Total de despesas', exemplo: '350.00', categoria: 'Totais' },
    { placeholder: '[debito_saldo]', descricao: 'Saldo de débitos vencidos', exemplo: '100.00', categoria: 'Totais' },
    { placeholder: '[fechamento]', descricao: 'Valor de fechamento', exemplo: '650.00', categoria: 'Totais' },
    { placeholder: '[recebido]', descricao: 'Valor recebido', exemplo: '500.00', categoria: 'Totais' },
    { placeholder: '[forma_pagamento]', descricao: 'Forma de pagamento', exemplo: 'PIX', categoria: 'Totais' },
    { placeholder: '[valor_pago]', descricao: 'Valor pago', exemplo: '500.00', categoria: 'Totais' },
    { placeholder: '[saldo_anterior]', descricao: 'Saldo anterior do cliente', exemplo: '150.00', categoria: 'Totais' },

    // Receitas fixas
    { placeholder: '[caixa_inicial]', descricao: 'Caixa inicial', exemplo: '100.00', categoria: 'Receitas' },
    { placeholder: '[reforco]', descricao: 'Reforço', exemplo: '50.00', categoria: 'Receitas' },
    { placeholder: '[leitura]', descricao: 'Leitura (total automático)', exemplo: '750.00', categoria: 'Receitas' },
    { placeholder: '[caixa_final]', descricao: 'Caixa final', exemplo: '900.00', categoria: 'Receitas' },

    // Despesas fixas
    { placeholder: '[uber]', descricao: 'Uber', exemplo: '30.00', categoria: 'Despesas' },
    { placeholder: '[mercado]', descricao: 'Mercado', exemplo: '200.00', categoria: 'Despesas' },
    { placeholder: '[gasolina]', descricao: 'Gasolina', exemplo: '50.00', categoria: 'Despesas' },
    { placeholder: '[vales]', descricao: 'Vales', exemplo: '20.00', categoria: 'Despesas' },
    { placeholder: '[bonus]', descricao: 'Bônus', exemplo: '10.00', categoria: 'Despesas' },
    { placeholder: '[diaria]', descricao: 'Diária', exemplo: '40.00', categoria: 'Despesas' },
    { placeholder: '[horas_extras]', descricao: 'Horas extras', exemplo: '15.00', categoria: 'Despesas' },
    { placeholder: '[dinheiro]', descricao: 'Dinheiro', exemplo: '100.00', categoria: 'Despesas' },
  ];

  // Campos dinâmicos de máquinas (por código)
  codigosMaquinas.forEach(codigo => {
    const key = normalizarChave(codigo);
    campos.push(
      { placeholder: `[${key}_entrada_anterior]`, descricao: `Entrada anterior da máquina ${codigo}`, exemplo: '10000', categoria: 'Máquinas' },
      { placeholder: `[${key}_entrada_nova]`, descricao: `Entrada nova (atual) da máquina ${codigo}`, exemplo: '11234', categoria: 'Máquinas' },
      { placeholder: `[${key}_entrada]`, descricao: `Diferença de entrada da máquina ${codigo} (nova - anterior)`, exemplo: '1234', categoria: 'Máquinas' },
      { placeholder: `[${key}_saida_anterior]`, descricao: `Saída anterior da máquina ${codigo}`, exemplo: '5000', categoria: 'Máquinas' },
      { placeholder: `[${key}_saida_nova]`, descricao: `Saída nova (atual) da máquina ${codigo}`, exemplo: '5567', categoria: 'Máquinas' },
      { placeholder: `[${key}_saida]`, descricao: `Diferença de saída da máquina ${codigo} (nova - anterior)`, exemplo: '567', categoria: 'Máquinas' },
      { placeholder: `[${key}_movimento]`, descricao: `Movimento da máquina ${codigo} (valor em R$ = entrada - saída × moeda)`, exemplo: '667.00', categoria: 'Máquinas' },
      { placeholder: `[${key}_saldo]`, descricao: `Saldo da máquina ${codigo} (igual ao movimento, em R$)`, exemplo: '667.00', categoria: 'Máquinas' },
    );
  });

  // Campos indexados (genéricos) — [maquina1_codigo], [maquina1_entrada], etc.
  // Permitem usar o mesmo gabarito para qualquer cliente, independentemente dos códigos das máquinas.
  // A numeração segue a ordem das máquinas no relatório (1, 2, 3, ...).
  for (let i = 1; i <= 30; i++) {
    campos.push(
      { placeholder: `[maquina${i}_codigo]`, descricao: `Código/nome da ${i}ª máquina`, exemplo: i === 1 ? 'B3' : i === 2 ? 'TURBO M.' : 'M001', categoria: 'Máquinas' },
      { placeholder: `[maquina${i}_numero]`, descricao: `Número sequencial da ${i}ª máquina`, exemplo: String(i), categoria: 'Máquinas' },
      { placeholder: `[maquina${i}_multiplicador]`, descricao: `Multiplicador da moeda da ${i}ª máquina (0.01, 0.05, 0.10, 0.25)`, exemplo: '0.25', categoria: 'Máquinas' },
      { placeholder: `[maquina${i}_entrada_anterior]`, descricao: `Entrada anterior da ${i}ª máquina`, exemplo: '10000', categoria: 'Máquinas' },
      { placeholder: `[maquina${i}_entrada_nova]`, descricao: `Entrada nova (atual) da ${i}ª máquina`, exemplo: '11234', categoria: 'Máquinas' },
      { placeholder: `[maquina${i}_entrada]`, descricao: `Diferença de entrada da ${i}ª máquina`, exemplo: '1234', categoria: 'Máquinas' },
      { placeholder: `[maquina${i}_saida_anterior]`, descricao: `Saída anterior da ${i}ª máquina`, exemplo: '5000', categoria: 'Máquinas' },
      { placeholder: `[maquina${i}_saida_nova]`, descricao: `Saída nova (atual) da ${i}ª máquina`, exemplo: '5567', categoria: 'Máquinas' },
      { placeholder: `[maquina${i}_saida]`, descricao: `Diferença de saída da ${i}ª máquina`, exemplo: '567', categoria: 'Máquinas' },
      { placeholder: `[maquina${i}_movimento]`, descricao: `Movimento da ${i}ª máquina (valor em R$)`, exemplo: '667.00', categoria: 'Máquinas' },
      { placeholder: `[maquina${i}_saldo]`, descricao: `Saldo da ${i}ª máquina (em R$)`, exemplo: '667.00', categoria: 'Máquinas' },
    );
  }

  return campos;
}

// ============================================
// CONSTRUÇÃO DO DICIONÁRIO DE DADOS
// ============================================

/**
 * Constrói um dicionário chave→valor a partir dos dados do relatório.
 * As chaves são normalizadas (sem acento, lowercase, underscore).
 *
 * Placeholders suportados:
 * - [cliente], [data], [turno], [operador], [modo_operacao], [acerto_percentual]
 * - [jogado], [cliente_parte], [receita], [despesa], [debito_saldo], [fechamento]
 * - [recebido], [forma_pagamento], [valor_pago], [saldo_anterior]
 * - [caixa_inicial], [reforco], [leitura], [caixa_final] (receitas fixas)
 * - [uber], [mercado], [gasolina], [vales], [bonus], [diaria], [horas_extras], [dinheiro] (despesas fixas)
 * - [cartao1], [cartao2] — valor dos campos de cartão (usa nomeCartao1/nomeCartao2 do cliente)
 * - [<codigo_maquina>_entrada], [<codigo_maquina>_saida], [<codigo_maquina>_saldo] — por máquina
 * - [<qualquer_descricao_normalizada>] — busca em receitas e despesas pela descrição
 */
export function construirDicionario(data: PlanilhaData, nomeCartao1?: string, nomeCartao2?: string): Record<string, string | number> {
  const dict: Record<string, string | number> = {};

  // Geral
  dict['cliente'] = data.cliente;
  dict['data'] = data.data;
  dict['turno'] = data.turno;
  dict['operador'] = data.operador;
  dict['modo_operacao'] = data.modoOperacao;
  dict['acerto_percentual'] = data.acertoPercentual;

  // Totais
  dict['jogado'] = data.jogado;
  dict['cliente_parte'] = data.clienteParte;
  dict['leituraatual'] = data.leituraAtual;
  dict['leituraanterior'] = data.leituraAnterior;
  dict['receita'] = data.receita;
  dict['despesa'] = data.despesa;
  dict['debito_saldo'] = data.debitoSaldo;
  dict['fechamento'] = data.fechamento;
  dict['recebido'] = data.recebido;
  dict['forma_pagamento'] = data.formaPagamento;
  dict['valor_pago'] = data.valorPago;
  dict['saldo_anterior'] = data.saldoAnterior;

  // Receitas (por descrição normalizada)
  Object.entries(data.receitas).forEach(([desc, valor]) => {
    const key = normalizarChave(desc);
    if (key) dict[key] = valor;
  });

  // Despesas (por descrição normalizada)
  Object.entries(data.despesas).forEach(([desc, valor]) => {
    const key = normalizarChave(desc);
    // Não sobrescreve se já existe em receitas com mesmo nome (improvável)
    if (key && !(key in dict)) dict[key] = valor;
  });

  // Cartões — mapeia pelo nome customizado do cliente
  // Ex: se nomeCartao1 = "CARTÃO MAQUININHA", placeholder = [cartao_maquininha]
  if (nomeCartao1) {
    const key1 = normalizarChave(nomeCartao1);
    if (key1 && !(key1 in dict)) dict[key1] = data.despesas[normalizarChave(nomeCartao1)] ?? 0;
  }
  if (nomeCartao2) {
    const key2 = normalizarChave(nomeCartao2);
    if (key2 && !(key2 in dict)) dict[key2] = data.despesas[normalizarChave(nomeCartao2)] ?? 0;
  }

  // Máquinas — dois modos de placeholder:
  // 1. Por código: [b3_entrada], [turbo_m_saida], etc. (específico da máquina)
  // 2. Indexado (genérico): [maquina1_codigo], [maquina1_entrada], etc.
  //    — permite usar o mesmo gabarito para qualquer cliente
  data.maquinas.forEach((m, index) => {
    const num = index + 1; // 1-based

    // 1. Por código (normalizado)
    const key = normalizarChave(m.codigo);
    if (key) {
      dict[`${key}_entrada_anterior`] = m.entradaAnterior;
      dict[`${key}_entrada_nova`] = m.entradaNova;
      dict[`${key}_entrada`] = m.diferencaEntrada;
      dict[`${key}_saida_anterior`] = m.saidaAnterior;
      dict[`${key}_saida_nova`] = m.saidaNova;
      dict[`${key}_saida`] = m.diferencaSaida;
      dict[`${key}_movimento`] = m.saldo;
      dict[`${key}_saldo`] = m.saldo;
    }

    // 2. Indexado (genérico) — [maquina1_codigo], [maquina1_entrada], etc.
    dict[`maquina${num}_codigo`] = m.codigo;
    dict[`maquina${num}_numero`] = num; // número sequencial da máquina (1, 2, 3, ...)
    dict[`maquina${num}_tipo`] = m.tipo;
    dict[`maquina${num}_entrada_anterior`] = m.entradaAnterior;
    dict[`maquina${num}_entrada_nova`] = m.entradaNova;
    dict[`maquina${num}_entrada`] = m.diferencaEntrada;
    dict[`maquina${num}_saida_anterior`] = m.saidaAnterior;
    dict[`maquina${num}_saida_nova`] = m.saidaNova;
    dict[`maquina${num}_saida`] = m.diferencaSaida;
    dict[`maquina${num}_movimento`] = m.saldo;
    dict[`maquina${num}_saldo`] = m.saldo;
    dict[`maquina${num}_moeda`] = m.moeda; // código da moeda: M001, M005, M010, M025
    dict[`maquina${num}_multiplicador`] = MOEDA_MULT[m.moeda] ?? 0.01; // valor do multiplicador (0.01, 0.05, 0.10, 0.25)
  });

  return dict;
}

// ============================================
// PARSING E GERAÇÃO DA PLANILHA
// ============================================

/**
 * Lê uma planilha gabarito (base64 data URL), substitui os placeholders
 * pelos valores reais e retorna um novo arquivo .xlsx como Blob.
 *
 * Usa ExcelJS para preservar formatação (cores, bordas, merges, fontes).
 *
 * @param gabaritoBase64 — data URL (ex: "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,...")
 * @param dicionario — mapa chave→valor com os dados do relatório
 * @returns Blob do arquivo .xlsx gerado
 */
export async function gerarPlanilhaPreenchida(
  gabaritoBase64: string,
  dicionario: Record<string, string | number>
): Promise<Blob> {
  // Converter base64 para Buffer
  const base64Data = gabaritoBase64.includes(',') ? gabaritoBase64.split(',')[1] : gabaritoBase64;
  const buffer = Buffer.from(base64Data, 'base64');

  // Escrever para arquivo temporário (ExcelJS precisa de arquivo ou stream)
  const tmpFile = `/tmp/gabarito_${Date.now()}.xlsx`;
  const fs = await import('fs');
  fs.writeFileSync(tmpFile, buffer);

  // Ler com ExcelJS — preserva formatação
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(tmpFile);

  // Para cada sheet, substitui placeholders em todas as células
  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        const valorOriginal = cell.value != null ? String(cell.value) : '';
        if (!valorOriginal.includes('[')) return;

        // Substitui todos os placeholders [chave] encontrados
        const valorSubstituido = valorOriginal.replace(/\[([^\]]+)\]/g, (match, key) => {
          const normalizedKey = normalizarChave(key);
          if (normalizedKey in dicionario) {
            return String(dicionario[normalizedKey]);
          }
          return match; // mantém placeholder se não encontrado
        });

        // Salvar estilo, alterar valor, restaurar estilo
        const savedFill = cell.fill;
        const savedFont = cell.font;
        const savedBorder = cell.border;
        const savedAlignment = cell.alignment;
        const savedNumFmt = cell.numFmt;

        // Se o valor substituído é puramente numérico, manter como número
        const numVal = Number(valorSubstituido);
        if (!isNaN(numVal) && valorSubstituido !== '' && !valorSubstituido.includes('[')) {
          cell.value = numVal;
        } else {
          cell.value = valorSubstituido;
        }

        // Restaurar estilo
        if (savedFill) cell.fill = savedFill;
        if (savedFont) cell.font = savedFont;
        if (savedBorder) cell.border = savedBorder;
        if (savedAlignment) cell.alignment = savedAlignment;
        if (savedNumFmt) cell.numFmt = savedNumFmt;
      });
    });
  });

  // Salvar arquivo preenchido
  const outFile = `/tmp/planilha_preenchida_${Date.now()}.xlsx`;
  await workbook.xlsx.writeFile(outFile);

  // Ler arquivo e converter para Blob
  const outBuffer = fs.readFileSync(outFile);

  // Limpar arquivos temporários
  try { fs.unlinkSync(tmpFile); } catch {}
  try { fs.unlinkSync(outFile); } catch {}

  return new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Helper para evitar warning de variável não usada
function matchOriginal(_v: string): string {
  return '';
}

// ============================================
// VALIDAÇÃO DE GABARITO
// ============================================

/**
 * Lê uma planilha gabarito e retorna a lista de placeholders encontrados.
 * Útil para validar se o cliente está usando os campos corretos.
 */
export function analisarPlaceholdersGabarito(gabaritoBase64: string): string[] {
  try {
    const base64Data = gabaritoBase64.includes(',') ? gabaritoBase64.split(',')[1] : gabaritoBase64;
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const workbook = XLSX.read(bytes, { type: 'array' });
    const placeholders = new Set<string>();

    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return;

      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
      for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = sheet[cellAddress];
          if (!cell) continue;

          const valor = cell.v != null ? String(cell.v) : '';
          const matches = valor.match(/\[([^\]]+)\]/g);
          if (matches) {
            matches.forEach(m => placeholders.add(m));
          }
        }
      }
    });

    return Array.from(placeholders);
  } catch (e) {
    console.error('Erro ao analisar gabarito:', e);
    return [];
  }
}
