import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { useAuthStore } from '@/lib/auth';

// Tabelas que podem ser exportadas (apenas do cliente ativo)
const TABELAS_DISPONIVEIS = [
  { nome: 'leituras', label: 'Leituras', tabela: 'leitura' },
  { nome: 'clientes', label: 'Clientes', tabela: 'cliente' },
  { nome: 'maquinas', label: 'Máquinas', tabela: 'maquina' },
  { nome: 'pagamentos', label: 'Pagamentos / Contas', tabela: 'conta' },
  { nome: 'usuarios', label: 'Usuários', tabela: 'usuario' },
  { nome: 'tipos_maquina', label: 'Tipos de Máquina', tabela: 'tipo_maquina' },
  { nome: 'debitos', label: 'Débitos', tabela: 'debito' },
];

// GET — lista tabelas disponíveis para backup
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      tabelas: TABELAS_DISPONIVEIS.map(t => ({ nome: t.nome, label: t.label })),
    });
  } catch (error) {
    console.error('[BACKUP] Erro ao listar tabelas:', error);
    return NextResponse.json({ error: 'Erro ao listar tabelas' }, { status: 500 });
  }
}

// POST — exporta dados de uma tabela específica do cliente ativo
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tabela: tabelaNome, empresaId } = body;

    if (!tabelaNome) {
      return NextResponse.json({ error: 'Tabela não especificada' }, { status: 400 });
    }

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId é obrigatório' }, { status: 400 });
    }

    const tabelaInfo = TABELAS_DISPONIVEIS.find(t => t.nome === tabelaNome);
    if (!tabelaInfo) {
      return NextResponse.json({ error: 'Tabela inválida' }, { status: 400 });
    }

    const prismaModel = tabelaInfo.tabela as keyof typeof db;

    // Buscar TODOS os registros da tabela filtrados por empresaId
    // (exceto usuarios que filtra por empresaId, e tipos_maquina que é global)
    let dados: any[] = [];
    const model = db[prismaModel] as any;

    if (tabelaNome === 'usuarios') {
      dados = await model.findMany({ where: { empresaId } });
    } else if (tabelaNome === 'tipos_maquina') {
      // Tipos de máquina são globais (não filtrados por empresa)
      dados = await model.findMany();
    } else {
      dados = await model.findMany({ where: { empresaId } });
    }

    console.log(`[BACKUP] Tabela ${tabelaNome}: ${dados.length} registros exportados (empresaId=${empresaId})`);

    return NextResponse.json({
      success: true,
      tabela: tabelaNome,
      label: tabelaInfo.label,
      totalRegistros: dados.length,
      dados,
      exportadoEm: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[BACKUP] Erro ao exportar:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro ao exportar: ${errorMessage}` }, { status: 500 });
  }
}
