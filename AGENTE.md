# Instruções para o Agente de IA - Z Chat

Este arquivo contém as instruções padrão para trabalhar com projetos neste ambiente.

---

## 🛠️ Ferramentas Disponíveis

O agente de IA neste ambiente tem acesso às seguintes ferramentas:

| Ferramenta | Descrição |
|------------|-----------|
| `Bash` | Executar comandos de terminal (git, npm, bun, etc.) |
| `Write` | Criar novos arquivos |
| `Edit` / `MultiEdit` | Editar arquivos existentes |
| `Read` | Ler conteúdo de arquivos |
| `Grep` | Buscar texto em arquivos |
| `Glob` | Buscar arquivos por padrão |
| `LS` | Listar diretórios |

---

## 📋 Fluxo de Trabalho Obrigatório

### 1. Versionamento Semântico
- Formato: `MAJOR.MINOR.PATCH.BUILD`
- Exemplo: `v2.5.1.0`
- Incrementar a cada alteração significativa

### 2. CHANGELOG.md
Sempre manter atualizado. Formato:
```markdown
## [vX.X.X.X] - AAAA-MM-DD

vX.X.X.X - Descrição da alteração 1
vX.X.X.X - Descrição da alteração 2
```

### 3. Git Workflow
```bash
# Configurar remote (se necessário)
git remote add origin https://<TOKEN>@github.com/<usuario>/<repositorio>.git

# Fluxo padrão
git add .
git commit -m "vX.X.X.X - Descrição da alteração"
git push origin master

# Force push (se necessário)
git push -u origin master --force
```

---

## 🔧 Comandos Úteis

### Desenvolvimento
```bash
bun run dev      # Iniciar servidor de desenvolvimento
bun run lint     # Verificar qualidade do código
bun run build    # Build de produção
```

### Banco de Dados (Prisma)
```bash
bun run db:generate    # Gerar Prisma Client
bun run db:push        # Enviar schema para o banco
bun run db:migrate     # Criar migration
bun run db:studio      # Abrir Prisma Studio
```

---

## ✅ Boas Práticas

### NUNCA fazer:
- ❌ Pedir para o usuário copiar/colar código manualmente
- ❌ Dizer que "não tem mãos" ou "não consegue executar"
- ❌ Ignorar erros de lint
- ❌ Fazer push sem commit

### SEMPRE fazer:
- ✅ Usar as ferramentas disponíveis (Bash, Write, Edit)
- ✅ Verificar erros com `bun run lint` antes de commit
- ✅ Atualizar CHANGELOG.md
- ✅ Atualizar versão em `src/lib/version.ts`
- ✅ Fazer commit e push após alterações significativas

---

## 🌐 Deploy no Vercel

O Vercel faz deploy automático após cada push para a branch master.

### Verificar logs:
1. Acesse o dashboard do Vercel
2. Clique no projeto
3. Veja os deployments

---

## 📁 Estrutura de Projeto Padrão (Next.js)

```
src/
├── app/
│   ├── api/           # Rotas da API
│   ├── page.tsx       # Página principal
│   └── layout.tsx     # Layout global
├── components/
│   └── ui/            # Componentes shadcn/ui
├── lib/
│   ├── db.ts          # Prisma Client
│   ├── utils.ts       # Utilitários
│   └── version.ts     # Controle de versão
└── stores/            # Estado global (Zustand)

prisma/
├── schema.prisma      # Schema do banco
└── migrations/        # Migrations

CHANGELOG.md           # Histórico de alterações
AGENTE.md              # Este arquivo
```

---

## 🚀 Prompt Inicial para Nova Sessão

Cole este prompt no início de cada nova sessão:

```
Estou trabalhando em um projeto no Z Chat. Siga as instruções do arquivo AGENTE.md.

INSTRUÇÕES IMPORTANTES:
1. Use as ferramentas disponíveis (Bash, Write, Edit, Read)
2. NÃO peça para eu copiar/colar código
3. Use versionamento semântico
4. Mantenha CHANGELOG.md atualizado
5. Faça commit e push quando solicitado

Meu token GitHub: [SEU_TOKEN_AQUI]
Repositório: https://github.com/[USUARIO]/[REPOSITORIO]
```

---

## 📝 Token GitHub

Para configurar o git com token:
```bash
git remote remove origin  # Se já existir
git remote add origin https://ghp_SEU_TOKEN@github.com/usuario/repositorio.git
```

**Importante:** O token precisa ter permissão `repo` no GitHub.

---

## 🔗 Links Úteis

- [Gerar Token GitHub](https://github.com/settings/tokens)
- [Vercel Dashboard](https://vercel.com/dashboard)
- [Prisma Docs](https://www.prisma.io/docs)

---

*Última atualização: v2.5.1.0*
