-- Add tCartao1 and tCartao2 to Cliente
-- Título do campo de TOTAL no canhoto do cartão (ex: "VALOR A PAGAR", "TOTAL", "VENDA")
-- Usado para instruir a IA Vision a localizar o valor correto em cada canhoto.
-- Opcional: se NULL, a IA usa os rótulos padrão "VALOR A PAGAR" ou "TOTAL".
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "tCartao1" TEXT;
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "tCartao2" TEXT;
