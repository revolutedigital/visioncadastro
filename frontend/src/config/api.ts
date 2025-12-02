/**
 * API Configuration
 * Configura a URL base da API baseado no ambiente
 */

// Em produção, usa a URL do Railway. Em dev, usa localhost
export const API_BASE_URL = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? 'https://visionai-production.up.railway.app'
    : 'http://localhost:4000');

console.log('🔗 API Base URL:', API_BASE_URL);
