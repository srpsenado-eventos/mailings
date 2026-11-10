import { carregarRetrato } from "@/app/carregar-retrato";
import { Painel } from "@/components/painel";
import { avisoDoParametro } from "@/lib/decisoes-coleta";

// Lê a cada abertura: o retrato muda fora do ciclo de build.
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const carga = await carregarRetrato("/");
  if ("aviso" in carga) return carga.aviso;
  // Aviso de decisões: o do carregador (arquivo ilegível) e o da varredura que acabou (`?aviso=decisoes`).
  const avisoDaVarredura = avisoDoParametro((await searchParams).aviso);
  const aviso = [carga.avisoDecisoes, avisoDaVarredura].filter(Boolean).join(" ") || undefined;
  // O painel não usa a base de endereços (só o /prodasen) nem a memória de leitura; não vão ao cliente.
  const { baseEnderecos: _base, leituras: _leituras, ...retratoDoPainel } = carga.retrato;
  return <Painel retrato={retratoDoPainel} modo={carga.modo} podePublicar={carga.podePublicar} aviso={aviso} decisoes={carga.decisoes} />;
}
