-- Add planilhaGabarito to Cliente
-- Armazena a planilha Excel gabarito (base64) para geração dinâmica de relatórios personalizados.
-- O cliente faz upload de uma planilha .xlsx com placeholders entre colchetes (ex: [caixainicial], [reforço])
-- e o aplicativo substitui os placeholders pelos valores reais do relatório de leitura.
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "planilhaGabarito" TEXT;
