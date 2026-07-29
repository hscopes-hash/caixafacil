import { db } from '@/lib/db';
import { isSuperAdmin } from '@/lib/auth';
import type { NextRequest } from 'next/server';

/**
 * Módulo central de enforcement de planos SaaS.
 * Verifica limites de recursos, features e status da assinatura.
 * Super administradores (nivelAcesso ADMINISTRADOR) bypassam todas as restrições.
 *
 * Uso nos endpoints:
 *   const check = await enforcePlan(empresaId, { limit: 'clientes' }, request);
 *   if (check.error) return NextResponse.json({ error: check.error }, { status: 403 });
 */

type LimitType = 'clientes' | 'usuarios' | 'maquinas';
type FeatureType = 'recIA' | 'recChatIA' | 'recRelatorios' | 'recBackup' | 'recAPI';

export interface PlanInfo {
  planoId: string;
  planoNome: string;
  statusAssinatura: string;
  limiteClientes: number;
  limiteUsuarios: number;
  limiteMaquinas: number;
  recIA: boolean;
  recChatIA: boolean;
  recRelatorios: boolean;
  recBackup: boolean;
  recAPI: boolean;
  recSuporte: string;
  usadosClientes: number;
  usadosUsuarios: number;
  usadosMaquinas: number;
}

// Cache simples (30s) para evitar queries repetidas na mesma request
let cacheKey = '';
let cacheResult: PlanInfo | null = null;
let cacheTime = 0;
const CACHE_TTL = 30_000;

async function getPlanInfo(empresaId: string, request?: NextRequest): Promise<PlanInfo | null> {
  // Super admin: retornar plano sem limites
  if (request && await isSuperAdmin(request)) {
    return {
      planoId: '',
      planoNome: 'Super Admin (sem limites)',
      statusAssinatura: 'ATIVA',
      limiteClientes: -1,
      limiteUsuarios: -1,
      limiteMaquinas: -1,
      recIA: true,
      recChatIA: true,
      recRelatorios: true,
      recBackup: true,
      recAPI: true,
      recSuporte: '24h',
      usadosClientes: 0,
      usadosUsuarios: 0,
      usadosMaquinas: 0,
    };
  }

  const now = Date.now();
  if (cacheKey === empresaId && cacheResult && now - cacheTime < CACHE_TTL) {
    return cacheResult;
  }

  try {
    // Contar recursos usados em paralelo
    const [usadosClientes, usadosUsuarios, usadosMaquinas] = await Promise.all([
      db.cliente.count({ where: { empresaId } }),
      db.usuario.count({ where: { empresaId } }),
      db.maquina.count({ where: { cliente: { empresaId } } }),
    ]);

    // 1) Buscar assinatura SaaS ativa da empresa
    const assinatura = await db.assinaturaSaaS.findFirst({
      where: { empresaId },
      include: { planoSaaS: true },
      orderBy: { createdAt: 'desc' },
    });

    if (assinatura && assinatura.planoSaaS) {
      const plano = assinatura.planoSaaS;
      cacheKey = empresaId;
      cacheTime = now;
      cacheResult = {
        planoId: plano.id,
        planoNome: plano.nome,
        statusAssinatura: assinatura.status,
        limiteClientes: plano.limiteClientes,
        limiteUsuarios: plano.limiteUsuarios,
        limiteMaquinas: plano.limiteMaquinas,
        recIA: plano.recIA,
        recChatIA: plano.recChatIA,
        recRelatorios: plano.recRelatorios,
        recBackup: plano.recBackup,
        recAPI: plano.recAPI,
        recSuporte: plano.recSuporte,
        usadosClientes,
        usadosUsuarios,
        usadosMaquinas,
      };
      return cacheResult;
    }

    // 2) Sem assinatura SaaS: buscar plano GRATUITO no cadastro de planos
    //    (plano gratuito deve estar cadastrado na tabela planos_saas)
    const planoGratuito = await db.planoSaaS.findFirst({
      where: {
        ativo: true,
        // Identificar plano gratuito por nome (case insensitive) ou valor 0
        OR: [
          { nome: { contains: 'ratur', mode: 'insensitive' } },
          { nome: { contains: 'free', mode: 'insensitive' } },
          { valorMensal: 0 },
        ],
      },
      orderBy: { ordem: 'asc' },
    });

    if (planoGratuito) {
      cacheKey = empresaId;
      cacheTime = now;
      cacheResult = {
        planoId: planoGratuito.id,
        planoNome: planoGratuito.nome,
        statusAssinatura: 'SEM_ASSINATURA',
        limiteClientes: planoGratuito.limiteClientes,
        limiteUsuarios: planoGratuito.limiteUsuarios,
        limiteMaquinas: planoGratuito.limiteMaquinas,
        recIA: planoGratuito.recIA,
        recChatIA: planoGratuito.recChatIA,
        recRelatorios: planoGratuito.recRelatorios,
        recBackup: planoGratuito.recBackup,
        recAPI: planoGratuito.recAPI,
        recSuporte: planoGratuito.recSuporte,
        usadosClientes,
        usadosUsuarios,
        usadosMaquinas,
      };
      return cacheResult;
    }

    // 3) Fallback final: plano gratuito hardcoded (mínimo viável)
    //    Só usado se não houver plano gratuito cadastrado no banco
    console.warn('[PLAN-ENFORCEMENT] Nenhum plano gratuito cadastrado no banco. Usando fallback hardcoded.');
    cacheKey = empresaId;
    cacheTime = now;
    cacheResult = {
      planoId: '',
      planoNome: 'Gratuito (fallback)',
      statusAssinatura: 'SEM_ASSINATURA',
      limiteClientes: 3,
      limiteUsuarios: 1,
      limiteMaquinas: 2,
      recIA: false,
      recChatIA: false,
      recRelatorios: false,
      recBackup: false,
      recAPI: false,
      recSuporte: 'email',
      usadosClientes,
      usadosUsuarios,
      usadosMaquinas,
    };
    return cacheResult;
  } catch (error) {
    console.error('[PLAN-ENFORCEMENT] Erro ao buscar info do plano:', error);
    return null;
  }
}

/**
 * Verifica se a assinatura da empresa está ativa.
 * Super admin (ADMINISTRADOR) bypassa todas as restrições.
 */
export async function checkSubscriptionStatus(empresaId: string, request?: NextRequest): Promise<{ error?: string }> {
  // Super admin bypassa todas as restrições
  if (request && await isSuperAdmin(request)) return {};

  const info = await getPlanInfo(empresaId, request);

  if (!info) {
    return {}; // Falha técnica = não bloqueia
  }

  const bloqueantes = ['VENCIDA', 'CANCELADA', 'SUSPENSA'];
  if (bloqueantes.includes(info.statusAssinatura)) {
    const msg = info.statusAssinatura === 'VENCIDA'
      ? 'Sua assinatura está vencida. Renove para continuar usando o sistema.'
      : info.statusAssinatura === 'CANCELADA'
        ? 'Sua assinatura foi cancelada. Assine um plano para continuar.'
        : 'Sua assinatura está suspensa. Entre em contato com o suporte.';
    return { error: msg };
  }

  return {};
}

/**
 * Verifica se a empresa pode criar mais um recurso do tipo especificado.
 * Super admin (ADMINISTRADOR) bypassa todas as restrições.
 */
export async function checkLimit(empresaId: string, tipo: LimitType, request?: NextRequest): Promise<{ error?: string; usados?: number; limite?: number }> {
  // Super admin bypassa todas as restrições
  if (request && await isSuperAdmin(request)) return {};

  const info = await getPlanInfo(empresaId, request);

  if (!info) return {};

  const limites: Record<LimitType, number> = {
    clientes: info.limiteClientes,
    usuarios: info.limiteUsuarios,
    maquinas: info.limiteMaquinas,
  };
  const usados: Record<LimitType, number> = {
    clientes: info.usadosClientes,
    usuarios: info.usadosUsuarios,
    maquinas: info.usadosMaquinas,
  };

  const limite = limites[tipo];
  const usado = usados[tipo];

  if (limite === -1) return {};

  if (usado >= limite) {
    const labels: Record<LimitType, string> = {
      clientes: 'clientes',
      usuarios: 'usuários',
      maquinas: 'máquinas',
    };
    return {
      error: `Limite do plano ${info.planoNome} atingido: ${usado}/${limite} ${labels[tipo]}. Faça upgrade do plano para adicionar mais.`,
      usados: usado,
      limite,
    };
  }

  return { usados: usado, limite };
}

/**
 * Verifica se a empresa tem acesso a uma feature específica.
 * Super admin (ADMINISTRADOR) bypassa todas as restrições.
 */
export async function checkFeature(empresaId: string, feature: FeatureType, request?: NextRequest): Promise<{ error?: string }> {
  // Super admin bypassa todas as restrições
  if (request && await isSuperAdmin(request)) return {};

  const info = await getPlanInfo(empresaId, request);

  if (!info) return {};

  const features: Record<FeatureType, boolean> = {
    recIA: info.recIA,
    recChatIA: info.recChatIA,
    recRelatorios: info.recRelatorios,
    recBackup: info.recBackup,
    recAPI: info.recAPI,
  };

  if (!features[feature]) {
    const labels: Record<FeatureType, string> = {
      recIA: 'IA Vision (OCR)',
      recChatIA: 'Chat IA (assistente)',
      recRelatorios: 'Relatórios avançados',
      recBackup: 'Backup automático',
      recAPI: 'API dedicada',
    };
    return {
      error: `O recurso "${labels[feature]}" não está disponível no seu plano (${info.planoNome}). Faça upgrade para acessar.`,
    };
  }

  return {};
}

/**
 * Verificação completa: status + limite de recurso + feature.
 * Super admin (ADMINISTRADOR) bypassa todas as restrições.
 */
export async function enforcePlan(
  empresaId: string,
  options?: {
    limit?: LimitType;
    feature?: FeatureType;
  },
  request?: NextRequest,
): Promise<{ error?: string }> {
  // Super admin bypassa todas as restrições (check rápido, antes de qualquer query)
  if (request && await isSuperAdmin(request)) return {};

  // 1) Verificar status da assinatura
  const statusCheck = await checkSubscriptionStatus(empresaId, request);
  if (statusCheck.error) return statusCheck;

  // 2) Verificar limite de recurso
  if (options?.limit) {
    const limitCheck = await checkLimit(empresaId, options.limit, request);
    if (limitCheck.error) return limitCheck;
  }

  // 3) Verificar feature
  if (options?.feature) {
    const featureCheck = await checkFeature(empresaId, options.feature, request);
    if (featureCheck.error) return featureCheck;
  }

  return {};
}

/**
 * Retorna info completa do plano para uso no frontend.
 */
export async function getPlanInfoForFrontend(empresaId: string, request?: NextRequest): Promise<PlanInfo | null> {
  return getPlanInfo(empresaId, request);
}
