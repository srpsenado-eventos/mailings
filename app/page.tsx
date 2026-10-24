import { carregarRetrato } from "@/app/carregar-retrato";
import { Painel } from "@/components/painel";

// Lê a cada abertura: o retrato muda fora do ciclo de build.
export const dynamic = "force-dynamic";

export default async function Home() {
  const carga = await carregarRetrato("/");
  if ("aviso" in carga) return carga.aviso;
  // O painel não usa a base de endereços (só o /prodasen) nem a memória de leitura; não vão ao cliente.
  const { baseEnderecos: _base, leituras: _leituras, ...retratoDoPainel } = carga.retrato;
  return <Painel retrato={retratoDoPainel} modo={carga.modo} podePublicar={carga.podePublicar} />;
}
