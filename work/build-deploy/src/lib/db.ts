import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  if (process.env.NODE_ENV === 'production') {
    // Em produção (Vercel serverless), cada request pode ser um processo novo.
    // Usar pool_timeout baixo e connection_limit reduzido para não esgotar o Neon.
    const databaseUrl = process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL || '';

    // Injetar parâmetros de pool na connection string se não existirem
    let url = databaseUrl;
    if (url && !url.includes('connection_limit')) {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}connection_limit=3&pool_timeout=5`;
    }

    return new PrismaClient({
      log: ['error'],
      datasources: {
        db: {
          url,
        },
      },
    })
  }

  return new PrismaClient({
    log: ['query'],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
