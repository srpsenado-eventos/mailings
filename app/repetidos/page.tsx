import { carregarRetrato } from "@/app/carregar-retrato";
import { TelaRepetidos } from "@/components/tela-repetidos";
import { autoridadesRepetidas } from "@/lib/repetidos";

// Lê a cada abertura: o retrato muda fora do ciclo de build.
export const dynamic = "force-dynamic";

export default async function Repetidos() {
  const carga = await carregarRetrato("/repetidos");
  if ("aviso" in carga) return carga.aviso;
  const { grupos, eleicao, geradoEm } = carga.retrato;
  return <TelaRepetidos repetidas={autoridadesRepetidas(grupos, eleicao, carga.decisoes)} geradoEm={geradoEm} aviso={carga.avisoDecisoes} modo={carga.modo} />;
}
