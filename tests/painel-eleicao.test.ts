import { describe, expect, test } from "vitest";
import {
  avisoDaEleicao,
  destacaLinha,
  detalheDaEleicao,
  ehFiltroEleicao,
  detalheDoGoverno,
  esperadosDoAgrupador,
  etiquetasDeEleicao,
  etiquetasDeGoverno,
  FILTROS_ELEICAO,
  passaFiltroEleicao,
  secoesDeEleicao,
  secoesDeGoverno,
  type SecaoGrupoEleito,
} from "@/lib/painel-eleicao";
import { GRUPO_DEPUTADOS_ELEITOS, GRUPO_DEPUTADOS_FEDERAIS, GRUPO_GOVERNADORES_ELEITOS, GRUPO_SENADORES_ELEITOS } from "@/data/grupos-posse";
import type { EleicaoContato, EleicaoGovernoContato, EleitoClassificado, GovernadorClassificado, ResultadoContato, ResultadoEleicao, ResultadoGrupo, UfSegundoTurno } from "@/lib/types";

const ec = (over: Partial<EleicaoContato> = {}): EleicaoContato => ({
  casa: "senado", destino: "reeleito", projecao: false, uf: "MA", situacaoTse: "Eleito",
  statusMandato: "Reeleição", nomeUrna: "Joana Fictícia", ...over,
});
const classificado = (over: Partial<EleitoClassificado> & { nome?: string; casa?: "senado" | "camara" } = {}): EleitoClassificado => ({
  eleito: { casa: over.casa ?? "senado", uf: "MA", nomeUrna: over.nome ?? "Joana Fictícia", nomeCompleto: `${over.nome ?? "Joana Fictícia"} Souza`, situacaoTse: "Eleito", statusMandato: "Mandato novo" },
  destino: "novo", projecao: false, contatos: [], ...over,
});
const eleicao = (eleitos: EleitoClassificado[], camaraNoContatos = false): ResultadoEleicao => ({ arquivos: ["x.xlsx"], eleitos, camaraNoContatos });
/** Grupo do retrato com `n` contatos (só a contagem importa aqui). */
const grupo = (nome: string, n: number): ResultadoGrupo => ({
  grupo: nome, semFonte: false, novos: [],
  contatos: Array.from({ length: n }, (_, i): ResultadoContato => ({
    contato: { nome: `Pessoa ${i}`, grupo: nome }, semaforo: "verde", score: 1, comparacoes: [], camposDivergentes: [], origem: "oficial",
  })),
});
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

  test("motivo de quem não está a conferir (decisão do GT) não aparece como A conferir", () => {
    const decidido = detalheDaEleicao(ec({ motivo: "Decisão do GT de 26/10" })).linhas.at(-1);
    const aConferir = detalheDaEleicao(ec({ destino: "conferir", motivo: "Homônimo" })).linhas.at(-1);
    expect(decidido).toEqual({ rotulo: "Classificação", valor: "Decisão do GT de 26/10" });
    expect(aConferir).toEqual({ rotulo: "A conferir", valor: "Homônimo" });
    expect(detalheDoGoverno(eg({ motivo: "Decisão do GT de 29/10" })).linhas.at(-1)).toEqual({ rotulo: "Classificação", valor: "Decisão do GT de 29/10" });
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

describe("secoesDeEleicao: uma seção por grupo de eleitos do Contatos", () => {
  const deltan = classificado({ nome: "Deltan Ficticio", grupoDestino: GRUPO_SENADORES_ELEITOS });
  const duvidaCamara = classificado({ nome: "Davi Duvida", casa: "camara", destino: "conferir", motivo: "Homônimo na Câmara" });
  const e = eleicao([
    deltan,
    classificado({ nome: "Bia Nova", casa: "camara", grupoDestino: GRUPO_DEPUTADOS_ELEITOS }),
    classificado({ nome: "Caio Ja Cadastrado", grupoDestino: GRUPO_SENADORES_ELEITOS, jaCadastrado: true }),
    duvidaCamara,
    classificado({ nome: "Eva Reeleita", destino: "reeleito", grupoDestino: "Senadores" }),
  ]);
  const grupos: ResultadoGrupo[] = [grupo("Senadores eleitos - Posse Presidencial 2027 ", 1), grupo("Senadores", 3)];
  const nomes = (xs: readonly { eleito: { nomeUrna: string } }[]) => xs.map((x) => x.eleito.nomeUrna);
  const secao = (s: SecaoGrupoEleito[], g: string) => s.find((x) => x.grupo === g);

  test("Deltan vai para A cadastrar dos senadores eleitos e o conferir da Câmara para A conferir dos deputados eleitos", () => {
    // Arrange / Act
    const s = secoesDeEleicao(e, grupos, "tudo", "");
    // Assert
    expect(s.map((x) => x.grupo)).toEqual([GRUPO_SENADORES_ELEITOS, GRUPO_DEPUTADOS_ELEITOS]);
    expect(nomes(secao(s, GRUPO_SENADORES_ELEITOS)!.aCadastrar)).toEqual(["Deltan Ficticio"]);
    expect(secao(s, GRUPO_SENADORES_ELEITOS)!.aConferir).toEqual([]);
    expect(nomes(secao(s, GRUPO_DEPUTADOS_ELEITOS)!.aCadastrar)).toEqual(["Bia Nova"]);
    expect(nomes(secao(s, GRUPO_DEPUTADOS_ELEITOS)!.aConferir)).toEqual(["Davi Duvida"]);
  });

  test("título com pela lista, no Contatos (rótulo casado pelo agrupador) e a cadastrar", () => {
    const s = secoesDeEleicao(e, grupos, "tudo", "");
    expect(secao(s, GRUPO_SENADORES_ELEITOS)).toMatchObject({ pelaLista: 2, noContatos: 1 });
    expect(secao(s, GRUPO_SENADORES_ELEITOS)!.titulo).toBe("Senadores eleitos - Posse Presidencial 2027 — 2 pela lista · 1 no Contatos · 1 a cadastrar");
    expect(secao(s, GRUPO_DEPUTADOS_ELEITOS)!.titulo).toBe("Deputado Federal eleitos - Posse Presidencial 2027 — 1 pela lista · 0 no Contatos · 1 a cadastrar");
  });

  test("nenhum título fala na seção antiga \"Eleitos — a conferir\"", () => {
    const todos = [...secoesDeEleicao(e, grupos, "tudo", ""), ...secoesDeEleicao(e, grupos, "a_conferir", "")];
    expect(todos.length).toBeGreaterThan(0);
    for (const s of todos) expect(s.titulo).not.toContain("Eleitos — a conferir");
  });

  test("a_cadastrar e a_conferir mostram só a subseção correspondente; outros filtros, nenhuma seção", () => {
    const cadastrar = secoesDeEleicao(e, grupos, "a_cadastrar", "");
    expect(cadastrar.map((x) => x.grupo)).toEqual([GRUPO_SENADORES_ELEITOS, GRUPO_DEPUTADOS_ELEITOS]);
    expect(cadastrar.every((x) => x.aConferir.length === 0)).toBe(true);
    const conferir = secoesDeEleicao(e, grupos, "a_conferir", "");
    expect(conferir.map((x) => x.grupo)).toEqual([GRUPO_DEPUTADOS_ELEITOS]);
    expect(conferir[0].aCadastrar).toEqual([]);
    expect(secoesDeEleicao(e, grupos, "saida", "")).toEqual([]);
    expect(secoesDeEleicao(e, grupos, "reeleitos", "")).toEqual([]);
  });

  test("busca por nome ignora acento e caixa; seção sem linha visível some", () => {
    const s = secoesDeEleicao(e, grupos, "tudo", "BIA");
    expect(s.map((x) => x.grupo)).toEqual([GRUPO_DEPUTADOS_ELEITOS]);
    expect(nomes(s[0].aCadastrar)).toEqual(["Bia Nova"]);
    expect(s[0].aConferir).toEqual([]);
  });

  test("retrato antigo, sem grupoDestino: o mandato novo cai no grupo de eleitos da sua Casa", () => {
    const antigo = eleicao([classificado({ nome: "Ana Antiga" }), classificado({ nome: "Bia Antiga", casa: "camara" }), classificado({ nome: "Eva Antiga", destino: "reeleito" })]);
    const s = secoesDeEleicao(antigo, [], "tudo", "");
    expect(s.map((x) => [x.grupo, nomes(x.aCadastrar)])).toEqual([
      [GRUPO_SENADORES_ELEITOS, ["Ana Antiga"]],
      [GRUPO_DEPUTADOS_ELEITOS, ["Bia Antiga"]],
    ]);
  });

  test("com Deputados Federais no Contatos, A cadastrar traz reeleitos e eleitos para outra Casa ainda não cadastrados", () => {
    // Arrange
    const comCamara = eleicao([
      classificado({ nome: "Rui Reeleito", casa: "camara", destino: "reeleito", grupoDestino: GRUPO_DEPUTADOS_FEDERAIS }),
      classificado({ nome: "Ivo Cadastrado", casa: "camara", destino: "reeleito", grupoDestino: GRUPO_DEPUTADOS_FEDERAIS, jaCadastrado: true }),
      classificado({ nome: "Sol Senadora", destino: "outra_casa", grupoDestino: GRUPO_DEPUTADOS_FEDERAIS }),
    ], true);
    // Act
    const s = secoesDeEleicao(comCamara, [grupo("Deputados Federais", 2)], "tudo", "");
    // Assert
    expect(s.map((x) => x.grupo)).toEqual([GRUPO_DEPUTADOS_FEDERAIS]);
    expect(nomes(s[0].aCadastrar)).toEqual(["Rui Reeleito", "Sol Senadora"]);
    expect(s[0].titulo).toBe("Deputados Federais — 3 pela lista · 2 no Contatos · 2 a cadastrar");
    expect(secoesDeEleicao({ ...comCamara, camaraNoContatos: false }, [], "tudo", "")).toEqual([]);
  });

  test("com a planilha da Câmara, Deputados Federais conta pela lista os deputados em exercício", () => {
    // Arrange
    const atuais = Array.from({ length: 513 }, (_, i) => ({ uf: "SP", nomeParlamentar: `Dep ${i}`, nomeCivil: `Deputado ${i}` }));
    const comCamara: ResultadoEleicao = {
      ...eleicao([classificado({ nome: "Rui Reeleito", casa: "camara", destino: "reeleito", grupoDestino: GRUPO_DEPUTADOS_FEDERAIS })], true),
      deputadosAtuais: atuais,
    };
    // Act
    const [s] = secoesDeEleicao(comCamara, [grupo("Deputados Federais", 500)], "tudo", "");
    // Assert
    expect(s).toMatchObject({ grupo: GRUPO_DEPUTADOS_FEDERAIS, pelaLista: 513 });
    expect(s.titulo).toBe("Deputados Federais — 513 pela lista · 500 no Contatos · 1 a cadastrar");
  });

  test("retrato sem eleição não tem seção nem aviso", () => {
    expect(secoesDeEleicao(undefined, grupos, "tudo", "")).toEqual([]);
    expect(avisoDaEleicao(undefined)).toBeUndefined();
  });

  test("aviso quando há deputados e o grupo ainda não está no Contatos", () => {
    expect(avisoDaEleicao(eleicao([classificado({ casa: "camara" })]))).toBe("Deputados classificados pela planilha: o grupo Deputados Federais ainda não está no Contatos.");
    expect(avisoDaEleicao(eleicao([classificado({ casa: "camara" })], true))).toBeUndefined();
    expect(avisoDaEleicao(eleicao([classificado()]))).toBeUndefined();
  });
});

describe("esperadosDoAgrupador", () => {
  test("conta os classificados por grupoDestino e os 513 deputados em exercício em Deputados Federais", () => {
    // Arrange
    const atuais = Array.from({ length: 513 }, (_, i) => ({ uf: "SP", nomeParlamentar: `Dep ${i}`, nomeCivil: `Deputado ${i}` }));
    const e: ResultadoEleicao = {
      ...eleicao([
        classificado({ nome: "A", grupoDestino: GRUPO_SENADORES_ELEITOS }),
        classificado({ nome: "B", grupoDestino: GRUPO_SENADORES_ELEITOS, jaCadastrado: true }),
        classificado({ nome: "C", casa: "camara", grupoDestino: GRUPO_DEPUTADOS_ELEITOS }),
        classificado({ nome: "D", casa: "camara", destino: "reeleito", grupoDestino: GRUPO_DEPUTADOS_FEDERAIS }),
        classificado({ nome: "E", destino: "conferir" }),
      ]),
      deputadosAtuais: atuais,
      governadores: { eleitos: [gov("G1", { grupoDestino: GRUPO_GOVERNADORES_ELEITOS }), gov("G2", { destino: "reeleito", grupoDestino: "Governadores" })], segundoTurno: [] },
    };
    // Act / Assert
    expect(esperadosDoAgrupador(e)).toEqual({
      [GRUPO_SENADORES_ELEITOS]: 2,
      [GRUPO_DEPUTADOS_ELEITOS]: 1,
      [GRUPO_GOVERNADORES_ELEITOS]: 1,
      [GRUPO_DEPUTADOS_FEDERAIS]: 513,
    });
  });

  test("sem eleição, nada esperado; sem a planilha de governadores ou da Câmara, a chave fica de fora", () => {
    expect(esperadosDoAgrupador(undefined)).toEqual({});
    expect(esperadosDoAgrupador(eleicao([classificado({ grupoDestino: GRUPO_SENADORES_ELEITOS })]))).toEqual({ [GRUPO_SENADORES_ELEITOS]: 1 });
  });
});
const eg = (over: Partial<EleicaoGovernoContato> = {}): EleicaoGovernoContato => ({
  destino: "reeleito", uf: "MA", situacaoTse: "Eleito", statusMandato: "Reeleição", nomeUrna: "Gov Fictício", ...over,
});
const gov = (nome: string, over: Partial<GovernadorClassificado> & { uf?: string; partido?: string } = {}): GovernadorClassificado => ({
  eleito: { uf: over.uf ?? "MA", nomeUrna: nome, nomeCompleto: `${nome} Completo`, partido: over.partido ?? "PXX", situacaoTse: "Eleito", statusMandato: "Mandato novo" },
  destino: "novo", contatos: [], ...over,
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
    const d = detalheDoGoverno(eg({ destino: "conferir", partido: "PXX", baseStatus: "Eleito em 2022", motivo: "Conferir" }));
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
  const e = comGov([gov("Ana Gov"), gov("Davi Reeleito", { destino: "reeleito" })], dois);

  test("só a seção do 2º turno; os governadores a cadastrar estão na seção do grupo de eleitos", () => {
    const s = secoesDeGoverno(e, "tudo", "");
    expect(s.map((x) => x.id)).toEqual(["governo_segundo_turno"]);
    expect(s[0].titulo).toBe("Governadores — aguarda 2º turno, 25/10 (2 UFs)");
    expect(s[0].segundoTurno).toHaveLength(2);
  });
  test("a_cadastrar e a_conferir não mostram o 2º turno", () => {
    expect(secoesDeGoverno(e, "a_cadastrar", "")).toEqual([]);
    expect(secoesDeGoverno(e, "a_conferir", "")).toEqual([]);
  });
  test("seção vazia some e retrato sem governadores devolve vazio", () => {
    expect(secoesDeGoverno(comGov([gov("Ana Gov")], []), "tudo", "")).toEqual([]);
    expect(secoesDeGoverno(eleicao([]), "tudo", "")).toEqual([]);
    expect(secoesDeGoverno(undefined, "tudo", "")).toEqual([]);
  });
  test("busca no 2º turno por UF ou candidato", () => {
    expect(secoesDeGoverno(e, "tudo", "sp")[0].segundoTurno.map((u) => u.uf)).toEqual(["SP"]);
    expect(secoesDeGoverno(e, "tudo", "cand tres")[0].segundoTurno.map((u) => u.uf)).toEqual(["RJ"]);
    expect(secoesDeGoverno(e, "tudo", "zzz")).toEqual([]);
  });
});

describe("secoesDeEleicao: governadores no grupo dos governadores eleitos", () => {
  const e: ResultadoEleicao = {
    ...eleicao([classificado({ nome: "Davi Duvida", destino: "conferir", motivo: "x" })]),
    governadores: {
      eleitos: [
        gov("Gov Novo", { grupoDestino: GRUPO_GOVERNADORES_ELEITOS }),
        gov("Gov Cadastrado", { grupoDestino: GRUPO_GOVERNADORES_ELEITOS, jaCadastrado: true }),
        gov("Gov Duvida", { destino: "conferir", motivo: "y" }),
        gov("Gov Reeleito", { destino: "reeleito", grupoDestino: "Governadores" }),
      ],
      segundoTurno: [],
    },
  };
  const govSecao = (s: SecaoGrupoEleito[]) => s.find((x) => x.grupo === GRUPO_GOVERNADORES_ELEITOS);

  test("a cadastrar e a conferir dos governadores ficam na seção do seu grupo, com o título contado", () => {
    const g = govSecao(secoesDeEleicao(e, [grupo("Governadores eleitos - Posse Presidencial 2027", 1)], "tudo", ""))!;
    expect(g.governo.aCadastrar.map((x) => x.eleito.nomeUrna)).toEqual(["Gov Novo"]);
    expect(g.governo.aConferir.map((x) => x.eleito.nomeUrna)).toEqual(["Gov Duvida"]);
    expect(g.aCadastrar).toEqual([]);
    expect(g.aConferir).toEqual([]);
    expect(g.titulo).toBe("Governadores eleitos - Posse Presidencial 2027 — 2 pela lista · 1 no Contatos · 1 a cadastrar");
  });
  test("o senador a conferir não vai para a seção dos governadores", () => {
    const s = secoesDeEleicao(e, [], "a_conferir", "");
    expect(s.map((x) => x.grupo)).toEqual([GRUPO_SENADORES_ELEITOS, GRUPO_GOVERNADORES_ELEITOS]);
    expect(govSecao(s)!.governo.aCadastrar).toEqual([]);
  });
  test("busca filtra os governadores; retrato antigo sem grupoDestino cai no grupo dos governadores eleitos", () => {
    expect(secoesDeEleicao(e, [], "tudo", "zzz")).toEqual([]);
    const antigo = comGov([gov("Gov Antigo")]);
    expect(govSecao(secoesDeEleicao(antigo, [], "tudo", ""))!.governo.aCadastrar.map((x) => x.eleito.nomeUrna)).toEqual(["Gov Antigo"]);
  });
});
