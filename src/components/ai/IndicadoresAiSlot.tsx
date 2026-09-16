"use client";

import { usePathname, useSearchParams } from "next/navigation";
import InsightsPreditivos from "@/components/ai/InsightsPreditivos";

export default function IndicadoresAiSlot() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const folha = searchParams.get("folha") ?? "fpy";

  if (pathname !== "/indicadores" || folha !== "desvios") return null;

  return (
    <div className="tela pt-4 pb-0">
      <InsightsPreditivos projeto={null} />
    </div>
  );
}
