from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"{label}: trecho não encontrado em {path}")
    p.write_text(text.replace(old, new, 1))


# 1) Mantém a série temporal inteira visível enquanto o painel é recortado.
path = "src/components/indicadores/Indicadores.tsx"
replace_once(
    path,
    '''    return {
      paredes: aplicarRecortesEmParedes(
        paredes.filter((p) => pertenceAoEscopo(p.projeto) && dentro(p.data)),
        recortes
      ),
      erros: aplicarRecortes(
        erros.filter((e) => pertenceAoEscopo(e.projeto) && dentro(e.data)),
        recortes
      ),
    };''',
    '''    const paredesDoPeriodo = paredes.filter(
      (p) => pertenceAoEscopo(p.projeto) && dentro(p.data)
    );
    const errosDoPeriodo = erros.filter(
      (e) => pertenceAoEscopo(e.projeto) && dentro(e.data)
    );
    /* O clique em dia/semana recorta os cartões e os demais gráficos,
       mas a própria série temporal preserva o contexto do período para
       que a marca selecionada possa virar uma barra e se mover para outro
       ponto sem o restante da linha desaparecer. Outros recortes (casa,
       parede etc.) continuam afetando a série normalmente. */
    const recortesSemTempo = recortes.filter(
      (r) => r.campo !== "dia" && r.campo !== "semanaMes"
    );
    return {
      paredes: aplicarRecortesEmParedes(paredesDoPeriodo, recortes),
      erros: aplicarRecortes(errosDoPeriodo, recortes),
      paredesTempo: aplicarRecortesEmParedes(paredesDoPeriodo, recortesSemTempo),
    };''',
    "série temporal independente do recorte temporal",
)
replace_once(
    path,
    '            onChange={(e) => setProjeto(e.target.value)}',
    '''            onChange={(e) => {
              setRecortes([]);
              setProjeto(e.target.value);
            }}''',
    "limpa seleção temporal ao trocar projeto",
)
replace_once(
    path,
    '              onClick={() => setPeriodo(p.valor)}',
    '''              onClick={() => {
                setRecortes([]);
                setPeriodo(p.valor);
              }}''',
    "limpa seleção temporal ao trocar período",
)
replace_once(
    path,
    '              aoEscolher={(de, ate) => setDatas({ de, ate })}',
    '''              aoEscolher={(de, ate) => {
                setRecortes([]);
                setDatas({ de, ate });
              }}''',
    "limpa seleção temporal ao trocar datas",
)
replace_once(
    path,
    '          paredes={recorte.paredes}\n          erros={recorte.erros}',
    '          paredes={recorte.paredes}\n          paredesTempo={recorte.paredesTempo}\n          erros={recorte.erros}',
    "passa série temporal contextual para FolhaFpy",
)

# 2) Usa a série contextual apenas nos dois gráficos de tempo.
path = "src/components/indicadores/FolhaFpy.tsx"
replace_once(
    path,
    '''export default function FolhaFpy({
  paredes,
  erros,''',
    '''export default function FolhaFpy({
  paredes,
  paredesTempo,
  erros,''',
    "prop paredesTempo no destructuring",
)
replace_once(
    path,
    '''  paredes: ParedeConferida[];
  erros: LinhaDash[];''',
    '''  paredes: ParedeConferida[];
  /** Série do período antes do recorte por dia/semana; mantém a linha
      inteira visível enquanto o ponto selecionado vira uma barra. */
  paredesTempo: ParedeConferida[];
  erros: LinhaDash[];''',
    "tipo paredesTempo",
)
replace_once(
    path,
    '          pontos={fpyPorDia(paredes)}',
    '          pontos={fpyPorDia(paredesTempo)}',
    "FPY por dia usa série contextual",
)
replace_once(
    path,
    '          pontos={fpyPorSemana(paredes)}',
    '          pontos={fpyPorSemana(paredesTempo)}',
    "FPY por semana usa série contextual",
)

# 3) O ponto selecionado vira coluna/barra vertical usando o mesmo token de cor.
p = Path("src/components/indicadores/Graficos.tsx")
s = p.read_text()
marcador_inicio = "export function LinhaFpyTempo({"
marcador_fim = "/* ------------------------------------------------------------------ */\n/* Colunas"
if marcador_inicio not in s or marcador_fim not in s:
    raise SystemExit("LinhaFpyTempo: limites da função não encontrados")
prefixo, resto = s.split(marcador_inicio, 1)
segmento, sufixo = resto.split(marcador_fim, 1)

old = '''              const cor = corDoPonto(p.fpy);
              const estaAceso = !!aceso && aceso(campo, p.chave);
              return ('''
new = '''              const cor = corDoPonto(p.fpy);
              const estaAceso = !!aceso && aceso(campo, p.chave);
              /* Seleção temporal = coluna. O piso de 8px mantém 0% visível
                 e a largura limitada evita que um único dia vire um bloco
                 gigante quando o gráfico tem poucos pontos. */
              const larguraBarra = Math.max(14, Math.min(40, passo * 0.54));
              const baseBarra = y(0);
              const alturaBarra = Math.max(8, baseBarra - y(p.fpy));
              const topoBarra = baseBarra - alturaBarra;
              const topoMarca = estaAceso ? topoBarra : y(p.fpy);
              return ('''
if old not in segmento:
    raise SystemExit("LinhaFpyTempo: cálculo da marca não encontrado")
segmento = segmento.replace(old, new, 1)

old = '''                  <circle
                    cx={x(i)} cy={y(p.fpy)} r={raio}
                    fill={cor}
                    stroke="var(--color-papel)"
                    strokeWidth={1.5}
                    pointerEvents="none"
                  />
                  {cabe[i] && (
                    <text
                      className="ind-valor-svg"
                      x={x(i)} y={y(p.fpy) - raio - 5}
                      textAnchor="middle"
                      style={{ fontSize: fonte, fill: cor }}
                      pointerEvents="none"
                    >
                      {p.fpy}
                    </text>
                  )}'''
new = '''                  {estaAceso ? (
                    <>
                      {/* halo de papel separa a barra da linha/área no tema escuro */}
                      <rect
                        x={x(i) - larguraBarra / 2}
                        y={topoBarra}
                        width={larguraBarra}
                        height={alturaBarra}
                        rx={3}
                        fill={cor}
                        fillOpacity={0.2}
                        stroke="var(--color-papel)"
                        strokeWidth={5}
                        pointerEvents="none"
                      />
                      <rect
                        x={x(i) - larguraBarra / 2}
                        y={topoBarra}
                        width={larguraBarra}
                        height={alturaBarra}
                        rx={3}
                        fill={cor}
                        fillOpacity={0.42}
                        stroke={cor}
                        strokeWidth={2}
                        pointerEvents="none"
                      />
                    </>
                  ) : (
                    <circle
                      cx={x(i)} cy={y(p.fpy)} r={raio}
                      fill={cor}
                      stroke="var(--color-papel)"
                      strokeWidth={1.5}
                      pointerEvents="none"
                    />
                  )}
                  {(estaAceso || cabe[i]) && (
                    <text
                      className="ind-valor-svg"
                      x={x(i)} y={topoMarca - (estaAceso ? 6 : raio + 5)}
                      textAnchor="middle"
                      style={{ fontSize: fonte, fill: cor }}
                      pointerEvents="none"
                    >
                      {p.fpy}
                    </text>
                  )}'''
if old not in segmento:
    raise SystemExit("LinhaFpyTempo: círculo/valor não encontrado")
segmento = segmento.replace(old, new, 1)

p.write_text(prefixo + marcador_inicio + segmento + marcador_fim + sufixo)

print("Patch de barra selecionada do FPY aplicado com sucesso")
