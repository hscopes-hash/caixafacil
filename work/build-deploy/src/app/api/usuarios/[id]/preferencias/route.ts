import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Colunas que a tabela precisa ter
const REQUIRED_COLUMNS = [
  { name: '"impressoraTipo"', type: 'TEXT' },
  { name: '"impressoraPreset"', type: 'TEXT' },
  { name: '"impressoraConexao"', type: 'TEXT' },
  { name: '"impressoraServicoUUID"', type: 'TEXT' },
  { name: '"impressoraCharUUID"', type: 'TEXT' },
  { name: '"impressoraChunkSize"', type: 'INTEGER' },
];

// Auto-migration: criar tabela + garantir todas as colunas existam
async function ensureTable() {
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "preferencias_usuario" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "usuarioId" TEXT NOT NULL,
        "uiScale" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
        "impressoraTipo" TEXT,
        "impressoraPreset" TEXT,
        "impressoraConexao" TEXT,
        "impressoraServicoUUID" TEXT,
        "impressoraCharUUID" TEXT,
        "impressoraChunkSize" INTEGER,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "preferencias_usuario_usuarioId_key" UNIQUE("usuarioId")
      );
    `);
  } catch (e) {
    console.error('[PREFS] create table:', e);
  }

  // Garantir FK
  try {
    await db.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "preferencias_usuario" ADD CONSTRAINT "preferencias_usuario_usuarioId_fkey"
        FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
  } catch {}

  // Garantir que todas as colunas existam (tabela pode ter sido criada sem elas)
  for (const col of REQUIRED_COLUMNS) {
    try {
      await db.$executeRawUnsafe(`
        DO $$ BEGIN
          ALTER TABLE "preferencias_usuario" ADD COLUMN ${col.name} ${col.type};
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$;
      `);
    } catch {}
  }
}

function esc(val: string) {
  return val.replace(/'/g, '');
}

// Buscar preferencias via SQL raw
async function findPrefs(usuarioId: string) {
  const rows: any[] = await db.$queryRawUnsafe(
    `SELECT * FROM "preferencias_usuario" WHERE "usuarioId" = '${esc(usuarioId)}' LIMIT 1`
  );
  return rows?.length > 0 ? rows[0] : null;
}

// Upsert com todas as colunas
async function upsertFull(usuarioId: string, fields: Record<string, any>) {
  const safeId = esc(usuarioId);
  const uiScale = fields.uiScale !== undefined ? Math.min(1.5, Math.max(0.8, Number(fields.uiScale) || 1.0)) : 1.0;
  const impressoraTipo = fields.impressoraTipo && fields.impressoraTipo !== 'none' ? `'${esc(fields.impressoraTipo)}'` : 'NULL';
  const impressoraPreset = fields.impressoraPreset && fields.impressoraPreset !== 'none' ? `'${esc(fields.impressoraPreset)}'` : 'NULL';
  const impressoraConexao = fields.impressoraConexao && fields.impressoraConexao !== 'none' ? `'${esc(fields.impressoraConexao)}'` : 'NULL';
  const impressoraServicoUUID = fields.impressoraServicoUUID && fields.impressoraServicoUUID !== 'none' ? `'${esc(fields.impressoraServicoUUID)}'` : 'NULL';
  const impressoraCharUUID = fields.impressoraCharUUID && fields.impressoraCharUUID !== 'none' ? `'${esc(fields.impressoraCharUUID)}'` : 'NULL';
  const impressoraChunkSize = typeof fields.impressoraChunkSize === 'number' ? fields.impressoraChunkSize : 'NULL';

  const sql = `
    INSERT INTO "preferencias_usuario" ("id","usuarioId","uiScale","impressoraTipo","impressoraPreset","impressoraConexao","impressoraServicoUUID","impressoraCharUUID","impressoraChunkSize","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,'${safeId}',${uiScale},${impressoraTipo},${impressoraPreset},${impressoraConexao},${impressoraServicoUUID},${impressoraCharUUID},${impressoraChunkSize},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT ("usuarioId") DO UPDATE SET
      "uiScale"=EXCLUDED."uiScale","impressoraTipo"=EXCLUDED."impressoraTipo","impressoraPreset"=EXCLUDED."impressoraPreset",
      "impressoraConexao"=EXCLUDED."impressoraConexao","impressoraServicoUUID"=EXCLUDED."impressoraServicoUUID",
      "impressoraCharUUID"=EXCLUDED."impressoraCharUUID","impressoraChunkSize"=EXCLUDED."impressoraChunkSize","updatedAt"=CURRENT_TIMESTAMP
    RETURNING *
  `;
  const rows: any[] = await db.$queryRawUnsafe(sql);
  return rows?.length > 0 ? rows[0] : null;
}

// Upsert mínimo — apenas uiScale (fallback)
async function upsertMinimal(usuarioId: string, uiScale: number) {
  const safeId = esc(usuarioId);
  const scale = Math.min(1.5, Math.max(0.8, uiScale || 1.0));
  const sql = `
    INSERT INTO "preferencias_usuario" ("id","usuarioId","uiScale","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,'${safeId}',${scale},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT ("usuarioId") DO UPDATE SET "uiScale"=${scale},"updatedAt"=CURRENT_TIMESTAMP
    RETURNING *
  `;
  const rows: any[] = await db.$queryRawUnsafe(sql);
  return rows?.length > 0 ? rows[0] : null;
}

function formatPrefs(r: any) {
  return {
    uiScale: Number(r?.uiScale) || 1.0,
    impressoraTipo: r?.impressoraTipo || null,
    impressoraPreset: r?.impressoraPreset || null,
    impressoraConexao: r?.impressoraConexao || null,
    impressoraServicoUUID: r?.impressoraServicoUUID || null,
    impressoraCharUUID: r?.impressoraCharUUID || null,
    impressoraChunkSize: r?.impressoraChunkSize || null,
  };
}

// GET
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureTable();
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    let prefs = await findPrefs(id);
    if (!prefs) {
      prefs = await upsertMinimal(id, 1.0);
    }
    return NextResponse.json(formatPrefs(prefs));
  } catch (error) {
    console.error('[PREFS GET]', error);
    return NextResponse.json({ uiScale: 1.0, impressoraPreset: null });
  }
}

// PUT — upsert com fallback progressivo
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureTable();
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

    const body = await request.json();
    const fields: Record<string, any> = {};
    if (body.uiScale !== undefined) fields.uiScale = body.uiScale;
    if (body.impressoraTipo !== undefined) fields.impressoraTipo = body.impressoraTipo;
    if (body.impressoraPreset !== undefined) fields.impressoraPreset = body.impressoraPreset;
    if (body.impressoraConexao !== undefined) fields.impressoraConexao = body.impressoraConexao;
    if (body.impressoraServicoUUID !== undefined) fields.impressoraServicoUUID = body.impressoraServicoUUID;
    if (body.impressoraCharUUID !== undefined) fields.impressoraCharUUID = body.impressoraCharUUID;
    if (body.impressoraChunkSize !== undefined) fields.impressoraChunkSize = body.impressoraChunkSize;

    // Tenta upsert completo
    let prefs = await upsertFull(id, fields);

    // Fallback: se falhou, tenta apenas uiScale
    if (!prefs && fields.uiScale !== undefined) {
      console.warn('[PREFS PUT] Full upsert failed, trying minimal');
      prefs = await upsertMinimal(id, fields.uiScale);
    }

    // Último recurso: retorna dados do body (frontend aplica localmente)
    if (!prefs) {
      console.warn('[PREFS PUT] Minimal also failed, returning body data');
      return NextResponse.json({
        uiScale: Number(fields.uiScale) || 1.0,
        impressoraPreset: fields.impressoraPreset === 'none' ? null : (fields.impressoraPreset || null),
      });
    }

    return NextResponse.json(formatPrefs(prefs));
  } catch (error) {
    console.error('[PREFS PUT]', error);
    // Nunca retorna erro 500 — retorna os dados do body para o frontend aplicar
    try {
      const body = await request.json().catch(() => ({}));
      return NextResponse.json({
        uiScale: Number(body.uiScale) || 1.0,
        impressoraPreset: body.impressoraPreset === 'none' ? null : (body.impressoraPreset || null),
      });
    } catch {
      return NextResponse.json({ uiScale: 1.0 });
    }
  }
}
