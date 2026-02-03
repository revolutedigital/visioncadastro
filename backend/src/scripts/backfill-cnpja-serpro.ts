/**
 * Script de Backfill para CNPJA + SERPRO + Duplicatas
 *
 * Executa em lotes para processar clientes existentes:
 * 1. Detecta tipo de documento (CNPJ/CPF)
 * 2. Enfileira para document-lookup (CNPJA ou SERPRO)
 * 3. Enfileira para detecção de duplicatas
 * 4. Enfileira para validação QSA
 *
 * Uso:
 *   npx ts-node src/scripts/backfill-cnpja-serpro.ts [--dry-run] [--limit=N]
 */

import { PrismaClient } from '@prisma/client';
import { documentLookupQueue, duplicateDetectionQueue } from '../queues/queue.config';
import { documentDetectorService } from '../services/document-detector.service';

const prisma = new PrismaClient();

interface BackfillOptions {
  dryRun: boolean;
  limit: number;
  delayMs: number;
}

async function backfillDocumentLookup(options: BackfillOptions) {
  console.log('\n📋 BACKFILL: Consulta de Documentos (CNPJA + SERPRO)');
  console.log('='.repeat(60));

  // Buscar clientes sem tipoDocumento definido
  const clientesPendentes = await prisma.cliente.findMany({
    where: {
      tipoDocumento: null,
      OR: [
        { cnpj: { not: null } },
        { cpf: { not: null } },
      ],
    },
    select: {
      id: true,
      nome: true,
      cnpj: true,
      cpf: true,
    },
    take: options.limit > 0 ? options.limit : undefined,
  });

  console.log(`📊 Encontrados: ${clientesPendentes.length} clientes sem tipo de documento`);

  if (options.dryRun) {
    console.log('\n🔍 [DRY RUN] Simulando processamento...');
    clientesPendentes.slice(0, 5).forEach((c) => {
      const doc = c.cnpj || c.cpf || '';
      const detection = documentDetectorService.detect(doc);
      console.log(`   - ${c.nome}: ${detection.tipo} (${detection.formatado || 'inválido'})`);
    });
    return { total: clientesPendentes.length, processados: 0 };
  }

  let enfileirados = 0;
  for (const cliente of clientesPendentes) {
    try {
      await documentLookupQueue.add(
        { clienteId: cliente.id },
        { delay: enfileirados * options.delayMs }
      );
      enfileirados++;

      if (enfileirados % 50 === 0) {
        console.log(`   ⏳ Enfileirados: ${enfileirados}/${clientesPendentes.length}`);
      }
    } catch (error: any) {
      console.error(`   ❌ Erro ao enfileirar ${cliente.nome}:`, error.message);
    }
  }

  console.log(`✅ Total enfileirados para document-lookup: ${enfileirados}`);
  return { total: clientesPendentes.length, processados: enfileirados };
}

async function backfillDuplicateDetection(options: BackfillOptions) {
  console.log('\n🔍 BACKFILL: Detecção de Duplicatas');
  console.log('='.repeat(60));

  // Buscar clientes com coordenadas mas sem verificação de duplicata
  const clientesPendentes = await prisma.cliente.findMany({
    where: {
      latitude: { not: null },
      longitude: { not: null },
      duplicataEnderecoQtd: null,
    },
    select: {
      id: true,
      nome: true,
    },
    take: options.limit > 0 ? options.limit : undefined,
  });

  console.log(`📊 Encontrados: ${clientesPendentes.length} clientes para verificar duplicatas`);

  if (options.dryRun) {
    console.log('\n🔍 [DRY RUN] Clientes seriam verificados para duplicatas');
    return { total: clientesPendentes.length, processados: 0 };
  }

  let enfileirados = 0;
  for (const cliente of clientesPendentes) {
    try {
      await duplicateDetectionQueue.add(
        { clienteId: cliente.id },
        { delay: enfileirados * (options.delayMs / 2) } // Mais rápido que document-lookup
      );
      enfileirados++;

      if (enfileirados % 100 === 0) {
        console.log(`   ⏳ Enfileirados: ${enfileirados}/${clientesPendentes.length}`);
      }
    } catch (error: any) {
      console.error(`   ❌ Erro ao enfileirar ${cliente.nome}:`, error.message);
    }
  }

  console.log(`✅ Total enfileirados para duplicate-detection: ${enfileirados}`);
  return { total: clientesPendentes.length, processados: enfileirados };
}

async function backfillQSAValidation(options: BackfillOptions) {
  console.log('\n👥 BACKFILL: Validação QSA (CPF no Quadro Societário)');
  console.log('='.repeat(60));

  // Buscar clientes CPF sem validação QSA
  const clientesCPF = await prisma.cliente.findMany({
    where: {
      tipoDocumento: 'CPF',
      cpfNoQuadroSocietario: null,
    },
    select: {
      id: true,
      nome: true,
      cpf: true,
    },
    take: options.limit > 0 ? options.limit : undefined,
  });

  console.log(`📊 Encontrados: ${clientesCPF.length} clientes CPF para validar QSA`);

  if (options.dryRun) {
    console.log('\n🔍 [DRY RUN] CPFs seriam validados contra quadros societários');
    return { total: clientesCPF.length, processados: 0 };
  }

  // Para QSA validation, usamos o mesmo queue de duplicate-detection
  // pois o worker já faz ambas as operações
  let enfileirados = 0;
  for (const cliente of clientesCPF) {
    try {
      await duplicateDetectionQueue.add(
        { clienteId: cliente.id, qsaOnly: true },
        { delay: enfileirados * (options.delayMs / 2) }
      );
      enfileirados++;

      if (enfileirados % 100 === 0) {
        console.log(`   ⏳ Enfileirados: ${enfileirados}/${clientesCPF.length}`);
      }
    } catch (error: any) {
      console.error(`   ❌ Erro ao enfileirar ${cliente.nome}:`, error.message);
    }
  }

  console.log(`✅ Total enfileirados para QSA validation: ${enfileirados}`);
  return { total: clientesCPF.length, processados: enfileirados };
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 BACKFILL: CNPJA + SERPRO + Duplicatas + QSA');
  console.log('='.repeat(60));

  // Parse arguments
  const args = process.argv.slice(2);
  const options: BackfillOptions = {
    dryRun: args.includes('--dry-run'),
    limit: parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] || '0'),
    delayMs: parseInt(args.find((a) => a.startsWith('--delay='))?.split('=')[1] || '2000'),
  };

  console.log('\n📌 Opções:');
  console.log(`   - Dry Run: ${options.dryRun}`);
  console.log(`   - Limite: ${options.limit || 'Sem limite'}`);
  console.log(`   - Delay entre jobs: ${options.delayMs}ms`);

  try {
    // 1. Document Lookup (CNPJA/SERPRO)
    const docResult = await backfillDocumentLookup(options);

    // 2. Duplicate Detection
    const dupResult = await backfillDuplicateDetection(options);

    // 3. QSA Validation (para CPFs)
    const qsaResult = await backfillQSAValidation(options);

    // Resumo
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DO BACKFILL');
    console.log('='.repeat(60));
    console.log(`   Document Lookup: ${docResult.processados}/${docResult.total}`);
    console.log(`   Duplicate Detection: ${dupResult.processados}/${dupResult.total}`);
    console.log(`   QSA Validation: ${qsaResult.processados}/${qsaResult.total}`);

    if (options.dryRun) {
      console.log('\n⚠️  Executado em modo DRY RUN - nenhuma alteração foi feita');
      console.log('   Para executar de verdade, remova o --dry-run');
    } else {
      console.log('\n✅ Backfill iniciado! Os jobs estão sendo processados em background.');
      console.log('   Acompanhe o progresso no Pipeline ou nos logs do worker.');
    }
  } catch (error: any) {
    console.error('\n❌ Erro durante backfill:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
