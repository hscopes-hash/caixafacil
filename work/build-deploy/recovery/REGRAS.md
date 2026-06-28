# 📜 REGRAS OBRIGATÓRIAS — Projeto CaixaFacil

> Estas regras DEVEM ser seguidas em todas as sessões. Foram definidas após perdas de trabalho em sessões anteriores.

---

## Regra #1 — Subagentes são somente para pesquisa

**Jamais permitir que subagentes modifiquem arquivos fonte.**

Subagentes (Task tool com `general-purpose`, `Explore`, `Plan`, etc.) devem ser utilizados **exclusivamente para rotinas de pesquisa**: ler arquivos, buscar padrões, mapear estrutura, coletar informações. Eles **NÃO devem nunca**:
- Editar arquivos (`Edit`, `MultiEdit`, `Write`)
- Criar arquivos novos
- Fazer commits ou push
- Executar scripts que modifiquem o código
- Rodar `npm install`, `vercel deploy`, etc.

**Toda modificação no código deve ser feita pelo agente principal (main agent).**

**Justificativa:** erros ocorridos em sessões passadas foram causados por subagentes fazendo modificações sem contexto completo, resultando em código quebrado, perda de fixes e retrabalho.

---

## Regra #2 — Salvar scripts em /home/z/my-project/scripts/

Qualquer script Python/Node/Shell usado para automação deve ser persistido em `/home/z/my-project/scripts/` (não rodar inline com `python -c`). Em caso de falha, editar o arquivo e rodar novamente.

---

## Regra #3 — Credenciais em /home/z/my-project/.secrets/

Arquivos sensíveis (JSONs de Service Account, tokens, etc.) devem ficar em `/home/z/my-project/.secrets/` com `chmod 600`. Nunca em `/home/z/my-project/upload/` (que pode ser limpo entre sessões).

---

## Regra #4 — Deploy Vercel exige staging

O projeto Vercel tem `rootDirectory: work/build-deploy`. Deploy sempre a partir de `/tmp/caixafacil-deploy-staging` (com a estrutura `work/build-deploy/` dentro). Nunca de dentro do diretório de trabalho direto.

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

---

## Regra #5 — Prisma 6.19.3 (NUNCA atualizar para 7.x)

O projeto usa Prisma 6.19.3. Atualizar para 7.x quebra completamente (muda para `prisma.config.ts`, url fora do schema). Se `npx prisma --version` mostrar 7.x, rodar `npm install` para forçar versão 6.

Verificação: `npx prisma --version` deve mostrar `prisma: 6.19.3` e `@prisma/client: 6.19.3`.

---

## Regra #6 — Raw SQL: nomes de tabela minúsculos sem aspas

Em queries `$queryRawUnsafe`, **nunca** usar aspas duplas em nomes de tabela:

- ❌ `FROM "Leitura"` → PostgreSQL trata como case-sensitive, tabela não existe
- ✅ `FROM leituras` → minúsculo sem aspas, funciona

Colunas podem usar aspas (o Prisma mantém camelCase): `l."clienteId"`, `l."dataLeitura"` etc.

### Mapeamento Modelos Prisma → Tabelas PostgreSQL

| Modelo Prisma   | Tabela real no PostgreSQL |
|----------------|--------------------------|
| Empresa        | empresas                 |
| Usuario        | usuarios                 |
| Cliente        | clientes                 |
| TipoMaquina    | tipos_maquina            |
| Maquina        | maquinas                 |
| Assinatura     | assinaturas              |
| Pagamento      | pagamentos               |
| Faturamento    | faturamentos             |
| Leitura        | leituras                 |
| LogAcesso      | logs_acesso              |
| WebhookLog     | webhook_logs             |
| Debito         | debitos                  |
| PlanoSaaS      | planos_saas              |
| AssinaturaSaaS | assinaturas_saas         |
| PagamentoSaaS  | pagamentos_saas          |
| ChatHistorico  | chat_historico           |
| ConfigSaaS     | config_saas              |
| ChatInstrucoes | chat_instrucoes          |
| Grua           | gruas                    |
| VendaGrua      | vendas_grua              |
| TelemetriaGrua | telemetria_grua          |

---

## Regra #7 — Somente Gemini 2.5 no Vertex AI

No projeto `utopian-splicer-255210`, somente `gemini-2.5-flash` e `gemini-2.5-pro` funcionam. Modelos 3.x e 3.5 não existem no Vertex AI deste projeto.

O `VERTEX_MODEL_MAP` em `src/lib/ai-vision.ts` mapeia modelos obsoletos para 2.5 equivalentes:
```typescript
const VERTEX_MODEL_MAP: Record<string, string> = {
  'gemini-2.0-flash-001': 'gemini-2.5-flash',
  'gemini-2.5-flash-lite': 'gemini-2.5-flash',
  'gemini-3.1-flash': 'gemini-2.5-flash',
  'gemini-3.1-flash-lite': 'gemini-2.5-flash',
  'gemini-3.1-pro': 'gemini-2.5-pro',
  'gemini-3.5-flash': 'gemini-2.5-flash',
};
```

Seletor `modelosIA` em `src/app/page.tsx` deve listar apenas:
- `gemini-2.5-flash` (Padrão - Equilibrado)
- `gemini-2.5-pro` (Mais preciso - Mais lento)

---

## Regra #8 — Workflow de implementação sem build automático

**Build e deploy NÃO são automáticos.** Só devem ser executados quando o usuário ordenar explicitamente (ex: "faça deploy", "publique", "builda").

**MAS: Push para GitHub É automático após cada commit.**

**Justificativa:** o workspace `/home/z/my-project/` pode ser resetado entre sessões (já ocorreu 5x em sessões anteriores, causando perda de trabalho). GitHub é o backup definitivo — push é barato (segundos) e evita perdas catastróficas.

### Fluxo padrão:
1. **Implementação** → agente principal edita código fonte
2. **Commit local** → `git add && git commit`
3. **Push para GitHub** → `git push origin main` (AUTOMÁTICO, não precisa de ordem)
4. **Aguardar ordem explícita do usuário para:**
   - Build (`npm run build` local para validar)
   - Deploy Vercel (via staging em `/tmp/caixafacil-deploy-staging`)

### PAT GitHub (necessário para push)
O push automático requer PAT. Se o PAT expirar ou não estiver configurado, o agente deve:
1. Fazer commit local
2. Avisar o usuário: "Commit feito localmente. PAT GitHub necessário para push."
3. Após receber o PAT, configurar credential helper:
   ```bash
   echo "https://hscopes-hash:<PAT>@github.com" > /home/z/my-project/.secrets/.git-credentials
   chmod 600 /home/z/my-project/.secrets/.git-credentials
   git config --global credential.helper "store --file=/home/z/my-project/.secrets/.git-credentials"
   ```
4. **NUNCA** salvar PAT em arquivo versionado.

---

## Regra #9 — Controle de versão sincronizado com tela de login

A versão mostrada na tela de login do app DEVE sempre bater com a versão deployada no Vercel. Isso serve para confirmar que:
- O deploy foi concluído com sucesso
- O usuário não está vendo uma página em cache

### Como funciona:
- Arquivo: `src/lib/version.ts` (campos `VERSION_STRING`, `VERSION_DISPLAY`, `LAST_DEPLOY`, `VERSION_WITH_DATE`)
- Auto-bump no build: `scripts/increment-version.mjs` incrementa o build number a cada `npm run build`

### Procedimento pós-deploy obrigatório:
```bash
# Versão esperada (após build)
cat /home/z/my-project/work/build-deploy/work/build-deploy/src/lib/version.ts | grep VERSION_DISPLAY

# Versão em produção
curl -s https://caixafacil-theta.vercel.app | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1

# As duas DEVEM bater
```

Se não bater: deploy falhou OU cache do navegador/CDN servindo versão antiga.

---

## Regra #10 — Procedimento de recuperação pós-reset

Se o workspace `/home/z/my-project/` for resetado (perda de arquivos locais entre sessões):

1. Detectar reset: `ls /home/z/my-project/work/build-deploy 2>&1`
2. Se vazio: clonar repo `github.com/hscopes-hash/caixafacil.git` em `work/build-deploy`
3. Executar: `bash /home/z/my-project/work/build-deploy/work/build-deploy/recovery/recovery.sh`
4. Pedir ao usuário: PAT GitHub (sempre) + SA JSON (só se for mexer em Firebase/Vertex local)
5. Ler `recovery/REGRAS.md` (este arquivo) e `recovery/ESTADO_ATUAL.md`

### Credenciais embutidas no recovery.sh (não sensíveis):
- Token Vercel: hardcoded (não precisa pedir)
- String PostgreSQL: hardcoded no `.env.local` (não precisa pedir)
- MercadoPago keys: hardcoded (não precisa pedir)

### Credenciais que PRECISAM ser reenviadas após reset:
- PAT GitHub (para `git push`)
- SA JSON Google Cloud (somente se for mexer em Firebase/Vertex local)

---

## 💡 Decisões de produto registradas

- **Sem rate limiting** em nenhum nível (app, endpoint diag, cota GCP) — usuário confirmou que custo de tokens não é problema
- `/api/diag-vertex` mantido público e sem proteção adicional
- Chat IA sem limite por usuário (liberdade total)
- URL principal de divulgação: `caixafaciloficial.web.app` (não `caixafacil.web.app` — esse é de outro projeto Firebase)

---

## 📋 Mensagens-chave do usuário que disparam ações

- **"deploy" / "publique" / "builda"** → executa build + deploy Vercel (valida versão pós-deploy)
- **"só implementa" / "não faz deploy ainda"** → apenas edita código + commit + push automático
- **Push para GitHub é SEMPRE automático** após commit (não precisa de ordem)
