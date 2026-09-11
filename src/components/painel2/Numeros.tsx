"use client";

import { Dica } from "@/components/painel/Interativo";
import type { RegraFpy, ResumoProjeto } from "@/lib/painel2";
import { corDoFpy } from "./estados";

/**
 * O macro: quatro números, e só. A pergunta que cada um responde está
 * escrita embaixo dele — quem olha de longe não precisa lembrar a
 * definição de FPY.
 */
export default function Numeros({
  r,
  regra,
  meta,
  aoVerEmRetrabalho,
}: {
  r: ResumoProjeto;
  regra: RegraFpy;
  /** meta de FPY, do parâmetro fpy_meta */
  meta: number;
  aoVerEmRetrabalho: () => void;
}) {
  const regraMordeu = regra.ativa && r.anuladasPelaRegra > 0;
  return (
    <div className="numeros2">
      <Numero
        rotulo="FPY"
        valor={r.fpy}
        sufixo="%"
        cor={corDoFpy(r.fpy, meta)}
        embaixo={
          regraMordeu
            ? `${r.passaramFpy} de ${r.conferidas} paredes · ${r.anuladasPelaRegra} anuladas pela regra`
            : `${r.passaramFpy} de ${r.conferidas} paredes · meta ${meta}%`
        }
        resumo={
          "FPY — First Pass Yield: paredes conferidas que não tiveram nenhum erro, divididas pelo total conferido. Uma parede que precisou de retrabalho não entra aqui, mesmo depois de corrigida." +
          (regra.ativa
            ? ` Regra da empresa: casa com ${regra.minParedesAfetadas} ou mais paredes afetadas tem o FPY zerado, e aí nem as paredes limpas dela contam.`
            : "")
        }
        dica={
          <>
            <b>FPY — First Pass Yield</b>
            <br />
            Passou de primeira: paredes conferidas que não tiveram nenhum erro,
            divididas pelo total conferido. É o indicador de fazer certo na
            primeira vez.
            <br />
            Uma parede que precisou de retrabalho não entra aqui, mesmo depois
            de corrigida.
            {regra.ativa && (
              <>
                <br />
                <br />
                <b>Regra da empresa:</b> casa com{" "}
                {regra.minParedesAfetadas} ou mais paredes afetadas tem o FPY
                zerado — nem as paredes limpas dela contam. A conta é de
                espalhamento: o que pesa é em quantas posições o erro
                apareceu, não quantos erros foram.
                {regraMordeu && (
                  <>
                    {" "}
                    Neste recorte isso anulou <b>
                      {r.anuladasPelaRegra}
                    </b>{" "}
                    paredes que tinham passado.
                  </>
                )}
              </>
            )}
          </>
        }
      />

      <Numero
        rotulo="Paredes em retrabalho"
        valor={r.emRetrabalho}
        cor={r.emRetrabalho > 0 ? "var(--color-alta)" : "var(--color-baixa)"}
        embaixo={
          r.criticosAbertos > 0
            ? `${r.criticosAbertos} erro${r.criticosAbertos === 1 ? "" : "s"} crítico${r.criticosAbertos === 1 ? "" : "s"} em aberto`
            : "nenhum erro crítico em aberto"
        }
        aoClicar={r.emRetrabalho > 0 ? aoVerEmRetrabalho : undefined}
        resumo="Paredes com erro em aberto, contadas por parede e não por erro: uma parede com oito erros conta uma vez. Toque para ver os erros."
        dica={
          <>
            <b>Paredes com erro em aberto</b>
            <br />
            Contadas por parede, não por erro: uma parede com oito erros conta
            uma vez. É quanto trabalho ainda existe no chão de fábrica.
            <br />
            Clique para ver os erros.
          </>
        }
      />

      <Numero
        rotulo="Execução"
        valor={r.pctConcluido}
        sufixo="%"
        cor="var(--color-info)"
        embaixo={`${r.aceitas + r.retrabalhadas} de ${r.conferidas} paredes resolvidas`}
        resumo="Aceitas de primeira mais retrabalhadas COM aprovação, sobre as paredes conferidas. Retrabalho sem aprovação não entra."
        dica={
          <>
            <b>Quanto do projeto está resolvido</b>
            <br />
            Aceitas de primeira mais retrabalhadas <b>com aprovação</b>, sobre
            as paredes conferidas.
            <br />
            Retrabalho sem aprovação não entra: enquanto a gestão não confirma,
            não está resolvido.
          </>
        }
      />

      <Numero
        rotulo="Casas sem pendência"
        valor={r.casasConcluidas}
        cor="var(--color-baixa)"
        embaixo={`de ${r.casas} ${r.casas === 1 ? "casa" : "casas"} com auditoria`}
        resumo="Casas em que todas as paredes conferidas estão resolvidas — aceitas ou retrabalhadas e aprovadas."
        dica={
          <>
            <b>Casas prontas</b>
            <br />
            Casa em que todas as paredes conferidas estão resolvidas — aceitas
            ou retrabalhadas e aprovadas.
          </>
        }
      />
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  sufixo,
  cor,
  embaixo,
  dica,
  resumo,
  aoClicar,
}: {
  rotulo: string;
  valor: number | null;
  sufixo?: string;
  cor?: string;
  embaixo: string;
  dica: React.ReactNode;
  /* mesma explicação em texto puro: no celular não existe hover, então o
     title é a única via — e serve também para leitor de tela */
  resumo: string;
  aoClicar?: () => void;
}) {
  const vazio = valor === null;
  const conteudo = (
    <>
      <span className="n2-rotulo">{rotulo}</span>
      <span className="n2-valor mono" style={{ color: vazio ? undefined : cor }}>
        {vazio ? "—" : valor.toLocaleString("pt-BR")}
        {!vazio && sufixo && <small>{sufixo}</small>}
      </span>
      <span className="n2-embaixo">{vazio ? "sem auditoria ainda" : embaixo}</span>
      <Dica lado="esq">{dica}</Dica>
    </>
  );

  if (aoClicar)
    return (
      <button
        type="button"
        onClick={aoClicar}
        title={resumo}
        className="numero2 dica-alvo clicavel"
      >
        {conteudo}
      </button>
    );
  return (
    <div className="numero2 dica-alvo" title={resumo}>
      {conteudo}
    </div>
  );
}
