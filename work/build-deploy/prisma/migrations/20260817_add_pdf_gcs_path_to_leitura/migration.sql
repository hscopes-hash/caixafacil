-- Add pdfGcsPath to Leitura
-- Armazena o caminho do PDF do relatório de fechamento no GCS
-- Substitui o upload de fotos individuais — PDF já contém tudo
ALTER TABLE "leituras" ADD COLUMN IF NOT EXISTS "pdfGcsPath" TEXT;
