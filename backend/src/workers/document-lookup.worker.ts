import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { documentLookupQueue, normalizationQueue } from '../queues/queue.config';
import { documentDetectorService } from '../services/document-detector.service';
import { cnpjaService } from '../services/cnpja.service';
import { serproCpfService } from '../services/serpro-cpf.service';

const prisma = new PrismaClient();

console.log('👷 Worker de Document Lookup (CNPJA + SERPRO) iniciado');

interface DocumentLookupJobData {
  clienteId: string;
  loteId?: string;
}

interface DocumentLookupJobResult {
  success: boolean;
  clienteId: string;
  nome: string;
  tipoDocumento: 'CNPJ' | 'CPF' | 'INVALIDO';
  fonte: 'CNPJA' | 'SERPRO' | 'NENHUMA';
  error?: string;
}

// Concurrency 5 = processa 5 CNPJs em paralelo (CNPJA API paga suporta)
documentLookupQueue.process(5, async (job: Job<DocumentLookupJobData>): Promise<DocumentLookupJobResult> => {
  const { clienteId, loteId } = job.data;

  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        id: true,
        nome: true,
        cnpj: true,
        cpf: true,
        endereco: true,
        cidade: true,
        estado: true,
        cep: true,
      },
    });

    if (!cliente) {
      throw new Error(`Cliente ${clienteId} não encontrado`);
    }

    // Marcar como processando
    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        receitaStatus: 'PROCESSANDO',
        receitaIniciadoEm: new Date(),
      },
    });

    // Detectar tipo de documento
    const documento = cliente.cnpj || cliente.cpf || '';
    const detection = documentDetectorService.detect(documento);

    console.log(`📋 Cliente ${cliente.nome}: cnpj="${cliente.cnpj}" cpf="${cliente.cpf}" → ${detection.tipo} (limpo="${detection.limpo}", len=${detection.limpo.length})`);

    // Atualizar tipo de documento
    await prisma.cliente.update({
      where: { id: clienteId },
      data: { tipoDocumento: detection.tipo },
    });

    if (detection.tipo === 'CNPJ') {
      // ===== CAMINHO CNPJ → CNPJA =====
      const result = await cnpjaService.consultarCNPJ(detection.limpo);

      if (result.success && result.data) {
        const d = result.data;

        await prisma.cliente.update({
          where: { id: clienteId },
          data: {
            receitaStatus: 'SUCESSO',
            receitaProcessadoEm: new Date(),
            // Dados cadastrais (mesmos campos do ReceitaWS)
            razaoSocial: d.razaoSocial,
            nomeFantasia: d.nomeFantasia,
            enderecoReceita: d.enderecoCompleto,
            situacaoReceita: d.situacao,
            dataAberturaReceita: d.dataAbertura,
            naturezaJuridica: d.naturezaJuridica,
            atividadePrincipal: d.atividadePrincipal,
            // Detectar divergência de endereço
            divergenciaEndereco: detectarDivergencia(cliente.endereco, d.enderecoCompleto),
            // CNPJA exclusivos
            simplesNacional: d.simplesNacional,
            simplesNacionalData: d.simplesNacionalData,
            meiOptante: d.meiOptante,
            cccStatus: d.cccStatus,
            cccDetalhes: d.cccDetalhes ? JSON.stringify(d.cccDetalhes) : null,
            quadroSocietario: d.quadroSocietario.length > 0 ? JSON.stringify(d.quadroSocietario) : null,
            quadroSocietarioQtd: d.quadroSocietarioQtd,
            capitalSocial: d.capitalSocial,
            porteEmpresa: d.porteEmpresa,
            // SERPRO não aplicável para CNPJ
            serproCpfStatus: 'NAO_APLICAVEL',
          },
        });

        // Encadear para normalização
        await normalizationQueue.add(
          { clienteId, loteId },
          { delay: 500 }
        );

        return {
          success: true,
          clienteId,
          nome: cliente.nome,
          tipoDocumento: 'CNPJ',
          fonte: 'CNPJA',
        };
      } else {
        await prisma.cliente.update({
          where: { id: clienteId },
          data: {
            receitaStatus: 'FALHA',
            receitaProcessadoEm: new Date(),
            receitaErro: result.error,
          },
        });

        // Mesmo com falha, encadear para normalização (pipeline continua)
        console.log(`⚠️  CNPJA falhou mas encadeando para normalização: ${clienteId}`);
        await normalizationQueue.add(
          { clienteId, loteId },
          { delay: 500 }
        );

        return {
          success: false,
          clienteId,
          nome: cliente.nome,
          tipoDocumento: 'CNPJ',
          fonte: 'CNPJA',
          error: result.error,
        };
      }
    } else if (detection.tipo === 'CPF') {
      // ===== CAMINHO CPF → SERPRO =====
      const result = await serproCpfService.consultarCPF(detection.limpo);

      if (result.success && result.data) {
        const d = result.data;

        await prisma.cliente.update({
          where: { id: clienteId },
          data: {
            cpf: detection.limpo,
            receitaStatus: 'NAO_APLICAVEL',
            serproCpfStatus: 'SUCESSO',
            serproCpfProcessadoEm: new Date(),
            cpfNome: d.nome,
            cpfSituacao: d.situacao,
            cpfNascimento: d.nascimento,
            cpfObito: d.obito,
          },
        });

        // Encadear para normalização
        await normalizationQueue.add(
          { clienteId, loteId },
          { delay: 500 }
        );

        return {
          success: true,
          clienteId,
          nome: cliente.nome,
          tipoDocumento: 'CPF',
          fonte: 'SERPRO',
        };
      } else {
        await prisma.cliente.update({
          where: { id: clienteId },
          data: {
            cpf: detection.limpo,
            serproCpfStatus: 'FALHA',
            serproCpfProcessadoEm: new Date(),
            serproCpfErro: result.error,
            receitaStatus: 'NAO_APLICAVEL',
          },
        });

        // Mesmo com falha, encadear para normalização (pipeline continua)
        console.log(`⚠️  SERPRO falhou mas encadeando para normalização: ${clienteId}`);
        await normalizationQueue.add(
          { clienteId, loteId },
          { delay: 500 }
        );

        return {
          success: false,
          clienteId,
          nome: cliente.nome,
          tipoDocumento: 'CPF',
          fonte: 'SERPRO',
          error: result.error,
        };
      }
    } else {
      // ===== DOCUMENTO INVÁLIDO =====
      await prisma.cliente.update({
        where: { id: clienteId },
        data: {
          receitaStatus: 'NAO_APLICAVEL',
          serproCpfStatus: 'NAO_APLICAVEL',
          receitaErro: `Documento inválido: ${documento}`,
        },
      });

      // Ainda encadear para normalização (endereço pode ser processado)
      await normalizationQueue.add(
        { clienteId, loteId },
        { delay: 500 }
      );

      return {
        success: false,
        clienteId,
        nome: cliente.nome,
        tipoDocumento: 'INVALIDO',
        fonte: 'NENHUMA',
        error: `Documento inválido: ${documento}`,
      };
    }
  } catch (error: any) {
    console.error(`❌ Erro no Document Lookup para cliente ${clienteId}:`, error.message);

    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        receitaStatus: 'FALHA',
        receitaProcessadoEm: new Date(),
        receitaErro: error.message,
      },
    }).catch(() => {});

    throw error;
  }
});

/**
 * Detecta divergência entre endereço da planilha e da Receita/CNPJA
 */
function detectarDivergencia(endPlanilha: string, endReceita: string): boolean {
  if (!endPlanilha || !endReceita) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = norm(endPlanilha);
  const b = norm(endReceita);
  // Se similaridade < 50%, considerar divergente
  const longer = Math.max(a.length, b.length);
  if (longer === 0) return false;
  let matches = 0;
  const shorter = a.length < b.length ? a : b;
  for (let i = 0; i < shorter.length; i++) {
    if (a[i] === b[i]) matches++;
  }
  return (matches / longer) < 0.5;
}

console.log('✅ Worker de Document Lookup pronto');
