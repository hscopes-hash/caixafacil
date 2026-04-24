import { NextResponse } from 'next/server';

// Endpoint para criar as tabelas e enums do Prisma no banco de dados
// Deve ser chamado uma vez após configurar o banco de dados no Vercel
export async function POST() {
  try {
    const { execSync } = require('child_process');

    // Verifica se as env vars do banco existem
    const dbUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
    if (!dbUrl) {
      return NextResponse.json(
        { error: 'DATABASE_URL ou POSTGRES_URL_NON_POOLING não configurada' },
        { status: 500 }
      );
    }

    const results: string[] = [];

    try {
      const pushOutput = execSync('npx prisma db push --accept-data-loss 2>&1', {
        encoding: 'utf-8',
        timeout: 60000,
        env: {
          ...process.env,
          POSTGRES_PRISMA_URL: process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL,
        },
      });
      results.push('prisma db push: ' + pushOutput);
    } catch (e: any) {
      results.push('prisma db push output: ' + (e.stdout || '') + (e.stderr || ''));
    }

    return NextResponse.json({
      success: true,
      message: 'Setup do banco de dados executado',
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro no setup', detail: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}
