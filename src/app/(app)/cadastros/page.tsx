import { redirect } from "next/navigation";
import GovernancaCadastros from "@/components/cadastros/GovernancaCadastros";
import { requireGestao, type EquipeRow, type ObraProjetoRow, type PerfilAcessoRow } from "@/lib/governanca";

const POR_PAGINA = 20;

type PageProps = {
  searchParams: Promise<{ pagina?: string; busca?: string }>;
};

export default async function CadastrosPage({ searchParams }: PageProps) {
  let guard;
  try {
    guard = await requireGestao();
  } catch {
    redirect("/");
  }

  const params = await searchParams;
  const pagina = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);
  const busca = (params.busca ?? "").trim();
  const inicio = (pagina - 1) * POR_PAGINA;
  const fim = inicio + POR_PAGINA - 1;
  const { supabase } = guard;

  let usuariosQuery = supabase
    .from("perfis_acesso")
    .select(
      "user_id,email,full_name,role,status,permissions,suspended_until,version",
      { count: "exact" }
    )
    .order("full_name", { ascending: true, nullsFirst: false })
    .order("email", { ascending: true })
    .range(inicio, fim);

  if (busca) {
    const termo = busca.replace(/[%_,()]/g, " ").trim();
    if (termo) usuariosQuery = usuariosQuery.or(`full_name.ilike.%${termo}%,email.ilike.%${termo}%`);
  }

  const [usuariosResult, equipesResult, membrosResult, projetosResult] = await Promise.all([
    usuariosQuery,
    supabase
      .from("equipes")
      .select("id,nome,descricao,ativo")
      .order("ativo", { ascending: false })
      .order("nome", { ascending: true }),
    supabase.from("equipe_membros").select("equipe_id,user_id,papel_equipe"),
    supabase
      .from("obras_projetos")
      .select("id,codigo,nome,origem,status")
      .order("status", { ascending: true })
      .order("nome", { ascending: true })
      .limit(200),
  ]);

  if (usuariosResult.error) {
    throw new Error("Falha ao carregar usuários: " + usuariosResult.error.message);
  }
  if (equipesResult.error) {
    throw new Error("Falha ao carregar equipes: " + equipesResult.error.message);
  }
  if (membrosResult.error) {
    throw new Error("Falha ao carregar vínculos de equipe: " + membrosResult.error.message);
  }
  if (projetosResult.error) {
    throw new Error("Falha ao carregar projetos: " + projetosResult.error.message);
  }

  const total = usuariosResult.count ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <main className="tela" style={{ maxWidth: 1440 }}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">
            Administração
          </p>
          <h1 className="mt-1 text-xl font-semibold text-ink">Cadastros e Governança de Acessos</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-2">
            Usuários, perfis, visibilidade, equipes e projetos em uma única área. A interface ajuda;
            a autorização efetiva continua validada no servidor e nas políticas RLS do Supabase.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-papel-2 px-3 py-2 text-xs text-ink-2">
          {total} usuário{total === 1 ? "" : "s"} · página {Math.min(pagina, totalPaginas)} de {totalPaginas}
        </div>
      </div>

      <GovernancaCadastros
        usuarios={(usuariosResult.data ?? []) as PerfilAcessoRow[]}
        equipes={(equipesResult.data ?? []) as EquipeRow[]}
        membros={membrosResult.data ?? []}
        projetos={(projetosResult.data ?? []) as ObraProjetoRow[]}
        pagina={pagina}
        totalPaginas={totalPaginas}
        busca={busca}
      />
    </main>
  );
}
