import { carregarRetrato } from "@/app/carregar-retrato";
import { TelaRepetidos } from "@/components/tela-repetidos";
import { autoridadesRepetidas } from "@/lib/repetidos";

// Lê a cada abertura: o retrato muda fora do ciclo de build.
export const dynamic = "force-dynamic";

export default async function Repetidos() {
  const carga = await carregarRetrato("/repetidos");
  if ("aviso" in carga) return carga.aviso;
  return <TelaRepetidos repetidas={autoridadesRepetidas(carga.retrato.grupos)} geradoEm={carga.retrato.geradoEm} />;
}
