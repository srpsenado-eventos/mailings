import Link from "next/link";
import { redirect } from "next/navigation";
import { Painel } from "@/components/painel";
import { armazemPadrao, RetratoIlegivelError } from "@/lib/armazem";
import type { Retrato } from "@/lib/types";

// Lê o arquivo a cada abertura: o retrato muda fora do ciclo de build.
export const dynamic = "force-dynamic";

export default async function Home() {
  let retrato: Retrato | undefined;
  try {
    retrato = await armazemPadrao().lerRetrato();
  } catch (err) {
    if (err instanceof RetratoIlegivelError) {
      return (
        <main className="mx-auto max-w-3xl px-6 py-12">
          <h1 className="font-serif text-3xl font-semibold">O último retrato não pôde ser lido</h1>
          <p className="mt-2 text-sm text-cinza">O arquivo .fiscal/retrato.json existe, mas não é um retrato válido. Faça uma nova varredura; ela substitui o arquivo.</p>
          <Link href="/nova-varredura" className="mt-6 inline-block rounded-lg bg-acao px-5 py-2.5 text-sm font-semibold text-white">Nova varredura</Link>
        </main>
      );
    }
    throw err;
  }
  if (!retrato) redirect("/nova-varredura");
  return <Painel retrato={retrato} />;
}
