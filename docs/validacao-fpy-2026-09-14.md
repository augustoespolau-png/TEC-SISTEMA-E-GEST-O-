# Validação FPY — 2026-09-14

Correção validada para leitura paginada de `fpy_paredes`/`ocorrencias` e ordenação crescente do gráfico FPY por Casa.

Motivo da paginação: `fpy_paredes` ultrapassou 1.000 registros e uma única resposta do PostgREST podia truncar as casas mais recentes.
