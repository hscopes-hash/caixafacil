#!/bin/bash
# recovery.sh — Procedimento de recuperação após reset de workspace
# Versão: 2.0 (20/06/2026)
#
# Uso: bash /home/z/my-project/work/build-deploy/work/build-deploy/recovery/recovery.sh
#
# IMPORTANTE: Este script NÃO contém credenciais reais (GitHub Push Protection bloqueia).
# Todas as credenciais sensíveis precisam ser fornecidas pelo usuário.
#
# O que este script faz:
# 1. Cria estrutura de diretórios em /home/z/my-project/
# 2. Recria .env.local COM PLACEHOLDERS (precisa editar com valores reais)
# 3. Roda npm install
# 4. Verifica Prisma 6.19.3
# 5. Configura git identity
# 6. Verifica status das credenciais (PAT, SA JSON, env vars)

set -e

PROJECT_ROOT="/home/z/my-project"
REPO_DIR="$PROJECT_ROOT/work/build-deploy/work/build-deploy"

echo "=== CaixaFacil — Recovery pós-reset (v2.0) ==="
echo ""
echo "⚠️  ATENÇÃO: Este script NÃO contém credenciais reais."
echo "   Após executá-lo, será necessário:"
echo "   1. Editar .env.local com valores reais (ou pedir ao usuário)"
echo "   2. Configurar PAT GitHub (para push automático)"
echo "   3. Configurar SA JSON (só se for mexer em Firebase/Vertex local)"
echo ""

# 1. Verificar se o repo já foi clonado
if [ ! -d "$REPO_DIR" ]; then
  echo "❌ Repo não encontrado em $REPO_DIR"
  echo "   Execute primeiro:"
  echo "   mkdir -p $PROJECT_ROOT"
  echo "   cd $PROJECT_ROOT"
  echo "   git clone https://github.com/hscopes-hash/caixafacil.git work/build-deploy"
  exit 1
fi

# 2. Criar estrutura de diretórios
echo "[1/6] Criando diretórios..."
mkdir -p "$PROJECT_ROOT/.secrets"
mkdir -p "$PROJECT_ROOT/scripts"
mkdir -p "$PROJECT_ROOT/upload"
mkdir -p "$PROJECT_ROOT/download"
chmod 700 "$PROJECT_ROOT/.secrets"

# 3. Recriar .env.local com placeholders
ENV_FILE="$REPO_DIR/.env.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "[2/6] Criando .env.local com placeholders..."
  cat > "$ENV_FILE" << 'ENVEOF'
# ⚠️ ARQUIVO COM PLACEHOLDERS — substituir pelos valores reais
# Valores reais estão no Vercel (Settings → Environment Variables)
# ou peça ao usuário para colar as credenciais

DATABASE_URL=postgresql://postgres:<PG_PASSWORD>@<PG_HOST>:5432/caixafacil?sslmode=prefer
POSTGRES_PRISMA_URL=postgresql://postgres:<PG_PASSWORD>@<PG_HOST>:5432/caixafacil?sslmode=prefer&connect_timeout=15
POSTGRES_URL_NON_POOLING=postgresql://postgres:<PG_PASSWORD>@<PG_HOST>:5432/caixafacil?sslmode=prefer&connect_timeout=15
MERCADOPAGO_PUBLIC_KEY=<MP_PUBLIC_KEY>
MERCADOPAGO_ACCESS_TOKEN=<MP_ACCESS_TOKEN>
LLM_MODEL=gemini-2.5-flash
POSTGRES_URL=postgresql://postgres:<PG_PASSWORD>@<PG_HOST>:5432/caixafacil?sslmode=prefer
POSTGRES_URL_NO_SSL=postgresql://postgres:<PG_PASSWORD>@<PG_HOST>:5432/caixafacil
PGHOST=<PG_HOST>
PGPORT=5432
PGUSER=postgres
PGPASSWORD=<PG_PASSWORD>
PGDATABASE=caixafacil
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<PG_PASSWORD>
POSTGRES_DATABASE=caixafacil
POSTGRES_HOST=<PG_HOST>
FOTO_ENCRYPTION_KEY=<FOTO_ENCRYPTION_KEY>
FOTO_BUCKET=<FOTO_BUCKET>
ENVEOF
  chmod 600 "$ENV_FILE"
  echo "   ✅ .env.local criado (PLACEHOLDERS — precisa editar!)"
  echo "   📋 Para obter valores reais:"
  echo "      - Vercel → Settings → Environment Variables (cada variável)"
  echo "      - Ou peça ao usuário para colar as credenciais"
else
  echo "[2/6] .env.local já existe, pulando..."
fi

# 4. npm install
echo "[3/6] npm install (pode levar 30-60s)..."
cd "$REPO_DIR"
if [ ! -d "node_modules" ]; then
  npm install --silent
  echo "   ✅ Dependências instaladas"
else
  echo "   ℹ️  node_modules já existe, pulando npm install"
fi

# 5. Verificar Prisma
echo "[4/6] Verificando Prisma..."
PRISMA_VERSION=$(npx prisma --version 2>&1 | grep "^prisma" | awk '{print $2}')
if [[ "$PRISMA_VERSION" == "6.19.3" ]]; then
  echo "   ✅ Prisma $PRISMA_VERSION (correto)"
elif [[ "$PRISMA_VERSION" == 7.* ]]; then
  echo "   ⚠️  Prisma $PRISMA_VERSION detectado (PROIBIDO). Forçando 6.19.3..."
  npm install --silent
  PRISMA_VERSION=$(npx prisma --version 2>&1 | grep "^prisma" | awk '{print $2}')
  echo "   ✅ Prisma agora: $PRISMA_VERSION"
else
  echo "   ⚠️  Prisma $PRISMA_VERSION (versão inesperada)"
fi

# 6. Configurar git identity
echo "[5/6] Configurando git identity..."
cd "$PROJECT_ROOT/work/build-deploy"
git config user.email "caixafacil-bot@local"
git config user.name "CaixaFacil Dev"
echo "   ✅ Git identity configurado"

# 7. Verificar credenciais
echo "[6/6] Verificando credenciais..."

# PAT GitHub
if [ -f "$PROJECT_ROOT/.secrets/.git-credentials" ]; then
  echo "   ✅ PAT GitHub configurado em .secrets/.git-credentials"
  git config --global credential.helper "store --file=$PROJECT_ROOT/.secrets/.git-credentials"
  if git ls-remote origin HEAD > /dev/null 2>&1; then
    echo "   ✅ Push para GitHub funcionando"
  else
    echo "   ⚠️  PAT presente mas não funciona — pode estar expirado"
  fi
else
  echo "   ❌ PAT GitHub AUSENTE — necessário para push automático"
  echo "      Pedir ao usuário: 'ghp_...'"
  echo "      Após receber, executar:"
  echo "        echo 'https://hscopes-hash:<PAT>@github.com' > $PROJECT_ROOT/.secrets/.git-credentials"
  echo "        chmod 600 $PROJECT_ROOT/.secrets/.git-credentials"
  echo "        git config --global credential.helper 'store --file=$PROJECT_ROOT/.secrets/.git-credentials'"
fi

# SA JSON
if [ -f "$PROJECT_ROOT/.secrets/caixafacil-deployer.json" ]; then
  echo "   ✅ SA JSON configurada em .secrets/caixafacil-deployer.json"
else
  echo "   ℹ️  SA JSON ausente (só necessária para Firebase/Vertex local)"
  echo "      Vercel já tem GOOGLE_APPLICATION_CREDENTIALS_JSON configurada"
fi

# .env.local — checar se ainda tem placeholders
if grep -q "<.*>" "$ENV_FILE" 2>/dev/null; then
  echo "   ⚠️  .env.local ainda contém placeholders — editar com valores reais!"
fi

# Validações finais
echo ""
echo "=== Validações finais ==="
echo "Versão atual no código:"
grep "VERSION_DISPLAY" "$REPO_DIR/src/lib/version.ts" | head -1
echo ""
echo "Git remote:"
cd "$PROJECT_ROOT/work/build-deploy"
git remote -v
echo ""

# Criar worklog local se não existir
if [ ! -f "$PROJECT_ROOT/worklog.md" ]; then
  cat > "$PROJECT_ROOT/worklog.md" << 'WORKEOF'
# Worklog — CaixaFacil Project

> Este arquivo é mantido localmente em /home/z/my-project/worklog.md
> Para regras e estado atual, ver recovery/REGRAS.md e recovery/ESTADO_ATUAL.md
> no repositório GitHub.

WORKEOF
fi

echo "=== Recuperação concluída! ==="
echo ""
echo "📋 Próximos passos:"
echo "  1. Configurar PAT GitHub (se ausente)"
echo "  2. Editar .env.local com valores reais (se ainda tem placeholders)"
echo "  3. Ler recovery/REGRAS.md para regras obrigatórias"
echo "  4. Ler recovery/ESTADO_ATUAL.md para snapshot do projeto"
echo "  5. Pronto para implementar!"
