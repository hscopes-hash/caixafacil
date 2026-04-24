import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// Endpoint para criar as tabelas e enums do Prisma no banco de dados
// Versão 3: usa nomes de colunas EXATOS do schema Prisma
export async function POST() {
  try {
    const prisma = new PrismaClient({
      log: ['error'],
      datasources: {
        db: {
          url: process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || '',
        },
      },
    });

    const results: string[] = [];

    // 1. Criar os enums necessarios
    const enumsSQL = [
      { name: 'Plano', values: "'BASICO', 'PROFISSIONAL', 'PREMIUM', 'ENTERPRISE'" },
      { name: 'NivelAcesso', values: "'ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR'" },
      { name: 'StatusMaquina', values: "'ATIVA', 'INATIVA', 'MANUTENCAO', 'VENDIDA'" },
      { name: 'StatusAssinatura', values: "'ATIVA', 'SUSPENSA', 'CANCELADA', 'VENCIDA'" },
      { name: 'StatusPagamento', values: "'PENDENTE', 'PAGO', 'ATRASADO', 'CANCELADO'" },
      { name: 'FormaPagamento', values: "'PIX', 'BOLETO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO', 'TRANSFERENCIA'" },
      { name: 'TipoMoeda', values: "'M001', 'M005', 'M010', 'M025'" },
      { name: 'StatusAssinaturaSaaS', values: "'ATIVA', 'TRIAL', 'VENCIDA', 'CANCELADA', 'SUSPENSA'" },
      { name: 'StatusPagamentoSaaS', values: "'PENDENTE', 'PAGO', 'ATRASADO', 'CANCELADO', 'ESTORNADO'" },
      { name: 'FormaPagamentoSaaS', values: "'PIX', 'BOLETO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'TRANSFERENCIA'" },
    ];

    for (const enumDef of enumsSQL) {
      try {
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN CREATE TYPE "${enumDef.name}" AS ENUM (${enumDef.values}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        `);
        results.push(`Enum "${enumDef.name}" OK`);
      } catch (e: any) {
        results.push(`Enum "${enumDef.name}": ${e.message?.substring(0, 100)}`);
      }
    }

    // 2. Drop all tables
    const drops = [
      'pagamentos_saas','assinaturas_saas','planos_saas','debitos','webhook_logs',
      'logs_acesso','leituras','faturamentos','pagamentos','assinaturas',
      'maquinas','tipos_maquina','clientes','usuarios','empresas','_prisma_migrations'
    ];
    for (const t of drops) {
      try { await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${t}" CASCADE`); } catch {}
    }
    results.push('All tables dropped');

    // 3. Criar tabelas com nomes de colunas EXATOS do Prisma schema
    const sqls: string[] = [];

    // empresas
    sqls.push(`CREATE TABLE "empresas" (
      "id" TEXT NOT NULL PRIMARY KEY, "nome" TEXT NOT NULL, "cnpj" TEXT UNIQUE,
      "email" TEXT, "telefone" TEXT, "endereco" TEXT, "cidade" TEXT, "estado" TEXT, "logo" TEXT,
      "ativa" BOOLEAN NOT NULL DEFAULT true, "plano" "Plano" NOT NULL DEFAULT 'BASICO',
      "dataVencimento" TIMESTAMP(3), "isDemo" BOOLEAN NOT NULL DEFAULT false,
      "diasDemo" INTEGER NOT NULL DEFAULT 7, "bloqueada" BOOLEAN NOT NULL DEFAULT false,
      "motivoBloqueio" TEXT, "llmApiKey" TEXT, "llmModel" TEXT, "llmApiKeyGemini" TEXT,
      "llmApiKeyGlm" TEXT, "llmApiKeyOpenrouter" TEXT, "mercadopagoAccessToken" TEXT,
      "mercadopagoPublicKey" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    // usuarios
    sqls.push(`CREATE TABLE "usuarios" (
      "id" TEXT NOT NULL PRIMARY KEY, "nome" TEXT NOT NULL, "email" TEXT NOT NULL,
      "senha" TEXT NOT NULL, "telefone" TEXT, "foto" TEXT, "ativo" BOOLEAN NOT NULL DEFAULT true,
      "nivelAcesso" "NivelAcesso" NOT NULL DEFAULT 'OPERADOR', "empresaId" TEXT NOT NULL,
      "ultimoAcesso" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "usuarios_email_empresaId_key" UNIQUE ("email", "empresaId")
    )`);
    sqls.push(`ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE`);

    // clientes
    sqls.push(`CREATE TABLE "clientes" (
      "id" TEXT NOT NULL PRIMARY KEY, "nome" TEXT NOT NULL, "cpfCnpj" TEXT, "email" TEXT,
      "telefone" TEXT, "telefone2" TEXT, "endereco" TEXT, "cidade" TEXT, "estado" TEXT,
      "cep" TEXT, "observacoes" TEXT, "whatsapp" TEXT, "acertoPercentual" INTEGER NOT NULL DEFAULT 50,
      "ativo" BOOLEAN NOT NULL DEFAULT true, "bloqueado" BOOLEAN NOT NULL DEFAULT false,
      "motivoBloqueio" TEXT, "empresaId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    sqls.push(`ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE`);

    // tipos_maquina
    sqls.push(`CREATE TABLE "tipos_maquina" (
      "id" TEXT NOT NULL PRIMARY KEY, "descricao" TEXT NOT NULL,
      "nomeEntrada" TEXT NOT NULL DEFAULT 'E', "nomeSaida" TEXT NOT NULL DEFAULT 'S',
      "ativo" BOOLEAN NOT NULL DEFAULT true, "empresaId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "tipos_maquina_descricao_empresaId_key" UNIQUE ("descricao", "empresaId")
    )`);
    sqls.push(`ALTER TABLE "tipos_maquina" ADD CONSTRAINT "tipos_maquina_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE`);

    // maquinas
    sqls.push(`CREATE TABLE "maquinas" (
      "id" TEXT NOT NULL PRIMARY KEY, "codigo" TEXT NOT NULL, "tipoId" TEXT NOT NULL,
      "descricao" TEXT, "marca" TEXT, "modelo" TEXT, "numeroSerie" TEXT,
      "dataAquisicao" TIMESTAMP(3), "valorAquisicao" DOUBLE PRECISION,
      "valorMensal" DOUBLE PRECISION, "localizacao" TEXT,
      "status" "StatusMaquina" NOT NULL DEFAULT 'ATIVA', "observacoes" TEXT,
      "moeda" "TipoMoeda" NOT NULL DEFAULT 'M001',
      "entradaAtual" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "saidaAtual" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "clienteId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "maquinas_codigo_clienteId_key" UNIQUE ("codigo", "clienteId")
    )`);
    sqls.push(`ALTER TABLE "maquinas" ADD CONSTRAINT "maquinas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    sqls.push(`ALTER TABLE "maquinas" ADD CONSTRAINT "maquinas_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "tipos_maquina"("id") ON DELETE RESTRICT ON UPDATE CASCADE`);

    // assinaturas
    sqls.push(`CREATE TABLE "assinaturas" (
      "id" TEXT NOT NULL PRIMARY KEY, "plano" TEXT NOT NULL, "descricao" TEXT,
      "valorMensal" DOUBLE PRECISION NOT NULL, "diaVencimento" INTEGER NOT NULL DEFAULT 10,
      "dataInicio" TIMESTAMP(3) NOT NULL, "dataFim" TIMESTAMP(3),
      "status" "StatusAssinatura" NOT NULL DEFAULT 'ATIVA', "clienteId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    sqls.push(`ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE`);

    // pagamentos
    sqls.push(`CREATE TABLE "pagamentos" (
      "id" TEXT NOT NULL PRIMARY KEY, "valor" DOUBLE PRECISION NOT NULL,
      "dataVencimento" TIMESTAMP(3) NOT NULL, "dataPagamento" TIMESTAMP(3),
      "status" "StatusPagamento" NOT NULL DEFAULT 'PENDENTE',
      "formaPagamento" "FormaPagamento", "observacoes" TEXT,
      "clienteId" TEXT NOT NULL, "assinaturaId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    sqls.push(`ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    sqls.push(`ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_assinaturaId_fkey" FOREIGN KEY ("assinaturaId") REFERENCES "assinaturas"("id") ON DELETE SET NULL ON UPDATE CASCADE`);

    // faturamentos
    sqls.push(`CREATE TABLE "faturamentos" (
      "id" TEXT NOT NULL PRIMARY KEY, "maquinaId" TEXT NOT NULL,
      "dataReferencia" TIMESTAMP(3) NOT NULL, "valorTotal" DOUBLE PRECISION NOT NULL,
      "quantidade" INTEGER, "observacoes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    sqls.push(`ALTER TABLE "faturamentos" ADD CONSTRAINT "faturamentos_maquinaId_fkey" FOREIGN KEY ("maquinaId") REFERENCES "maquinas"("id") ON DELETE CASCADE ON UPDATE CASCADE`);

    // leituras
    sqls.push(`CREATE TABLE "leituras" (
      "id" TEXT NOT NULL PRIMARY KEY, "maquinaId" TEXT NOT NULL, "clienteId" TEXT NOT NULL,
      "usuarioId" TEXT NOT NULL, "dataLeitura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "entradaAnterior" DOUBLE PRECISION NOT NULL DEFAULT 0, "entradaNova" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "saidaAnterior" DOUBLE PRECISION NOT NULL DEFAULT 0, "saidaNova" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "diferencaEntrada" DOUBLE PRECISION NOT NULL DEFAULT 0, "diferencaSaida" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "saldo" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "moeda" "TipoMoeda" NOT NULL DEFAULT 'M010',
      "observacoes" TEXT, "despesa" TEXT, "valorDespesa" DOUBLE PRECISION,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    sqls.push(`ALTER TABLE "leituras" ADD CONSTRAINT "leituras_maquinaId_fkey" FOREIGN KEY ("maquinaId") REFERENCES "maquinas"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    sqls.push(`ALTER TABLE "leituras" ADD CONSTRAINT "leituras_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    sqls.push(`ALTER TABLE "leituras" ADD CONSTRAINT "leituras_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    sqls.push(`CREATE INDEX IF NOT EXISTS "leituras_clienteId_dataLeitura_idx" ON "leituras"("clienteId", "dataLeitura")`);
    sqls.push(`CREATE INDEX IF NOT EXISTS "leituras_maquinaId_dataLeitura_idx" ON "leituras"("maquinaId", "dataLeitura")`);

    // logs_acesso
    sqls.push(`CREATE TABLE "logs_acesso" (
      "id" TEXT NOT NULL PRIMARY KEY, "acao" TEXT NOT NULL, "descricao" TEXT,
      "ip" TEXT, "usuarioId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    sqls.push(`ALTER TABLE "logs_acesso" ADD CONSTRAINT "logs_acesso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE`);

    // webhook_logs
    sqls.push(`CREATE TABLE "webhook_logs" (
      "id" TEXT NOT NULL PRIMARY KEY, "metodo" TEXT NOT NULL, "url" TEXT NOT NULL,
      "headers" TEXT NOT NULL, "body" TEXT, "query" TEXT, "statusCode" INTEGER,
      "origem" TEXT NOT NULL DEFAULT 'mercadopago',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    // debitos
    sqls.push(`CREATE TABLE "debitos" (
      "id" TEXT NOT NULL PRIMARY KEY, "descricao" TEXT NOT NULL, "valor" DOUBLE PRECISION NOT NULL,
      "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "paga" BOOLEAN NOT NULL DEFAULT false,
      "dataPagamento" TIMESTAMP(3), "observacoes" TEXT, "empresaId" TEXT NOT NULL,
      "clienteId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    sqls.push(`ALTER TABLE "debitos" ADD CONSTRAINT "debitos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    sqls.push(`ALTER TABLE "debitos" ADD CONSTRAINT "debitos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE`);

    // planos_saas
    sqls.push(`CREATE TABLE "planos_saas" (
      "id" TEXT NOT NULL PRIMARY KEY, "nome" TEXT NOT NULL, "descricao" TEXT,
      "valorMensal" DOUBLE PRECISION NOT NULL, "valorAnual" DOUBLE PRECISION,
      "moeda" TEXT NOT NULL DEFAULT 'BRL', "limiteClientes" INTEGER NOT NULL,
      "limiteUsuarios" INTEGER NOT NULL, "limiteMaquinas" INTEGER NOT NULL,
      "recIA" BOOLEAN NOT NULL DEFAULT false, "recRelatorios" BOOLEAN NOT NULL DEFAULT false,
      "recBackup" BOOLEAN NOT NULL DEFAULT false, "recAPI" BOOLEAN NOT NULL DEFAULT false,
      "recSuporte" TEXT NOT NULL DEFAULT 'email', "ordem" INTEGER NOT NULL DEFAULT 0,
      "ativo" BOOLEAN NOT NULL DEFAULT true, "popular" BOOLEAN NOT NULL DEFAULT false,
      "mercadoPagoPreferenceId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "planos_saas_nome_key" UNIQUE ("nome")
    )`);

    // assinaturas_saas
    sqls.push(`CREATE TABLE "assinaturas_saas" (
      "id" TEXT NOT NULL PRIMARY KEY, "empresaId" TEXT NOT NULL, "planoSaaSId" TEXT NOT NULL,
      "status" "StatusAssinaturaSaaS" NOT NULL DEFAULT 'ATIVA',
      "dataInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "dataFim" TIMESTAMP(3),
      "dataCancelamento" TIMESTAMP(3), "mercadoPagoPreferenciaId" TEXT,
      "mercadoPagoPagamentoId" TEXT, "mercadoPagoStatus" TEXT,
      "valorPago" DOUBLE PRECISION, "formaPagamento" "FormaPagamentoSaaS",
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    sqls.push(`ALTER TABLE "assinaturas_saas" ADD CONSTRAINT "assinaturas_saas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    sqls.push(`ALTER TABLE "assinaturas_saas" ADD CONSTRAINT "assinaturas_saas_planoSaaSId_fkey" FOREIGN KEY ("planoSaaSId") REFERENCES "planos_saas"("id") ON DELETE RESTRICT ON UPDATE CASCADE`);

    // pagamentos_saas
    sqls.push(`CREATE TABLE "pagamentos_saas" (
      "id" TEXT NOT NULL PRIMARY KEY, "assinaturaSaaSId" TEXT NOT NULL,
      "empresaId" TEXT NOT NULL, "valor" DOUBLE PRECISION NOT NULL,
      "status" "StatusPagamentoSaaS" NOT NULL DEFAULT 'PENDENTE',
      "formaPagamento" "FormaPagamentoSaaS",
      "dataVencimento" TIMESTAMP(3) NOT NULL, "dataPagamento" TIMESTAMP(3),
      "mercadoPagoPaymentId" TEXT, "mercadoPagoStatus" TEXT,
      "mercadoPagoApprovedAt" TIMESTAMP(3), "mercadoPagoFee" DOUBLE PRECISION,
      "descricao" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "pagamentos_saas_mercadoPagoPaymentId_key" UNIQUE ("mercadoPagoPaymentId")
    )`);
    sqls.push(`ALTER TABLE "pagamentos_saas" ADD CONSTRAINT "pagamentos_saas_assinaturaSaaSId_fkey" FOREIGN KEY ("assinaturaSaaSId") REFERENCES "assinaturas_saas"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    sqls.push(`ALTER TABLE "pagamentos_saas" ADD CONSTRAINT "pagamentos_saas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE`);

    // _prisma_migrations
    sqls.push(`CREATE TABLE "_prisma_migrations" (
      "id" TEXT NOT NULL PRIMARY KEY, "checksum" TEXT NOT NULL,
      "finished_at" TIMESTAMP(3), "migration_name" TEXT NOT NULL,
      "logs" TEXT, "rolled_back_at" TIMESTAMP(3),
      "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )`);

    for (let i = 0; i < sqls.length; i++) {
      try {
        await prisma.$executeRawUnsafe(sqls[i]);
      } catch (e: any) {
        results.push(`SQL ${i + 1} ERROR: ${e.message?.substring(0, 120)}`);
      }
    }

    await prisma.$disconnect();

    return NextResponse.json({
      success: true,
      message: 'Setup v3 completo',
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro no setup', detail: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}
