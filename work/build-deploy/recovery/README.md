# 🚨 RECOVERY — Início de Sessão

> **LEIA ESTE ARQUIVO PRIMEIRO** se o workspace foi resetado ou é uma nova sessão.

Este diretório contém tudo que a próxima sessão precisa para se recuperar automaticamente de um reset de workspace.

---

## 📋 Procedimento de Recuperação (executar nesta ordem)

### Passo 1 — Detectar se houve reset

```bash
ls /home/z/my-project/work/build-deploy 2>&1
```

- Se existir → workspace OK, pode trabalhar normalmente
- Se não existir → **RESET DETECTADO**, continue para passo 2

### Passo 2 — Clonar repositório (mesmo sem nada configurado)

```bash
mkdir -p /home/z/my-project
cd /home/z/my-project
git clone https://github.com/hscopes-hash/caixafacil.git work/build-deploy
```

### Passo 3 — Executar script de recovery

```bash
bash /home/z/my-project/work/build-deploy/work/build-deploy/recovery/recovery.sh
```

O script vai:
1. Criar estrutura de diretórios (`.secrets/`, `scripts/`, `upload/`, `download/`)
2. Recriar `.env.local` com 19 variáveis
3. Rodar `npm install`
4. Verificar Prisma 6.19.3
5. Configurar git identity
6. Validar status das credenciais

### Passo 4 — Pedir credenciais ao usuário (se necessário)

Após executar recovery.sh, ele vai indicar quais credenciais faltam:

| Credencial | Sempre precisa? | Para que |
|------------|-----------------|----------|
| **PAT GitHub** | ✅ Sim | Push automático (regra C do workflow) |
| **SA JSON Google Cloud** | ⚠️ Só se for mexer em Firebase Hosting ou testar Vertex AI localmente | Vercel já tem `GOOGLE_APPLICATION_CREDENTIALS_JSON` configurada |
| **Token Vercel** | ❌ Nunca | Hardcoded no recovery.sh |
| **.env.local** | ❌ Nunca | Recriado automaticamente pelo script |

### Passo 5 — Ler documentação de regras

```bash
cat /home/z/my-project/work/build-deploy/work/build-deploy/recovery/REGRAS.md
```

Contém as 10 regras obrigatórias do projeto (não usar subagentes para edição, Prisma 6.19.3, etc).

### Passo 6 — Ler estado atual do projeto

```bash
cat /home/z/my-project/work/build-deploy/work/build-deploy/recovery/ESTADO_ATUAL.md
```

Contém versão atual, deploy no ar, endpoints funcionando, última sessão, etc.

---

## 📁 Conteúdo deste diretório

| Arquivo | Função |
|---------|--------|
| `README.md` | Este arquivo — ponto de entrada |
| `REGRAS.md` | 10 regras obrigatórias do projeto |
| `ESTADO_ATUAL.md` | Snapshot do estado atual (versão, deploy, pendências) |
| `recovery.sh` | Script de recuperação automática |
| `env.local.template` | Template do `.env.local` (sem secrets reais) |
| `HISTORICO_SESSOES.md` | Log de alterações por sessão |

---

## ⚠️ IMPORTANTE

- **NUNCA** salvar PAT ou SA JSON em arquivo dentro deste diretório (vai para GitHub)
- **NUNCA** salvar credenciais sensíveis em arquivos versionados
- O `recovery.sh` tem hardcoded apenas o Token Vercel e strings PostgreSQL (que já estão no resumo público do projeto)
- Após recovery, o worklog local fica em `/home/z/my-project/worklog.md` (não versionado)

---

## 🔄 Atualização deste diretório

Após sessões significativas, atualizar:
- `ESTADO_ATUAL.md` com nova versão e mudanças
- `HISTORICO_SESSOES.md` com nova entrada

Commits para este diretório devem ter prefixo `recovery:` para facilitar rastreamento.
