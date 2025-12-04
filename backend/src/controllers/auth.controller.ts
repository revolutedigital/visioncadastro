import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'scampepisico-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d'; // Token válido por 7 dias

// Usuários hardcoded - em produção, mover para database
// Senhas são hashes bcrypt
const USERS = [
  {
    id: '1',
    email: 'admin@scampepisico.com',
    name: 'Administrador',
    // Senha: admin123
    passwordHash: '$2a$10$xVWsU8E8L5FzKqPsYFzxA.5JQX1z5L8tZjI6XqK9GmJW5J6ZQxLfK',
  },
  {
    id: '2',
    email: 'igor@revolutedigital.com.br',
    name: 'Igor',
    // Senha: revolute2024
    passwordHash: '$2a$10$YzV1234567890abcdefghijklmnopqrstuvwxyzABCDEFGH',
  },
  {
    id: '3',
    email: 'admin@pepsico.com',
    name: 'Admin PepsiCo',
    // Senha: pepsico2024
    passwordHash: '$2a$10$placeholder', // Será gerado automaticamente
  },
];

// Inicializar senhas na primeira execução
let usersInitialized = false;
const initializeUsers = async () => {
  if (usersInitialized) return;

  // Gerar hashes para as senhas padrão
  USERS[0].passwordHash = await bcrypt.hash('admin123', 10);
  USERS[1].passwordHash = await bcrypt.hash('revolute2024', 10);
  USERS[2].passwordHash = await bcrypt.hash('pepsico2024', 10);

  usersInitialized = true;
  console.log('✅ Usuários de autenticação inicializados');
};

// Inicializar ao carregar o módulo
initializeUsers();

export class AuthController {
  /**
   * POST /api/auth/login
   * Autenticar usuário e retornar token JWT
   */
  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email e senha são obrigatórios',
        });
      }

      // Aguardar inicialização dos usuários
      await initializeUsers();

      // Buscar usuário
      const user = USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Credenciais inválidas',
        });
      }

      // Verificar senha
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);

      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: 'Credenciais inválidas',
        });
      }

      // Gerar token JWT
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      console.log(`✅ Login bem-sucedido: ${user.email}`);

      return res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        expiresIn: JWT_EXPIRES_IN,
      });
    } catch (error: any) {
      console.error('❌ Erro no login:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno ao processar login',
      });
    }
  }

  /**
   * GET /api/auth/me
   * Retornar dados do usuário autenticado
   */
  async me(req: Request, res: Response) {
    try {
      // O middleware já validou o token e adicionou o user ao request
      const user = (req as any).user;

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Não autenticado',
        });
      }

      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      });
    } catch (error: any) {
      console.error('❌ Erro ao buscar usuário:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno',
      });
    }
  }

  /**
   * POST /api/auth/refresh
   * Renovar token JWT
   */
  async refresh(req: Request, res: Response) {
    try {
      const user = (req as any).user;

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Não autenticado',
        });
      }

      // Gerar novo token
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      return res.json({
        success: true,
        token,
        expiresIn: JWT_EXPIRES_IN,
      });
    } catch (error: any) {
      console.error('❌ Erro ao renovar token:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro interno',
      });
    }
  }
}
