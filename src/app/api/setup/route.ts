import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // Criar tabela empresas
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS empresas (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        nome TEXT NOT NULL,
        cnpj TEXT UNIQUE,
        email TEXT,
        telefone TEXT,
        endereco TEXT,
        cidade TEXT,
        estado TEXT,
        logo TEXT,
        ativa BOOLEAN DEFAULT true,
        plano TEXT DEFAULT 'BASICO',
        "dataVencimento" TIMESTAMP(3),
        bloqueada BOOLEAN DEFAULT false,
        "motivoBloqueio" TEXT,
        "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar tabela usuarios
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        nome TEXT NOT NULL,
        email TEXT NOT NULL,
        senha TEXT NOT NULL,
        telefone TEXT,
        foto TEXT,
        ativo BOOLEAN DEFAULT true,
        "nivelAcesso" TEXT DEFAULT 'OPERADOR',
        "empresaId" TEXT NOT NULL,
        "ultimoAcesso" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("empresaId") REFERENCES empresas(id) ON DELETE CASCADE,
        UNIQUE(email, "empresaId")
      )
    `);

    // Criar tabela clientes
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS clientes (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        nome TEXT NOT NULL,
        "cpfCnpj" TEXT,
        email TEXT,
        telefone TEXT,
        telefone2 TEXT,
        endereco TEXT,
        cidade TEXT,
        estado TEXT,
        cep TEXT,
        observacoes TEXT,
        ativo BOOLEAN DEFAULT true,
        bloqueado BOOLEAN DEFAULT false,
        "motivoBloqueio" TEXT,
        "empresaId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("empresaId") REFERENCES empresas(id) ON DELETE CASCADE
      )
    `);

    // Criar tabela tipos_maquina
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS tipos_maquina (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        descricao TEXT NOT NULL,
        "nomeEntrada" TEXT DEFAULT 'E',
        "nomeSaida" TEXT DEFAULT 'S',
        ativo BOOLEAN DEFAULT true,
        "empresaId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("empresaId") REFERENCES empresas(id) ON DELETE CASCADE,
        UNIQUE(descricao, "empresaId")
      )
    `);

    // Criar tabela maquinas
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS maquinas (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        codigo TEXT NOT NULL,
        "tipoId" TEXT NOT NULL,
        descricao TEXT,
        marca TEXT,
        modelo TEXT,
        "numeroSerie" TEXT,
        "dataAquisicao" TIMESTAMP(3),
        "valorAquisicao" DOUBLE PRECISION,
        "valorMensal" DOUBLE PRECISION,
        localizacao TEXT,
        status TEXT DEFAULT 'ATIVA',
        observacoes TEXT,
        moeda TEXT DEFAULT 'M010',
        "entradaAtual" DOUBLE PRECISION DEFAULT 0,
        "saidaAtual" DOUBLE PRECISION DEFAULT 0,
        "clienteId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("clienteId") REFERENCES clientes(id) ON DELETE CASCADE,
        FOREIGN KEY ("tipoId") REFERENCES tipos_maquina(id) ON DELETE RESTRICT,
        UNIQUE(codigo, "clienteId")
      )
    `);

    // Criar tabela assinaturas
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS assinaturas (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        plano TEXT NOT NULL,
        descricao TEXT,
        "valorMensal" DOUBLE PRECISION NOT NULL,
        "diaVencimento" INTEGER DEFAULT 10,
        "dataInicio" TIMESTAMP(3) NOT NULL,
        "dataFim" TIMESTAMP(3),
        status TEXT DEFAULT 'ATIVA',
        "clienteId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("clienteId") REFERENCES clientes(id) ON DELETE CASCADE
      )
    `);

    // Criar tabela pagamentos
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS pagamentos (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        valor DOUBLE PRECISION NOT NULL,
        "dataVencimento" TIMESTAMP(3) NOT NULL,
        "dataPagamento" TIMESTAMP(3),
        status TEXT DEFAULT 'PENDENTE',
        "formaPagamento" TEXT,
        observacoes TEXT,
        "clienteId" TEXT NOT NULL,
        "assinaturaId" TEXT,
        "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("clienteId") REFERENCES clientes(id) ON DELETE CASCADE,
        FOREIGN KEY ("assinaturaId") REFERENCES assinaturas(id) ON DELETE SET NULL
      )
    `);

    // Criar tabela faturamentos
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS faturamentos (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "maquinaId" TEXT NOT NULL,
        "dataReferencia" TIMESTAMP(3) NOT NULL,
        "valorTotal" DOUBLE PRECISION NOT NULL,
        quantidade INTEGER,
        observacoes TEXT,
        "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("maquinaId") REFERENCES maquinas(id) ON DELETE CASCADE
      )
    `);

    // Criar tabela leituras
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS leituras (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "maquinaId" TEXT NOT NULL,
        "clienteId" TEXT NOT NULL,
        "usuarioId" TEXT NOT NULL,
        "dataLeitura" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        "entradaAnterior" DOUBLE PRECISION DEFAULT 0,
        "entradaNova" DOUBLE PRECISION DEFAULT 0,
        "saidaAnterior" DOUBLE PRECISION DEFAULT 0,
        "saidaNova" DOUBLE PRECISION DEFAULT 0,
        "diferencaEntrada" DOUBLE PRECISION DEFAULT 0,
        "diferencaSaida" DOUBLE PRECISION DEFAULT 0,
        saldo DOUBLE PRECISION DEFAULT 0,
        moeda TEXT DEFAULT 'M010',
        observacoes TEXT,
        "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("maquinaId") REFERENCES maquinas(id) ON DELETE CASCADE,
        FOREIGN KEY ("clienteId") REFERENCES clientes(id) ON DELETE CASCADE,
        FOREIGN KEY ("usuarioId") REFERENCES usuarios(id) ON DELETE CASCADE
      )
    `);

    // Criar índices para leituras
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS leituras_clienteId_dataLeitura_idx ON leituras("clienteId", "dataLeitura")
    `);
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS leituras_maquinaId_dataLeitura_idx ON leituras("maquinaId", "dataLeitura")
    `);

    // Criar tabela logs_acesso
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS logs_acesso (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        acao TEXT NOT NULL,
        descricao TEXT,
        ip TEXT,
        "usuarioId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("usuarioId") REFERENCES usuarios(id) ON DELETE CASCADE
      )
    `);

    return NextResponse.json({
      success: true,
      message: 'Todas as tabelas foram criadas com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao criar tabelas:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      details: JSON.stringify(error, null, 2)
    }, { status: 500 });
  }
}
