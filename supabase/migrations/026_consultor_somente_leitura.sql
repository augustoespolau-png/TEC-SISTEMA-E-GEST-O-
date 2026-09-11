-- ============================================================
-- Tecverde · Registro de Erros — 026: consultor é SOMENTE LEITURA
--
-- O BURACO. A política de UPDATE das ocorrências dizia apenas
-- "auth.uid() is not null": qualquer pessoa logada podia mudar o
-- status de qualquer erro, inclusive quem entrou como consultor. O
-- papel nunca teve botão para isso na tela, mas a tela não é a trava —
-- a trava é aqui, e aqui estava aberta. Uma chamada direta à API com a
-- chave pública e uma sessão de consultor bastava.
--
-- Todas as outras tabelas já limitavam a escrita a operador/gestão;
-- esta era a única exceção, e passou despercebida porque o gatilho
-- ocorrencias_guard restringe QUAIS CAMPOS mudam, não QUEM muda.
--
-- Depois desta migration o papel consultor não escreve em lugar
-- nenhum do sistema — ele passa a ser o acesso de quem só acompanha.
-- ============================================================

drop policy if exists oco_update on public.ocorrencias;

create policy oco_update on public.ocorrencias for update
  using (public.get_my_role() in ('operador', 'gestao'))
  with check (public.get_my_role() in ('operador', 'gestao'));

comment on table public.ocorrencias is
  'Erros de produção. Escrita: operador e gestão. Consultor lê e não altera nada — a regra vale na API, não só na tela.';
