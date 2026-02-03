-- Migration: Add Arca Analyst Fields
-- Date: 2026-02-03
-- Description: Adds fields for Arca Analyst - the holistic AI agent that validates
--              cadastros by cross-referencing ALL data sources (CNPJA, Google, SERPRO, etc)

-- Arca Analyst - veredito holistico
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "arcaStatus" TEXT;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "arcaConfianca" INTEGER;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "arcaResumo" TEXT;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "arcaAlertasCriticos" TEXT;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "arcaAlertasSecundarios" TEXT;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "arcaRecomendacoes" TEXT;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "arcaDivergencias" TEXT;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "arcaProcessadoEm" TIMESTAMP(3);

-- Indexes for filtering by Arca status
CREATE INDEX IF NOT EXISTS "Cliente_arcaStatus_idx" ON "Cliente"("arcaStatus");
CREATE INDEX IF NOT EXISTS "Cliente_arcaConfianca_idx" ON "Cliente"("arcaConfianca");
