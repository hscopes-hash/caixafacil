# 📊 ESTADO ATUAL DO PROJETO — CaixaFacil

> Snapshot atualizado em: **20/06/2026**
> Atualizar este arquivo após cada sessão significativa.

---

## 🌐 Ambiente

| Item | Valor |
|------|-------|
| **Repositório GitHub** | https://github.com/hscopes-hash/caixafacil |
| **Deploy Vercel (produção)** | https://caixafacil-theta.vercel.app |
| **Deploy Vercel (URL longa)** | https://caixafacil-hscopes-4523s-projects.vercel.app |
| **Projeto Vercel ID** | `prj_joOPtECjt2iC2zoyGEe1n4VT1eF6` |
| **Team Vercel** | `hscopes-4523s-projects` |
| **Plano Vercel** | Hobby |
| **Node version** | 24.x |
| **Prisma version** | 6.19.3 (NUNCA 7.x) |

---

## 📦 Versão atual

| Local | Versão |
|-------|--------|
| GitHub (`version.ts`) | `v2.46.0.524` |
| Produção Vercel | `v2.46.0.525` |
| Próximo deploy (auto-bump) | `v2.46.0.526` |

Verificar versão produção: `curl -s https://caixafacil-theta.vercel.app | grep -oE 'v[0-9.]+(\s*\([0-9-]+\))?' | head -3`

---

## 🌐 Domínios

| Domínio | Status |
|---------|--------|
| `caixafaciloficial.web.app` | ✅ Funciona (redirect → Vercel) — **URL principal** |
| `caixafacil-pos.web.app` | ✅ Funciona (redirect → Vercel) |
| `caixafacil-cob.web.app` | ✅ Funciona (redirect → Vercel) |
| `utopian-splicer-255210.web.app` | ✅ Funciona (redirect → Vercel) |
| `caixafacil.web.app` | ❌ Não acessível — domínio de outro projeto Firebase |
| `caixafacil-theta.vercel.app` | ✅ HTTP 200 (curl + browser) |
| `caixafacil-hscopes-4523s-projects.vercel.app` | ✅ Browser OK / curl 401 (Shield) |

---

## 🔐 Credenciais e Acesso

### No Vercel (env vars) — 20 variáveis configuradas
Inclui:
- `DATABASE_URL` + variantes PostgreSQL
- `MERCADOPAGO_PUBLIC_KEY` + `MERCADOPAGO_ACCESS_TOKEN`
- `LLM_MODEL=gemini-2.5-flash-lite`
- `FOTO_ENCRYPTION_KEY` + `FOTO_BUCKET`
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` (SA JSON completa, encrypted)

### Service Account Google Cloud
- **Email:** `caixafacil-app-identity@utopian-splicer-255210.iam.gserviceaccount.com`
- **Project:** `utopian-splicer-255210`
- **Permissões confirmadas:** Vertex AI (Gemini 2.5), listagem de sites Firebase
- **Local:** `/home/z/my-project/.secrets/caixafacil-deployer.json` (chmod 600)

### Token Vercel
- **Não versionado por segurança** (GitHub Push Protection bloqueia)
- Solicitar ao usuário no início da sessão (ou já hardcoded no `recovery.sh` local, fora do repo)
- Formato: `vcp_...` (Vercel Personal Access Token)

### Banco PostgreSQL (Google Cloud SQL)
- Host: `34.95.239.246:5432`
- Database: `caixafacil`
- User: `postgres`

---

## ✅ Funcionalidades confirmadas funcionando

- ✅ Chat IA (Gemini 2.5 Flash via Vertex AI)
- ✅ OCR de máquinas (Gemini 2.5 Flash via Vertex AI)
- ✅ Suporte a SA JSON no `ai-vision.ts` (funciona no Vercel sem metadata server)
- ✅ Telegram (envio de extrato + fotos via `/api/telegram/send`)
- ✅ Fechamentos anteriores (raw SQL corrigido em 18/06)
- ✅ Vercel Shield bloqueia curl mas permite navegadores reais (esperado)
- ✅ Endpoint diagnóstico: `/api/diag-vertex` (testa SA + Token + chamada Gemini)

---

## 🗂️ Estrutura de arquivos

```
work/build-deploy/work/build-deploy/   # Root do projeto Next.js
├── prisma/
│   └── schema.prisma                   # Schema Prisma (20+ models)
├── src/
│   ├── app/
│   │   ├── page.tsx                    # ⚠️ ~14075 linhas, 641KB — arquivo maior
│   │   ├── admin/page.tsx              # Painel admin
│   │   ├── site/page.tsx               # Landing page
│   │   └── api/                        # 78+ endpoints API
│   │       ├── chat-ia/                # Chat com Gemini
│   │       ├── leituras/               # Leituras de máquinas + OCR
│   │       │   └── fechamentos-anteriores/route.ts  # ⚠️ raw SQL corrigido
│   │       ├── telegram/send/          # Envio extrato + fotos
│   │       ├── diag-vertex/            # Diagnóstico Vertex AI
│   │       ├── mercadopago/            # Pagamentos
│   │       └── ...
│   └── lib/
│       ├── ai-vision.ts                # Vertex AI + SA JSON + compressão sharp
│       ├── zhipu-auth.ts               # Autenticação GLM (legado)
│       ├── db.ts                       # Prisma client
│       ├── crypto.ts                   # Criptografia fotos
│       └── version.ts                  # ⚠️ Auto-bump no build
├── scripts/
│   ├── increment-version.mjs           # Auto-versioning
│   └── print-version.mjs              # Exibe versão no build log
├── recovery/                           # ← ESTE DIRETÓRIO
│   ├── README.md
│   ├── REGRAS.md
│   ├── ESTADO_ATUAL.md (este arquivo)
│   ├── HISTORICO_SESSOES.md
│   ├── recovery.sh
│   └── env.local.template
├── package.json
├── .env.local                          # ⚠️ Não versionado — recriado pelo recovery.sh
├── firebase.json                       # Redirect utopian-splicer
├── firebase-hosting/                   # Redirect caixafaciloficial
├── caixacil-pos-hosting/               # Redirect caixafacil-pos
└── caixafacil-cob/                     # Redirect caixafacil-cob
```

---

## 📝 Pendências conhecidas

### Nenhuma pendência crítica

Todas as pendências documentadas em sessões anteriores foram resolvidas:
- ✅ CÂMARA → CÂMERA (corrigido em 18/06)
- ✅ Seletor de modelos Gemini (corrigido em 18/06)
- ✅ Suporte a SA JSON no Vercel (implementado em 18/06)
- ✅ Raw SQL com nomes de tabela (corrigido em 18/06)
- ✅ Endpoint de diagnóstico (`/api/diag-vertex`)

### Pendências menores (sem urgência)
- 📋 Atualizar documentação interna: URL principal = `caixafaciloficial.web.app` (não `caixafacil.web.app`)
- 📋 Considerar atualizar redirects Firebase para apontar para `caixafacil-theta.vercel.app` (URL mais curta)

---

## 🚀 Comandos rápidos

### Build local
```bash
cd /home/z/my-project/work/build-deploy/work/build-deploy
npm run build
# Auto-bump da versão + prisma generate + next build
```

### Deploy produção
```bash
# TOKEN Vercel: solicitar ao usuário (não versionado por segurança)
TOKEN="<VERCEL_TOKEN>"
PROJ_DIR="/home/z/my-project/work/build-deploy/work/build-deploy"

rm -rf /tmp/caixafacil-deploy-staging
mkdir -p /tmp/caixafacil-deploy-staging/work/build-deploy
cp -r $PROJ_DIR/* /tmp/caixafacil-deploy-staging/work/build-deploy/
rm -rf /tmp/caixafacil-deploy-staging/work/build-deploy/.vercel 2>/dev/null

cd /tmp/caixafacil-deploy-staging
npx vercel link --scope hscopes-4523s-projects --project caixafacil --yes --token="$TOKEN"
npx vercel deploy --prod --yes --token="$TOKEN"
```

### Validar versão pós-deploy
```bash
# Versão esperada (após build)
grep VERSION_DISPLAY /home/z/my-project/work/build-deploy/work/build-deploy/src/lib/version.ts

# Versão em produção (pode demorar 30-60s para propagar)
curl -s https://caixafacil-theta.vercel.app | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1
```

### Testar Vertex AI
```bash
curl -s https://caixafacil-theta.vercel.app/api/diag-vertex | python3 -m json.tool
# Deve retornar: sa.has_GOOGLE_APPLICATION_CREDENTIALS_JSON: true, token.obtained: true, gemini.ok: true
```

### Push para GitHub (automático após commit)
```bash
cd /home/z/my-project/work/build-deploy
git add -A
git commit -m "descrição da mudança"
git push origin main
```
