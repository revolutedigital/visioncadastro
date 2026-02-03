-- Migration: Add CNPJA, SERPRO CPF, and Duplicate Detection Fields
-- Date: 2026-02-03
-- Description: Adds fields for CNPJA integration, SERPRO CPF lookups,
--              duplicate detection, and QSA validation

-- Tipo de documento
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "tipoDocumento" TEXT;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "cpf" TEXT;

-- CNPJA - dados enriquecidos
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "simplesNacional" BOOLEAN;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "simplesNacionalData" TEXT;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "meiOptante" BOOLEAN;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "cccStatus" TEXT;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "cccDetalhes" TEXT;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "quadroSocietario" TEXT;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "quadroSocietarioQtd" INTEGER;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "capitalSocial" DOUBLE PRECISION;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "porteEmpresa" TEXT;

-- SERPRO CPF
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "cpfNome" TEXT;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "cpfSituacao" TEXT;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "cpfNascimento" TEXT;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "cpfObito" BOOLEAN;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "serproCpfStatus" TEXT DEFAULT 'PENDENTE';
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "serproCpfProcessadoEm" TIMESTAMP(3);
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "serproCpfErro" TEXT;

-- Duplicatas
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "duplicataEnderecoIds" TEXT;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "duplicataEnderecoQtd" INTEGER DEFAULT 0;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "alertaDuplicata" BOOLEAN DEFAULT false;

-- QSA cross-ref
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "cpfNoQuadroSocietario" BOOLEAN;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "cpfQsaRelacionamento" TEXT;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "alertaCpfNaoRelacionado" BOOLEAN DEFAULT false;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "Cliente_tipoDocumento_idx" ON "Cliente"("tipoDocumento");
CREATE INDEX IF NOT EXISTS "Cliente_alertaDuplicata_idx" ON "Cliente"("alertaDuplicata");
CREATE INDEX IF NOT EXISTS "Cliente_cpfNoQuadroSocietario_idx" ON "Cliente"("cpfNoQuadroSocietario");
CREATE INDEX IF NOT EXISTS "Cliente_alertaCpfNaoRelacionado_idx" ON "Cliente"("alertaCpfNaoRelacionado");
