-- ============================================================
-- Tecverde · Registro de Erros — 004: lista completa de tipos de erro
--
-- Extraída de 283 ocorrências reais da planilha antiga (32 tipos
-- distintos). A ordem segue a FREQUÊNCIA de cada tipo: os mais
-- comuns aparecem primeiro no formulário, acelerando o registro
-- no chão de fábrica.
--
-- Padronização de grafia aplicada (ver relatório na conversa):
--   CÍMENTICIA / CIMENTICIA  ->  CIMENTÍCIA
--   MODULO                   ->  MÓDULO
-- A gestão pode renomear qualquer item pela tela Configurações.
-- ============================================================

delete from public.tipos_erro;

insert into public.tipos_erro (nome, ordem) values
  ('SOLEIRA', 1),                        -- 65 ocorrências
  ('OSB', 2),                            -- 62
  ('PLACA CIMENTÍCIA', 3),               -- 26
  ('PREGOS', 4),                         -- 24
  ('ENTALHES', 5),                       -- 12
  ('PARAFUSO CIMENTÍCIA', 6),            -- 10
  ('MANTA KATJA', 7),                    -- 9
  ('MONTANTES', 8),                      -- 7
  ('IÇAMENTO', 9),                       -- 7
  ('CADEIRINHAS', 10),                   -- 7
  ('ESQUADRO PAREDE', 11),               -- 6
  ('CONDUÍTES', 12),                     -- 6
  ('FURO DE IÇAMENTO', 13),              -- 4
  ('ETIQUETAS', 14),                     -- 4
  ('ANTENAS', 15),                       -- 4
  ('PINGADEIRA', 16),                    -- 3
  ('MÓDULO', 17),                        -- 3
  ('MASSA CIMENTÍCIA', 18),              -- 3
  ('TUPIA', 19),                         -- 2
  ('PARAFUSO SALIENTE', 20),             -- 2
  ('HIDRÁULICA', 21),                    -- 2
  ('ESQUADRO', 22),                      -- 2
  ('CLASSIFICAÇÃO', 23),                 -- 2
  ('CARGA', 24),                         -- 2
  ('CALÇO', 25),                         -- 2
  ('SEPARAÇÃO DE PAREDE SEM FAZER', 26), -- 1
  ('REFORÇO IÇAMENTO', 27),              -- 1
  ('MÓDULO PORTA', 28),                  -- 1
  ('MÓDULO JANELA', 29),                 -- 1
  ('ESQUADRO PORTA', 30),                -- 1
  ('CAIXA ELÉTRICA', 31),                -- 1
  ('ARMAZENAMENTO', 32);                 -- 1
