from pathlib import Path

p = Path("src/components/auditoria/AuditoriaCasa.tsx")
s = p.read_text()

old_refs = '''  const datasRef = useRef<Record<string, string>>({});
  const errosRef = useRef<ErroDaAuditoria[]>([]);
  const nasRef = useRef<NaDaAuditoria[]>([]);
  const auditoriaIdRef = useRef<string | null>(null);
  datasRef.current = datas;
  errosRef.current = erros;
  nasRef.current = nas;
  auditoriaIdRef.current = auditoria?.id ?? null;'''
new_refs = '''  const datasRef = useRef<Record<string, string>>({});
  const errosRef = useRef<ErroDaAuditoria[]>([]);
  const nasRef = useRef<NaDaAuditoria[]>([]);
  const auditoriaIdRef = useRef<string | null>(null);'''
if old_refs not in s:
    raise SystemExit("Bloco de refs gerado pelo patch não encontrado")
s = s.replace(old_refs, new_refs, 1)

marker = '''  const [regras, setRegras] = useState<Regras>(REGRAS_PADRAO);

  /* ---------- listas de configuração ---------- */'''
replacement = '''  const [regras, setRegras] = useState<Regras>(REGRAS_PADRAO);

  useEffect(() => {
    datasRef.current = datas;
  }, [datas]);
  useEffect(() => {
    errosRef.current = erros;
  }, [erros]);
  useEffect(() => {
    nasRef.current = nas;
  }, [nas]);
  useEffect(() => {
    auditoriaIdRef.current = auditoria?.id ?? null;
  }, [auditoria?.id]);

  /* ---------- listas de configuração ---------- */'''
if marker not in s:
    raise SystemExit("Ponto de sincronização das refs não encontrado")
s = s.replace(marker, replacement, 1)

old_switch = '''        if (auditoriaIdRef.current !== auditoriaId) return;

        let atualizados = errosRef.current.map((item) => item.id === idOtimista ? { ...item, id } : item);'''
new_switch = '''        if (auditoriaIdRef.current !== auditoriaId) {
          if (anexo) {
            const anexoSalvoForaDaTela = await salvarFotoDoDesvio(
              supabase,
              parede,
              id,
              anexo
            );
            if (anexoSalvoForaDaTela.error) {
              toast.error(
                "O erro foi salvo, mas a foto não sincronizou: " +
                  anexoSalvoForaDaTela.error.message
              );
            }
          }
          return;
        }

        let atualizados = errosRef.current.map((item) => item.id === idOtimista ? { ...item, id } : item);'''
if old_switch not in s:
    raise SystemExit("Guarda de troca de auditoria não encontrada")
s = s.replace(old_switch, new_switch, 1)

old_pending = '''        const pendentesPosteriores = nasRef.current.filter(
          (item) => item.parede === parede && item.id.startsWith("optimistic-na-") && !idsOtimistas.includes(item.id)
        );
        const reconciliados = [
          ...nasRef.current.filter((item) => item.parede !== parede),
          ...((leitura.data ?? []) as NaDaAuditoria[]),
          ...pendentesPosteriores,
        ];'''
new_pending = '''        const persistidos = (leitura.data ?? []) as NaDaAuditoria[];
        const tiposPersistidos = new Set(persistidos.map((item) => item.tipo_erro));
        const pendentesPosteriores = nasRef.current.filter(
          (item) =>
            item.parede === parede &&
            item.id.startsWith("optimistic-na-") &&
            !idsOtimistas.includes(item.id) &&
            !tiposPersistidos.has(item.tipo_erro)
        );
        const reconciliados = [
          ...nasRef.current.filter((item) => item.parede !== parede),
          ...persistidos,
          ...pendentesPosteriores,
        ];'''
if old_pending not in s:
    raise SystemExit("Reconciliação de N/A concorrente não encontrada")
s = s.replace(old_pending, new_pending, 1)

p.write_text(s)
print("Correções pós-patch aplicadas")
