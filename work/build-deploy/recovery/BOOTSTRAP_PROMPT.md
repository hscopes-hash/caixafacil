# 🚀 Bootstrap Prompt — CaixaFacil Nova Sessão

> **Copie TODO o conteúdo abaixo (entre as linhas tracejadas) e cole na nova sessão.**
> **Substitua os placeholders `[COLAR_...]` pelas credenciais antes de enviar.**

---

## Instruções para a nova sessão

Você é o Super Z continuando o projeto CaixaFacil. O workspace pode ter sido resetado. Siga exatamente este procedimento.

### Passo 1 — Configurar PAT GitHub

```bash
mkdir -p /home/z/my-project/.secrets
echo 'https://hscopes-hash:[COLAR_PAT_GITHUB]@github.com' > /home/z/my-project/.secrets/.git-credentials
chmod 600 /home/z/my-project/.secrets/.git-credentials
git config --global credential.helper "store --file=/home/z/my-project/.secrets/.git-credentials"
```

### Passo 2 — Clonar repositório

```bash
mkdir -p /home/z/my-project
cd /home/z/my-project
git clone https://github.com/hscopes-hash/caixafacil.git work/build-deploy
```

### Passo 3 — Executar recovery script

```bash
bash /home/z/my-project/work/build-deploy/work/build-deploy/recovery/recovery.sh
```

### Passo 4 — Recriar .env.local com valores reais

```bash
cat > /home/z/my-project/work/build-deploy/work/build-deploy/.env.local << 'EOF'
DATABASE_URL=postgresql://postgres:CxF2026Secure!@34.95.239.246:5432/caixafacil?sslmode=prefer
POSTGRES_PRISMA_URL=postgresql://postgres:CxF2026Secure!@34.95.239.246:5432/caixafacil?sslmode=prefer&connect_timeout=15
POSTGRES_URL_NON_POOLING=postgresql://postgres:CxF2026Secure!@34.95.239.246:5432/caixafacil?sslmode=prefer&connect_timeout=15
MERCADOPAGO_PUBLIC_KEY=APP_USR-07f1899c-b08d-4995-9e83-b0016ff91691
MERCADOPAGO_ACCESS_TOKEN=APP_USR-3033966537377253-041912-a864df2a414f05d1c8c68073a44bab66-3346873858
LLM_MODEL=gemini-2.5-flash-lite
POSTGRES_URL=postgresql://postgres:CxF2026Secure!@34.95.239.246:5432/caixafacil?sslmode=prefer
POSTGRES_URL_NO_SSL=postgresql://postgres:CxF2026Secure!@34.95.239.246:5432/caixafacil
PGHOST=34.95.239.246
PGPORT=5432
PGUSER=postgres
PGPASSWORD=CxF2026Secure!
PGDATABASE=caixafacil
POSTGRES_USER=postgres
POSTGRES_PASSWORD=CxF2026Secure!
POSTGRES_DATABASE=caixafacil
POSTGRES_HOST=34.95.239.246
FOTO_ENCRYPTION_KEY=33b8c8db03a6076bc47e238fea99ef3cf4b146a7fdeb368ae533e6ad8f50e548
FOTO_BUCKET=caixafacil-leitura-fotos
EOF
chmod 600 /home/z/my-project/work/build-deploy/work/build-deploy/.env.local
```

### Passo 5 — Configurar Token Vercel (variável de ambiente)

```bash
export VERCEL_TOKEN="[COLAR_VERCEL_TOKEN]"
```

### Passo 6 — (Opcional) Configurar SA JSON se for mexer em Firebase/Vertex local

```bash
cat > /home/z/my-project/.secrets/caixafacil-deployer.json << 'EOF'
[COLAR_SA_JSON_COMPLETA]
EOF
chmod 600 /home/z/my-project/.secrets/caixafacil-deployer.json
```

### Passo 7 — Ler documentação do projeto

```bash
cat /home/z/my-project/work/build-deploy/work/build-deploy/recovery/REGRAS.md
cat /home/z/my-project/work/build-deploy/work/build-deploy/recovery/ESTADO_ATUAL.md
cat /home/z/my-project/work/build-deploy/work/build-deploy/recovery/HISTORICO_SESSOES.md
```

---

## Resumo das regras (NÃO esquecer)

1. **Subagentes são SOMENTE para pesquisa** — nunca editar arquivos
2. **Push GitHub é AUTOMÁTICO** após cada commit (Opção C)
3. **Build/Deploy Vercel SÓ com ordem explícita** ("deploy", "publique")
4. **Prisma 6.19.3** (nunca 7.x)
5. **Raw SQL**: nomes de tabela minúsculos sem aspas (`FROM leituras` não `FROM "Leitura"`)
6. **Somente Gemini 2.5** (`gemini-2.5-flash` ou `gemini-2.5-pro`) — modelos 3.x não existem
7. **Sem rate limiting** (usuário confirmou que custo não é problema)
8. **Pós-deploy**: validar versão via `curl https://caixafacil-theta.vercel.app | grep -oE 'v[0-9.]+\.[0-9]+'`

## Credenciais necessárias (substituir acima)

- `[COLAR_PAT_GITHUB]` — Token GitHub (formato: `ghp_...`)
- `[COLAR_VERCEL_TOKEN]` — Token Vercel (formato: `vcp_...`)
- `[COLAR_SA_JSON_COMPLETA]` — Apenas se for mexer em Firebase/Vertex local

## Estado atual (snapshot rápido)

- **Versão produção:** v2.46.0.525 (verificar com curl)
- **Deploy URL:** https://caixafacil-theta.vercel.app
- **GitHub:** https://github.com/hscopes-hash/caixafacil
- **URL principal de divulgação:** https://caixafaciloficial.web.app

---

## ✅ Pronto para implementar

Após completar os passos 1-7, o ambiente está pronto. O usuário vai pedir implementações. Lembre-se:
- Implementar → Commit → Push automático
- Aguardar ordem explícita para build/deploy Vercel
- Validar versão após cada deploy

---
