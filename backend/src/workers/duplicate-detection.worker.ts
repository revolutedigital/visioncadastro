import { Job } from 'bull';
import { duplicateDetectionQueue } from '../queues/queue.config';
import { duplicateDetectorService } from '../services/duplicate-detector.service';
import { qsaValidatorService } from '../services/qsa-validator.service';

console.log('👷 Worker de Detecção de Duplicatas iniciado');

interface DuplicateDetectionJobData {
  clienteId: string;
  loteId?: string;
}

interface DuplicateDetectionJobResult {
  success: boolean;
  clienteId: string;
  duplicatasEncontradas: number;
  cpfNoQsa?: boolean;
}

duplicateDetectionQueue.process(async (job: Job<DuplicateDetectionJobData>): Promise<DuplicateDetectionJobResult> => {
  const { clienteId } = job.data;

  try {
    // 1. Detectar duplicatas por endereço
    const dupResult = await duplicateDetectorService.detectByAddress(clienteId);
    console.log(`🔍 Cliente ${clienteId}: ${dupResult.total} duplicata(s) de endereço encontrada(s)`);

    // 2. Validar CPF no QSA (se aplicável)
    const qsaResult = await qsaValidatorService.validateCpfAgainstQsa(clienteId);
    if (qsaResult.found) {
      console.log(`✅ Cliente ${clienteId}: CPF encontrado no quadro societário`);
    } else if (qsaResult.found === false) {
      console.log(`⚠️  Cliente ${clienteId}: CPF NÃO encontrado em nenhum quadro societário`);
    }

    return {
      success: true,
      clienteId,
      duplicatasEncontradas: dupResult.total,
      cpfNoQsa: qsaResult.found,
    };
  } catch (error: any) {
    console.error(`❌ Erro na detecção de duplicatas para ${clienteId}:`, error.message);
    throw error;
  }
});

console.log('✅ Worker de Detecção de Duplicatas pronto');
