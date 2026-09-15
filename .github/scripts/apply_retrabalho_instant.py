from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"{label}: trecho não encontrado em {path}")
    p.write_text(text.replace(old, new, 1))


# 1) ATUALIZAR_DESVIO passa pelo fast-path incremental já instalado no banco.
replace_once(
    "src/lib/qualidadeCompat.ts",
    '''  "ADICIONAR_ANEXO",\n]);''',
    '''  "ADICIONAR_ANEXO",\n  "ATUALIZAR_DESVIO",\n]);''',
    "ATUALIZAR_DESVIO no fast-path",
)

path = "src/components/OcorrenciaCard.tsx"
p = Path(path)
s = p.read_text()

s = s.replace(
    'import { BUCKET_AUDITORIA, enviarFotoAuditoria } from "@/lib/anexos";',
    'import { BUCKET_AUDITORIA, enviarFotoAuditoria, otimizarFoto } from "@/lib/anexos";',
    1,
)

s = s.replace(
    '''  const [salvando, setSalvando] = useState(false);\n  const [faltaObs, setFaltaObs] = useState(false);\n  const [fotoPosRetrabalho, setFotoPosRetrabalho] = useState<File | null>(null);\n  const [processandoFoto, setProcessandoFoto] = useState(false);\n  const campoObs = useRef<HTMLTextAreaElement>(null);''',
    '''  const [sincronizando, setSincronizando] = useState(false);\n  const [fotoEmEnvio, setFotoEmEnvio] = useState(false);\n  const [fotoFalhou, setFotoFalhou] = useState(false);\n  const [faltaObs, setFaltaObs] = useState(false);\n  const [fotoPosRetrabalho, setFotoPosRetrabalho] = useState<File | null>(null);\n  const campoObs = useRef<HTMLTextAreaElement>(null);\n  // Trava síncrona: impede dois POSTs antes de o React renderizar o disabled.\n  const enviandoRef = useRef(false);''',
    1,
)

start = s.find('  async function enviar(status: string, observacao: string, avisoOk: string) {')
end = s.find('\n  async function salvar() {', start)
if start < 0 or end < 0:
    raise SystemExit("bloco enviar/salvar não encontrado")

novo_enviar = r'''  function enviar(status: string, observacao: string, avisoOk: string) {
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setSincronizando(true);
    setFotoFalhou(false);

    const supabase = createClient();
    const fotoOriginal =
      fotoPosRetrabalho &&
      (status === "RETRABALHO" || status === "RETRABALHO_PENDENTE")
        ? fotoPosRetrabalho
        : null;
    const observacaoFinal = observacao.trim() || null;

    // Meio-dia em São Paulo: a data não desliza de fuso em nenhuma direção.
    const resolvedAt =
      (status === "RETRABALHO" || status === "RETRABALHO_PENDENTE") &&
      dataRetrabalho
        ? `${dataRetrabalho}T12:00:00-03:00`
        : null;

    // OPTIMISTIC UI: o cartão fecha e muda de status no mesmo frame do toque.
    // A persistência acontece abaixo, sem prender o inspetor em "Salvando…".
    const otimista: Ocorrencia = {
      ...item,
      status: status as Status,
      observacao: observacaoFinal,
      resolved_at: resolvedAt,
      updated_at: new Date().toISOString(),
    };
    onSalvo(otimista);
    setAberto(false);
    if (fotoOriginal) setFotoEmEnvio(true);

    void (async () => {
      let fotoPendente: FotoPosRetrabalhoPendente | null = null;
      let fotoRemovida = false;

      const limparFotoPendente = async () => {
        if (!fotoPendente || fotoRemovida) return;
        fotoRemovida = true;
        const { error } = await supabase.storage
          .from(BUCKET_AUDITORIA)
          .remove([fotoPendente.path]);
        if (error) {
          toast.error(
            "Não foi possível limpar a foto enviada. O arquivo ficou preservado para revisão."
          );
        }
      };

      try {
        // O status é sempre a primeira escrita: foto nenhuma pode atrasá-lo.
        const { data, error } = await mutarQualidade("ATUALIZAR_DESVIO", {
          id: item.id,
          status,
          observacao: observacaoFinal,
          resolved_at: resolvedAt,
        });

        if (error) {
          // Falha de rede/banco: volta exatamente ao snapshot anterior e
          // reabre o cartão para o inspetor poder tentar novamente.
          onSalvo(item);
          setAberto(true);
          setFotoEmEnvio(false);
          toast.error(error.message);
          return;
        }

        const vindoDoBanco = data as Ocorrencia | null;
        let confirmado: Ocorrencia = vindoDoBanco
          ? {
              ...item,
              ...vindoDoBanco,
              anexos: item.anexos ?? vindoDoBanco.anexos,
            }
          : otimista;
        onSalvo(confirmado);
        toast.success(avisoOk);
        setFotoPosRetrabalho(null);

        if (!fotoOriginal) return;

        // Compressão + Storage + vínculo rodam somente DEPOIS do desvio
        // confirmado. O inspetor já está livre para continuar trabalhando.
        try {
          const otimizada = await otimizarFoto(fotoOriginal);
          fotoPendente = await prepararFotoPosRetrabalho(
            supabase,
            item,
            otimizada
          );

          const { error: vinculoError } = await adicionarAnexoRetrabalho({
            deviation_id: String(item.id),
            anexo: fotoPendente.dados,
          });

          if (vinculoError) {
            await limparFotoPendente();
            setFotoFalhou(true);
            toast.error(
              "Alteração salva, mas não foi possível vincular a foto pós-retrabalho. Tente anexá-la novamente."
            );
            return;
          }

          const assinado = await supabase.storage
            .from(BUCKET_AUDITORIA)
            .createSignedUrl(fotoPendente.path, 60 * 60);
          const anexo: AnexoOcorrencia = {
            id: fotoPendente.id,
            tipo: "retrabalho",
            nome_arquivo: String(fotoPendente.dados.name),
            mime_type: "image/jpeg",
            tamanho_bytes: Number(fotoPendente.dados.size),
            storage_bucket: BUCKET_AUDITORIA,
            storage_path: fotoPendente.path,
            url: assinado.data?.signedUrl ?? null,
          };
          confirmado = {
            ...confirmado,
            anexos: [...(confirmado.anexos ?? []), anexo],
          };
          onSalvo(confirmado);
          setFotoFalhou(false);
        } catch (errorFoto) {
          await limparFotoPendente();
          setFotoFalhou(true);
          toast.error(
            errorFoto instanceof Error
              ? `Alteração salva, mas a foto ficou pendente: ${errorFoto.message}`
              : "Alteração salva, mas a foto pós-retrabalho ficou pendente."
          );
        } finally {
          setFotoEmEnvio(false);
        }
      } catch (error) {
        onSalvo(item);
        setAberto(true);
        setFotoEmEnvio(false);
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível salvar a alteração."
        );
      } finally {
        enviandoRef.current = false;
        setSincronizando(false);
      }
    })();
  }
'''
s = s[:start] + novo_enviar + s[end:]

s = s.replace('  async function salvar() {\n    if (salvando) return;', '  function salvar() {\n    if (enviandoRef.current) return;', 1)
s = s.replace('''    await enviar(\n      novoStatus,''', '''    enviar(\n      novoStatus,''', 1)
s = s.replace('  async function aprovar() {\n    if (salvando) return;', '  function aprovar() {\n    if (enviandoRef.current) return;', 1)
s = s.replace('    await enviar("RETRABALHO", texto, "Retrabalho aprovado.");', '    enviar("RETRABALHO", texto, "Retrabalho aprovado.");', 1)
s = s.replace('  async function recusar() {\n    if (salvando) return;', '  function recusar() {\n    if (enviandoRef.current) return;', 1)
s = s.replace('''    await enviar(\n      "AGUARDANDO",''', '''    enviar(\n      "AGUARDANDO",''', 1)

# Indicadores discretos no cabeçalho do cartão, visíveis mesmo fechado.
old = '''          <SeloStatus status={item.status} />\n          {(item.status === "RETRABALHO" ||'''
new = '''          <SeloStatus status={item.status} />\n          {sincronizando && (\n            <span className="text-[10.5px] text-ink-3" aria-live="polite">\n              ◌ Sincronizando…\n            </span>\n          )}\n          {fotoEmEnvio && (\n            <span className="text-[10.5px] text-ink-3" aria-live="polite">\n              ◌ Foto enviando…\n            </span>\n          )}\n          {fotoFalhou && !fotoEmEnvio && (\n            <span className="text-[10.5px]" style={{ color: "var(--color-media)" }}>\n              ⚠ Foto pendente\n            </span>\n          )}\n          {(item.status === "RETRABALHO" ||'''
if old not in s:
    raise SystemExit("posição de indicadores no cabeçalho não encontrada")
s = s.replace(old, new, 1)

# Todos os botões usam a trava de background, mas nunca mostram Salvando….
s = s.replace('disabled={salvando}', 'disabled={sincronizando}')
s = s.replace('{salvando ? "…" : "Aprovar retrabalho"}', 'Aprovar retrabalho')
s = s.replace('                  setProcessandoFoto(false);\n', '')

old = '''                descricao="A evidência será compactada e vinculada a este desvio no Storage privado."\n                salvando={salvando}\n                onArquivoPronto={setFotoPosRetrabalho}\n                onProcessando={setProcessandoFoto}\n              />'''
new = '''                descricao="A evidência será compactada, enviada e vinculada em segundo plano, sem bloquear o salvamento."\n                salvando={sincronizando}\n                onArquivoPronto={setFotoPosRetrabalho}\n              />'''
if old not in s:
    raise SystemExit("SeletorFoto do retrabalho não encontrado")
s = s.replace(old, new, 1)

old = '''            disabled={salvando || processandoFoto}\n            className="btn btn-forte mt-3 w-full"\n            style={{ padding: "11px 16px", fontSize: 14.5 }}\n          >\n            {salvando ? "Salvando…" : "Salvar alteração"}\n          </button>'''
new = '''            disabled={sincronizando}\n            className="btn btn-forte mt-3 w-full"\n            style={{ padding: "11px 16px", fontSize: 14.5 }}\n          >\n            Salvar alteração\n          </button>'''
if old not in s:
    raise SystemExit("botão Salvar alteração não encontrado")
s = s.replace(old, new, 1)

# Guardas: não pode sobrar o bloqueio visual antigo no fluxo.
if 'processandoFoto' in s or 'setSalvando' in s or 'Salvando…' in s:
    raise SystemExit("sobrou estado/bloqueio antigo no OcorrenciaCard")
if 'onProcessando={setProcessandoFoto}' in s:
    raise SystemExit("foto ainda comprime antes do save")
if 'void (async () =>' not in s or 'onSalvo(otimista);' not in s:
    raise SystemExit("optimistic/background não aplicado")

p.write_text(s)
print("Retrabalho instantâneo aplicado")
