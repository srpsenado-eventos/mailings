import * as XLSX from "xlsx";
import type { ResultadoAnalise, ResultadoContato } from "@/lib/types";

/** Campos mostrados em pares de colunas planilha×site. */
const CAMPOS = [
  { campo: "nome", rotulo: "Nome" },
  { campo: "cargo", rotulo: "Cargo" },
  { campo: "endereco", rotulo: "Endereço" },
];

/** Valor do site para um campo: valor correto (com origem), "fonte não informa", ou vazio. */
function valorSiteDe(c: ResultadoContato, campo: string): string {
  const comp = c.comparacoes.find((x) => x.campo === campo);
  if (!comp) return "";
  if (comp.situacao === "fonte_nao_informa") return "fonte não informa";
  const v = comp.valorSite ?? "";
  return v && comp.origemValor === "conhecimento" ? `${v} (via IA — confira)` : v;
}

function valorPlanilhaDe(c: ResultadoContato, campo: string): string {
  if (campo === "nome") return c.contato.nome;
  return c.comparacoes.find((x) => x.campo === campo)?.valorPlanilha ?? "";
}

export function resultadoParaLinhas(analise: ResultadoAnalise): Record<string, string>[] {
  const linhas: Record<string, string>[] = [];
  for (const g of analise.grupos) {
    for (const c of g.contatos) {
      const linha: Record<string, string> = {
        Grupo: g.grupo,
        Status: c.possivelSaida ? "possível saída" : c.semaforo,
        Divergencias: c.camposDivergentes.map((d) => d.campo).join(", "),
        Origem: c.origem,
        Fonte: c.fonteUrl ?? "",
        Observacao: c.observacao ?? "",
      };
      for (const f of CAMPOS) {
        linha[`${f.rotulo} (planilha)`] = valorPlanilhaDe(c, f.campo);
        linha[`${f.rotulo} (site)`] = valorSiteDe(c, f.campo);
      }
      linhas.push(linha);
    }
    for (const novo of g.novos) {
      const siteNome = novo.origem === "conhecimento" ? `${novo.nome} (via IA)` : novo.nome;
      const siteCargo = novo.cargo
        ? novo.origem === "conhecimento"
          ? `${novo.cargo} (via IA)`
          : novo.cargo
        : "";
      const linha: Record<string, string> = {
        Grupo: g.grupo,
        Status: "novo",
        Divergencias: "",
        Origem: novo.origem === "conhecimento" ? "pesquisa_ampla" : "oficial",
        Fonte: g.fonteUrl ?? "",
        Observacao: "Pessoa na fonte sem correspondência na planilha",
        "Nome (planilha)": "",
        "Nome (site)": siteNome,
        "Cargo (planilha)": "",
        "Cargo (site)": siteCargo,
        "Endereço (planilha)": "",
        "Endereço (site)": novo.endereco ?? "",
      };
      linhas.push(linha);
    }
  }
  return linhas;
}

export function gerarXlsx(analise: ResultadoAnalise): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(resultadoParaLinhas(analise));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resultado");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function gerarCsv(analise: ResultadoAnalise): string {
  const ws = XLSX.utils.json_to_sheet(resultadoParaLinhas(analise));
  return XLSX.utils.sheet_to_csv(ws);
}
