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
    // ⚠️ REGRA #6: nomes de tabela em minúsculo SEM aspas (leituras, usuarios)
    //    Colunas podem ter aspas pois Prisma mantém camelCase
    const fechamentos = await db.$queryRawUnsafe(`
      SELECT 
        DATE_TRUNC('minute', "dataLeitura") as data_trunc,
        COUNT(*) as qtd_leituras,
        COUNT(CASE WHEN "fotoGcsPath" IS NOT NULL THEN 1 END) as qtd_fotos,
        STRING_AGG(DISTINCT u.nome, ', ') as operadores
      FROM leituras l
      LEFT JOIN usuarios u ON u.id = l."usuarioId"
      WHERE l."clienteId" = $1
      GROUP BY DATE_TRUNC('minute', "dataLeitura")
      ORDER BY data_trunc DESC
      LIMIT 30
    `, clienteId);

    const resultado = (fechamentos as any[]).map((f: any) => {
      // Usa explicitamente getUTC* para deixar claro que o dataISO é em UTC.
      // O servidor Vercel roda em UTC por padrão, mas vamos ser explícitos
      // para evitar bugs se o TZ do servidor mudar no futuro.
      const d = new Date(f.data_trunc);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const h = String(d.getUTCHours()).padStart(2, '0');
      const min = String(d.getUTCMinutes()).padStart(2, '0');
      // Converte para horário de São Paulo (America/Sao_Paulo, UTC-3)
      // para exibir a data/hora correta no frontend
      const utcDate = new Date(Date.UTC(y, parseInt(m) - 1, parseInt(day), parseInt(h), parseInt(min), 0));
      const spDate = new Date(utcDate.getTime() - 3 * 60 * 60 * 1000); // UTC-3
      const spDay = String(spDate.getUTCDate()).padStart(2, '0');
      const spMonth = String(spDate.getUTCMonth() + 1).padStart(2, '0');
      const spYear = spDate.getUTCFullYear();
      const spHour = String(spDate.getUTCHours()).padStart(2, '0');
      const spMin = String(spDate.getUTCMinutes()).padStart(2, '0');
      return {
        data: `${spDay}/${spMonth}/${spYear} ${spHour}:${spMin}`,
        // ⚠️ dataISO com sufixo 'Z' para indicar UTC — frontend cria Date correta
        dataISO: `${y}-${m}-${day}T${h}:${min}:00Z`,
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
