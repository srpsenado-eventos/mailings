import { describe, expect, test } from "vitest";
import {
  ehGrupoDeTeste,
  gruposNaoCadastrados,
  gruposVaziosVisiveis,
  rotulosDeTesteForaDoAgrupador,
  retratoSemGruposDeTeste,
  TEXTO_GRUPO_NAO_CADASTRADO,
} from "@/lib/painel-grupos-vazios";
import type { LinhaAgrupador } from "@/lib/agrupador";
import type { ResultadoContato, ResultadoGrupo, ResumoAnalise, Semaforo } from "@/lib/types";

function contato(nome: string, semaforo: Semaforo): ResultadoContato {
  return {
    contato: { nome, grupo: "G", cargo: "", tratamento: "", enderecamento: "" },
    semaforo, score: 0, comparacoes: [], camposDivergentes: [], origem: "oficial",
  };
}
const grupo = (rotulo: string, contatos: ResultadoContato[]): ResultadoGrupo => ({ grupo: rotulo, semFonte: false, contatos, novos: [] });
const resumo = (over: Partial<ResumoAnalise>): ResumoAnalise => ({
  total: 0, verde: 0, amarelo: 0, vermelho: 0, novo: 0, indeterminado: 0, enderecosAConfirmar: 0,
  possivelSaida: 0, contatosSemFonte: 0, gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0,
  gruposReaproveitados: 0, urlsCaidasRepetidas: 0, gruposComMudanca: 0, ...over,
} as ResumoAnalise);

const COMBINADO = "Ministros do STF;Ministros do TSE;Embaixadores";

describe("ehGrupoDeTeste", () => {
  test("rótulo com vários grupos do agrupador e só contato Teste é grupo de teste", () => {
    expect(ehGrupoDeTeste(grupo(COMBINADO, [contato("teste novos grupos", "indeterminado")]))).toBe(true);
  });
  test("rótulo de um grupo só não é de teste", () => {
    expect(ehGrupoDeTeste(grupo("Ministros do STF", [contato("Teste", "verde")]))).toBe(false);
  });
  test("segmento fora do agrupador não impede o grupo de ser de teste", () => {
    expect(ehGrupoDeTeste(grupo("Ministros do STF;EMCFA indicados - Posse Presidencial 2027", [contato("Teste", "verde")]))).toBe(true);
  });
  test("pessoa real em rótulo combinado continua fora da regra", () => {
    expect(ehGrupoDeTeste(grupo("Presidente do Senado Federal; Senadores", [contato("Davi Alcolumbre", "verde")]))).toBe(false);
  });
  test("contato real no rótulo combinado desqualifica", () => {
    expect(ehGrupoDeTeste(grupo(COMBINADO, [contato("Teste A", "verde"), contato("Maria", "verde")]))).toBe(false);
  });
  test("grupo sem contatos não é de teste", () => {
    expect(ehGrupoDeTeste(grupo(COMBINADO, []))).toBe(false);
  });
});

describe("rotulosDeTesteForaDoAgrupador", () => {
  test("lista os segmentos aparados que o agrupador não reconhece, sem repetir", () => {
    const grupos = [
      grupo("Ministros do STF; EMCFA indicados - Posse Presidencial 2027 ;Outro fora", [contato("Teste a", "verde")]),
      grupo("Embaixadores;Outro fora", [contato("Teste b", "verde")]),
      grupo("Ministros do STF;Fora de teste real", [contato("Maria", "verde")]),
    ];
    expect(rotulosDeTesteForaDoAgrupador(grupos)).toEqual(["EMCFA indicados - Posse Presidencial 2027", "Outro fora"]);
  });
  test("o rótulo do singular dos deputados é apelido e não vira linha avulsa (spec 2026-11-05 §9.2)", () => {
    const grupos = [grupo("Deputado Federal - Posse Presidencial 2027; EMCFA indicados - Posse Presidencial 2027", [contato("Teste a", "verde")])];
    expect(rotulosDeTesteForaDoAgrupador(grupos)).toEqual(["EMCFA indicados - Posse Presidencial 2027"]);
  });
});

describe("retratoSemGruposDeTeste", () => {
  test("tira o grupo e desconta total e semáforo do resumo, sem mutar", () => {
    const r = {
      grupos: [grupo("Embaixadores", [contato("Ana", "verde")]), grupo(COMBINADO, [contato("Teste x", "indeterminado"), contato("TESTE y", "amarelo")])],
      resumo: resumo({ total: 3, verde: 1, indeterminado: 1, amarelo: 1 }),
    };
    const copia = structuredClone(r);
    const out = retratoSemGruposDeTeste(r);
    expect(out.grupos.map((g) => g.grupo)).toEqual(["Embaixadores"]);
    expect(out.resumo).toMatchObject({ total: 1, verde: 1, indeterminado: 0, amarelo: 0 });
    expect(r).toEqual(copia);
  });
  test("desconta vermelho do resumo", () => {
    const r = { grupos: [grupo(COMBINADO, [contato("Teste", "vermelho")])], resumo: resumo({ total: 1, vermelho: 1 }) };
    expect(retratoSemGruposDeTeste(r).resumo).toMatchObject({ total: 0, vermelho: 0 });
  });
  test("sem grupo de teste devolve a mesma referência", () => {
    const r = { grupos: [grupo("Embaixadores", [contato("Ana", "verde")])], resumo: resumo({ total: 1, verde: 1 }) };
    expect(retratoSemGruposDeTeste(r)).toBe(r);
  });
});

const linha = (rotulo: string, noContatos: number, extra: Partial<LinhaAgrupador> = {}): LinhaAgrupador => ({ rotulo, fiscalizacao: "fonte", noContatos, ...extra });

describe("gruposNaoCadastrados", () => {
  const linhas = [linha("A", 3), linha("B", 0), linha("C", 0), linha("Fora", 0, { foraDoAgrupador: true }), linha("Deputados Federais", 0)];
  test("lista só os vazios do agrupador, em ordem, com o texto padrão", () => {
    expect(gruposNaoCadastrados(linhas, {}, false)).toEqual([
      { rotulo: "B", texto: TEXTO_GRUPO_NAO_CADASTRADO },
      { rotulo: "C", texto: TEXTO_GRUPO_NAO_CADASTRADO },
      { rotulo: "Deputados Federais", texto: TEXTO_GRUPO_NAO_CADASTRADO },
    ]);
  });
  test("usa o motivo quando há, vários separados por ponto médio, e tira Deputados Federais com o grupo virtual", () => {
    const out = gruposNaoCadastrados(linhas, { B: ["m1", "m2"], C: [] }, true);
    expect(out).toEqual([
      { rotulo: "B", texto: "m1 · m2" },
      { rotulo: "C", texto: TEXTO_GRUPO_NAO_CADASTRADO },
    ]);
  });
  test("rótulos extras entram depois das linhas do agrupador, com o texto padrão", () => {
    const out = gruposNaoCadastrados(linhas, {}, true, ["Extra"]);
    expect(out.map((g) => g.rotulo)).toEqual(["B", "C", "Extra"]);
    expect(out[2].texto).toBe(TEXTO_GRUPO_NAO_CADASTRADO);
  });
  test("texto padrão", () => {
    expect(TEXTO_GRUPO_NAO_CADASTRADO).toBe("Grupo ainda não cadastrado no Contatos");
  });
});

describe("gruposVaziosVisiveis", () => {
  const lista = [{ rotulo: "B", texto: "x" }, { rotulo: "C", texto: "y" }];
  test("tudo sem busca e sem grupo mostra todos", () => {
    expect(gruposVaziosVisiveis(lista, { filtro: "tudo", busca: "", grupo: "" })).toEqual(lista);
  });
  test("busca só com espaços conta como vazia", () => {
    expect(gruposVaziosVisiveis(lista, { filtro: "tudo", busca: "  ", grupo: "" })).toEqual(lista);
  });
  test("outro filtro ou busca esconde todos", () => {
    expect(gruposVaziosVisiveis(lista, { filtro: "divergencia", busca: "", grupo: "" })).toEqual([]);
    expect(gruposVaziosVisiveis(lista, { filtro: "tudo", busca: "ana", grupo: "" })).toEqual([]);
  });
  test("grupo escolhido mostra só a linha dele, mesmo com outro filtro", () => {
    expect(gruposVaziosVisiveis(lista, { filtro: "saida", busca: "", grupo: "C" })).toEqual([lista[1]]);
  });
  test("grupo escolhido que tem contatos não gera linha", () => {
    expect(gruposVaziosVisiveis(lista, { filtro: "tudo", busca: "", grupo: "A" })).toEqual([]);
  });
});
