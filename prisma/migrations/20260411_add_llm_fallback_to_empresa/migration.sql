-- AlterTable: Adicionar campos de IA reserva (fallback) na tabela empresas
ALTER TABLE "empresas" ADD COLUMN "llmApiKeyFallback" TEXT;
ALTER TABLE "empresas" ADD COLUMN "llmModelFallback" TEXT;
