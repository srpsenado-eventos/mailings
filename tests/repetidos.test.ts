import { describe, expect, test } from "vitest";
import {
  autoridadesRepetidas, escolherGrupo, etiquetaDeRepeticao, filtrarRepetidas, MOTIVO_ELEITO_SEM_CARGO_ATUAL, MOTIVO_PARCIAL,
  MOTIVO_SEM_NIVEL, ocorrenciasDeFora, rotuloOrigem, separarRepetidas, textoEleitosRepetidos, textoLinkRepetidas, textoRepetidas,
  type OcorrenciaRepetida,
} from "@/lib/repetidos";
import { situacaoDoContato } from "@/lib/painel";
import type {
  CasaLegislativa, DeputadoAtual, EleitoClassificado, GovernadorClassificado, ResultadoContato, ResultadoEleicao, ResultadoGrupo,
} from "@/lib/types";

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
    grupo: grupoRegra, grupoRegra, chave: "ana", cargo: "x", ex: false, possivelSaida: false, origem: "contatos",
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

const deputado = (nomeParlamentar: string, nomeCivil: string, uf = "CE"): DeputadoAtual => ({ uf, nomeParlamentar, nomeCivil });
const eleito = (casa: CasaLegislativa, nomeUrna: string, nomeCompleto: string, uf = "SP"): EleitoClassificado => ({
  eleito: { casa, uf, nomeUrna, nomeCompleto, situacaoTse: "Eleito", statusMandato: "x" },
  destino: "reeleito", projecao: false, contatos: [],
});
const governadorEleito = (nomeUrna: string, nomeCompleto: string, uf = "SP"): GovernadorClassificado => ({
  eleito: { uf, nomeUrna, nomeCompleto, situacaoTse: "Eleito", statusMandato: "x" },
  destino: "outro_cargo", contatos: [],
});
const eleicao = (extra: Partial<ResultadoEleicao> = {}): ResultadoEleicao => ({
  arquivos: [], eleitos: [], camaraNoContatos: false, ...extra,
});
const exPresidenteSenado = (nome: string) => grupo("Ex-Presidentes do Senado", [linha(nome, "Ex-Presidente do Senado Federal")]);

describe("ocorrenciasDeFora", () => {
  test("sem eleição não há ocorrência de fora", () => {
    expect(ocorrenciasDeFora(undefined)).toEqual([]);
  });

  test("deputado atual entra com os dois nomes, no nível 4.14", () => {
    const [p, ...resto] = ocorrenciasDeFora(eleicao({ deputadosAtuais: [deputado("Ciro Fictício", "Ciro Fictício de Souza")] }));
    expect(resto).toEqual([]);
    expect(p.nomes).toEqual(["Ciro Fictício", "Ciro Fictício de Souza"]);
    expect(p.ocorrencia).toMatchObject({
      grupo: "Deputados Federais", grupoRegra: "Deputados Federais", chave: "ciro ficticio", cargo: "Deputado Federal",
      nivel: { nivel: "4.14" }, ex: false, possivelSaida: false, origem: "camara",
    });
  });

  test("deputados atuais ficam de fora quando o grupo existe no Contatos", () => {
    expect(ocorrenciasDeFora(eleicao({ camaraNoContatos: true, deputadosAtuais: [deputado("Ciro Fictício", "Ciro Fictício de Souza")] }))).toEqual([]);
  });

  test("eleitos levam o grupo e o nível de eleito; governador do DF é 4.11.1", () => {
    const fora = ocorrenciasDeFora(eleicao({
      eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima"), eleito("camara", "Lia Fictícia", "Lia Fictícia Prado")],
      governadores: {
        eleitos: [governadorEleito("Edu Fictício", "Eduardo Fictício", "GO"), governadorEleito("Bel Fictícia", "Isabel Fictícia", "DF")],
        segundoTurno: [],
      },
    }));
    expect(fora.map((p) => [p.ocorrencia.grupoRegra, p.ocorrencia.nivel?.nivel, p.ocorrencia.origem])).toEqual([
      ["Senadores Eleitos", "4.13.1", "eleicao"],
      ["Deputados Federais Eleitos", "4.14.1", "eleicao"],
      ["Governadores Eleitos", "4.12.1", "eleicao"],
      ["Governadores Eleitos", "4.11.1", "eleicao"],
    ]);
  });
});

describe("autoridadesRepetidas com as listas de fora do Contatos", () => {
  test("ex-presidente do Senado que é deputado atual é convidado por Deputados Federais", () => {
    const [a, ...resto] = autoridadesRepetidas(
      [exPresidenteSenado("Ciro Fictício")],
      eleicao({ deputadosAtuais: [deputado("Ciro Fictício", "Ciro Fictício")] }),
    );
    expect(resto).toEqual([]);
    expect(a.nome).toBe("Ciro Fictício");
    expect(a.situacao).toBe("decidido");
    expect(a.convidaPor?.grupoRegra).toBe("Deputados Federais");
    expect(a.convidaPor?.origem).toBe("camara");
    expect(a.motivo).toBe("Cargo atual (Deputados Federais) vence cargo de ex- (Ex-Presidentes do Senado)");
    expect(a.eleicao).toBeUndefined();
    expect(a.ocorrencias.map((o) => o.origem)).toEqual(["contatos", "camara"]);
  });

  test("nome parlamentar igual e civil mais longo dão um caso só, decidido", () => {
    const lista = autoridadesRepetidas(
      [exPresidenteSenado("Ciro Fictício")],
      eleicao({ deputadosAtuais: [deputado("Ciro Fictício", "Ciro Fictício Gomes de Souza")] }),
    );
    expect(lista).toHaveLength(1);
    expect(lista[0].situacao).toBe("decidido");
    expect(lista[0].ocorrencias).toHaveLength(2);
  });

  test("casa pelo nome civil quando o parlamentar é diferente", () => {
    const [a] = autoridadesRepetidas(
      [exPresidenteSenado("Ciro Fictício Gomes")],
      eleicao({ deputadosAtuais: [deputado("Cirinho", "Ciro Fictício Gomes")] }),
    );
    expect(a.situacao).toBe("decidido");
    expect(a.convidaPor?.grupoRegra).toBe("Deputados Federais");
  });

  test("nome parcial com a lista de fora vai para conferir", () => {
    const [a, ...resto] = autoridadesRepetidas(
      [exPresidenteSenado("Mauro Fictício")],
      eleicao({ deputadosAtuais: [deputado("Mauro Fictício Filho", "Mauro Fictício Filho")] }),
    );
    expect(resto).toEqual([]);
    expect(a.situacao).toBe("conferir");
    expect(a.motivo).toBe(MOTIVO_PARCIAL);
    expect(a.ocorrencias).toHaveLength(2);
  });

  test("lista da Câmara é ignorada quando o grupo Deputados Federais existe no Contatos", () => {
    expect(autoridadesRepetidas(
      [exPresidenteSenado("Ciro Fictício")],
      eleicao({ camaraNoContatos: true, deputadosAtuais: [deputado("Ciro Fictício", "Ciro Fictício")] }),
    )).toEqual([]);
  });

  test("senador reeleito é convidado por Senadores, com a marca da eleição", () => {
    const [a, ...resto] = autoridadesRepetidas(
      [grupo("Senadores", [linha("Rui Fictício", "Senador")])],
      eleicao({ eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima")] }),
    );
    expect(resto).toEqual([]);
    expect(a.situacao).toBe("decidido");
    expect(a.convidaPor?.grupoRegra).toBe("Senadores");
    expect(a.motivo).toBe("Eleição 2026: convidar pelo grupo atual (Ata 14)");
    expect(a.eleicao).toBe(true);
  });

  test("senador eleito governador é convidado por Senadores", () => {
    const [a] = autoridadesRepetidas(
      [grupo("Senadores", [linha("Rui Fictício", "Senador")])],
      eleicao({ governadores: { eleitos: [governadorEleito("Rui Fictício", "Rui Fictício Lima")], segundoTurno: [] } }),
    );
    expect(a.situacao).toBe("decidido");
    expect(a.convidaPor?.grupoRegra).toBe("Senadores");
    expect(a.eleicao).toBe(true);
  });

  test("eleito no nível mais alto não tira o convite do grupo atual", () => {
    const [a] = autoridadesRepetidas(
      [grupo("Senadores", [linha("Rui Fictício", "Senador")])],
      eleicao({ governadores: { eleitos: [governadorEleito("Rui Fictício", "Rui Fictício", "DF")], segundoTurno: [] } }),
    );
    expect(a.convidaPor?.grupoRegra).toBe("Senadores");
  });

  test("eleito que no Contatos só tem cargo de ex- vai para conferir", () => {
    const [a] = autoridadesRepetidas(
      [exPresidenteSenado("Rui Fictício")],
      eleicao({ eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima")] }),
    );
    expect(a.situacao).toBe("conferir");
    expect(a.convidaPor).toBeUndefined();
    expect(a.motivo).toBe(MOTIVO_ELEITO_SEM_CARGO_ATUAL);
    expect(a.eleicao).toBe(true);
  });

  test("deputado reeleito que é ex-presidente do Senado é convidado pela Câmara", () => {
    const [a] = autoridadesRepetidas(
      [exPresidenteSenado("Ciro Fictício")],
      eleicao({
        deputadosAtuais: [deputado("Ciro Fictício", "Ciro Fictício de Souza")],
        eleitos: [eleito("camara", "Ciro Fictício", "Ciro Fictício de Souza", "CE")],
      }),
    );
    expect(a.situacao).toBe("decidido");
    expect(a.convidaPor?.grupoRegra).toBe("Deputados Federais");
    expect(a.eleicao).toBe(true);
    expect(a.ocorrencias.map((o) => o.origem)).toEqual(["contatos", "camara", "eleicao"]);
  });

  test("eleito não liga como parcial dois nomes do mesmo grupo do Contatos", () => {
    const lista = autoridadesRepetidas(
      [grupo("Senadores", [linha("José Fictício", "Senador"), linha("José Fictício Lima", "Senador")])],
      eleicao({ eleitos: [eleito("senado", "José Fictício", "José Fictício Prado")] }),
    );
    expect(lista).toHaveLength(1);
    expect(lista[0].situacao).toBe("decidido");
    expect(lista[0].ocorrencias.map((o) => o.chave)).toEqual(["jose ficticio", "jose ficticio"]);
  });

  test("pessoa só nas listas de fora não entra", () => {
    expect(autoridadesRepetidas(
      [grupo("Senadores", [linha("Outra Pessoa", "Senador")])],
      eleicao({
        deputadosAtuais: [deputado("Ciro Fictício", "Ciro Fictício de Souza")],
        eleitos: [eleito("camara", "Ciro Fictício", "Ciro Fictício de Souza", "CE")],
      }),
    )).toEqual([]);
  });

  test("os dois nomes da mesma pessoa de fora não viram parcial entre si", () => {
    expect(autoridadesRepetidas(
      [grupo("Senadores", [linha("Outra Pessoa", "Senador")])],
      eleicao({ deputadosAtuais: [deputado("Ciro Fictício", "Ciro Fictício de Souza")] }),
    )).toEqual([]);
  });

  test("sem eleição, o resultado é o de hoje", () => {
    const grupos = [stf(), tse(), exPresidenteSenado("Rui Fictício"), grupo("Senadores", [linha("Rui Fictício", "Senador")])];
    const sem = autoridadesRepetidas(grupos);
    expect(autoridadesRepetidas(grupos, undefined)).toEqual(sem);
    expect(autoridadesRepetidas(grupos, eleicao())).toEqual(sem);
    expect(sem.map((a) => [a.nome, a.situacao, a.convidaPor?.grupoRegra])).toEqual([
      ["Ana Fictícia", "decidido", "Ministros do STF"],
      ["Rui Fictício", "decidido", "Senadores"],
    ]);
    expect(sem.flatMap((a) => a.ocorrencias.map((o) => o.origem))).toEqual(["contatos", "contatos", "contatos", "contatos"]);
  });

  test("etiqueta: vermelha no grupo de ex- de quem é convidado pela Câmara", () => {
    const repetidas = autoridadesRepetidas(
      [exPresidenteSenado("Ciro Fictício")],
      eleicao({ deputadosAtuais: [deputado("Ciro Fictício", "Ciro Fictício")] }),
    );
    expect(etiquetaDeRepeticao(repetidas, linha("Ciro Fictício", "Ex-Presidente do Senado Federal"), "Ex-Presidentes do Senado")).toEqual({
      campo: "grupo", tom: "ruim", texto: "Autoridade a ser convidada pelo grupo Deputados Federais",
      explicacao: "Cargo atual (Deputados Federais) vence cargo de ex- (Ex-Presidentes do Senado)",
    });
  });

  test("etiqueta: reeleito decidido fica sem etiqueta de repetição", () => {
    const repetidas = autoridadesRepetidas(
      [grupo("Senadores", [linha("Rui Fictício", "Senador")])],
      eleicao({ eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima")] }),
    );
    expect(etiquetaDeRepeticao(repetidas, linha("Rui Fictício", "Senador"), "Senadores")).toBeUndefined();
  });

  test("etiqueta: a linha do grupo de eleitos do Contatos não pega a ocorrência de fora", () => {
    const repetidas = autoridadesRepetidas(
      [exPresidenteSenado("Rui Fictício")],
      eleicao({ eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima")] }),
    );
    expect(etiquetaDeRepeticao(repetidas, linha("Rui Fictício", "Senador eleito"), "Senadores Eleitos")).toBeUndefined();
  });

  test("contadores: eleitos à parte das demais", () => {
    expect(textoEleitosRepetidos(1)).toBe("1 eleito já no Contatos");
    expect(textoEleitosRepetidos(14)).toBe("14 eleitos já no Contatos");
  });
});

describe("tela das repetidas com as listas de fora", () => {
  const comEleito = () => autoridadesRepetidas(
    [grupo("Senadores", [linha("Rui Fictício", "Senador")]), stf(), tse()],
    eleicao({ eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima")] }),
  );

  test("rótulo da origem: Contatos, Planilha da Câmara e Eleição 2026", () => {
    expect(rotuloOrigem("contatos")).toBe("Contatos");
    expect(rotuloOrigem("camara")).toBe("Planilha da Câmara");
    expect(rotuloOrigem("eleicao")).toBe("Eleição 2026");
  });

  test("separa as de eleito das demais, mantendo a ordem", () => {
    const { demais, eleitos } = separarRepetidas(comEleito());
    expect(demais.map((a) => a.nome)).toEqual(["Ana Fictícia"]);
    expect(eleitos.map((a) => a.nome)).toEqual(["Rui Fictício"]);
  });

  test("sem eleitos, a seção de eleitos fica vazia", () => {
    const { demais, eleitos } = separarRepetidas(autoridadesRepetidas([stf(), tse()]));
    expect(demais).toHaveLength(1);
    expect(eleitos).toEqual([]);
  });

  test("texto do link conta as demais e acrescenta os eleitos só quando há", () => {
    expect(textoLinkRepetidas(comEleito())).toBe("1 autoridade em mais de um grupo · 1 eleito já no Contatos");
    expect(textoLinkRepetidas(autoridadesRepetidas([stf(), tse()]))).toBe("1 autoridade em mais de um grupo");
  });

  test("texto do link só de eleitos mostra apenas o contador dos eleitos", () => {
    const so = autoridadesRepetidas(
      [grupo("Senadores", [linha("Rui Fictício", "Senador")]), grupo("Ex-Presidentes do Senado", [linha("Rui Fictício", "Ex-Presidente do Senado Federal")])],
      eleicao({ eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima")] }),
    );
    expect(textoLinkRepetidas(so)).toBe("1 eleito já no Contatos");
  });
});
