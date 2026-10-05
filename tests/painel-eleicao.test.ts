import { describe, expect, test } from "vitest";
import {
  avisoDaEleicao,
  destacaLinha,
  detalheDaEleicao,
  ehFiltroEleicao,
  etiquetasDeEleicao,
  passaFiltroEleicao,
  secoesDeEleicao,
} from "@/lib/painel-eleicao";
import type { EleicaoContato, EleitoClassificado, ResultadoContato, ResultadoEleicao } from "@/lib/types";

const ec = (over: Partial<EleicaoContato> = {}): EleicaoContato => ({
  casa: "senado", destino: "reeleito", projecao: false, uf: "MA", situacaoTse: "Eleito",
  statusMandato: "Reeleição", nomeUrna: "Joana Fictícia", ...over,
});
const classificado = (over: Partial<EleitoClassificado> & { nome?: string; casa?: "senado" | "camara" } = {}): EleitoClassificado => ({
  eleito: { casa: over.casa ?? "senado", uf: "MA", nomeUrna: over.nome ?? "Joana Fictícia", nomeCompleto: `${over.nome ?? "Joana Fictícia"} Souza`, situacaoTse: "Eleito", statusMandato: "Mandato novo" },
  destino: "novo", projecao: false, contatos: [], ...over,
});
const eleicao = (eleitos: EleitoClassificado[], camaraNoContatos = false): ResultadoEleicao => ({ arquivos: ["x.xlsx"], eleitos, camaraNoContatos });
const linha = (eleicaoContato?: EleicaoContato): ResultadoContato => ({
  contato: { nome: "Joana Fictícia", grupo: "Senadores" }, semaforo: "verde", score: 1, comparacoes: [], camposDivergentes: [], origem: "oficial",
  ...(eleicaoContato ? { eleicao: eleicaoContato } : {}),
});

describe("etiquetasDeEleicao", () => {
  test("reeleito é verde", () => {
    expect(etiquetasDeEleicao(ec())).toEqual([expect.objectContaining({ campo: "eleicao", texto: "Reeleito", tom: "ok" })]);
  });

  test("troca de Casa é atenção, com a orientação da Ata 14, e a linha ganha destaque", () => {
    const e = ec({ destino: "outra_casa", casa: "senado" });
    expect(etiquetasDeEleicao(e)[0]).toMatchObject({ texto: "Eleito senador — atenção", tom: "atencao" });
    expect(etiquetasDeEleicao(e)[0].explicacao).toContain("Ata 14");
    expect(etiquetasDeEleicao(ec({ destino: "outra_casa", casa: "camara" }))[0].texto).toBe("Eleito deputado — atenção");
    expect(destacaLinha(e)).toBe(true);
    expect(destacaLinha(ec())).toBe(false);
    expect(destacaLinha(undefined)).toBe(false);
  });

  test("projeção ganha etiqueta neutra própria", () => {
    expect(etiquetasDeEleicao(ec({ projecao: true })).map((x) => x.texto)).toEqual(["Reeleito", "Projeção — aguarda TSE"]);
  });

  test("sem eleição, nenhuma etiqueta", () => {
    expect(etiquetasDeEleicao(undefined)).toEqual([]);
  });
});

describe("detalheDaEleicao", () => {
  test("lista cargo, UF, partido, situação e base; orientação só na troca de Casa", () => {
    const d = detalheDaEleicao(ec({ partido: "PXX", baseStatus: "Eleita em 2018" }));
    expect(d.linhas).toEqual([
      { rotulo: "Eleito para", valor: "Senado Federal" },
      { rotulo: "UF", valor: "MA" },
      { rotulo: "Partido", valor: "PXX" },
      { rotulo: "Situação no TSE", valor: "Eleito" },
      { rotulo: "Status do mandato", valor: "Reeleição" },
      { rotulo: "Base do status", valor: "Eleita em 2018" },
    ]);
    expect(d.orientacao).toBeUndefined();
    expect(detalheDaEleicao(ec({ destino: "outra_casa", casa: "camara" })).orientacao).toContain("Ata 14");
  });
});

describe("filtros da eleição", () => {
  test("reeleitos e outra_casa filtram linhas; a_cadastrar e a_conferir não trazem linha", () => {
    expect(passaFiltroEleicao(linha(ec()), "reeleitos")).toBe(true);
    expect(passaFiltroEleicao(linha(ec()), "outra_casa")).toBe(false);
    expect(passaFiltroEleicao(linha(ec({ destino: "outra_casa" })), "outra_casa")).toBe(true);
    expect(passaFiltroEleicao(linha(), "reeleitos")).toBe(false);
    expect(passaFiltroEleicao(linha(ec()), "a_cadastrar")).toBe(false);
  });

  test("ehFiltroEleicao reconhece só os quatro", () => {
    expect(ehFiltroEleicao("a_conferir")).toBe(true);
    expect(ehFiltroEleicao("tudo")).toBe(false);
  });
});

describe("secoesDeEleicao", () => {
  const e = eleicao([
    classificado({ nome: "Ana Nova" }),
    classificado({ nome: "Bia Nova", casa: "camara" }),
    classificado({ nome: "Caio Ja Cadastrado", jaCadastrado: true }),
    classificado({ nome: "Davi Duvida", destino: "conferir", motivo: "Planilha pede verificação" }),
    classificado({ nome: "Eva Reeleita", destino: "reeleito" }),
  ]);
  const nomes = (s: ReturnType<typeof secoesDeEleicao>) => s.map((x) => [x.id, x.linhas.map((l) => l.eleito.nomeUrna)]);

  test("tudo: as duas listas a cadastrar (sem quem já está cadastrado) e a de conferir", () => {
    expect(nomes(secoesDeEleicao(e, "tudo", ""))).toEqual([
      ["senado_novos", ["Ana Nova"]],
      ["camara_novos", ["Bia Nova"]],
      ["conferir", ["Davi Duvida"]],
    ]);
    expect(secoesDeEleicao(e, "tudo", "")[0].titulo).toBe("Senadores Eleitos — a cadastrar (1)");
  });

  test("a_cadastrar e a_conferir mostram só as suas; outros filtros, nenhuma", () => {
    expect(secoesDeEleicao(e, "a_cadastrar", "").map((s) => s.id)).toEqual(["senado_novos", "camara_novos"]);
    expect(secoesDeEleicao(e, "a_conferir", "").map((s) => s.id)).toEqual(["conferir"]);
    expect(secoesDeEleicao(e, "saida", "")).toEqual([]);
  });

  test("busca por nome ignora acento e caixa; seção vazia some", () => {
    expect(nomes(secoesDeEleicao(e, "tudo", "BIA"))).toEqual([["camara_novos", ["Bia Nova"]]]);
  });

  test("retrato sem eleição não tem seção nem aviso", () => {
    expect(secoesDeEleicao(undefined, "tudo", "")).toEqual([]);
    expect(avisoDaEleicao(undefined)).toBeUndefined();
  });

  test("aviso quando há deputados e o grupo ainda não está no Contatos", () => {
    expect(avisoDaEleicao(eleicao([classificado({ casa: "camara" })]))).toBe("Deputados classificados pela planilha: o grupo Deputados Federais ainda não está no Contatos.");
    expect(avisoDaEleicao(eleicao([classificado({ casa: "camara" })], true))).toBeUndefined();
    expect(avisoDaEleicao(eleicao([classificado()]))).toBeUndefined();
  });
});
