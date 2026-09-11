import Image from "next/image";

/*
 * Logotipo oficial da Tecverde, dos arquivos entregues com o manual de
 * identidade. O símbolo real são três laços vazados que se cruzam, com
 * degradê do azul 639C ao verde 362C.
 *
 * O PNG original tinha fundo chapado; o fundo foi recortado, senão o logo
 * apareceria como um retângulo dentro da barra do topo, que tem cor
 * própria e não coincide com o fundo da página em nenhum dos dois temas.
 *
 * A versão certa para cada tema é escolhida por CSS, não por JavaScript:
 * as duas imagens vão no HTML e o tema esconde a que não serve, então a
 * correta já aparece no primeiro quadro, sem piscar na hidratação.
 *
 * A ALTURA fica no CSS (.logo-tv), com media query. O logo completo — com
 * a escrita TECVERDE e o slogan — aparece em toda largura de tela, só
 * menor no celular; não existe versão "só o símbolo" nos cabeçalhos.
 */

const PROPORCAO = 518 / 146; // medida do arquivo, para não distorcer
const PROPORCAO_SIMBOLO = 136 / 146;

/** Só o símbolo, sem o nome. Serve nos dois temas: é colorido. */
export function SimboloTecverde({ tamanho = 34 }: { tamanho?: number }) {
  const largura = Math.round(tamanho * PROPORCAO_SIMBOLO);
  return (
    <Image
      src="/logo-simbolo.png"
      alt=""
      width={largura}
      height={tamanho}
      priority
      style={{ height: tamanho, width: largura, flexShrink: 0 }}
    />
  );
}

export default function LogoTecverde({
  className = "",
}: {
  /** "grande" na tela de login; vazio nos cabeçalhos */
  className?: string;
}) {
  // valores nominais para o next/image; a altura real vem do CSS
  const altura = 30;
  const largura = Math.round(altura * PROPORCAO);
  return (
    <span className={`logo-tv ${className}`}>
      <Image
        src="/logo-claro.png"
        alt="Tecverde · Construções eficientes"
        width={largura}
        height={altura}
        priority
        className="logo-tv-claro"
      />
      <Image
        src="/logo-escuro.png"
        alt=""
        aria-hidden
        width={largura}
        height={altura}
        priority
        className="logo-tv-escuro"
      />
    </span>
  );
}
