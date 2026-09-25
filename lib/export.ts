import * as XLSX from "xlsx";
import { coerenciasVisiveis, textoCoerencia, ROTULOS_CAMPO_TRATAMENTO } from "@/lib/tratamento";
import type { ComparacaoCampo, ResultadoAnalise, ResultadoContato } from "@/lib/types";

/**
 * Campos mostrados em pares de colunas planilha × referência. O sufixo é fixo por campo:
 * nome, cargo e endereço se conferem contra o site; tratamento e endereçamento, contra a
 * tabela de protocolo. Fixo também garante o mesmo cabeçalho em todas as linhas do arquivo.
 * Os rótulos de tratamento e endereçamento vêm de `lib/tratamento.ts`, que também os usa
 * para nomear o campo no texto de um achado de coerência — um só lugar para os dois nomes.
 */
const CAMPOS = [
  { campo: "nome", rotulo: "Nome", referencia: "site" },
  { campo: "cargo", rotulo: "Cargo", referencia: "site" },
  { campo: "endereco", rotulo: "Endereço", referencia: "site" },
  { campo: "tratamento", rotulo: ROTULOS_CAMPO_TRATAMENTO.tratamento, referencia: "protocolo" },
  { campo: "enderecamento", rotulo: ROTULOS_CAMPO_TRATAMENTO.enderecamento, referencia: "protocolo" },
];

/**
 * Comparação de valor de um campo. A linha de coerência é diagnóstico, não comparação:
 * não tem `valorEsperado` e, se ocupasse o par de colunas, esconderia o valor do protocolo.
 * Ela sai na coluna `Coerência`.
 */
function comparacaoDe(c: ResultadoContato, campo: string): ComparacaoCampo | undefined {
  return c.comparacoes.find((x) => x.campo === campo && x.origemValor !== "coerencia");
}

/** Valor esperado de um campo: valor correto (com origem), aviso, ou vazio. */
function valorEsperadoDe(c: ResultadoContato, campo: string): string {
  const comp = comparacaoDe(c, campo);
  if (!comp) return "";
  if (comp.situacao === "fonte_nao_informa") return "fonte não informa";
  if (comp.situacao === "sem_regra") return "sem regra de protocolo";
  const v = comp.valorEsperado ?? "";
  return v && comp.origemValor === "conhecimento" ? `${v} (via IA — confira)` : v;
}

function valorPlanilhaDe(c: ResultadoContato, campo: string): string {
  if (campo === "nome") return c.contato.nome;
  return comparacaoDe(c, campo)?.valorPlanilha ?? "";
}

export function resultadoParaLinhas(analise: ResultadoAnalise): Record<string, string>[] {
  const linhas: Record<string, string>[] = [];
  for (const g of analise.grupos) {
    for (const c of g.contatos) {
      const linha: Record<string, string> = {
        Grupo: g.grupo,
        Status: c.possivelSaida ? "possível saída" : c.semaforo,
        Divergencias: [...new Set(c.camposDivergentes.map((d) => d.campo))].join(", "),
        Origem: c.origem,
        Fonte: c.fonteUrl ?? "",
        Observacao: c.observacao ?? "",
      };
      for (const f of CAMPOS) {
        linha[`${f.rotulo} (planilha)`] = valorPlanilhaDe(c, f.campo);
        linha[`${f.rotulo} (${f.referencia})`] = valorEsperadoDe(c, f.campo);
      }
      linha["Coerência"] = coerenciasVisiveis(c.comparacoes).map(textoCoerencia).join("; ");
      linhas.push(linha);
    }
    for (const novo of g.novos) {
      const siteNome = novo.origem === "conhecimento" ? `${novo.nome} (via IA)` : novo.nome;
      const siteCargo = novo.cargo
        ? novo.origem === "conhecimento"
          ? `${novo.cargo} (via IA)`
          : novo.cargo
        : "";
      const siteDe: Record<string, string> = {
        nome: siteNome,
        cargo: siteCargo,
        endereco: novo.endereco ?? "",
      };
      const situacao = novo.rotuloFonte
        ? ` — ${[novo.rotuloFonte, novo.contexto].filter(Boolean).join(": ")}`
        : "";
      const linha: Record<string, string> = {
        Grupo: g.grupo,
        Status: "novo",
        Divergencias: "",
        Origem: novo.origem === "conhecimento" ? "pesquisa_ampla" : "oficial",
        Fonte: novo.fonteUrl ?? g.fonteUrl ?? "",
        Observacao: `Pessoa na fonte sem correspondência na planilha${situacao}`,
      };
      for (const f of CAMPOS) {
        linha[`${f.rotulo} (planilha)`] = "";
        linha[`${f.rotulo} (${f.referencia})`] = siteDe[f.campo] ?? "";
      }
      linha["Coerência"] = "";
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
