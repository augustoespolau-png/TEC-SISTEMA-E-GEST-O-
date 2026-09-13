# Índice de Qualidade

O cartão **Índice de qualidade** aparece na folha FPY de Indicadores e
respeita o projeto e o período selecionados.

## Fórmula

```text
Total bruto = P × I
Itens válidos = Total bruto − N/A
Itens conformes = Itens válidos − D
Índice (%) = Itens conformes ÷ Itens válidos × 100
```

Quando não há itens válidos, o cartão mostra `—`, pois não existe uma base
matemática para o percentual. Valores negativos são protegidos no cálculo;
desvios acima da base deixam os itens conformes em zero.

## Fontes do painel

| Variável | Fonte |
| --- | --- |
| `P` | Linhas filtradas de `fpy_paredes` |
| `I` | Quantidade de tipos de erro ativos em `tipos_erro` |
| `N/A` | `fpy_paredes.nao_aplicaveis`, derivado de `produto_auditorias.raw.naItems` |
| `D` | Ocorrências filtradas na view `ocorrencias` |

O frontend calcula a regra em `src/lib/indicadores.ts` por meio da função
`calcularIndiceQualidade`. A variante `calcularIndiceQualidadePorPaineis`
mantém a mesma fórmula para o caso futuro em que cada painel tenha uma
quantidade própria de itens de checklist. A migration
`037_indice_qualidade.sql` apenas amplia a projeção canônica de paredes; não
cria estrutura paralela.
