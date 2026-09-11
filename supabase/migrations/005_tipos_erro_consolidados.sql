-- ============================================================
-- Tecverde · Registro de Erros — 005: tipos de erro consolidados
--
-- Substitui a migration 004. Duas mudanças:
--
-- 1) VARIAÇÕES UNIFICADAS (de 32 para 28 tipos):
--      ESQUADRO + ESQUADRO PAREDE + ESQUADRO PORTA -> ESQUADRO  (9 ocorrências)
--      MÓDULO + MÓDULO PORTA + MÓDULO JANELA       -> MÓDULO    (5 ocorrências)
--
-- 2) ORDEM ALFABÉTICA (antes era por frequência).
--
-- Se um dia o histórico da planilha for importado, lembrar de
-- aplicar a mesma unificação nas colunas antigas.
-- ============================================================

delete from public.tipos_erro;

insert into public.tipos_erro (nome, ordem) values
  ('ANTENAS', 1),                        -- 4 ocorrências no histórico
  ('ARMAZENAMENTO', 2),                  -- 1
  ('CADEIRINHAS', 3),                    -- 7
  ('CAIXA ELÉTRICA', 4),                 -- 1
  ('CALÇO', 5),                          -- 2
  ('CARGA', 6),                          -- 2
  ('CLASSIFICAÇÃO', 7),                  -- 2
  ('CONDUÍTES', 8),                      -- 6
  ('ENTALHES', 9),                       -- 12
  ('ESQUADRO', 10),                      -- 9  (unificado)
  ('ETIQUETAS', 11),                     -- 4
  ('FURO DE IÇAMENTO', 12),              -- 4
  ('HIDRÁULICA', 13),                    -- 2
  ('IÇAMENTO', 14),                      -- 7
  ('MANTA KATJA', 15),                   -- 9
  ('MASSA CIMENTÍCIA', 16),              -- 3
  ('MÓDULO', 17),                        -- 5  (unificado)
  ('MONTANTES', 18),                     -- 7
  ('OSB', 19),                           -- 62
  ('PARAFUSO CIMENTÍCIA', 20),           -- 10
  ('PARAFUSO SALIENTE', 21),             -- 2
  ('PINGADEIRA', 22),                    -- 3
  ('PLACA CIMENTÍCIA', 23),              -- 26
  ('PREGOS', 24),                        -- 24
  ('REFORÇO IÇAMENTO', 25),              -- 1
  ('SEPARAÇÃO DE PAREDE SEM FAZER', 26), -- 1
  ('SOLEIRA', 27),                       -- 65
  ('TUPIA', 28);                         -- 2
