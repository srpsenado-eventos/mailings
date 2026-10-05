import { normalizarTexto } from "@/lib/normalize";

/** Nome por extenso em maiúsculas, como o Contatos grava no `Departamento` dos senadores. */
export const UF_POR_EXTENSO: Readonly<Record<string, string>> = {
  AC: "ACRE", AL: "ALAGOAS", AP: "AMAPÁ", AM: "AMAZONAS", BA: "BAHIA", CE: "CEARÁ",
  DF: "DISTRITO FEDERAL", ES: "ESPÍRITO SANTO", GO: "GOIÁS", MA: "MARANHÃO", MT: "MATO GROSSO",
  MS: "MATO GROSSO DO SUL", MG: "MINAS GERAIS", PA: "PARÁ", PB: "PARAÍBA", PR: "PARANÁ",
  PE: "PERNAMBUCO", PI: "PIAUÍ", RJ: "RIO DE JANEIRO", RN: "RIO GRANDE DO NORTE",
  RS: "RIO GRANDE DO SUL", RO: "RONDÔNIA", RR: "RORAIMA", SC: "SANTA CATARINA", SP: "SÃO PAULO",
  SE: "SERGIPE", TO: "TOCANTINS",
};

const SIGLA_POR_NOME = new Map(Object.entries(UF_POR_EXTENSO).map(([sigla, nome]) => [normalizarTexto(nome), sigla]));

/** Sigla da UF a partir do nome por extenso ou da própria sigla; `undefined` quando não é UF. */
export function siglaDaUf(texto: string | undefined): string | undefined {
  const t = (texto ?? "").trim();
  if (!t) return undefined;
  const sigla = t.toUpperCase();
  if (sigla in UF_POR_EXTENSO) return sigla;
  return SIGLA_POR_NOME.get(normalizarTexto(t));
}
