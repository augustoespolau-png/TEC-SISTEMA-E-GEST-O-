import type { CampoRecorte } from "@/lib/dashboard";

/*
 * O CLIQUE NO GRÁFICO VIRA RECORTE DO PAINEL INTEIRO.
 *
 * Um gráfico é uma pergunta respondida em cima do conjunto todo; quando
 * uma coluna chama atenção, a pergunta seguinte é sempre a mesma —
 * "e o resto, como fica só nesse pedaço?". Antes disso só dava para
 * responder mudando o período à mão, e nem toda coluna é um período:
 * casa, tipo e setor não cabem no seletor de datas.
 *
 * Aqui cada marca do gráfico diz QUAL campo ela representa e com que
 * valor. Quem monta a tela decide o que fazer com isso — hoje, somar ao
 * recorte que vale para todas as folhas.
 *
 * A conta de quem filtra o quê NÃO mora aqui: mora em lib/dashboard.ts
 * (aplicarRecortes / aplicarRecortesEmParedes), que já sabe, por
 * exemplo, que recortar por setor não pode filtrar paredes — tirar as
 * paredes sem aquele erro tiraria do denominador justamente as que
 * passaram, e o FPY subiria sozinho.
 */
export interface Clicavel {
  /** liga/desliga o recorte; ausente = gráfico apenas de leitura */
  aoRecortar?: (campo: CampoRecorte, valor: string) => void;
  /** este valor está recortado agora? usado para acender a marca */
  aceso?: (campo: CampoRecorte, valor: string) => boolean;
}

/**
 * Como uma marca se apresenta dentro de um gráfico com recorte ativo.
 *
 * Com algo aceso, o que não faz parte do recorte não some — apaga. Sumir
 * mudaria a forma do gráfico e a pessoa perderia a referência de onde
 * estava; apagado, o contorno do conjunto continua lá e o pedaço
 * escolhido salta.
 */
export function opacidadeDaMarca(
  temAlgumAceso: boolean,
  esteAceso: boolean
): number {
  if (!temAlgumAceso) return 1;
  return esteAceso ? 1 : 0.25;
}
