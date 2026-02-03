import { Request, Response } from 'express';
import { ParserService } from '../services/parser.service';
import { AIParserService } from '../services/ai-parser.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const parserService = new ParserService();
const aiParserService = new AIParserService();

export class UploadController {
  /**
   * Sugerir mapeamento de colunas com IA
   * POST /api/upload/suggest-mapping
   */
  async suggestMapping(req: Request, res: Response) {
    try {
      // Validar se arquivo foi enviado
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Nenhum arquivo foi enviado',
        });
      }

      const file = req.file;
      const extensao = file.originalname.split('.').pop()?.toLowerCase();

      // Validar tipo de arquivo
      if (!['xlsx', 'xls', 'csv'].includes(extensao || '')) {
        return res.status(400).json({
          success: false,
          error: 'Tipo de arquivo inválido. Aceito apenas .xlsx, .xls ou .csv',
        });
      }

      console.log('🤖 Usando IA para identificar colunas da planilha...');

      // Usar IA para identificar colunas automaticamente
      const fileType = extensao === 'csv' ? 'csv' : 'excel';
      const columnMapping = await aiParserService.identifyColumns(file.buffer, fileType);

      console.log('✅ Colunas identificadas pela IA:', columnMapping);

      return res.json({
        success: true,
        mapping: columnMapping,
      });
    } catch (error) {
      console.error('Erro ao sugerir mapeamento:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao processar sugestão de mapeamento',
        details: (error as Error).message,
      });
    }
  }

  /**
   * Upload de planilha
   * POST /api/upload
   */
  async upload(req: Request, res: Response) {
    try {
      // Validar se arquivo foi enviado
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Nenhum arquivo foi enviado',
        });
      }

      const file = req.file;
      const extensao = file.originalname.split('.').pop()?.toLowerCase();

      // Validar tipo de arquivo
      if (!['xlsx', 'xls', 'csv'].includes(extensao || '')) {
        return res.status(400).json({
          success: false,
          error: 'Tipo de arquivo inválido. Aceito apenas .xlsx, .xls ou .csv',
        });
      }

      console.log('🤖 Usando IA para identificar colunas da planilha...');

      // Usar IA para identificar colunas automaticamente
      const fileType = extensao === 'csv' ? 'csv' : 'excel';
      const columnMapping = await aiParserService.identifyColumns(file.buffer, fileType);

      console.log('✅ Colunas identificadas pela IA:', columnMapping);

      // Extrair dados usando o mapeamento identificado pela IA
      const extractedData = aiParserService.extractDataWithMapping(file.buffer, fileType, columnMapping);

      console.log(`📊 Dados extraídos: ${extractedData.length} linhas`);
      if (extractedData.length > 0) {
        console.log('📊 Exemplo primeira linha:', JSON.stringify(extractedData[0]));
      }

      if (extractedData.length === 0) {
        console.log('❌ Nenhum dado extraído da planilha');
        return res.status(400).json({
          success: false,
          error: 'Nenhum dado válido encontrado na planilha',
        });
      }

      // Normalizar e validar dados extraídos
      const clientes: any[] = [];
      const errors: string[] = [];

      extractedData.forEach((row, index) => {
        const linha = index + 2;

        try {
          // Validação básica - apenas CNPJ é obrigatório (nome/endereco vem da Receita)
          if (!row.cnpj) {
            errors.push(`Linha ${linha}: CNPJ/CPF faltando`);
            return;
          }

          // Normalizar dados
          const cliente = {
            nome: row.nome ? row.nome.trim().replace(/\s+/g, ' ') : '',
            telefone: row.telefone ? String(row.telefone).replace(/\D/g, '') : null,
            endereco: row.endereco ? row.endereco.trim().replace(/\s+/g, ' ') : '',
            cidade: row.cidade ? row.cidade.trim() : null,
            estado: row.estado ? row.estado.trim().toUpperCase() : null,
            cep: row.cep ? String(row.cep).replace(/\D/g, '') : null,
            cnpj: row.cnpj ? String(row.cnpj).replace(/\D/g, '') : null,
          };

          clientes.push(cliente);
        } catch (error) {
          errors.push(`Linha ${linha}: ${(error as Error).message}`);
        }
      });

      if (clientes.length === 0) {
        console.log('❌ Nenhum cliente válido após validação');
        console.log('❌ Erros encontrados:', errors);
        return res.status(400).json({
          success: false,
          error: 'Erro ao processar planilha',
          details: errors,
        });
      }

      console.log(`✅ ${clientes.length} clientes validados com sucesso`);

      const parseResult = {
        success: true,
        data: clientes,
        errors,
        totalLinhas: extractedData.length,
      };

      // Detectar duplicatas
      const duplicatas = parserService.detectarDuplicatas(parseResult.data);

      // Criar registro da planilha
      const planilha = await prisma.planilha.create({
        data: {
          nomeArquivo: file.originalname,
          status: 'PROCESSANDO',
          totalLinhas: parseResult.totalLinhas,
        },
      });

      // Processar clientes: atualizar duplicatas ou criar novos
      let clientesCriados = 0;
      let clientesAtualizados = 0;
      let clientesPulados = 0;

      for (const cliente of parseResult.data) {
        // Buscar cliente existente - prioridade: CNPJ, depois nome+endereco
        let clienteExistente = null;

        // 1. Buscar por CNPJ (mais confiável)
        if (cliente.cnpj) {
          clienteExistente = await prisma.cliente.findFirst({
            where: { cnpj: cliente.cnpj },
          });
        }

        // 2. Se não tem CNPJ ou não achou, buscar por nome+endereco (se tiver)
        if (!clienteExistente && cliente.nome && cliente.endereco) {
          clienteExistente = await prisma.cliente.findFirst({
            where: {
              AND: [
                { nome: { contains: cliente.nome.substring(0, 20), mode: 'insensitive' } },
                { endereco: { contains: cliente.endereco.substring(0, 20), mode: 'insensitive' } },
              ],
            },
          });
        }

        if (clienteExistente) {
          // Cliente duplicado encontrado - atualizar apenas campos vazios
          const updateData: any = {};
          let temAtualizacao = false;

          if (!clienteExistente.telefone && cliente.telefone) {
            updateData.telefone = cliente.telefone;
            temAtualizacao = true;
          }
          if (!clienteExistente.cidade && cliente.cidade) {
            updateData.cidade = cliente.cidade;
            temAtualizacao = true;
          }
          if (!clienteExistente.estado && cliente.estado) {
            updateData.estado = cliente.estado;
            temAtualizacao = true;
          }
          if (!clienteExistente.cep && cliente.cep) {
            updateData.cep = cliente.cep;
            temAtualizacao = true;
          }
          if (!clienteExistente.cnpj && cliente.cnpj) {
            updateData.cnpj = cliente.cnpj;
            temAtualizacao = true;
          }

          if (temAtualizacao) {
            await prisma.cliente.update({
              where: { id: clienteExistente.id },
              data: updateData,
            });
            clientesAtualizados++;
            console.log(`✓ Cliente "${cliente.nome}" atualizado com novos dados`);
          } else {
            clientesPulados++;
            console.log(`⊘ Cliente "${cliente.nome}" já existe sem dados novos - pulado`);
          }
        } else {
          // Cliente novo - criar
          await prisma.cliente.create({
            data: {
              planilhaId: planilha.id,
              nome: cliente.nome,
              telefone: cliente.telefone || null,
              endereco: cliente.endereco,
              cidade: cliente.cidade || null,
              estado: cliente.estado || null,
              cep: cliente.cep || null,
              cnpj: cliente.cnpj || null,
              status: 'PENDENTE',
            },
          });
          clientesCriados++;
        }
      }

      // Atualizar status da planilha
      await prisma.planilha.update({
        where: { id: planilha.id },
        data: { status: 'CONCLUIDO' },
      });

      console.log(`\n📊 Resumo do Upload:`);
      console.log(`   ✓ Clientes criados: ${clientesCriados}`);
      console.log(`   ↻ Clientes atualizados: ${clientesAtualizados}`);
      console.log(`   ⊘ Clientes pulados (duplicatas sem dados novos): ${clientesPulados}`);

      return res.status(201).json({
        success: true,
        message: 'Planilha processada com sucesso',
        data: {
          planilhaId: planilha.id,
          nomeArquivo: file.originalname,
          totalLinhas: parseResult.totalLinhas,
          clientesCriados,
          clientesAtualizados,
          clientesPulados,
          erros: parseResult.errors,
          duplicatasDetectadas: duplicatas.size,
        },
      });
    } catch (error) {
      console.error('Erro no upload:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno ao processar upload',
        details: (error as Error).message,
      });
    }
  }

  /**
   * Listar planilhas enviadas
   * GET /api/uploads
   */
  async listar(req: Request, res: Response) {
    try {
      const planilhas = await prisma.planilha.findMany({
        orderBy: { uploadedAt: 'desc' },
        include: {
          _count: {
            select: { clientes: true },
          },
        },
      });

      return res.json({
        success: true,
        data: planilhas.map(p => ({
          id: p.id,
          nomeArquivo: p.nomeArquivo,
          status: p.status,
          totalLinhas: p.totalLinhas,
          totalClientes: p._count.clientes,
          uploadedAt: p.uploadedAt,
        })),
      });
    } catch (error) {
      console.error('Erro ao listar planilhas:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao listar planilhas',
      });
    }
  }

  /**
   * Detalhes de uma planilha
   * GET /api/uploads/:id
   */
  async detalhes(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const planilha = await prisma.planilha.findUnique({
        where: { id },
        include: {
          clientes: {
            take: 10, // Primeiros 10 clientes
            orderBy: { createdAt: 'asc' },
          },
          _count: {
            select: { clientes: true },
          },
        },
      });

      if (!planilha) {
        return res.status(404).json({
          success: false,
          error: 'Planilha não encontrada',
        });
      }

      return res.json({
        success: true,
        data: {
          id: planilha.id,
          nomeArquivo: planilha.nomeArquivo,
          status: planilha.status,
          totalLinhas: planilha.totalLinhas,
          totalClientes: planilha._count.clientes,
          uploadedAt: planilha.uploadedAt,
          preview: planilha.clientes,
        },
      });
    } catch (error) {
      console.error('Erro ao buscar planilha:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar planilha',
      });
    }
  }
}
