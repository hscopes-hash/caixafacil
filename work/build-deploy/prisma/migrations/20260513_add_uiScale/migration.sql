-- Adicionar coluna uiScale na tabela empresas (escala de UI por empresa)
-- Esta coluna faltava no banco mas existia no schema.prisma

ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "uiScale" DOUBLE PRECISION;

COMMENT ON COLUMN "empresas"."uiScale" IS 'Escala proporcional da interface (0.8 a 1.5, padrao 1.0)';
