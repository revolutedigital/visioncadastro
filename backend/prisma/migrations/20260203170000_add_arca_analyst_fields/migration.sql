-- Migration: Add Arca Analyst Fields
-- Date: 2026-02-03
-- Description: Adds fields for Arca Analyst - the holistic AI agent that validates
--              cadastros by cross-referencing ALL data sources (CNPJA, Google, SERPRO, etc)

-- Arca Analyst - veredito holistico
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "arcaStatus" TEXT;
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "arcaConfianca" INTEGER;
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "arcaResumo" TEXT;
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "arcaAlertasCriticos" TEXT;
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "arcaAlertasSecundarios" TEXT;
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "arcaRecomendacoes" TEXT;
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "arcaDivergencias" TEXT;
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "arcaProcessadoEm" TIMESTAMP(3);

-- Indexes for filtering by Arca status
CREATE INDEX IF NOT EXISTS "clientes_arcaStatus_idx" ON "clientes"("arcaStatus");
CREATE INDEX IF NOT EXISTS "clientes_arcaConfianca_idx" ON "clientes"("arcaConfianca");
