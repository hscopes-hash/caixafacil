import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Default permissions per access level
const DEFAULT_PERMISSOES: Record<string, string[]> = {
  ADMINISTRADOR: [
    'dashboard', 'clientes', 'maquinas', 'tipos-maquina', 'leituras',
    'fluxo-caixa', 'usuarios', 'relatorios', 'assinatura', 'grua', 'backup-restore', 'configuracoes-empresa',
  ],
  SUPERVISOR: [
    'dashboard', 'clientes', 'maquinas', 'leituras',
    'fluxo-caixa', 'relatorios', 'assinatura', 'grua',
  ],
  OPERADOR: [
    'dashboard', 'clientes', 'maquinas', 'leituras',
    'fluxo-caixa', 'relatorios', 'assinatura',
  ],
};

const NIVEIS_VALIDOS = ['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR'];

/** Ensure the permissoes column exists on config_saas (self-healing) */
async function ensureColumn(): Promise<void> {
  try {
    await db.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'config_saas' AND column_name = 'permissoes'
        ) THEN
          ALTER TABLE "config_saas" ADD COLUMN "permissoes" TEXT;
        END IF;
      END $$;
    `);
  } catch (err) {
    console.error('[SAAS-PERMISSOES] Could not auto-create column:', err instanceof Error ? err.message : err);
  }
}

/** Read the permissoes JSON from the first ConfigSaaS row, or return defaults */
async function getPermissoesMap(): Promise<Record<string, string[]>> {
  try {
    const rows = await db.$queryRawUnsafe(`SELECT permissoes FROM "config_saas" LIMIT 1`) as any[];
    const raw = rows[0]?.permissoes;
    if (raw) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return { ...DEFAULT_PERMISSOES, ...parsed };
      } catch {
        // corrupted JSON — fall back to defaults
      }
    }
  } catch {
    // table or column might not exist yet — return defaults
  }
  return { ...DEFAULT_PERMISSOES };
}

/** Persist the full permissoes map back to ConfigSaaS */
async function savePermissoesMap(map: Record<string, string[]>): Promise<void> {
  const json = JSON.stringify(map);
  const count = await db.$queryRawUnsafe(`SELECT COUNT(*)::int as c FROM "config_saas"`) as any[];
  if (count[0]?.c > 0) {
    await db.$executeRawUnsafe(
      `UPDATE "config_saas" SET "permissoes" = $1, "updatedAt" = CURRENT_TIMESTAMP`,
      json
    );
  } else {
    await db.$executeRawUnsafe(
      `INSERT INTO "config_saas" ("permissoes") VALUES ($1)`,
      json
    );
  }
}

// GET — Return permissions for a specific nivel or all levels
export async function GET(request: NextRequest) {
  try {
    await ensureColumn();

    const nivel = request.nextUrl.searchParams.get('nivel');
    const map = await getPermissoesMap();

    if (nivel) {
      if (!NIVEIS_VALIDOS.includes(nivel)) {
        return NextResponse.json(
          { error: `Nível inválido. Use: ${NIVEIS_VALIDOS.join(', ')}` },
          { status: 400 }
        );
      }
      return NextResponse.json({
        success: true,
        nivel,
        permissoes: map[nivel] || DEFAULT_PERMISSOES[nivel] || [],
      });
    }

    // No nivel param — return all levels in the format expected by the frontend
    const allLevels = NIVEIS_VALIDOS.map(n => ({
      nivel: n,
      menuPermitidos: map[n] || DEFAULT_PERMISSOES[n] || [],
    }));

    return NextResponse.json({ success: true, permissoes: allLevels });
  } catch (error) {
    console.error('[SAAS-PERMISSOES] Erro ao buscar:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// PUT — Save permissions for a given nivel
export async function PUT(request: NextRequest) {
  try {
    await ensureColumn();

    const body = await request.json();
    const { nivel, menuPermitidos } = body;

    if (!nivel || !Array.isArray(menuPermitidos)) {
      return NextResponse.json(
        { error: 'nivel e menuPermitidos (array) são obrigatórios' },
        { status: 400 }
      );
    }

    if (!NIVEIS_VALIDOS.includes(nivel)) {
      return NextResponse.json(
        { error: `Nível inválido. Use: ${NIVEIS_VALIDOS.join(', ')}` },
        { status: 400 }
      );
    }

    const map = await getPermissoesMap();
    map[nivel] = menuPermitidos;
    await savePermissoesMap(map);

    return NextResponse.json({
      success: true,
      mensagem: `Permissões do ${nivel} salvas com sucesso`,
    });
  } catch (error) {
    console.error('[SAAS-PERMISSOES] Erro ao salvar:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
