import { Response } from 'express';
import { geocodingQueue, receitaQueue, placesQueue, analysisQueue, tipologiaQueue, documentLookupQueue, normalizationQueue } from '../queues/queue.config';

interface SSEClient {
  id: string;
  res: Response;
  queueName: string;
}

/**
 * SSE Log Broadcaster
 * Transmite logs das filas em tempo real para clientes conectados via Server-Sent Events
 */
export class SSELogBroadcaster {
  private clients: Map<string, SSEClient[]> = new Map();

  constructor() {
    this.setupQueueListeners();
  }

  /**
   * Adiciona um cliente SSE
   */
  addClient(queueName: string, res: Response): string {
    const clientId = `${queueName}-${Date.now()}-${Math.random()}`;

    // Configurar headers SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Desabilitar buffering no nginx

    const client: SSEClient = { id: clientId, res, queueName };

    if (!this.clients.has(queueName)) {
      this.clients.set(queueName, []);
    }
    this.clients.get(queueName)!.push(client);

    // Enviar mensagem inicial de conexão
    this.sendToClient(client, {
      type: 'connected',
      message: `Conectado ao stream de logs da fila ${queueName}`,
      timestamp: new Date().toISOString(),
    });

    // Remover cliente quando desconectar
    res.on('close', () => {
      this.removeClient(clientId, queueName);
    });

    return clientId;
  }

  /**
   * Remove um cliente SSE
   */
  private removeClient(clientId: string, queueName: string) {
    const clients = this.clients.get(queueName);
    if (clients) {
      const index = clients.findIndex((c) => c.id === clientId);
      if (index !== -1) {
        clients.splice(index, 1);
      }
    }
  }

  /**
   * Envia mensagem para um cliente específico
   */
  private sendToClient(client: SSEClient, data: any) {
    try {
      client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      // Cliente desconectou
    }
  }

  /**
   * Broadcast para todos os clientes de uma fila
   */
  private broadcast(queueName: string, data: any) {
    const clients = this.clients.get(queueName);
    if (!clients || clients.length === 0) return;

    const payload = {
      ...data,
      timestamp: data.timestamp || new Date().toISOString(),
    };

    clients.forEach((client) => {
      this.sendToClient(client, payload);
    });
  }

  /**
   * Configura listeners nas filas do Bull
   */
  private setupQueueListeners() {
    // ========== RECEITA QUEUE ==========
    receitaQueue.on('active', (job: any) => {
      this.broadcast('receita', {
        type: 'processing',
        message: `🔄 Processando CNPJ: ${job.data.cnpj || job.id}`,
        jobId: job.id,
        data: job.data,
      });
    });

    receitaQueue.on('completed', (job: any, result: any) => {
      this.broadcast('receita', {
        type: 'success',
        message: `✅ CNPJ processado: ${result?.nomeFantasia || result?.razaoSocial || job.data.cnpj}`,
        jobId: job.id,
        result,
      });
    });

    receitaQueue.on('failed', (job: any, err: any) => {
      this.broadcast('receita', {
        type: 'error',
        message: `❌ Erro ao processar CNPJ ${job?.data?.cnpj}: ${err.message}`,
        jobId: job?.id,
        error: err.message,
      });
    });

    receitaQueue.on('progress', (job: any, progress: any) => {
      this.broadcast('receita', {
        type: 'progress',
        message: `📊 Progresso: ${progress}%`,
        jobId: job.id,
        progress,
      });
    });

    // ========== DOCUMENT LOOKUP QUEUE (CNPJA + SERPRO) ==========
    // Emite no canal 'receita' para compatibilidade com frontend
    documentLookupQueue.on('active', (job: any) => {
      this.broadcast('receita', {
        type: 'processing',
        message: `🔄 Consultando documento: ${job.data.clienteId || job.id}`,
        jobId: job.id,
        data: job.data,
      });
    });

    documentLookupQueue.on('completed', (job: any, result: any) => {
      const tipoDoc = result?.tipoDocumento || 'DOC';
      const fonte = result?.fonte || 'API';
      const nome = result?.nome || job.data.clienteId;
      this.broadcast('receita', {
        type: 'success',
        message: `✅ ${tipoDoc} processado (${fonte}): ${nome}`,
        jobId: job.id,
        result,
      });
    });

    documentLookupQueue.on('failed', (job: any, err: any) => {
      this.broadcast('receita', {
        type: 'error',
        message: `❌ Erro ao consultar documento ${job?.data?.clienteId}: ${err.message}`,
        jobId: job?.id,
        error: err.message,
      });
    });

    // ========== NORMALIZATION QUEUE ==========
    normalizationQueue.on('active', (job: any) => {
      this.broadcast('normalization', {
        type: 'processing',
        message: `📝 Normalizando endereço: ${job.data.clienteId || job.id}`,
        jobId: job.id,
        data: job.data,
      });
    });

    normalizationQueue.on('completed', (job: any, result: any) => {
      this.broadcast('normalization', {
        type: 'success',
        message: `✅ Endereço normalizado: ${result?.enderecoNormalizado || 'Sucesso'}`,
        jobId: job.id,
        result,
      });
    });

    normalizationQueue.on('failed', (job: any, err: any) => {
      this.broadcast('normalization', {
        type: 'error',
        message: `❌ Erro na normalização ${job?.id}: ${err.message}`,
        jobId: job?.id,
        error: err.message,
      });
    });

    // ========== GEOCODING QUEUE ==========
    geocodingQueue.on('active', (job: any) => {
      this.broadcast('geocoding', {
        type: 'processing',
        message: `🗺️ Geocodificando: ${job.data.endereco || job.id}`,
        jobId: job.id,
        data: job.data,
      });
    });

    geocodingQueue.on('completed', (job: any, result: any) => {
      this.broadcast('geocoding', {
        type: 'success',
        message: `✅ Geocodificação concluída: ${result?.formatted_address || 'Sucesso'}`,
        jobId: job.id,
        result,
      });
    });

    geocodingQueue.on('failed', (job: any, err: any) => {
      this.broadcast('geocoding', {
        type: 'error',
        message: `❌ Erro na geocodificação ${job?.id}: ${err.message}`,
        jobId: job?.id,
        error: err.message,
      });
    });

    // ========== PLACES QUEUE ==========
    placesQueue.on('active', (job: any) => {
      this.broadcast('places', {
        type: 'processing',
        message: `📍 Buscando Google Places: ${job.data.nome || job.id}`,
        jobId: job.id,
        data: job.data,
      });
    });

    placesQueue.on('completed', (job: any, result: any) => {
      this.broadcast('places', {
        type: 'success',
        message: `✅ Google Places encontrado: ${result?.name || 'Sucesso'} (${result?.fotos?.length || 0} fotos)`,
        jobId: job.id,
        result,
      });
    });

    placesQueue.on('failed', (job: any, err: any) => {
      this.broadcast('places', {
        type: 'error',
        message: `❌ Erro no Google Places ${job?.id}: ${err.message}`,
        jobId: job?.id,
        error: err.message,
      });
    });

    // ========== ANALYSIS QUEUE ==========
    analysisQueue.on('active', (job: any) => {
      this.broadcast('analysis', {
        type: 'processing',
        message: `🤖 Analisando com IA: Cliente ${job.data.clienteId}`,
        jobId: job.id,
        data: job.data,
      });
    });

    analysisQueue.on('completed', (job: any, result: any) => {
      // 🎯 VISION AI: Mostrar confiança geral (não tipologia - será classificada em worker separado)
      const confiancaGeral = result?.confiancaGeral !== undefined ? result.confiancaGeral : 0;
      const categoria = result?.confianciaCategoria || 'N/A';
      const fotosAnalisadas = result?.fotosAnalisadas || 0;

      this.broadcast('analysis', {
        type: 'success',
        message: `✅ Análise IA concluída: ${categoria} (${confiancaGeral}% confiança Vision AI)`,
        jobId: job.id,
        result: {
          confiancaGeral,
          categoria,
          fotosAnalisadas,
        },
      });
    });

    analysisQueue.on('failed', (job: any, err: any) => {
      this.broadcast('analysis', {
        type: 'error',
        message: `❌ Erro na análise IA ${job?.id}: ${err.message}`,
        jobId: job?.id,
        error: err.message,
      });
    });

    analysisQueue.on('progress', (job: any, progress: any) => {
      this.broadcast('analysis', {
        type: 'progress',
        message: `🔄 Analisando fotos: ${progress}%`,
        jobId: job.id,
        progress,
      });
    });

    // ========== TIPOLOGIA QUEUE ==========
    tipologiaQueue.on('active', (job: any) => {
      this.broadcast('tipologia', {
        type: 'processing',
        message: `🏷️ Classificando tipologia: ${job.data.nome || job.id}`,
        jobId: job.id,
        data: job.data,
      });
    });

    tipologiaQueue.on('completed', (job: any, result: any) => {
      const tipologia = result?.tipologia || 'N/A';
      const confianca = result?.confianca || 0;

      this.broadcast('tipologia', {
        type: 'success',
        message: `✅ Tipologia classificada: ${tipologia} (${confianca}% confiança)`,
        jobId: job.id,
        result: {
          tipologia,
          confianca,
        },
      });
    });

    tipologiaQueue.on('failed', (job: any, err: any) => {
      this.broadcast('tipologia', {
        type: 'error',
        message: `❌ Erro ao classificar tipologia ${job?.id}: ${err.message}`,
        jobId: job?.id,
        error: err.message,
      });
    });

    tipologiaQueue.on('progress', (job: any, progress: any) => {
      this.broadcast('tipologia', {
        type: 'progress',
        message: `📊 Classificando: ${progress}%`,
        jobId: job.id,
        progress,
      });
    });

    console.log('📡 SSE Log Broadcaster configurado para todas as filas');
  }

  /**
   * Obtém estatísticas dos clientes conectados
   */
  getStats() {
    const stats: Record<string, number> = {};
    this.clients.forEach((clients, queueName) => {
      stats[queueName] = clients.length;
    });
    return stats;
  }
}

// Singleton
export const sseLogBroadcaster = new SSELogBroadcaster();
