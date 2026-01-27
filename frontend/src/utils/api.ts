import { API_BASE_URL } from '../config/api';

const TOKEN_KEY = 'auth_token';

/**
 * Fetch autenticado - adiciona token JWT automaticamente
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY);

  const headers = new Headers(options.headers);

  // Apenas setar Content-Type se não for FormData
  // FormData precisa que o browser defina o Content-Type automaticamente com boundary
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Se retornar 401, limpar tokens (mas não redirecionar - deixa o React Router fazer isso)
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('auth_user');
    // Não fazer redirect aqui para evitar loops - o ProtectedRoute vai redirecionar
    throw new Error('Sessao expirada');
  }

  return response;
}

/**
 * Helper para fazer GET autenticado
 */
export async function apiGet<T>(endpoint: string): Promise<T> {
  const response = await authFetch(`${API_BASE_URL}${endpoint}`);
  return response.json();
}

/**
 * Helper para fazer POST autenticado
 */
export async function apiPost<T>(endpoint: string, data?: unknown): Promise<T> {
  const response = await authFetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
  return response.json();
}

/**
 * Helper para fazer PUT autenticado
 */
export async function apiPut<T>(endpoint: string, data?: unknown): Promise<T> {
  const response = await authFetch(`${API_BASE_URL}${endpoint}`, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });
  return response.json();
}

/**
 * Helper para fazer DELETE autenticado
 */
export async function apiDelete<T>(endpoint: string): Promise<T> {
  const response = await authFetch(`${API_BASE_URL}${endpoint}`, {
    method: 'DELETE',
  });
  return response.json();
}
