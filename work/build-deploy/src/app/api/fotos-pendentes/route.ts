import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Garantir que a tabela existe (compatibilidade com DB sem migration)
async function ensureSchema() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "fotos_pendentes" (
        "id" TEXT NOT NULL,
        "empresaId" TEXT NOT NULL,
        "clienteId" TEXT,
        "whatsappRemetente" TEXT NOT NULL,
        "imagemBase64" TEXT NOT NULL,
        "mensagemId" TEXT,
        "status" TEXT NOT NULL DEFAULT 'pendente',
        "importadaEm" TIMESTAMP(3),
        "observacoes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "fotos_pendentes_pkey" PRIMARY KEY ("id")
      );
      CREATE INDEX IF NOT EXISTS "fotos_pendentes_empresaId_idx" ON "fotos_pendentes"("empresaId");
      CREATE INDEX IF NOT EXISTS "fotos_pendentes_clienteId_idx" ON "fotos_pendentes"("clienteId");
      CREATE INDEX IF NOT EXISTS "fotos_pendentes_whatsappRemetente_idx" ON "fotos_pendentes"("whatsappRemetente");
      CREATE UNIQUE INDEX IF NOT EXISTS "fotos_pendentes_mensagemId_key" ON "fotos_pendentes"("mensagemId");
    `);
  } catch (err) {
    console.warn('[Fotos Pendentes] ensureSchema:', err);
  }
}

// ============================================
// GET — Listar fotos pendentes de um cliente
// Query params: empresaId (obrigatório), clienteId (opcional, filtra por cliente)
// ============================================
export async function GET(request: NextRequest) {
  try {
    await ensureSchema();
    const searchParams = request.nextUrl.searchParams;
    const empresaId = searchParams.get('empresaId');
    const clienteId = searchParams.get('clienteId');

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId obrigatório' }, { status: 400 });
    }

    const fotos = await prisma.fotoPendente.findMany({
      where: {
        empresaId,
        ...(clienteId ? { clienteId } : {}),
        status: 'pendente',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        whatsappRemetente: true,
        status: true,
        observacoes: true,
        createdAt: true,
        // Retorna um thumbnail (primeiros 100 chars do base64) para identificar
        // A imagem completa é retornada apenas no endpoint individual
      },
    });

    // Contar total por cliente
    const total = fotos.length;

    return NextResponse.json({
      total,
      fotos,
    });
  } catch (error) {
    console.error('[Fotos Pendentes] Erro ao listar:', error);
    return NextResponse.json({ error: 'Erro ao listar fotos' }, { status: 500 });
  }
}

// ============================================
// POST — Importar fotos para processamento
// Body: { fotoIds: string[], clienteId?: string }
// Marca as fotos como importadas e retorna as imagens
// ============================================
export async function POST(request: NextRequest) {
  try {
    await ensureSchema();
    const body = await request.json();
    const { fotoIds, clienteId, empresaId } = body;

    if (!fotoIds || !Array.isArray(fotoIds) || fotoIds.length === 0) {
      return NextResponse.json({ error: 'fotoIds obrigatório' }, { status: 400 });
    }

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId obrigatório' }, { status: 400 });
    }

    // Buscar fotos com imagens completas
    const fotos = await prisma.fotoPendente.findMany({
      where: {
        id: { in: fotoIds },
        empresaId,
        status: 'pendente',
      },
    });

    if (fotos.length === 0) {
      return NextResponse.json({ error: 'Nenhuma foto encontrada' }, { status: 404 });
    }

    // Retornar as imagens para o frontend processar
    const resultado = fotos.map(f => ({
      id: f.id,
      imagem: f.imagemBase64,
      whatsappRemetente: f.whatsappRemetente,
    }));

    // Marcar como importadas
    await prisma.fotoPendente.updateMany({
      where: { id: { in: fotos.map(f => f.id) } },
      data: {
        status: 'importada',
        importadaEm: new Date(),
        ...(clienteId ? { clienteId } : {}),
      },
    });

    console.log(`[Fotos Pendentes] ${fotos.length} fotos importadas e marcadas como processadas`);

    return NextResponse.json({
      total: resultado.length,
      fotos: resultado,
    });
  } catch (error) {
    console.error('[Fotos Pendentes] Erro ao importar:', error);
    return NextResponse.json({ error: 'Erro ao importar fotos' }, { status: 500 });
  }
}

// ============================================
// DELETE — Descartar fotos (remover)
// Query params: id (fotoId) ou ids (array separado por vírgula)
// ============================================
export async function DELETE(request: NextRequest) {
  try {
    await ensureSchema();
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const ids = searchParams.get('ids');

    const idsToDelete: string[] = [];
    if (id) idsToDelete.push(id);
    if (ids) idsToDelete.push(...ids.split(','));

    if (idsToDelete.length === 0) {
      return NextResponse.json({ error: 'id ou ids obrigatório' }, { status: 400 });
    }

    const result = await prisma.fotoPendente.deleteMany({
      where: { id: { in: idsToDelete } },
    });

    console.log(`[Fotos Pendentes] ${result.count} fotos descartadas/removidas`);

    return NextResponse.json({
      deletadas: result.count,
    });
  } catch (error) {
    console.error('[Fotos Pendentes] Erro ao descartar:', error);
    return NextResponse.json({ error: 'Erro ao descartar fotos' }, { status: 500 });
  }
}
