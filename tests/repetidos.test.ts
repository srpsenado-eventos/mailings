import { describe, expect, test } from "vitest";
import {
  autoridadesRepetidas, escolherGrupo, etiquetaDeRepeticao, filtrarRepetidas, MOTIVO_PARCIAL, MOTIVO_SEM_NIVEL,
  textoRepetidas, type OcorrenciaRepetida,
} from "@/lib/repetidos";
import { situacaoDoContato } from "@/lib/painel";
import type { ResultadoContato, ResultadoGrupo } from "@/lib/types";

const linha = (nome: string, cargo: string, extra: Partial<ResultadoContato> = {}): ResultadoContato => ({
  contato: { nome, cargo, grupo: "x" }, semaforo: "verde", score: 1, comparacoes: [], camposDivergentes: [], origem: "oficial", ...extra,
});
const grupo = (nome: string, contatos: ResultadoContato[]): ResultadoGrupo => ({ grupo: nome, semFonte: false, contatos, novos: [] });

const stf = (nome = "Ana Fictícia", cargo = "Ministra do Supremo Tribunal Federal", extra: Partial<ResultadoContato> = {}) =>
  grupo("Ministros do STF", [linha(nome, cargo, extra)]);
const tse = (nome = "Ana Fictícia", cargo = "Ministra do Tribunal Superior Eleitoral") => grupo("Ministros do TSE", [linha(nome, cargo)]);

describe("autoridadesRepetidas", () => {
  test("ministra do STF no TSE fica no STF", () => {
    const [a, ...resto] = autoridadesRepetidas([stf(), tse()]);
    expect(resto).toEqual([]);
    expect(a.situacao).toBe("decidido");
    expect(a.convidaPor?.grupoRegra).toBe("Ministros do STF");
    expect(a.motivo).toBe("Ministros do STF (4.9) antes de Ministros do TSE (5.9)");
    expect(a.ocorrencias.map((o) => o.grupo)).toEqual(["Ministros do STF", "Ministros do TSE"]);
  });

  test("ministra do STF que preside o TSE fica no TSE", () => {
    const [a] = autoridadesRepetidas([stf(), tse("Ana Fictícia", "Presidente do Tribunal Superior Eleitoral")]);
    expect(a.convidaPor?.grupoRegra).toBe("Ministros do TSE");
    expect(a.motivo).toBe("Ministros do TSE (4.8) antes de Ministros do STF (4.9)");
  });

  test("cargo atual vence cargo de ex-", () => {
    const [a] = autoridadesRepetidas([
      grupo("Ex-Presidentes do Senado", [linha("Rui Fictício", "Ex-Presidente do Senado Federal")]),
      grupo("Senadores", [linha("Rui Fictício", "Senador")]),
    ]);
    expect(a.convidaPor?.grupoRegra).toBe("Senadores");
    expect(a.motivo).toBe("Cargo atual (Senadores) vence cargo de ex- (Ex-Presidentes do Senado)");
  });

  test("entre dois cargos de ex-, vale a Nominata", () => {
    const [a] = autoridadesRepetidas([
      grupo("Ex-Presidentes do Senado", [linha("Rui Fictício", "Ex-Presidente do Senado Federal")]),
      grupo("Ex-Presidentes da República", [linha("Rui Fictício", "Ex-Presidente da República")]),
    ]);
    expect(a.convidaPor?.grupoRegra).toBe("Ex-Presidentes da República");
    expect(a.motivo).toBe("Ex-Presidentes da República (3.4) antes de Ex-Presidentes do Senado (3.5)");
  });

  test("cargo fora da Nominata perde para cargo que está nela", () => {
    const [a] = autoridadesRepetidas([
      grupo("Conselho Nacional de Justiça (CNJ)", [linha("Ana Fictícia", "Conselheira")]),
      stf(),
    ]);
    expect(a.convidaPor?.grupoRegra).toBe("Ministros do STF");
    expect(a.motivo).toBe("Ministros do STF (4.9) antes de Conselho Nacional de Justiça (CNJ) (fora da Nominata)");
  });

  test("nenhum cargo na Nominata vai para conferir", () => {
    const [a] = autoridadesRepetidas([
      grupo("Conselho Nacional de Justiça (CNJ)", [linha("Ana Fictícia", "Conselheira")]),
      grupo("Conselho Nacional do Ministério Público (CNMP)", [linha("Ana Fictícia", "Conselheira")]),
    ]);
    expect(a.situacao).toBe("conferir");
    expect(a.convidaPor).toBeUndefined();
    expect(a.motivo).toBe(MOTIVO_SEM_NIVEL);
  });

  test("nome parcial em grupos diferentes vai para conferir", () => {
    const [a] = autoridadesRepetidas([stf("Carmem Fictícia"), tse("Carmem Fictícia Antunes Rocha")]);
    expect(a.situacao).toBe("conferir");
    expect(a.motivo).toBe(MOTIVO_PARCIAL);
    expect(a.ocorrencias).toHaveLength(2);
  });

  test("nome parcial dentro do mesmo grupo não é caso", () => {
    expect(autoridadesRepetidas([grupo("Senadores", [linha("José Fictício", "Senador"), linha("José Fictício Lima", "Senador")])])).toEqual([]);
  });

  test("possível saída no grupo vencedor vai para conferir", () => {
    const [a] = autoridadesRepetidas([stf("Ana Fictícia", "Ministra do Supremo Tribunal Federal", { possivelSaida: true }), tse()]);
    expect(a.situacao).toBe("conferir");
    expect(a.motivo).toBe("Possível saída em Ministros do STF: confirmar o cargo antes de decidir");
  });

  test("a mesma pessoa em três rótulos de ex- e Senadores é decidida por Senadores", () => {
    const [a] = autoridadesRepetidas([
      grupo("Senadores", [linha("Rui Fictício", "Senador")]),
      grupo("Senadores (Acre a Goiás)", [linha("Rui Fictício", "Senador")]),
      grupo("Ex-Presidentes do Senado", [linha("Rui Fictício", "Ex-Presidente do Senado Federal")]),
    ]);
    expect(a.situacao).toBe("decidido");
    expect(a.convidaPor?.grupoRegra).toBe("Senadores");
    expect(a.motivo).toBe("Cargo atual (Senadores) vence cargo de ex- (Ex-Presidentes do Senado)");
    expect(a.ocorrencias).toHaveLength(3);
  });

  test("possível saída no único cargo atual vai para conferir", () => {
    const [a] = autoridadesRepetidas([
      grupo("Senadores", [linha("Rui Fictício", "Senador", { possivelSaida: true })]),
      grupo("Ex-Presidentes do Senado", [linha("Rui Fictício", "Ex-Presidente do Senado Federal")]),
    ]);
    expect(a.situacao).toBe("conferir");
    expect(a.motivo).toBe("Possível saída em Senadores: confirmar o cargo antes de decidir");
  });

  test("célula com dois grupos conta como duas ocorrências", () => {
    const [a] = autoridadesRepetidas([grupo("Presidente do Senado Federal; Senadores", [linha("Davi Fictício", "Presidente do Senado Federal")])]);
    expect(a.ocorrencias.map((o) => o.grupoRegra)).toEqual(["Presidente do Senado", "Senadores"]);
    expect(a.convidaPor?.grupoRegra).toBe("Presidente do Senado");
  });

  test("grupos de eleitos e o piloto ficam fora", () => {
    expect(autoridadesRepetidas([
      grupo("Senadores", [linha("Rui Fictício", "Senador")]),
      grupo("Senadores Eleitos", [linha("Rui Fictício", "Senador eleito")]),
      grupo("Grupo Eventos - PP 2027 - PILOTO", [linha("Rui Fictício", "Senador")]),
    ])).toEqual([]);
  });

  test("os três grupos de Senadores são o mesmo grupo", () => {
    expect(autoridadesRepetidas([
      grupo("Senadores (Acre a Goiás)", [linha("Rui Fictício", "Senador")]),
      grupo("Senadores", [linha("Rui Fictício", "Senador")]),
    ])).toEqual([]);
  });

  test("contato sem nome é ignorado", () => {
    expect(autoridadesRepetidas([stf(""), tse("")])).toEqual([]);
  });

  test("conferir vem antes de decidido", () => {
    const lista = autoridadesRepetidas([
      grupo("Ministros do STF", [linha("Ana Fictícia", "Ministra"), linha("Bia Fictícia", "Ministra", { possivelSaida: true })]),
      grupo("Ministros do TSE", [linha("Ana Fictícia", "Ministra"), linha("Bia Fictícia", "Ministra")]),
    ]);
    expect(lista.map((a) => a.situacao)).toEqual(["conferir", "decidido"]);
  });
});

describe("escolherGrupo", () => {
  const oc = (grupoRegra: string, nivel?: string): OcorrenciaRepetida => ({
    grupo: grupoRegra, grupoRegra, chave: "ana", cargo: "x", ex: false, possivelSaida: false,
    ...(nivel ? { nivel: { nivel, nominata: "x" } } : {}),
  });

  test("mesmo nível em grupos diferentes vai para conferir", () => {
    const e = escolherGrupo([oc("A", "4.13"), oc("B", "4.13")], false);
    expect(e).toEqual({ situacao: "conferir", motivo: "Mesmo nível na Nominata (4.13): decidir à mão" });
  });
});

describe("etiquetaDeRepeticao", () => {
  const repetidas = autoridadesRepetidas([stf(), tse()]);
  const ana = linha("Ana Fictícia", "Ministra");

  test("grupo que não convida leva a etiqueta vermelha", () => {
    expect(etiquetaDeRepeticao(repetidas, ana, "Ministros do TSE")).toEqual({
      campo: "grupo", tom: "ruim", texto: "Autoridade a ser convidada pelo grupo Ministros do STF",
      explicacao: "Ministros do STF (4.9) antes de Ministros do TSE (5.9)",
    });
  });

  test("grupo que convida leva a etiqueta neutra", () => {
    expect(etiquetaDeRepeticao(repetidas, ana, "Ministros do STF")).toEqual({
      campo: "grupo", tom: "neutro", texto: "Convidada por este grupo; também em Ministros do TSE",
      explicacao: "Ministros do STF (4.9) antes de Ministros do TSE (5.9)",
    });
  });

  test("caso a conferir leva etiqueta de atenção", () => {
    const conferir = autoridadesRepetidas([stf("Carmem Fictícia"), tse("Carmem Fictícia Antunes Rocha")]);
    expect(etiquetaDeRepeticao(conferir, linha("Carmem Fictícia", "Ministra"), "Ministros do STF")).toEqual({
      campo: "grupo", tom: "atencao", texto: "Em mais de um grupo: conferir", explicacao: MOTIVO_PARCIAL,
    });
  });

  test("a etiqueta de repetição não entra na situação do contato", () => {
    const g = grupo("Ministros do TSE", [ana]);
    const igual = grupo("Outro grupo", [linha("Ana Fictícia", "Ministra")]);
    expect(etiquetaDeRepeticao(repetidas, ana, "Ministros do TSE")?.tom).toBe("ruim");
    expect(situacaoDoContato(ana, g)).toEqual(situacaoDoContato(linha("Ana Fictícia", "Ministra"), igual));
  });

  test("contato que não se repete fica sem etiqueta", () => {
    expect(etiquetaDeRepeticao(repetidas, linha("Outra Pessoa", "Ministra"), "Ministros do STF")).toBeUndefined();
  });
});

describe("filtro e texto", () => {
  const lista = autoridadesRepetidas([
    grupo("Ministros do STF", [linha("Ana Fictícia", "Ministra"), linha("Bia Fictícia", "Ministra", { possivelSaida: true })]),
    grupo("Ministros do TSE", [linha("Ana Fictícia", "Ministra"), linha("Bia Fictícia", "Ministra")]),
  ]);

  test("filtra por situação e por nome sem acento", () => {
    expect(filtrarRepetidas(lista, "", "conferir").map((a) => a.nome)).toEqual(["Bia Fictícia"]);
    expect(filtrarRepetidas(lista, "ficticia", "decidido").map((a) => a.nome)).toEqual(["Ana Fictícia"]);
    expect(filtrarRepetidas(lista, "ANA", "todas")).toHaveLength(1);
  });

  test("texto do link", () => {
    expect(textoRepetidas(1)).toBe("1 autoridade em mais de um grupo");
    expect(textoRepetidas(10)).toBe("10 autoridades em mais de um grupo");
  });
});
