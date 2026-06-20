# 📅 HISTÓRICO DE SESSÕES — CaixaFacil

> Log cronológico de alterações por sessão. Adicione nova entrada no topo.

---

## Sessão 20/06/2026

### Estabelecidas regras oficiais do projeto (10 regras)
- Regra #1: Subagentes são somente para pesquisa (NUNCA editar arquivos)
- Regra #2: Scripts em `/home/z/my-project/scripts/`
- Regra #3: Credenciais em `/home/z/my-project/.secrets/` (chmod 600)
- Regra #4: Deploy Vercel via staging em `/tmp/caixafacil-deploy-staging`
- Regra #5: Prisma 6.19.3 (nunca 7.x)
- Regra #6: Raw SQL com nomes de tabela minúsculos sem aspas
- Regra #7: Somente Gemini 2.5 no Vertex AI
- Regra #8: Workflow sem build automático (build/deploy só com ordem)
- Regra #9: Versão sincronizada com tela de login
- Regra #10: Procedimento de recuperação pós-reset

### Workflow definido (Opção C)
- Implementação → commit → **push automático** → aguardar ordem para deploy

### Criado diretório `recovery/` no repo
- README.md (ponto de entrada)
- REGRAS.md (10 regras)
- ESTADO_ATUAL.md (snapshot)
- HISTORICO_SESSOES.md (este arquivo)
- recovery.sh (script de recuperação automática)

### Decisões de produto
- Sem rate limiting em nenhum nível
- `/api/diag-vertex` mantido público sem proteção
- URL principal de divulgação: `caixafaciloficial.web.app`

### Credenciais configuradas
- PAT GitHub `ghp_JEcc...` em `/home/z/my-project/.secrets/.git-credentials`
- SA JSON em `/home/z/my-project/.secrets/caixafacil-deployer.json`

---

## Sessão 19-20/06/2026

### Confirmação de domínios Firebase
- `caixafacil.web.app` não é reivindicável (outro projeto Firebase)
- URL principal definida: `caixafaciloficial.web.app` (já funcionava com redirect)
- Testados todos os domínios via curl — 3 funcionando + 1 esperado (404)

### Listagem de sites Firebase via REST API
Usando Service Account JWT para chamar `firebasehosting.googleapis.com/v1beta1/projects/utopian-splicer-255210/sites`:
- `caixafacil-cob` ✅
- `caixafacil-pos` ✅
- `caixafaciloficial` ✅ (este era o "site correto", não `caixafacil`)
- `utopian-splicer-255210` ✅ (DEFAULT_SITE)

---

## Sessão 18/06/2026 (tarde/noite)

### Correções aplicadas
1. **`src/app/page.tsx`**: 2 ocorrências de "CÂMARA" → "CÂMERA"
2. **`src/app/page.tsx`**: seletor `modelosIA` reduzido de 6 para 2 modelos (só `gemini-2.5-flash` e `gemini-2.5-pro`)
3. **`src/app/page.tsx`**: fallback de `gemini-3.1-flash-lite` → `gemini-2.5-flash`
4. **`src/lib/ai-vision.ts`**: implementado suporte a Service Account JSON via `GOOGLE_APPLICATION_CREDENTIALS_JSON` (assina JWT RSA-SHA256 e troca por access_token OAuth2 — sem dependência externa)
5. **`src/lib/ai-vision.ts`**: `VERTEX_MODEL_MAP` corrigido (modelos 3.x mapeados para 2.5 equivalentes em vez de 3.5 inexistente)
6. **`package-lock.json`**: removidas `@vercel/analytics` e `@vercel/speed-insights` (não referenciadas no código)

### Deploy Vercel
- Configurada env var `GOOGLE_APPLICATION_CREDENTIALS_JSON` (encrypted, target: production + preview + development)
- Deploy `v2.46.0.526` bem-sucedido
- Criado endpoint `/api/diag-vertex` para validação end-to-end do Vertex AI
- Testado: `gemini.ok: true` ✅

### Commits no GitHub
- `3a785e9` — fix: corrige CÂMARA→CÂMERA, seletor Gemini (só 2.5), e adiciona suporte a SA JSON no Vertex AI
- `506cf85` — feat: adiciona endpoint de diagnóstico /api/diag-vertex

---

## Sessão 18/06/2026 (manhã)

### Correção de raw SQL
- **`src/app/api/leituras/fechamentos-anteriores/route.ts`**: 
  - `FROM "Leitura"` → `FROM leituras`
  - `LEFT JOIN "Usuario"` → `LEFT JOIN usuarios`
  - PostgreSQL com aspas duplas em nomes de tabela é case-sensitive → tabela não encontrada → erro 500

### Setup inicial
- `.env.local` criado com 19 variáveis de ambiente copiadas do Vercel
- Deploy `v2.46.0.525` bem-sucedido
