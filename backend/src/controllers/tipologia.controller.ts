import { Request, Response } from 'express';
import { TipologiaService } from '../services/tipologia.service';
import { PrismaClient } from '@prisma/client';
import { tipologiaQueue } from '../queues/queue.config';

const tipologiaService = new TipologiaService();
const prisma = new PrismaClient();

/**
 * Sprint 4: Controller de Tipologia/Classificação de Clientes
 */

/**
 * POST /api/tipologia/start
 * Inicia classificação de tipologia para todos os clientes analisados
 */
export async function startTipologiaAll(req: Request, res: Response) {
  try {
    console.log('\n🏷️  ===== INICIANDO CLASSIFICAÇÃO DE TIPOLOGIAS =====');

    // Buscar TODOS os clientes que ainda não têm tipologia
    // Incluindo aqueles sem fotos (terão confiança menor)
    const clientes = await prisma.cliente.findMany({
      where: {
        tipologia: null, // Ainda não foi classificado
      },
      select: {
        id: true,
        nome: true,
        enrichmentStatus: true,
      },
    });

    console.log(`   📊 Total de clientes para classificar: ${clientes.length}`);

    if (clientes.length === 0) {
      return res.json({
        success: true,
        message: 'Nenhum cliente pendente de classificação',
        total: 0,
      });
    }

    // Adicionar jobs na fila
    const jobs = await Promise.all(
      clientes.map(cliente =>
        tipologiaQueue.add({
          clienteId: cliente.id,
        })
      )
    );

    console.log(`   ✅ ${jobs.length} jobs adicionados à fila de tipologia`);
    console.log(`======================================\n`);

    res.json({
      success: true,
      message: `Classificação de tipologia iniciada para ${clientes.length} clientes`,
      total: clientes.length,
      jobIds: jobs.map(j => j.id),
    });
  } catch (error: any) {
    console.error('❌ Erro ao iniciar classificação de tipologias:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/tipologia/classificar/:id
 * Classifica um cliente específico
 */
export async function classificarCliente(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const resultado = await tipologiaService.classificarTipologia(id);

    res.json({
      success: true,
      ...resultado,
    });
  } catch (error: any) {
    console.error('Erro ao classificar cliente:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/tipologia/recalcular-todos
 * Recalcula tipologia para todos os clientes analisados
 */
export async function recalcularTodos(req: Request, res: Response) {
  try {
    const resultado = await tipologiaService.recalcularTodasTipologias();

    res.json({
      success: true,
      message: 'Classificação de tipologias concluída',
      ...resultado,
    });
  } catch (error: any) {
    console.error('Erro ao recalcular tipologias:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/tipologia/distribuicao
 * Retorna distribuição dos clientes por tipologia
 */
export async function getDistribuicao(req: Request, res: Response) {
  try {
    const distribuicao = await tipologiaService.getDistribuicaoTipologias();

    res.json({
      success: true,
      ...distribuicao,
    });
  } catch (error: any) {
    console.error('Erro ao obter distribuição:', error);
    res.status(500).json({ error: error.message });
  }
}
