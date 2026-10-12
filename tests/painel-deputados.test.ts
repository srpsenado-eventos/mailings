import { describe, expect, it } from "vitest";
import { etiquetasDoDeputado, grupoDeputados, resumoGrupoDeputados, temGrupoDeputados } from "@/lib/painel-deputados";
import type { DeputadoAtual, EleitoClassificado, GovernadorClassificado, ResultadoEleicao } from "@/lib/types";

const dep = (p: Partial<DeputadoAtual>): DeputadoAtual => ({ uf: "AC", nomeParlamentar: "Fulano Teste", nomeCivil: "Fulano de Tal Teste", ...p });
const novo = (nome: string, uf = "AC"): EleitoClassificado => ({
  eleito: { casa: "camara", uf, nomeUrna: nome, nomeCompleto: `${nome} Completo`, situacaoTse: "Eleito", statusMandato: "Mandato novo" },
  destino: "novo", projecao: false, contatos: [],
});
const eleicao = (p: Partial<ResultadoEleicao> = {}): ResultadoEleicao => ({
  arquivos: [], eleitos: [], camaraNoContatos: false,
  deputadosAtuais: [dep({ uf: "SP", nomeParlamentar: "Beltrano", nomeCivil: "Beltrano da Silva Teste", eleicao2026: "Reeleito deputado federal" }), dep({ eleicao2026: "Não concorreu em 2026" })],
  ...p,
});
const tudo = { busca: "", filtro: "tudo", grupo: "" };

describe("etiquetasDoDeputado", () => {
  it.each<[string | undefined, string[]]>([
    ["Reeleito deputado federal", ["Reeleito"]],
    ["Reeleito deputado federal (projeção)", ["Reeleito", "Projeção — aguarda TSE"]],
    ["Eleito senador", ["Eleito senador — atenção"]],
    ["Concorreu e não se elegeu / aguarda definição", ["Não reeleito / aguarda definição"]],
    ["Não concorreu em 2026", ["Não concorreu"]],
    ["Algo novo", ["Algo novo"]],
    [undefined, []],
    ["", []],
  ])("resumo %s vira %j", (resumo, textos) => {
    expect(etiquetasDoDeputado(resumo).map((e) => e.texto)).toEqual(textos);
  });
  it("eleito senador é atenção com a orientação da Ata 14", () => {
    const [e] = etiquetasDoDeputado("Eleito senador");
    expect(e.tom).toBe("atencao");
    expect(e.explicacao).toContain("Ata 14");
  });
});

describe("grupoDeputados", () => {
  it("sem deputados atuais não há grupo", () => {
    expect(grupoDeputados(eleicao({ deputadosAtuais: undefined }), tudo)).toBeUndefined();
    expect(grupoDeputados(undefined, tudo)).toBeUndefined();
  });
  it("com o grupo no Contatos o virtual some", () => {
    expect(temGrupoDeputados(eleicao({ camaraNoContatos: true }))).toBe(false);
    expect(grupoDeputados(eleicao({ camaraNoContatos: true }), tudo)).toBeUndefined();
  });
  it("ordena por UF e nome e leva a etiqueta", () => {
    const g = grupoDeputados(eleicao(), tudo)!;
    expect(g.atuais.map((d) => d.uf)).toEqual(["AC", "SP"]);
    expect(g.atuais[1].etiquetas.map((e) => e.texto)).toEqual(["Reeleito"]);
    expect(g.totalAtuais).toBe(2);
  });
  it("traz os eleitos de mandato novo da Câmara ainda não cadastrados", () => {
    const g = grupoDeputados(eleicao({ eleitos: [novo("Novato"), { ...novo("Já Cadastrado"), jaCadastrado: true }, { ...novo("Senador Novo"), eleito: { ...novo("x").eleito, casa: "senado" } }] }), tudo)!;
    expect(g.aCadastrar.map((x) => x.eleito.nomeUrna)).toEqual(["Novato"]);
  });
  it("busca por nome civil, UF ou partido", () => {
    const g = grupoDeputados(eleicao(), { ...tudo, busca: "fulano de tal" })!;
    expect(g.atuais).toHaveLength(1);
    expect(grupoDeputados(eleicao(), { ...tudo, busca: "ninguem assim" })).toBeUndefined();
  });
  it("seletor de outro grupo esconde; o próprio mostra", () => {
    expect(grupoDeputados(eleicao(), { ...tudo, grupo: "Senadores" })).toBeUndefined();
    expect(grupoDeputados(eleicao(), { ...tudo, grupo: "Deputados Federais" })).toBeDefined();
  });
  it("filtros de situação escondem; Reeleitos mostra só os reeleitos", () => {
    expect(grupoDeputados(eleicao(), { ...tudo, filtro: "ressalva" })).toBeUndefined();
    const g = grupoDeputados(eleicao(), { ...tudo, filtro: "reeleitos" })!;
    expect(g.atuais.map((d) => d.nome)).toEqual(["Beltrano"]);
    expect(g.aCadastrar).toEqual([]);
  });
  it("A cadastrar mostra só os eleitos novos", () => {
    const g = grupoDeputados(eleicao({ eleitos: [novo("Novato")] }), { ...tudo, filtro: "a_cadastrar" })!;
    expect(g.atuais).toEqual([]);
    expect(g.aCadastrar).toHaveLength(1);
  });
  it("resumo do cabeçalho", () => {
    const g = grupoDeputados(eleicao({ eleitos: [novo("Novato")] }), tudo)!;
    expect(resumoGrupoDeputados(g)).toBe("2 deputados em exercício · 1 eleito a cadastrar");
  });
  it("resumo com filtro ou busca mostra quantos de quantos", () => {
    const g = grupoDeputados(eleicao(), { ...tudo, busca: "Beltrano" })!;
    expect(resumoGrupoDeputados(g)).toBe("1 de 2 deputados em exercício");
  });
});

describe("explicações neutras", () => {
  it("só citam a coluna da planilha da Câmara", () => {
    for (const r of ["Concorreu e não se elegeu / aguarda definição", "Não concorreu em 2026", "Algo novo"]) {
      expect(etiquetasDoDeputado(r)[0].explicacao).toBe("Coluna Eleição 2026 da planilha da Câmara");
    }
  });
});

describe("grupo virtual com deputadosAtuais vazio", () => {
  it("não existe grupo nem opção do seletor", () => {
    expect(temGrupoDeputados(eleicao({ deputadosAtuais: [] }))).toBe(false);
    expect(grupoDeputados(eleicao({ deputadosAtuais: [] }), tudo)).toBeUndefined();
  });
});

describe("governador eleito que é deputado atual", () => {
  const governador = (deputadoAtual?: { uf: string; nomeParlamentar: string }): GovernadorClassificado => ({
    eleito: { uf: "AC", nomeUrna: "Fulano Gov", nomeCompleto: "Fulano de Tal Teste", situacaoTse: "Eleito", statusMandato: "Mandato novo" },
    destino: "outro_cargo", contatos: [], ...(deputadoAtual ? { deputadoAtual } : {}),
  });
  const comGov = (g: GovernadorClassificado) => eleicao({ governadores: { eleitos: [g], segundoTurno: [] } });

  it("a linha do deputado ganha a etiqueta de governador, além da da Câmara", () => {
    const g = grupoDeputados(comGov(governador({ uf: "AC", nomeParlamentar: "Fulano Teste" })), tudo)!;
    const fulano = g.atuais.find((d) => d.nome === "Fulano Teste")!;
    expect(fulano.etiquetas.map((e) => e.texto)).toEqual(["Não concorreu", "Eleito governador — atenção"]);
    expect(fulano.etiquetas[1].explicacao).toContain("Ata 14");
    expect(g.atuais.find((d) => d.nome === "Beltrano")!.etiquetas.map((e) => e.texto)).toEqual(["Reeleito"]);
  });
  it("não casa quando a UF é outra", () => {
    const g = grupoDeputados(comGov(governador({ uf: "SP", nomeParlamentar: "Fulano Teste" })), tudo)!;
    expect(g.atuais.find((d) => d.nome === "Fulano Teste")!.etiquetas.map((e) => e.texto)).toEqual(["Não concorreu"]);
  });
  it("o filtro outra_casa mostra o deputado eleito governador e o eleito senador", () => {
    const e = eleicao({
      deputadosAtuais: [dep({ eleicao2026: "Eleito senador", nomeParlamentar: "Senadorável" }), dep({ nomeParlamentar: "Fulano Teste" }), dep({ nomeParlamentar: "Outro" })],
      governadores: { eleitos: [governador({ uf: "AC", nomeParlamentar: "Fulano Teste" })], segundoTurno: [] },
    });
    const g = grupoDeputados(e, { ...tudo, filtro: "outra_casa" })!;
    expect(g.atuais.map((d) => d.nome).sort()).toEqual(["Fulano Teste", "Senadorável"]);
  });
  it("retrato sem governadores não quebra", () => {
    expect(grupoDeputados(eleicao({ governadores: undefined }), tudo)!.atuais).toHaveLength(2);
  });
});
