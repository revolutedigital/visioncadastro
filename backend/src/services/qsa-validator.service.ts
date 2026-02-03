import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * QSA Validator Service
 * Valida se CPFs cadastrados fazem parte do quadro societário de alguma empresa
 */
export class QsaValidatorService {
  /**
   * Verifica se o CPF de um cliente consta no quadro societário de alguma empresa
   */
  async validateCpfAgainstQsa(clienteId: string): Promise<{
    found: boolean;
    relationship?: string;
    empresaId?: string;
  }> {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        id: true,
        cpf: true,
        cnpj: true,
        tipoDocumento: true,
      },
    });

    if (!cliente) return { found: false };

    // Só validar se o cliente é CPF
    if (cliente.tipoDocumento !== 'CPF' || !cliente.cpf) {
      await prisma.cliente.update({
        where: { id: clienteId },
        data: {
          cpfNoQuadroSocietario: null,
          alertaCpfNaoRelacionado: false,
        },
      });
      return { found: false };
    }

    const cpfLimpo = cliente.cpf.replace(/[^\d]/g, '');

    // Buscar em todos os clientes que têm quadro societário
    const empresasComQsa = await prisma.cliente.findMany({
      where: {
        tipoDocumento: 'CNPJ',
        quadroSocietario: { not: null },
      },
      select: {
        id: true,
        nome: true,
        cnpj: true,
        quadroSocietario: true,
      },
    });

    for (const empresa of empresasComQsa) {
      if (!empresa.quadroSocietario) continue;

      try {
        const socios = JSON.parse(empresa.quadroSocietario);
        const encontrado = socios.find(
          (s: any) => s.cpf && s.cpf.replace(/[^\d]/g, '') === cpfLimpo
        );

        if (encontrado) {
          const relationship = JSON.stringify({
            empresaId: empresa.id,
            empresaNome: empresa.nome,
            empresaCnpj: empresa.cnpj,
            qualificacao: encontrado.qualificacao,
            dataEntrada: encontrado.dataEntrada,
          });

          await prisma.cliente.update({
            where: { id: clienteId },
            data: {
              cpfNoQuadroSocietario: true,
              cpfQsaRelacionamento: relationship,
              alertaCpfNaoRelacionado: false,
            },
          });

          return { found: true, relationship, empresaId: empresa.id };
        }
      } catch {}
    }

    // CPF não encontrado em nenhum QSA
    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        cpfNoQuadroSocietario: false,
        alertaCpfNaoRelacionado: true,
      },
    });

    return { found: false };
  }
}

export const qsaValidatorService = new QsaValidatorService();
