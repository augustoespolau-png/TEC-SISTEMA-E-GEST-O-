"use client";

import { useEffect, useRef, useState } from "react";

export interface Tamanho {
  largura: number;
  altura: number;
}

/**
 * Tamanho real do contêiner, acompanhado enquanto a tela muda.
 *
 * Mede DUAS vezes de propósito. O ResizeObserver cobre o redimensionar
 * da janela, a barra lateral que abre e a troca de folha; mas ele só
 * entrega o callback dentro do ciclo de renderização do navegador, e há
 * casos em que esse ciclo não roda — aba em segundo plano, janela
 * minimizada, navegador sem composição. Nesses casos o desenho ficava
 * preso no tamanho mínimo, com o SVG de 680x320 esticado dentro de uma
 * caixa de 1178x731. Por isso a leitura direta na montagem, que não
 * depende de quadro nenhum.
 */
export function useTamanho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [t, setT] = useState<Tamanho>({ largura: 0, altura: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const anotar = (largura: number, altura: number) =>
      setT((antes) =>
        antes.largura === largura && antes.altura === altura
          ? antes
          : { largura, altura }
      );

    /* clientWidth/Height, e nao getBoundingClientRect: sao a caixa de
       CONTEUDO, a mesma que o contentRect do observer entrega, e ja
       descontam a barra de rolagem. Com o retangulo de borda, o
       fluxograma no tablet saia 15px mais alto que a area em que era
       pintado — a altura que a barra horizontal ocupa. */
    anotar(el.clientWidth, el.clientHeight);

    const obs = new ResizeObserver(([e]) =>
      anotar(
        Math.round(e.contentRect.width),
        Math.round(e.contentRect.height)
      )
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return [ref, t] as const;
}
