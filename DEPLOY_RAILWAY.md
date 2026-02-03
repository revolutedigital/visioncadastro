# Deploy no Railway - Arca AI (VisionCadastro)

## Pré-requisitos
- Conta no [Railway](https://railway.app)
- Repositório no GitHub
- Chaves de API (CNPJA, SERPRO, Google Maps, Anthropic)

---

## Passo 1: Criar Projeto no Railway

1. Acesse [railway.app](https://railway.app) e faça login
2. Clique em **New Project**
3. Selecione **Deploy from GitHub repo**
4. Autorize o Railway a acessar seu repositório
5. Selecione o repositório `visioncadastro`

---

## Passo 2: Adicionar Serviços

Você precisará de 3 serviços:

### 2.1 PostgreSQL
1. No projeto, clique em **+ New**
2. Selecione **Database** → **PostgreSQL**
3. Aguarde a criação
4. O Railway injetará automaticamente `DATABASE_URL`

### 2.2 Redis
1. Clique em **+ New**
2. Selecione **Database** → **Redis**
3. Aguarde a criação
4. O Railway injetará automaticamente `REDIS_URL`

### 2.3 Backend
1. Clique em **+ New** → **GitHub Repo**
2. Selecione o repositório
3. Em **Settings**:
   - **Root Directory**: `backend`
   - **Build Command**: `npm run build`
   - **Start Command**: `npm run start:migrate`

### 2.4 Frontend
1. Clique em **+ New** → **GitHub Repo**
2. Selecione o mesmo repositório
3. Em **Settings**:
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Start Command**: `npm run start`

---

## Passo 3: Configurar Variáveis de Ambiente

### Backend - Variables
Clique no serviço Backend → **Variables** → **Raw Editor** e cole:

```env
# Database (Railway injeta automaticamente)
# DATABASE_URL=já injetado

# Redis (Railway injeta automaticamente)
# REDIS_URL=já injetado

# ===== OBRIGATÓRIAS =====

# Google Maps API
GOOGLE_MAPS_API_KEY=sua_chave_google_maps

# Anthropic Claude API
ANTHROPIC_API_KEY=sua_chave_anthropic

# CNPJA API (cnpja.com)
CNPJA_API_KEY=sua_chave_cnpja

# SERPRO CPF API (OPCIONAL - usa Brasil API gratuito como fallback)
# Se quiser usar SERPRO oficial, descomente e configure:
# SERPRO_CPF_CONSUMER_KEY=sua_consumer_key_serpro
# SERPRO_CPF_CONSUMER_SECRET=sua_consumer_secret_serpro
# SERPRO_CPF_TOKEN_URL=https://gateway.apiserpro.serpro.gov.br/token
# SERPRO_CPF_API_URL=https://gateway.apiserpro.serpro.gov.br/consulta-cpf-df/v1/cpf

# JWT Secret (gere com: openssl rand -base64 32)
JWT_SECRET=sua_chave_jwt_super_secreta_minimo_32_caracteres

# ===== OPCIONAIS =====

# OpenAI (fallback)
OPENAI_API_KEY=

# Feature flags
USE_CNPJA=true
CLAUDE_VISION_MODEL=haiku

# App config
NODE_ENV=production
PORT=4000
PHOTOS_DIR=/app/uploads/fotos

# Frontend URL (para CORS) - atualize após deploy do frontend
FRONTEND_URL=https://seu-frontend.up.railway.app
```

### Frontend - Variables
Clique no serviço Frontend → **Variables**:

```env
VITE_API_URL=https://seu-backend.up.railway.app
```

---

## Passo 4: Conectar Serviços

1. Vá no serviço **Backend**
2. Clique em **Variables** → **Reference Variables**
3. Adicione referências para:
   - `DATABASE_URL` do PostgreSQL
   - `REDIS_URL` do Redis

---

## Passo 5: Gerar Domínios

### Backend
1. Backend → **Settings** → **Networking**
2. Clique em **Generate Domain**
3. Copie a URL (ex: `arca-backend.up.railway.app`)

### Frontend
1. Frontend → **Settings** → **Networking**
2. Clique em **Generate Domain**
3. Copie a URL (ex: `arca-frontend.up.railway.app`)

---

## Passo 6: Atualizar CORS

Volte no Backend → **Variables** e atualize:
```env
FRONTEND_URL=https://arca-frontend.up.railway.app
```

E no Frontend → **Variables**:
```env
VITE_API_URL=https://arca-backend.up.railway.app
```

---

## Passo 7: Deploy!

1. Faça commit das suas alterações:
```bash
git add .
git commit -m "chore: railway deploy config"
git push origin main
```

2. Railway detectará o push e fará deploy automaticamente
3. Acompanhe os logs em **Deployments** → **View Logs**

---

## Passo 8: Verificar Deploy

### Backend
```bash
curl https://seu-backend.up.railway.app/api/health
```
Deve retornar: `{"status":"ok"}`

### Frontend
Acesse `https://seu-frontend.up.railway.app` no navegador

---

## Passo 9: Volume para Fotos (Opcional)

Se quiser persistir fotos:

1. Backend → **Settings** → **Volumes**
2. Clique em **+ Add Volume**
3. Mount Path: `/app/uploads/fotos`
4. Clique em **Add**

---

## Troubleshooting

### Erro de Migration
Se der erro na migration, acesse o shell do container:
```bash
railway run --service=backend npx prisma migrate deploy
```

### Erro de CORS
Verifique se `FRONTEND_URL` no backend está correto.

### Erro de conexão Redis
Verifique se `REDIS_URL` está referenciado corretamente.

### Logs
Sempre verifique os logs em:
- Railway Dashboard → Serviço → Deployments → View Logs

---

## Resumo das URLs

| Serviço | Variável | Exemplo |
|---------|----------|---------|
| Backend | `VITE_API_URL` (frontend) | `https://arca-backend.up.railway.app` |
| Frontend | `FRONTEND_URL` (backend) | `https://arca-frontend.up.railway.app` |
| PostgreSQL | `DATABASE_URL` | Injetado automaticamente |
| Redis | `REDIS_URL` | Injetado automaticamente |

---

## Checklist Final

- [ ] PostgreSQL criado
- [ ] Redis criado
- [ ] Backend deployado
- [ ] Frontend deployado
- [ ] Variáveis de ambiente configuradas
- [ ] CORS configurado (`FRONTEND_URL`)
- [ ] API URL configurada (`VITE_API_URL`)
- [ ] Health check funcionando
- [ ] Volume montado (se necessário)
