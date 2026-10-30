import { describe, expect, test } from "vitest";
import {
  avisoDaEleicao,
  destacaLinha,
  detalheDaEleicao,
  ehFiltroEleicao,
  detalheDoGoverno,
  etiquetasDeEleicao,
  etiquetasDeGoverno,
  FILTROS_ELEICAO,
  passaFiltroEleicao,
  secoesDeEleicao,
  secoesDeGoverno,
} from "@/lib/painel-eleicao";
import type { EleicaoContato, EleicaoGovernoContato, EleitoClassificado, GovernadorClassificado, ResultadoContato, ResultadoEleicao, UfSegundoTurno } from "@/lib/types";

const ec = (over: Partial<EleicaoContato> = {}): EleicaoContato => ({
  casa: "senado", destino: "reeleito", projecao: false, uf: "MA", situacaoTse: "Eleito",
  statusMandato: "Reeleição", nomeUrna: "Joana Fictícia", ...over,
});
const classificado = (over: Partial<EleitoClassificado> & { nome?: string; casa?: "senado" | "camara" } = {}): EleitoClassificado => ({
  eleito: { casa: over.casa ?? "senado", uf: "MA", nomeUrna: over.nome ?? "Joana Fictícia", nomeCompleto: `${over.nome ?? "Joana Fictícia"} Souza`, situacaoTse: "Eleito", statusMandato: "Mandato novo" },
  destino: "novo", projecao: false, grupoDestino: "", contatos: [], ...over,
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

  test("com o grupo virtual de deputados a seção camara_novos some; sem deputados atuais, volta", () => {
    const atual = { uf: "MA", nomeParlamentar: "Fulano Teste", nomeCivil: "Fulano de Tal Teste" };
    const comGrupo: ResultadoEleicao = { ...e, deputadosAtuais: [atual] };
    expect(secoesDeEleicao(comGrupo, "tudo", "").map((s) => s.id)).toEqual(["senado_novos", "conferir"]);
    expect(secoesDeEleicao({ ...comGrupo, camaraNoContatos: true }, "tudo", "").map((s) => s.id)).toContain("camara_novos");
    expect(secoesDeEleicao(e, "tudo", "").map((s) => s.id)).toContain("camara_novos");
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

const eg = (over: Partial<EleicaoGovernoContato> = {}): EleicaoGovernoContato => ({
  destino: "reeleito", uf: "MA", situacaoTse: "Eleito", statusMandato: "Reeleição", nomeUrna: "Gov Fictício", ...over,
});
const gov = (nome: string, over: Partial<GovernadorClassificado> & { uf?: string; partido?: string } = {}): GovernadorClassificado => ({
  eleito: { uf: over.uf ?? "MA", nomeUrna: nome, nomeCompleto: `${nome} Completo`, partido: over.partido ?? "PXX", situacaoTse: "Eleito", statusMandato: "Mandato novo" },
  destino: "novo", grupoDestino: "", contatos: [], ...over,
});
const comGov = (eleitos: GovernadorClassificado[], segundoTurno: UfSegundoTurno[] = []): ResultadoEleicao =>
  ({ ...eleicao([]), governadores: { eleitos, segundoTurno } });

describe("etiquetasDeGoverno", () => {
  test("reeleito é verde; novo é neutro; sem governo, nenhuma", () => {
    expect(etiquetasDeGoverno(eg())).toEqual([expect.objectContaining({ campo: "eleicao", texto: "Reeleito governador", tom: "ok" })]);
    expect(etiquetasDeGoverno(eg({ destino: "novo" }))[0]).toMatchObject({ texto: "Eleito governador — grupo novo", tom: "neutro" });
    expect(etiquetasDeGoverno(undefined)).toEqual([]);
  });
  test("outro cargo é atenção com a Ata 14; conferir traz o motivo", () => {
    const o = etiquetasDeGoverno(eg({ destino: "outro_cargo" }))[0];
    expect(o).toMatchObject({ texto: "Eleito governador — atenção", tom: "atencao" });
    expect(o.explicacao).toContain("Ata 14");
    expect(etiquetasDeGoverno(eg({ destino: "conferir", motivo: "Homônimo em outra UF" }))[0]).toMatchObject({ texto: "Governo: a conferir", tom: "atencao", explicacao: "Homônimo em outra UF" });
  });
});

describe("detalheDoGoverno", () => {
  test("lista cargo, UF, partido, situação, status, base e a conferir; orientação só em outro cargo", () => {
    const d = detalheDoGoverno(eg({ partido: "PXX", baseStatus: "Eleito em 2022", motivo: "Conferir" }));
    expect(d.linhas).toEqual([
      { rotulo: "Eleito para", valor: "Governo do Estado" },
      { rotulo: "UF", valor: "MA" },
      { rotulo: "Partido", valor: "PXX" },
      { rotulo: "Situação no TSE", valor: "Eleito" },
      { rotulo: "Status do mandato", valor: "Reeleição" },
      { rotulo: "Base do status", valor: "Eleito em 2022" },
      { rotulo: "A conferir", valor: "Conferir" },
    ]);
    expect(d.orientacao).toBeUndefined();
    expect(detalheDoGoverno(eg({ destino: "outro_cargo" })).orientacao).toContain("Ata 14");
  });
});

describe("destaque e filtros com governo", () => {
  test("outro cargo destaca a linha, mesmo sem eleição de Casa", () => {
    expect(destacaLinha(undefined, eg({ destino: "outro_cargo" }))).toBe(true);
    expect(destacaLinha(undefined, eg())).toBe(false);
    expect(destacaLinha(ec({ destino: "outra_casa" }), undefined)).toBe(true);
  });
  test("Reeleitos aceita governador reeleito; outra_casa aceita outro cargo", () => {
    const c: ResultadoContato = { ...linha(), eleicaoGoverno: eg() };
    expect(passaFiltroEleicao(c, "reeleitos")).toBe(true);
    expect(passaFiltroEleicao({ ...c, eleicaoGoverno: eg({ destino: "outro_cargo" }) }, "outra_casa")).toBe(true);
    expect(passaFiltroEleicao(c, "outra_casa")).toBe(false);
  });
  test("rótulo do filtro de troca de cargo", () => {
    expect(FILTROS_ELEICAO.find((f) => f.id === "outra_casa")?.rotulo).toBe("Eleitos para outro cargo");
  });
});

describe("secoesDeGoverno", () => {
  const dois: UfSegundoTurno[] = [
    { uf: "SP", candidatos: [{ nomeUrna: "Cand Um", partido: "PAA", statusMandato: "Disputa" }, { nomeUrna: "Cand Dois", statusMandato: "Disputa" }] },
    { uf: "RJ", candidatos: [{ nomeUrna: "Cand Tres", partido: "PBB", statusMandato: "Disputa" }] },
  ];
  const e = comGov([gov("Ana Gov"), gov("Bia Gov", { uf: "AC", partido: "PZZ" }), gov("Caio Gov", { jaCadastrado: true }), gov("Davi Reeleito", { destino: "reeleito" })], dois);

  test("tudo: novos a cadastrar e 2º turno, com contagem no título", () => {
    const s = secoesDeGoverno(e, "tudo", "");
    expect(s.map((x) => x.id)).toEqual(["governo_novos", "governo_segundo_turno"]);
    expect(s[0].titulo).toBe("Governadores Eleitos — a cadastrar (2)");
    expect(s[0].novos.map((g) => g.eleito.nomeUrna)).toEqual(["Ana Gov", "Bia Gov"]);
    expect(s[1].titulo).toBe("Governadores — aguarda 2º turno, 25/10 (2 UFs)");
    expect(s[1].segundoTurno).toHaveLength(2);
  });
  test("a_cadastrar só os novos; a_conferir nenhuma", () => {
    expect(secoesDeGoverno(e, "a_cadastrar", "").map((x) => x.id)).toEqual(["governo_novos"]);
    expect(secoesDeGoverno(e, "a_conferir", "")).toEqual([]);
  });
  test("seção vazia some e retrato sem governadores devolve vazio", () => {
    expect(secoesDeGoverno(comGov([gov("Ana Gov")], []), "tudo", "").map((x) => x.id)).toEqual(["governo_novos"]);
    expect(secoesDeGoverno(eleicao([]), "tudo", "")).toEqual([]);
    expect(secoesDeGoverno(undefined, "tudo", "")).toEqual([]);
  });
  test("busca por nome de urna, completo, UF ou partido; no 2º turno por UF ou candidato", () => {
    const ids = (b: string) => secoesDeGoverno(e, "tudo", b).map((x) => x.id);
    expect(secoesDeGoverno(e, "tudo", "BIA")[0].novos).toHaveLength(1);
    expect(secoesDeGoverno(e, "tudo", "ana gov completo")[0].novos).toHaveLength(1);
    expect(secoesDeGoverno(e, "tudo", "pzz")[0].novos).toHaveLength(1);
    expect(ids("ac")).toEqual(["governo_novos"]);
    expect(ids("sp")).toEqual(["governo_segundo_turno"]);
    expect(ids("cand tres")).toEqual(["governo_segundo_turno"]);
    expect(secoesDeGoverno(e, "tudo", "cand tres")[0].segundoTurno.map((u) => u.uf)).toEqual(["RJ"]);
  });
});

describe("secoesDeEleicao com governadores a conferir", () => {
  test("a_conferir inclui o governador conferir na seção de eleitos a conferir", () => {
    const e: ResultadoEleicao = { ...eleicao([classificado({ nome: "Davi Duvida", destino: "conferir", motivo: "x" })]), governadores: { eleitos: [gov("Gov Duvida", { destino: "conferir", motivo: "y" }), gov("Gov Novo")], segundoTurno: [] } };
    const [s] = secoesDeEleicao(e, "a_conferir", "");
    expect(s.titulo).toBe("Eleitos — a conferir (2)");
    expect(s.governo?.map((g) => g.eleito.nomeUrna)).toEqual(["Gov Duvida"]);
  });
  test("só governador a conferir também gera a seção; busca filtra", () => {
    const e: ResultadoEleicao = { ...eleicao([]), governadores: { eleitos: [gov("Gov Duvida", { destino: "conferir" })], segundoTurno: [] } };
    expect(secoesDeEleicao(e, "tudo", "").map((x) => x.id)).toEqual(["conferir"]);
    expect(secoesDeEleicao(e, "tudo", "zzz")).toEqual([]);
  });
  test("retrato antigo, sem governadores, não quebra", () => {
    expect(secoesDeEleicao(eleicao([classificado({ destino: "conferir" })]), "tudo", "")[0].titulo).toBe("Eleitos — a conferir (1)");
  });
});
