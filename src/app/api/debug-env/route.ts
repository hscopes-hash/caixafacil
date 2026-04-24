import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    POSTGRES_PRISMA_URL: process.env.POSTGRES_PRISMA_URL || 'NOT_SET',
    POSTGRES_URL_NON_POOLING: process.env.POSTGRES_URL_NON_POOLING || 'NOT_SET',
    DATABASE_URL: process.env.DATABASE_URL || 'NOT_SET',
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'NOT_SET',
  });
}
