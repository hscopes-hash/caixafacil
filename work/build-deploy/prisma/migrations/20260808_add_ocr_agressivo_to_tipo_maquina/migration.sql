-- Add ocrAgressivo to TipoMaquina
-- Se true, usa pipeline agressivo (deskew + JPEG 90) no processamento de OCR.
-- Marcado apenas para tipos de máquina com problemas de leitura (ex: display inclinado).
ALTER TABLE "tipos_maquina" ADD COLUMN IF NOT EXISTS "ocrAgressivo" BOOLEAN NOT NULL DEFAULT false;
