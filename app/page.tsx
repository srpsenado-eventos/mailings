import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Painel } from "@/components/painel";
import { armazemPadrao, RetratoIlegivelError, type Armazem } from "@/lib/armazem";
import { armazemEmBlob, clienteBlobPadrao } from "@/lib/armazem-blob";
import { modoDoApp } from "@/lib/modo";
import { COOKIE_SESSAO, validarToken } from "@/lib/sessao";
import type { Retrato } from "@/lib/types";

// Lê a cada abertura: o retrato muda fora do ciclo de build.
export const dynamic = "force-dynamic";

function Aviso({ titulo, texto, acao }: { titulo: string; texto: string; acao?: { href: string; rotulo: string } }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-serif text-3xl font-semibold">{titulo}</h1>
      <p className="mt-2 text-sm text-cinza">{texto}</p>
      {acao && <Link href={acao.href} className="mt-6 inline-block rounded-lg bg-acao px-5 py-2.5 text-sm font-semibold text-white">{acao.rotulo}</Link>}
    </main>
  );
}

export default async function Home() {
  const modo = modoDoApp();
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (modo === "web" && !token) {
    return <Aviso titulo="Ambiente não configurado" texto="Falta a variável BLOB_READ_WRITE_TOKEN neste ambiente. Nada quebrou; só não há de onde ler a varredura publicada." />;
  }
  if (modo === "web") {
    // Defesa em profundidade: o middleware já barrou, aqui confere de novo.
    const sessao = (await cookies()).get(COOKIE_SESSAO)?.value;
    if (!(await validarToken(sessao, process.env.APP_SEGREDO_COOKIE ?? "", Date.now()))) redirect("/entrar");
  }
  const armazem: Armazem = modo === "web" ? armazemEmBlob(clienteBlobPadrao(token as string)) : armazemPadrao();

  let retrato: Retrato | undefined;
  try {
    retrato = await armazem.lerRetrato();
  } catch (err) {
    if (err instanceof RetratoIlegivelError) {
      return modo === "web"
        ? <Aviso titulo="A varredura publicada não pôde ser lida" texto="O retrato publicado existe, mas não é um retrato válido para esta versão do painel. Publique de novo a partir da máquina do GT." />
        : <Aviso titulo="O último retrato não pôde ser lido" texto="O arquivo .fiscal/retrato.json existe, mas não é um retrato válido. Faça uma nova varredura; ela substitui o arquivo." acao={{ href: "/nova-varredura", rotulo: "Nova varredura" }} />;
    }
    if (modo === "web") {
      // Blob fora do ar: nada de cache, nada de retrato velho (spec §7).
      console.error("[/] retrato publicado não lido:", err instanceof Error ? err.message : "erro desconhecido");
      return <Aviso titulo="Não foi possível ler a varredura publicada" texto="O serviço de armazenamento não respondeu. Recarregue a página em instantes." />;
    }
    throw err;
  }
  if (!retrato) {
    if (modo === "web") return <Aviso titulo="Nenhuma varredura publicada ainda" texto="Quando a máquina do GT publicar uma varredura, ela aparece aqui." />;
    redirect("/nova-varredura");
  }
  // O painel não usa a base de endereços (só o /prodasen); não vai ao cliente.
  const { baseEnderecos: _base, ...retratoDoPainel } = retrato;
  return <Painel retrato={retratoDoPainel} modo={modo} podePublicar={modo === "local" && Boolean(token)} />;
}
