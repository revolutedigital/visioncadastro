/**
 * Script de Backfill para clientes com nome vazio
 *
 * Atualiza o campo `nome` usando `razaoSocial` ou `nomeFantasia` quando disponível
 *
 * Uso:
 *   npx ts-node src/scripts/backfill-empty-names.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('\n' + '='.repeat(60));
  console.log('📝 BACKFILL: Atualizar nomes vazios com razaoSocial/nomeFantasia');
  console.log('='.repeat(60));
  console.log(`   Modo: ${dryRun ? 'DRY RUN (simulação)' : 'EXECUÇÃO REAL'}`);

  // Buscar todos os clientes e filtrar em memória
  const todosClientes = await prisma.cliente.findMany({
    select: {
      id: true,
      nome: true,
      razaoSocial: true,
      nomeFantasia: true,
      cnpj: true,
    },
  });

  // Filtrar: nome vazio/null E (razaoSocial ou nomeFantasia preenchido)
  const clientesSemNome = todosClientes.filter((c) => {
    const nomeVazio = !c.nome || c.nome.trim() === '';
    const temRazaoSocial = c.razaoSocial && c.razaoSocial.trim() !== '';
    const temNomeFantasia = c.nomeFantasia && c.nomeFantasia.trim() !== '';
    return nomeVazio && (temRazaoSocial || temNomeFantasia);
  });

  console.log(`\n📊 Encontrados: ${clientesSemNome.length} clientes com nome vazio mas com razaoSocial/nomeFantasia`);

  if (clientesSemNome.length === 0) {
    console.log('✅ Nenhum cliente para atualizar!');
    return;
  }

  // Preview dos primeiros 10
  console.log('\n🔍 Preview (primeiros 10):');
  clientesSemNome.slice(0, 10).forEach((c, i) => {
    const novoNome = c.nomeFantasia || c.razaoSocial || '';
    console.log(`   ${i + 1}. CNPJ ${c.cnpj || '?'}: "${c.nome || '(vazio)'}" → "${novoNome}"`);
  });

  if (dryRun) {
    console.log('\n⚠️  [DRY RUN] Nenhuma alteração feita. Remova --dry-run para executar.');
    return;
  }

  // Atualizar cada cliente
  console.log('\n🔄 Atualizando...');
  let atualizados = 0;
  let erros = 0;

  for (const cliente of clientesSemNome) {
    const novoNome = cliente.nomeFantasia || cliente.razaoSocial;
    if (!novoNome) continue;

    try {
      await prisma.cliente.update({
        where: { id: cliente.id },
        data: { nome: novoNome },
      });
      atualizados++;

      if (atualizados % 50 === 0) {
        console.log(`   ⏳ Atualizados: ${atualizados}/${clientesSemNome.length}`);
      }
    } catch (error: any) {
      console.error(`   ❌ Erro ao atualizar cliente ${cliente.id}:`, error.message);
      erros++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESULTADO');
  console.log('='.repeat(60));
  console.log(`   ✅ Atualizados: ${atualizados}`);
  console.log(`   ❌ Erros: ${erros}`);
  console.log(`   📋 Total encontrados: ${clientesSemNome.length}`);
}

main()
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
