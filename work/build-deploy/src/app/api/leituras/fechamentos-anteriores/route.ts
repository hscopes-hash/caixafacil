import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/leituras/fechamentos-anteriores?clienteId=xxx
 * Retorna os últimos 30 fechamentos de um cliente (agrupados por data/hora),
 * com paginação no banco para nao sobrecarregar.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clienteId = searchParams.get('clienteId');

    if (!clienteId) {
      return NextResponse.json({ error: 'clienteId obrigatorio' }, { status: 400 });
    }

    // Buscar as datas distintas dos fechamentos (groupBy via raw query)
    // Ordena por data decrescente, pega os 30 mais recentes
    const fechamentos = await db.$queryRawUnsafe(`
      SELECT 
        DATE_TRUNC('minute', "dataLeitura") as data_trunc,
        COUNT(*) as qtd_leituras,
        COUNT(CASE WHEN "fotoGcsPath" IS NOT NULL THEN 1 END) as qtd_fotos,
        STRING_AGG(DISTINCT u.nome, ', ') as operadores
      FROM "Leitura" l
      LEFT JOIN "Usuario" u ON u.id = l."usuarioId"
      WHERE l."clienteId" = $1
      GROUP BY DATE_TRUNC('minute', "dataLeitura")
      ORDER BY data_trunc DESC
      LIMIT 30
    `, clienteId);

    const resultado = (fechamentos as any[]).map((f: any) => {
      const d = new Date(f.data_trunc);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return {
        data: `${day}/${m}/${y} ${h}:${min}`,
        dataISO: `${y}-${m}-${day}T${h}:${min}:00`,
        operadores: f.operadores || '',
        qtdFotos: Number(f.qtd_fotos) || 0,
        qtdLeituras: Number(f.qtd_leituras) || 0,
      };
    });

    return NextResponse.json(resultado);
  } catch (error) {
    console.error('[FECHAMENTOS-ANTERIORES] Erro:', error);
    return NextResponse.json({ error: 'Erro ao buscar fechamentos' }, { status: 500 });
  }
}
