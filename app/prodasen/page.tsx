import Link from "next/link";
import { notFound } from "next/navigation";
import { ProdasenEndereco } from "@/components/prodasen-endereco";
import { gruposPorContatoDoRetrato, montarAjusteNumero } from "@/lib/ajuste-numero";
import { armazemPadrao } from "@/lib/armazem";
import { modoDoApp } from "@/lib/modo";
import { ColunaFaltanteError } from "@/lib/planilha";

export const dynamic = "force-dynamic";

function Aviso({ texto, acao }: { texto: string; acao?: { href: string; rotulo: string } }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-serif text-3xl font-semibold">Ajustes PRODASEN</h1>
      <p className="mt-2 text-sm text-cinza">{texto}</p>
      {acao && <Link href={acao.href} className="mt-6 inline-block rounded-lg bg-acao px-5 py-2.5 text-sm font-semibold text-white">{acao.rotulo}</Link>}
    </main>
  );
}

export default async function ProdasenPage() {
  if (modoDoApp() === "web") notFound();
  const retrato = await armazemPadrao().lerRetrato();
  if (!retrato) {
    return <Aviso texto="Ainda não há varredura salva." acao={{ href: "/nova-varredura", rotulo: "Nova varredura" }} />;
  }
  const base = retrato.baseEnderecos;
  if (!base) {
    return <Aviso texto="Esta varredura é anterior à tela do PRODASEN: faça uma nova varredura com a planilha de endereços" acao={{ href: "/nova-varredura", rotulo: "Nova varredura" }} />;
  }
  try {
    const ajuste = montarAjusteNumero(base, gruposPorContatoDoRetrato(retrato.grupos));
    return (
      <ProdasenEndereco
        base={base}
        ajuste={ajuste}
        fora={retrato.numeroNaBase ? retrato.numeroNaBase.foraDaPosse + retrato.numeroNaBase.naoPrioritarios : 0}
        geradoEm={retrato.geradoEm}
        fonte={retrato.planilhaEnderecos?.nome ?? ""}
      />
    );
  } catch (err) {
    if (err instanceof ColunaFaltanteError) return <Aviso texto={err.message} />;
    throw err;
  }
}
