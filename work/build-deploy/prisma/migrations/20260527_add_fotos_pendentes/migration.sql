-- Fotos pendentes recebidas via WhatsApp Business API
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

CREATE UNIQUE INDEX IF NOT EXISTS "fotos_pendentes_mensagemId_key" ON "fotos_pendentes"("mensagemId");
CREATE INDEX IF NOT EXISTS "fotos_pendentes_empresaId_clienteId_status_idx" ON "fotos_pendentes"("empresaId", "clienteId", "status");
CREATE INDEX IF NOT EXISTS "fotos_pendentes_whatsappRemetente_idx" ON "fotos_pendentes"("whatsappRemetente");

ALTER TABLE "clientes" ALTER COLUMN "whatsapp" TYPE TEXT;
COMMENT ON COLUMN "clientes"."whatsapp" IS 'Número WhatsApp pessoal (para receber fotos do CaixaFacil Bot)';
