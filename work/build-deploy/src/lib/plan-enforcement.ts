import { db } from '@/lib/db';
import { isSuperAdmin } from '@/lib/auth';
import type { NextRequest } from 'next/server';

/**
 * Modulo central de enforcement de planos SaaS.
 * Verifica limites de recursos, features e status da assinatura.
 * Super administradores (nivelAcesso ADMINISTRADOR) bypassam todas as restricoes.
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

/**
 * Mapa de features do enum Empresa.plano (sistema legado).
 * Usado como fallback quando nao existe AssinaturaSaaS ativa.
 */
const PLANO_LEGADO_MAP: Record<string, {
  planoNome: string;
  limiteClientes: number;
  limiteUsuarios: number;
  limiteMaquinas: number;
  recIA: boolean;
  recChatIA: boolean;
  recRelatorios: boolean;
  recBackup: boolean;
  recAPI: boolean;
  recSuporte: string;
}> = {
  BASICO: {
    planoNome: 'Basico',
    limiteClientes: 5,
    limiteUsuarios: 1,
    limiteMaquinas: 2,
    recIA: false,
    recChatIA: false,
    recRelatorios: false,
    recBackup: false,
    recAPI: false,
    recSuporte: 'email',
  },
  PROFISSIONAL: {
    planoNome: 'Profissional',
    limiteClientes: 100,
    limiteUsuarios: 5,
    limiteMaquinas: 50,
    recIA: true,
    recChatIA: true,
    recRelatorios: true,
    recBackup: true,
    recAPI: false,
    recSuporte: 'prioritario',
  },
  PREMIUM: {
    planoNome: 'Premium',
    limiteClientes: 500,
    limiteUsuarios: 15,
    limiteMaquinas: 50,
    recIA: true,
    recChatIA: true,
    recRelatorios: true,
    recBackup: true,
    recAPI: true,
    recSuporte: 'prioritario',
  },
  ENTERPRISE: {
    planoNome: 'Enterprise',
    limiteClientes: -1,
    limiteUsuarios: -1,
    limiteMaquinas: -1,
    recIA: true,
    recChatIA: true,
    recRelatorios: true,
    recBackup: true,
    recAPI: true,
    recSuporte: '24h',
  },
};

async function getPlanInfo(empresaId: string, request?: NextRequest): Promise<PlanInfo | null> {
  // Super admin: retornar plano ENTERPRISE (sem limites)
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
    // Contar recursos usados em paralelo (necessario para todos os caminhos)
    const [usadosClientes, usadosUsuarios, usadosMaquinas] = await Promise.all([
      db.cliente.count({ where: { empresaId } }),
      db.usuario.count({ where: { empresaId } }),
      db.maquina.count({ where: { cliente: { empresaId } } }),
    ]);

    // 1) Tentar buscar assinatura SaaS (sistema novo)
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

    // 2) Fallback: buscar Empresa.plano (enum legado)
    const empresa = await db.empresa.findUnique({
      where: { id: empresaId },
      select: { plano: true },
    });

    const planoLegado = empresa?.plano ? PLANO_LEGADO_MAP[empresa.plano] : null;

    if (planoLegado) {
      console.log(`[PLAN-ENFORCEMENT] Usando plano legado Empresa.plano=${empresa.plano} para empresa ${empresaId}`);
      cacheKey = empresaId;
      cacheTime = now;
      cacheResult = {
        planoId: '',
        planoNome: planoLegado.planoNome,
        statusAssinatura: 'ATIVA',
        limiteClientes: planoLegado.limiteClientes,
        limiteUsuarios: planoLegado.limiteUsuarios,
        limiteMaquinas: planoLegado.limiteMaquinas,
        recIA: planoLegado.recIA,
        recChatIA: planoLegado.recChatIA,
        recRelatorios: planoLegado.recRelatorios,
        recBackup: planoLegado.recBackup,
        recAPI: planoLegado.recAPI,
        recSuporte: planoLegado.recSuporte,
        usadosClientes,
        usadosUsuarios,
        usadosMaquinas,
      };
      return cacheResult;
    }

    // 3) Sem plano definido = Gratuito padrao
    cacheKey = empresaId;
    cacheTime = now;
    cacheResult = {
      planoId: '',
      planoNome: 'Gratuito (padrao)',
      statusAssinatura: 'SEM_ASSINATURA',
      limiteClientes: 5,
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
 * Verifica se a assinatura da empresa esta ativa.
 * Super admin (ADMINISTRADOR) bypassa todas as restricoes.
 */
export async function checkSubscriptionStatus(empresaId: string, request?: NextRequest): Promise<{ error?: string }> {
  // Super admin bypassa todas as restricoes
  if (request && await isSuperAdmin(request)) return {};

  const info = await getPlanInfo(empresaId, request);

  if (!info) {
    return {}; // Falha tecnica = nao bloqueia
  }

  const bloqueantes = ['VENCIDA', 'CANCELADA', 'SUSPENSA'];
  if (bloqueantes.includes(info.statusAssinatura)) {
    const msg = info.statusAssinatura === 'VENCIDA'
      ? 'Sua assinatura esta vencida. Renove para continuar usando o sistema.'
      : info.statusAssinatura === 'CANCELADA'
        ? 'Sua assinatura foi cancelada. Assine um plano para continuar.'
        : 'Sua assinatura esta suspensa. Entre em contato com o suporte.';
    return { error: msg };
  }

  return {};
}

/**
 * Verifica se a empresa pode criar mais um recurso do tipo especificado.
 * Super admin (ADMINISTRADOR) bypassa todas as restricoes.
 */
export async function checkLimit(empresaId: string, tipo: LimitType, request?: NextRequest): Promise<{ error?: string; usados?: number; limite?: number }> {
  // Super admin bypassa todas as restricoes
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
      usuarios: 'usuarios',
      maquinas: 'maquinas',
    };
    return {
      error: `Limite do plano ${info.planoNome} atingido: ${usado}/${limite} ${labels[tipo]}. Faca upgrade do plano para adicionar mais.`,
      usados: usado,
      limite,
    };
  }

  return { usados: usado, limite };
}

/**
 * Verifica se a empresa tem acesso a uma feature especifica.
 * Super admin (ADMINISTRADOR) bypassa todas as restricoes.
 */
export async function checkFeature(empresaId: string, feature: FeatureType, request?: NextRequest): Promise<{ error?: string }> {
  // Super admin bypassa todas as restricoes
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
      recRelatorios: 'Relatorios avancados',
      recBackup: 'Backup automatico',
      recAPI: 'API dedicada',
    };
    return {
      error: `O recurso "${labels[feature]}" nao esta disponivel no seu plano (${info.planoNome}). Faca upgrade para acessar.`,
    };
  }

  return {};
}

/**
 * Verificacao completa: status + limite de recurso + feature.
 * Super admin (ADMINISTRADOR) bypassa todas as restricoes.
 */
export async function enforcePlan(
  empresaId: string,
  options?: {
    limit?: LimitType;
    feature?: FeatureType;
  },
  request?: NextRequest,
): Promise<{ error?: string }> {
  // Super admin bypassa todas as restricoes (check rapido, antes de qualquer query)
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
