-- Add liberarDigitacaoLeitura to Cliente
-- Permite controlar por cliente se a digitação manual da leitura atual é liberada
-- Se false, apenas preenchimento via OCR (processamento da foto)
ALTER TABLE "clientes" ADD COLUMN "liberarDigitacaoLeitura" BOOLEAN NOT NULL DEFAULT true;
