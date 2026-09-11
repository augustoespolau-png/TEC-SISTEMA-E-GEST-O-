import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/*
 * A aba Registrar saiu do ar. Esta rota virou a porta de entrada: manda
 * cada perfil para a primeira tela que ele pode usar.
 *
 * Por que Auditoria e não Registrar: a auditoria lança o erro já preso à
 * casa e à parede conferida, que é o que alimenta o FPY. O Registrar
 * lançava erro solto, sem dizer quantas paredes foram olhadas — eram
 * dois jeitos de entrar com a mesma informação, e só um deles sustenta o
 * indicador.
 *
 * O CÓDIGO DO REGISTRAR NÃO FOI APAGADO. Continua em:
 *   src/components/RegistrarForm.tsx
 *
 * Ele grava em public.ocorrencias sem auditoria_id — o banco aceita, a
 * tela Consultar mostra e o painel conta o erro na parede pelo
 * cruzamento de texto (projeto + casa + parede). O que esse erro NÃO faz
 * é criar parede conferida, então ele não entra no denominador do FPY.
 *
 * PARA RELIGAR: devolva o <RegistrarForm userId={user.id} /> aqui (ou
 * numa rota própria, tipo /registrar) e recoloque a aba em TabBar.tsx e
 * NavInferior.tsx. O componente está inteiro e continua compilando.
 */
export default async function Entrada() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  /* Só a gestão cai na auditoria. Consultor e operador vão para a
     consulta — o consultor porque não audita, o operador porque a
     auditoria saiu do menu dele. Sem esta linha, quem entrasse como
     operador aterrissava numa tela que o menu dele não sabe mais
     alcançar: sem aba acesa e sem caminho de volta. */
  /* Cada papel cai na tela que é a dele: a gestão na auditoria, o
     consultor no indicador (é a única tela dele) e o operador na
     consulta. */
  redirect(
    profile?.role === "gestao"
      ? "/auditoria"
      : profile?.role === "consultor"
        ? "/indicadores"
        : "/consultar"
  );
}
