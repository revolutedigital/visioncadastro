import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import uploadRoutes from './routes/upload.routes';
import geocodingRoutes from './routes/geocoding.routes';
import placesRoutes from './routes/places.routes';
import analysisRoutes from './routes/analysis.routes';
import dataQualityRoutes from './routes/data-quality.routes';
import enrichmentRoutes from './routes/enrichment.routes';
import tipologiaRoutes from './routes/tipologia.routes';
import adminRoutes from './routes/admin.routes';
import authRoutes from './routes/auth.routes';
import { authMiddleware } from './middleware/auth.middleware';
import { errorHandler, notFoundHandler } from './middleware/error-handler';

// Carregar variáveis de ambiente
dotenv.config();

// Iniciar workers
import './workers/geocoding.worker';
import './workers/receita.worker';
import './workers/normalization.worker';
import './workers/places.worker';
import './workers/analysis.worker';
import './workers/enrichment.worker';
import './workers/arca-analyst.worker'; // Substitui tipologia.worker
import './workers/document-lookup.worker';

// Import das filas para despausar ao iniciar
import { geocodingQueue, receitaQueue, normalizationQueue, placesQueue, analysisQueue, tipologiaQueue, documentLookupQueue, duplicateDetectionQueue } from './queues/queue.config';

// Despausar todas as filas ao iniciar (caso tenham sido pausadas em sessão anterior)
async function resumeAllQueues() {
  try {
    await receitaQueue.resume();
    await normalizationQueue.resume();
    await geocodingQueue.resume();
    await placesQueue.resume();
    await analysisQueue.resume();
    await tipologiaQueue.resume();
    await documentLookupQueue.resume();
    await duplicateDetectionQueue.resume();
    console.log('✅ Todas as filas despausadas e prontas para processar');
  } catch (error) {
    console.error('⚠️  Erro ao despausar filas:', error);
  }
}

// Executar ao iniciar
resumeAllQueues();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Configuration para produção
const allowedOrigins = [
  'http://localhost:3000', // Dev local
  'http://localhost:5173', // Vite dev server
  process.env.FRONTEND_URL || '', // Railway frontend (configurável)
  'https://arcaai.up.railway.app', // Arca AI Frontend
  'https://arcaback.up.railway.app', // Arca AI Backend
  'https://scampepisico-frontend.up.railway.app', // Fallback Railway
  'https://visionaifront-production.up.railway.app', // Railway frontend produção
  'https://visionai-production.up.railway.app', // Backend Railway (para testes)
];

// CORS com lista de origens permitidas
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos (fotos) - Fallback para arquivos locais
const photosDir = process.env.PHOTOS_DIR || path.join(__dirname, '../uploads/fotos');
app.use('/api/fotos-local', express.static(photosDir));
console.log(`📁 Servindo fotos locais de: ${photosDir}`);

// Servir fotos: disco local primeiro, fallback para Google Places
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import fs from 'fs/promises';
const prisma = new PrismaClient();

app.get('/api/fotos/:fileName', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.params;
    const filePath = path.join(photosDir, fileName);

    // 1. Tentar servir do disco local (persistente)
    try {
      await fs.access(filePath);
      res.set({
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=604800', // Cache 7 dias
      });
      const fileBuffer = await fs.readFile(filePath);
      return res.send(fileBuffer);
    } catch {
      // Arquivo não existe no disco, tentar buscar do Google
    }

    // 2. Buscar foto no banco para obter photoReference
    const foto = await prisma.foto.findFirst({
      where: { fileName },
    });

    if (!foto) {
      return res.status(404).json({ error: 'Foto não encontrada' });
    }

    if (!foto.photoReference) {
      return res.status(404).json({ error: 'Photo reference não disponível' });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Google Maps API key não configurada' });
    }

    // 3. Buscar do Google Places e salvar localmente para persistência
    const googlePhotoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${foto.photoReference}&key=${apiKey}`;

    const photoResponse = await axios.get(googlePhotoUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    // Salvar no disco para próximas requisições
    try {
      await fs.mkdir(photosDir, { recursive: true });
      await fs.writeFile(filePath, photoResponse.data);
      console.log(`💾 Foto salva no disco: ${fileName}`);
    } catch (saveError: any) {
      console.warn(`⚠️ Não foi possível salvar foto no disco: ${saveError.message}`);
    }

    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=604800',
    });

    return res.send(photoResponse.data);
  } catch (error: any) {
    console.error('Erro ao servir foto:', error.message);
    return res.status(500).json({ error: 'Erro ao buscar foto' });
  }
});

// Rota de health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Rota inicial
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Sistema RAC - API',
    version: '0.5.0',
    endpoints: {
      health: '/health',
      upload: '/api/upload',
      uploads: '/api/uploads',
      geocoding: '/api/geocoding',
      geocodingStatus: '/api/geocoding/status',
      places: '/api/places',
      placesStatus: '/api/places/status',
      analysis: '/api/analysis',
      analysisStatus: '/api/analysis/status',
      dataQuality: '/api/data-quality',
      dataQualityReport: '/api/data-quality/report',
      enrichment: '/api/enrichment',
      enrichmentStatus: '/api/enrichment/status',
      tipologia: '/api/tipologia',
      tipologiaDistribuicao: '/api/tipologia/distribuicao',
    },
  });
});

// Rotas públicas (sem autenticação)
app.use('/api/auth', authRoutes);

// Rotas protegidas (requerem autenticação em produção)
const protectedRouter = express.Router();

// Em produção, aplicar middleware de auth em todas as rotas
if (process.env.NODE_ENV === 'production') {
  protectedRouter.use(authMiddleware);
  console.log('🔐 Autenticação JWT ativada em produção');
} else {
  console.log('⚠️  Autenticação desativada em desenvolvimento');
}

protectedRouter.use('/upload', uploadRoutes);
protectedRouter.use('/geocoding', geocodingRoutes);
protectedRouter.use('/places', placesRoutes);
protectedRouter.use('/analysis', analysisRoutes);
protectedRouter.use('/data-quality', dataQualityRoutes);
protectedRouter.use('/enrichment', enrichmentRoutes);
protectedRouter.use('/tipologia', tipologiaRoutes);
protectedRouter.use('/admin', adminRoutes);

app.use('/api', protectedRouter);

// Error handling middlewares (must be AFTER all routes)
app.use(notFoundHandler);
app.use(errorHandler);

// Iniciar servidor
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================
// Garante que o servidor encerra de forma limpa em produção
// Railway envia SIGTERM ao fazer redeploy

async function gracefulShutdown(signal: string) {
  console.log(`\n⚠️  ${signal} recebido. Iniciando graceful shutdown...`);

  // Timeout de segurança (30 segundos)
  const shutdownTimeout = setTimeout(() => {
    console.error('❌ Shutdown timeout! Forçando encerramento...');
    process.exit(1);
  }, 30000);

  try {
    // 1. Parar de aceitar novas conexões
    console.log('1️⃣ Fechando servidor HTTP...');
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // 2. Pausar todas as filas do Bull
    console.log('2️⃣ Pausando filas do Bull...');
    await Promise.all([
      receitaQueue.pause(),
      normalizationQueue.pause(),
      geocodingQueue.pause(),
      placesQueue.pause(),
      analysisQueue.pause(),
      tipologiaQueue.pause(),
      documentLookupQueue.pause(),
      duplicateDetectionQueue.pause(),
    ]);

    // 3. Desconectar Prisma
    console.log('3️⃣ Desconectando Prisma...');
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.$disconnect();

    console.log('✅ Shutdown concluído com sucesso');
    clearTimeout(shutdownTimeout);
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro durante shutdown:', error);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

// Capturar sinais de término
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Capturar erros não tratados
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});
