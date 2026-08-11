-- Add criterioAnalise and mensagemAlerta to TipoMaquina
-- Alerta de Defeito: critério enviado à IA para análise + mensagem exibida quando confirmado
ALTER TABLE "tipos_maquina" ADD COLUMN IF NOT EXISTS "criterioAnalise" TEXT;
ALTER TABLE "tipos_maquina" ADD COLUMN IF NOT EXISTS "mensagemAlerta" TEXT;
