# Planilha Gabarito — Modelo de Exemplo

Este arquivo (`PLANILHA_GABARITO.xlsx`) é um **modelo genérico** que pode ser usado como ponto de partida para criar a planilha personalizada de cada cliente.

## Como usar

1. **Baixe** este arquivo: [PLANILHA_GABARITO.xlsx](./PLANILHA_GABARITO.xlsx)
2. **Abra** no Excel, Google Sheets ou LibreOffice Calc
3. **Adapte** à sua necessidade — mantenha os placeholders entre colchetes `[...]` onde quiser que os valores apareçam
4. **Faça upload** no cadastro do cliente (campo "Planilha Gabarito")
5. Na tela de relatório de leitura, clique em **"WhatsApp (Planilha Excel)"** — o app substitui os placeholders pelos valores reais e envia a planilha preenchida

## Placeholders disponíveis

### Geral
| Placeholder | Descrição |
|---|---|
| `[cliente]` | Nome do cliente |
| `[data]` | Data do relatório |
| `[turno]` | Turno (MANHÃ, TARDE, NOITE, MADRUGADA) |
| `[operador]` | Nome do operador |
| `[acerto_percentual]` | Percentual de acerto do cliente |

### Totais
| Placeholder | Descrição |
|---|---|
| `[jogado]` | Total jogado (entradas - saídas) |
| `[cliente_parte]` | Parte do cliente (jogado × acerto%) |
| `[leituraatual]` | LEITURA atual (parte do sistema) |
| `[leituraanterior]` | LEITURA anterior (saldo acumulado) |
| `[receita]` | Total de receitas extras |
| `[despesa]` | Total de despesas |
| `[fechamento]` | Valor de fechamento |
| `[recebido]` | Valor recebido |
| `[saldo_anterior]` | Saldo anterior do cliente |

### Receitas
| Placeholder | Descrição |
|---|---|
| `[caixa_inicial]` | Caixa inicial |
| `[reforco]` | Reforço |
| `[leitura]` | Leitura (total automático) |
| `[caixa_final]` | Caixa final |

### Despesas
| Placeholder | Descrição |
|---|---|
| `[uber]` | Uber |
| `[mercado]` | Mercado |
| `[gasolina]` | Gasolina |
| `[vales]` | Vales |
| `[bonus]` | Bônus |
| `[diaria]` | Diária |
| `[horas_extras]` | Horas extras |
| `[dinheiro]` | Dinheiro |
| `[cartao1]` | Valor do cartão 1 (usa nome customizado do cliente) |
| `[cartao2]` | Valor do cartão 2 |

### Máquinas (indexado — genérico)

Use `[maquinaN_campo]` onde N é a posição da máquina no relatório (1, 2, 3, ...):

| Placeholder | Descrição |
|---|---|
| `[maquina1_codigo]` | Código/nome da 1ª máquina |
| `[maquina1_entrada_anterior]` | Entrada anterior da 1ª máquina |
| `[maquina1_entrada_nova]` | Entrada nova da 1ª máquina |
| `[maquina1_entrada]` | Diferença de entrada da 1ª máquina |
| `[maquina1_saida_anterior]` | Saída anterior da 1ª máquina |
| `[maquina1_saida_nova]` | Saída nova da 1ª máquina |
| `[maquina1_saida]` | Diferença de saída da 1ª máquina |
| `[maquina1_movimento]` | Movimento da 1ª máquina (em R$) |
| `[maquina1_saldo]` | Saldo da 1ª máquina (em R$) |

Repita para `maquina2`, `maquina3`, ... até `maquina30`.

### Máquinas (por código — específico)

Se preferir usar o código da máquina diretamente:

| Placeholder | Exemplo |
|---|---|
| `[b3_entrada]` | Diferença de entrada da máquina B3 |
| `[b3_saida]` | Diferença de saída da máquina B3 |
| `[b3_movimento]` | Movimento da máquina B3 (em R$) |
| `[turbo_m_entrada]` | Entrada da máquina TURBO M. |

O código é normalizado: minúsculas, sem acentos, espaços → underscore.

## Dicas

- Placeholders não diferenciam maiúsculas/minúsculas e ignoram acentos
- Você pode combinar texto e placeholders: `Total jogado: [jogado]`
- Placeholders não reconhecidos são mantidos como texto original
- A planilha mantém toda a formatação (cores, bordas, merges, fórmulas)
