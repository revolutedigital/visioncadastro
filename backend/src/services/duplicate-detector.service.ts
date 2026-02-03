import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Duplicate Detector Service
 * Detecta clientes com CNPJs/CPFs diferentes no mesmo endereço
 */
export class DuplicateDetectorService {
  /**
   * Detecta duplicatas por endereço normalizado (match exato)
   */
  async detectByAddress(clienteId: string): Promise<{ duplicatas: string[]; total: number }> {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        id: true,
        enderecoNormalizado: true,
        endereco: true,
        latitude: true,
        longitude: true,
      },
    });

    if (!cliente) return { duplicatas: [], total: 0 };

    const duplicatas: string[] = [];

    // Estratégia 1: Match exato de endereço normalizado
    if (cliente.enderecoNormalizado) {
      const matchesEndereco = await prisma.cliente.findMany({
        where: {
          id: { not: clienteId },
          enderecoNormalizado: cliente.enderecoNormalizado,
        },
        select: { id: true },
      });
      matchesEndereco.forEach((m) => {
        if (!duplicatas.includes(m.id)) duplicatas.push(m.id);
      });
    }

    // Estratégia 2: Coordenadas dentro de 50m
    if (cliente.latitude && cliente.longitude && duplicatas.length === 0) {
      // Haversine simplificado: ~0.00045 graus ≈ 50m
      const delta = 0.00045;
      const matchesCoordenadas = await prisma.cliente.findMany({
        where: {
          id: { not: clienteId },
          latitude: {
            gte: cliente.latitude - delta,
            lte: cliente.latitude + delta,
          },
          longitude: {
            gte: cliente.longitude - delta,
            lte: cliente.longitude + delta,
          },
        },
        select: { id: true },
      });
      matchesCoordenadas.forEach((m) => {
        if (!duplicatas.includes(m.id)) duplicatas.push(m.id);
      });
    }

    // Atualizar cliente
    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        duplicataEnderecoIds: duplicatas.length > 0 ? JSON.stringify(duplicatas) : null,
        duplicataEnderecoQtd: duplicatas.length,
        alertaDuplicata: duplicatas.length > 0,
      },
    });

    // Atualizar os outros clientes que também são duplicatas
    for (const dupId of duplicatas) {
      const existingDup = await prisma.cliente.findUnique({
        where: { id: dupId },
        select: { duplicataEnderecoIds: true },
      });

      let existingIds: string[] = [];
      if (existingDup?.duplicataEnderecoIds) {
        try { existingIds = JSON.parse(existingDup.duplicataEnderecoIds); } catch {}
      }

      if (!existingIds.includes(clienteId)) {
        existingIds.push(clienteId);
        await prisma.cliente.update({
          where: { id: dupId },
          data: {
            duplicataEnderecoIds: JSON.stringify(existingIds),
            duplicataEnderecoQtd: existingIds.length,
            alertaDuplicata: true,
          },
        });
      }
    }

    return { duplicatas, total: duplicatas.length };
  }
}

export const duplicateDetectorService = new DuplicateDetectorService();
