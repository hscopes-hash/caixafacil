-- AlterTable: Adiciona campos de receita à tabela de leituras
ALTER TABLE "leituras" ADD COLUMN "receita" TEXT;
ALTER TABLE "leituras" ADD COLUMN "valorReceita" DOUBLE PRECISION;
