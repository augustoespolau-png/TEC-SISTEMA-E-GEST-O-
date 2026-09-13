# Arquitetura de anexos do Tecverde

Este é o padrão único para fotos e arquivos dos módulos do sistema. A
Auditoria de Produto já está usando o bucket privado `auditoria-arquivos`; não
crie outra tabela ou fluxo paralelo para cada tela.

## Decisões canônicas

| Camada | Padrão |
| --- | --- |
| Binário | Supabase Storage, nunca Base64 ou `bytea` no Postgres |
| Bucket atual | `auditoria-arquivos`, privado, limite de 20 MB |
| Metadados genéricos | `public.sistema_anexos` |
| Projeção da auditoria | `public.produto_anexos`, mantida pelo sincronizador legado |
| URL para exibição | URL assinada temporária, criada no cliente e não persistida |
| Fonte de verdade | O registro do módulo; o anexo guarda apenas o vínculo e o caminho |

`sistema_anexos` é a tabela relacional reutilizável. Ela concentra `id`,
`modulo`, `entidade`, `registro_id`, `tipo`, `nome_arquivo`, `mime_type`,
`tamanho_bytes`, `storage_bucket`, `storage_path`, `metadata`, autoria e
timestamps. O `registro_id` é texto por compatibilidade com a Auditoria de
Produto, mas recebe a representação do UUID do registro quando o módulo usar
UUID.

Não armazenamos `url_storage`: em bucket privado, a URL assinada expira. O
valor estável é o par `storage_bucket` + `storage_path`; a aplicação gera uma
nova URL assinada quando precisa mostrar ou baixar o arquivo.

## Caminho determinístico

As fotos da Auditoria de Produto seguem este formato:

```text
produto/{usuario_id}/{projeto_id}/{casa_id}/{parede_id}/{timestamp}-{uuid}.jpg
```

O primeiro segmento `produto` e o segundo `usuario_id` fazem parte da política
RLS atual do Storage. Os segmentos seguintes usam IDs normalizados, não nomes
editáveis da interface. Um exemplo real do formato novo é:

```text
produto/8a.../project_123/146/wall_08/20260911T181530Z-550e8400-e29b-41d4-a716-446655440000.jpg
```

O helper `src/lib/anexos.ts:caminhoAnexoAuditoria` é a única forma de montar o
caminho no frontend. Novos módulos devem criar um helper equivalente usando o
mesmo prefixo de proprietário e seus próprios IDs de domínio.

Os desenhos técnicos cadastrados em Configuração usam o mesmo bucket e a
mesma tabela, com a posição da parede como vínculo:

```text
produto/{usuario_id}/{projeto_id}/{parede_id}/projeto/{timestamp}-{uuid}.pdf
produto/{usuario_id}/{projeto_id}/{parede_id}/projeto/{timestamp}-{uuid}.jpg
```

O campo `projectDocument` continua sendo parte do estado canônico da parede.
Ao salvar pela tela Configuração, o RPC atualiza esse estado e o sincronizador
existente mantém `produto_paredes` e `sistema_anexos` consistentes. Assim, a
Auditoria localiza o mesmo documento por `produto_paredes_documento`, sem uma
tabela paralela. Documentos antigos permanecem legíveis; a tela só gera uma
URL assinada temporária quando o inspetor abre a parede.

## Fluxo de upload

1. O inspetor escolhe a imagem ou abre a câmera do celular/tablet.
2. O navegador redimensiona a maior dimensão para, no máximo, 1200 px e
   converte para JPEG com qualidade 0,80.
3. O cliente exige sessão autenticada, calcula o caminho determinístico e envia
   o arquivo para `auditoria-arquivos` com `upsert: false`.
4. Só depois do upload bem-sucedido o RPC grava no estado da auditoria o ID do
   anexo, nome, tipo, tamanho, `path`, `deviationId` e `wallId`.
5. O sincronizador materializa os metadados em `produto_anexos` e
   `sistema_anexos`. A leitura cria URLs assinadas de curta duração.

Para um desenho de parede, o mesmo ciclo é usado: a foto técnica é comprimida
no navegador, o PDF é enviado como PDF, o Storage recebe o caminho
determinístico e o RPC só grava metadados no estado. Se a escrita do estado
falhar, o objeto recém-enviado é removido; uma substituição só tenta remover o
arquivo anterior quando ele pertence ao usuário atual.

Na baixa de retrabalho, o mesmo fluxo usa `reworkAttachments` no registro
canônico. O objeto recebe `deviationId` e o RPC
`qualidade_adicionar_anexo_retrabalho` valida o desvio antes de gravar. Assim,
a foto pós-retrabalho fica vinculada à ocorrência em `sistema_anexos` (e não
somente à auditoria da casa). A tela Consulta busca as fotos pelo vínculo,
gera URLs assinadas por uma hora e nunca persiste essas URLs.

Se a etapa do banco falhar após o upload, o cliente remove o objeto recém-criado
para evitar órfãos. Ao excluir um erro ou uma casa, os objetos relacionados são
removidos do Storage antes de a operação ser concluída; uma falha de limpeza é
informada ao usuário para permitir auditoria posterior.

## Segurança e políticas

O bucket é privado. As políticas de `storage.objects` restringem:

- `INSERT`: usuário autenticado com permissão de edição e caminho pertencente
  ao próprio usuário;
- `SELECT`: permissões de consulta/edição/histórico do módulo;
- `DELETE`: proprietário, administrador ou gestão autorizada do módulo;
- `UPDATE`: não é necessário para o upload normal porque o fluxo usa nomes
  únicos e `upsert: false`.

O RPC `ADICIONAR_ANEXO` aceita somente `path` preenchido e rejeita qualquer
chave `dataUrl`. A migração `032_anexos_storage_only.sql` também remove a
chave legada, protege a projeção relacional com constraint e cria o índice por
`desvio_id` usado pela tela de auditoria.

## Reuso em módulos futuros

Para um novo módulo, reutilize `sistema_anexos` com:

```text
modulo       = nome estável do módulo
entidade     = nome lógico do registro
registro_id  = ID do registro ao qual o arquivo pertence
storage_bucket/storage_path = localização do binário
```

Use um prefixo de Storage próprio quando as regras de acesso forem diferentes
(`manutencao/{usuario_id}/...`, por exemplo). Crie um bucket separado somente
quando o isolamento de retenção, tamanho, MIME ou segurança justificar; não
duplique a tabela de anexos.

## Checklist de revisão

- [ ] Nenhum `data:` URL, Base64, `ArrayBuffer` ou binário em colunas JSON/SQL.
- [ ] Upload limitado por MIME, tamanho e política RLS.
- [ ] Foto comprimida antes do envio, sem fallback para o arquivo original.
- [ ] Caminho contém proprietário e IDs do domínio.
- [ ] Metadados estão em `sistema_anexos` ou na projeção oficial do módulo.
- [ ] Leitura usa URL assinada temporária.
- [ ] Exclusão remove o registro lógico e tenta remover o objeto físico.
- [ ] Índice existe para o vínculo usado nas consultas do módulo.
- [ ] Desenho técnico de parede usa `produto_paredes_documento` em
      `sistema_anexos`, com projeto e parede de origem estáveis.
- [ ] PDFs e imagens técnicas são exibidos por URL assinada, sem URL permanente
      ou Base64 no estado.
