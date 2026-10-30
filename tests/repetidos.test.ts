import { describe, expect, test } from "vitest";
import {
  autoridadesRepetidas, escolherGrupo, etiquetaDeRepeticao, filtrarRepetidas, MOTIVO_ELEITO_SEM_CARGO_ATUAL, MOTIVO_PARCIAL,
  MOTIVO_SEM_NIVEL, eleitosLigados, MOTIVO_ELEICAO_NOVO, ocorrenciasDeFora, rotuloOrigem, separarRepetidas, textoDoLinkDoPainel, textoEleitosRepetidos, textoLinkRepetidas, textoRepetidas,
  type OcorrenciaRepetida,
} from "@/lib/repetidos";
import { GRUPO_DEPUTADOS_ELEITOS, GRUPO_SENADORES_ELEITOS } from "@/data/grupos-posse";
import { HISTORICO_VAZIO, registrar, type HistoricoDecisoes, type RegistroManual } from "@/lib/decisoes";
import { situacaoDoContato } from "@/lib/painel";
import type {
  CasaLegislativa, ContatoDoEleito, DeputadoAtual, EleitoClassificado, GovernadorClassificado, ResultadoContato, ResultadoEleicao, ResultadoGrupo,
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
    expect(etiquetaDeRepeticao(repetidas, ana, "Ministros do TSE")?.etiqueta).toEqual({
      campo: "grupo", tom: "ruim", texto: "Autoridade a ser convidada pelo grupo Ministros do STF",
      explicacao: "Ministros do STF (4.9) antes de Ministros do TSE (5.9)",
    });
  });

  test("grupo que convida leva a etiqueta neutra", () => {
    expect(etiquetaDeRepeticao(repetidas, ana, "Ministros do STF")?.etiqueta).toEqual({
      campo: "grupo", tom: "neutro", texto: "Convidada por este grupo; também em Ministros do TSE",
      explicacao: "Ministros do STF (4.9) antes de Ministros do TSE (5.9)",
    });
  });

  test("caso a conferir leva etiqueta de atenção", () => {
    const conferir = autoridadesRepetidas([stf("Carmem Fictícia"), tse("Carmem Fictícia Antunes Rocha")]);
    expect(etiquetaDeRepeticao(conferir, linha("Carmem Fictícia", "Ministra"), "Ministros do STF")?.etiqueta).toEqual({
      campo: "grupo", tom: "atencao", texto: "Em mais de um grupo: conferir", explicacao: MOTIVO_PARCIAL,
    });
  });

  test("a etiqueta de repetição não entra na situação do contato", () => {
    const g = grupo("Ministros do TSE", [ana]);
    const igual = grupo("Outro grupo", [linha("Ana Fictícia", "Ministra")]);
    expect(etiquetaDeRepeticao(repetidas, ana, "Ministros do TSE")?.etiqueta.tom).toBe("ruim");
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
/** Ligação que o eixo da Eleição 2026 fez entre o eleito e a linha do Contatos. */
const lig = (grupo: string, nome: string): ContatoDoEleito => ({ grupo, nome });
const eleito = (
  casa: CasaLegislativa, nomeUrna: string, nomeCompleto: string, uf = "SP", contatos: ContatoDoEleito[] = [], extra: Partial<EleitoClassificado> = {},
): EleitoClassificado => ({
  eleito: { casa, uf, nomeUrna, nomeCompleto, situacaoTse: "Eleito", statusMandato: "x" },
  destino: "reeleito", projecao: false, contatos, ...extra,
});
const governadorEleito = (
  nomeUrna: string, nomeCompleto: string, uf = "SP", contatos: ContatoDoEleito[] = [], extra: Partial<GovernadorClassificado> = {},
): GovernadorClassificado => ({
  eleito: { uf, nomeUrna, nomeCompleto, situacaoTse: "Eleito", statusMandato: "x" },
  destino: "outro_cargo", contatos, ...extra,
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
      eleicao({ eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima", "SP", [lig("Senadores", "Rui Fictício")])] }),
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
      eleicao({ governadores: { eleitos: [governadorEleito("Rui Fictício", "Rui Fictício Lima", "SP", [lig("Senadores", "Rui Fictício")])], segundoTurno: [] } }),
    );
    expect(a.situacao).toBe("decidido");
    expect(a.convidaPor?.grupoRegra).toBe("Senadores");
    expect(a.eleicao).toBe(true);
  });

  test("eleito no nível mais alto não tira o convite do grupo atual", () => {
    const [a] = autoridadesRepetidas(
      [grupo("Senadores", [linha("Rui Fictício", "Senador")])],
      eleicao({ governadores: { eleitos: [governadorEleito("Rui Fictício", "Rui Fictício", "DF", [lig("Senadores", "Rui Fictício")])], segundoTurno: [] } }),
    );
    expect(a.convidaPor?.grupoRegra).toBe("Senadores");
  });

  test("eleito que no Contatos só tem cargo de ex- vai para conferir", () => {
    const [a] = autoridadesRepetidas(
      [exPresidenteSenado("Rui Fictício")],
      eleicao({ eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima", "SP", [lig("Ex-Presidentes do Senado", "Rui Fictício")])] }),
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
        eleitos: [eleito("camara", "Ciro Fictício", "Ciro Fictício de Souza", "CE", [lig("Ex-Presidentes do Senado", "Ciro Fictício")])],
      }),
    );
    expect(a.situacao).toBe("decidido");
    expect(a.convidaPor?.grupoRegra).toBe("Deputados Federais");
    expect(a.eleicao).toBe(true);
    expect(a.ocorrencias.map((o) => o.origem)).toEqual(["contatos", "camara", "eleicao"]);
  });

  test("dois nomes parecidos do mesmo grupo do Contatos não viram parcial, nem com eleito ligado", () => {
    const lista = autoridadesRepetidas(
      [grupo("Senadores", [linha("José Fictício", "Senador"), linha("José Fictício Lima", "Senador")])],
      eleicao({ eleitos: [eleito("senado", "José Fictício", "José Fictício Prado", "SP", [lig("Senadores", "José Fictício")])] }),
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
    expect(etiquetaDeRepeticao(repetidas, linha("Ciro Fictício", "Ex-Presidente do Senado Federal"), "Ex-Presidentes do Senado")?.etiqueta).toEqual({
      campo: "grupo", tom: "ruim", texto: "Autoridade a ser convidada pelo grupo Deputados Federais",
      explicacao: "Cargo atual (Deputados Federais) vence cargo de ex- (Ex-Presidentes do Senado)",
    });
  });

  test("etiqueta: reeleito decidido fica sem etiqueta de repetição", () => {
    const repetidas = autoridadesRepetidas(
      [grupo("Senadores", [linha("Rui Fictício", "Senador")])],
      eleicao({ eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima", "SP", [lig("Senadores", "Rui Fictício")])] }),
    );
    expect(etiquetaDeRepeticao(repetidas, linha("Rui Fictício", "Senador"), "Senadores")).toBeUndefined();
  });

  test("etiqueta: a linha do grupo de eleitos do Contatos não pega a ocorrência de fora", () => {
    const repetidas = autoridadesRepetidas(
      [exPresidenteSenado("Rui Fictício")],
      eleicao({ eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima", "SP", [lig("Ex-Presidentes do Senado", "Rui Fictício")])] }),
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
    eleicao({ eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima", "SP", [lig("Senadores", "Rui Fictício")])] }),
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
      eleicao({ eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima", "SP", [lig("Senadores", "Rui Fictício"), lig("Ex-Presidentes do Senado", "Rui Fictício")])] }),
    );
    expect(textoLinkRepetidas(so)).toBe("1 eleito já no Contatos");
  });
});

describe("etiqueta de repetição com eleito", () => {
  const presidenteDoSenado = (nome: string) => grupo("Presidente do Senado", [linha(nome, "Presidente do Senado Federal")]);
  const senadores = (nome: string) => grupo("Senadores", [linha(nome, "Senador")]);

  test("deputado reeleito só em Ex-Presidentes do Senado: a linha do Contatos fica vermelha, convite pela Câmara", () => {
    const repetidas = autoridadesRepetidas(
      [exPresidenteSenado("Ciro Fictício")],
      eleicao({
        deputadosAtuais: [deputado("Ciro Fictício", "Ciro Fictício de Souza")],
        eleitos: [eleito("camara", "Ciro Fictício", "Ciro Fictício de Souza", "CE", [lig("Ex-Presidentes do Senado", "Ciro Fictício")])],
      }),
    );
    expect(etiquetaDeRepeticao(repetidas, linha("Ciro Fictício", "Ex-Presidente do Senado Federal"), "Ex-Presidentes do Senado")?.etiqueta).toEqual({
      campo: "grupo", tom: "ruim", texto: "Autoridade a ser convidada pelo grupo Deputados Federais",
      explicacao: "Eleição 2026: convidar pelo grupo atual (Ata 14)",
    });
  });

  test("senador reeleito em Presidente do Senado e em Senadores: só a linha de Senadores fica vermelha", () => {
    const repetidas = autoridadesRepetidas(
      [presidenteDoSenado("Rui Fictício"), senadores("Rui Fictício")],
      eleicao({ eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima", "SP", [lig("Presidente do Senado", "Rui Fictício"), lig("Senadores", "Rui Fictício")])] }),
    );
    expect(etiquetaDeRepeticao(repetidas, linha("Rui Fictício", "Senador"), "Senadores")?.etiqueta).toMatchObject({
      tom: "ruim", texto: "Autoridade a ser convidada pelo grupo Presidente do Senado",
    });
    expect(etiquetaDeRepeticao(repetidas, linha("Rui Fictício", "Presidente do Senado Federal"), "Presidente do Senado")).toBeUndefined();
  });

  test("reeleito só em Senadores continua sem etiqueta de repetição", () => {
    const repetidas = autoridadesRepetidas(
      [senadores("Rui Fictício")],
      eleicao({ eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima", "SP", [lig("Senadores", "Rui Fictício")])] }),
    );
    expect(etiquetaDeRepeticao(repetidas, linha("Rui Fictício", "Senador"), "Senadores")).toBeUndefined();
  });

  test("deputado sem nome parlamentar entra pelo nome civil", () => {
    const fora = ocorrenciasDeFora(eleicao({ deputadosAtuais: [deputado("", "Ciro Fictício de Souza")] }));
    expect(fora).toHaveLength(1);
    expect(fora[0].ocorrencia.chave).toBe("ciro ficticio de souza");
  });

  test("deputado sem nenhum nome é descartado", () => {
    expect(ocorrenciasDeFora(eleicao({ deputadosAtuais: [deputado("", "  ")] }))).toEqual([]);
  });
});

describe("eleitosLigados", () => {
  test("sem eleição não há eleito ligado", () => {
    expect(eleitosLigados(undefined)).toEqual([]);
  });

  test("eleitos ligados levam o grupo e o nível de eleito; governador do DF é 4.11.1", () => {
    const ligados = eleitosLigados(eleicao({
      eleitos: [
        eleito("senado", "Rui Fictício", "Rui Fictício Lima", "SP", [lig("Senadores", "Rui Fictício")]),
        eleito("camara", "Lia Fictícia", "Lia Fictícia Prado", "SP", [lig("Deputados Federais", "Lia Fictícia")]),
      ],
      governadores: {
        eleitos: [
          governadorEleito("Edu Fictício", "Eduardo Fictício", "GO", [lig("Governadores", "Edu Fictício")]),
          governadorEleito("Bel Fictícia", "Isabel Fictícia", "DF", [lig("Governadores", "Bel Fictícia")]),
        ],
        segundoTurno: [],
      },
    }));
    expect(ligados.map((p) => [p.ocorrencia.grupoRegra, p.ocorrencia.nivel?.nivel, p.ocorrencia.origem])).toEqual([
      ["Senadores Eleitos", "4.13.1", "eleicao"],
      ["Deputados Federais Eleitos", "4.14.1", "eleicao"],
      ["Governadores Eleitos", "4.12.1", "eleicao"],
      ["Governadores Eleitos", "4.11.1", "eleicao"],
    ]);
  });

  test("eleito sem ligação não entra", () => {
    expect(eleitosLigados(eleicao({
      eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima")],
      governadores: { eleitos: [governadorEleito("Edu Fictício", "Eduardo Fictício", "GO")], segundoTurno: [] },
    }))).toEqual([]);
  });
});

describe("eleitos pela ligação do eixo da Eleição 2026 (spec 2026-10-28 §8)", () => {
  test("reeleito de nome diferente do Contatos, mas ligado pelo eixo, é decidido pelo grupo atual", () => {
    const [a, ...resto] = autoridadesRepetidas(
      [grupo("Senadores", [linha("Veneziano Vital do Rêgo", "Senador")])],
      eleicao({
        eleitos: [eleito("senado", "Veneziano", "Veneziano Vital Do Rêgo Segundo Neto", "PB", [lig("Senadores", "Veneziano Vital do Rêgo")])],
      }),
    );
    expect(resto).toEqual([]);
    expect(a.situacao).toBe("decidido");
    expect(a.convidaPor?.grupoRegra).toBe("Senadores");
    expect(a.motivo).toBe("Eleição 2026: convidar pelo grupo atual (Ata 14)");
    expect(a.eleicao).toBe(true);
  });

  test("eleito com o mesmo nome de alguém do Contatos, mas sem ligação, não entra", () => {
    expect(autoridadesRepetidas(
      [grupo("Senadores", [linha("Rui Fictício", "Senador")])],
      eleicao({ eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima")] }),
    )).toEqual([]);
  });

  test("eleito de nome parecido sem ligação (filho e pai) não entra", () => {
    const lista = autoridadesRepetidas(
      [exPresidenteSenado("Mauro Fictício"), grupo("Senadores", [linha("Mauro Fictício", "Senador")])],
      eleicao({ eleitos: [eleito("camara", "Mauro Fictício Filho", "Mauro Fictício Filho", "CE")] }),
    );
    expect(lista).toHaveLength(1);
    expect(lista[0].eleicao).toBeUndefined();
    expect(lista[0].ocorrencias.map((o) => o.origem)).toEqual(["contatos", "contatos"]);
  });

  test("destino conferir com ligação vai para conferir com o motivo do eixo", () => {
    const [a] = autoridadesRepetidas(
      [grupo("Senadores", [linha("Rui Fictício", "Senador")])],
      eleicao({
        eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima", "SP", [lig("Senadores", "Rui Fictício")], {
          destino: "conferir", motivo: "Planilha diz X, Contatos diz Y",
        })],
      }),
    );
    expect(a.situacao).toBe("conferir");
    expect(a.convidaPor).toBeUndefined();
    expect(a.motivo).toBe("Eleição 2026: Planilha diz X, Contatos diz Y");
    expect(a.eleicao).toBe(true);
  });

  test("destino conferir sem motivo do eixo usa o texto padrão", () => {
    const [a] = autoridadesRepetidas(
      [grupo("Senadores", [linha("Rui Fictício", "Senador")])],
      eleicao({ eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima", "SP", [lig("Senadores", "Rui Fictício")], { destino: "conferir" })] }),
    );
    expect(a.motivo).toBe("Eleição 2026: conferir no eixo da eleição");
  });

  test("destino novo com ligação vai para conferir com o motivo do mandato novo", () => {
    const [a] = autoridadesRepetidas(
      [grupo("Senadores", [linha("Rui Fictício", "Senador")])],
      eleicao({ eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima", "SP", [lig("Senadores", "Rui Fictício")], { destino: "novo" })] }),
    );
    expect(a.situacao).toBe("conferir");
    expect(a.motivo).toBe(MOTIVO_ELEICAO_NOVO);
    expect(a.motivo).toBe("Eleição 2026: mandato novo de quem já está no Contatos");
    expect(a.eleicao).toBe(true);
  });

  test("ligação ao grupo de eleitos do próprio Contatos não conta", () => {
    expect(autoridadesRepetidas(
      [grupo("Senadores Eleitos", [linha("Rui Fictício", "Senador eleito")]), grupo("Senadores", [linha("Rui Fictício", "Senador")])],
      eleicao({ eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima", "SP", [lig("Senadores Eleitos", "Rui Fictício")])] }),
    )).toEqual([]);
  });

  test("governador eleito ligado com deputado atual de nome parcial dá um caso só, conferir, com a marca da eleição", () => {
    const lista = autoridadesRepetidas(
      [grupo("Governadores", [linha("Edu Fictício", "Governador de Goiás")])],
      eleicao({
        deputadosAtuais: [deputado("Edu Fictício Neto", "Eduardo Fictício Neto")],
        governadores: { eleitos: [governadorEleito("Edu Fictício", "Eduardo Fictício", "GO", [lig("Governadores", "Edu Fictício")])], segundoTurno: [] },
      }),
    );
    expect(lista).toHaveLength(1);
    expect(lista[0].situacao).toBe("conferir");
    expect(lista[0].motivo).toBe(MOTIVO_PARCIAL);
    expect(lista[0].eleicao).toBe(true);
  });

  test("eleito ligado a duas linhas do Contatos junta as duas no mesmo caso", () => {
    const lista = autoridadesRepetidas(
      [grupo("Presidente do Senado", [linha("Rui Fictício", "Presidente do Senado Federal")]), grupo("Senadores", [linha("Rui Fictício", "Senador")])],
      eleicao({
        eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima", "SP", [lig("Presidente do Senado", "Rui Fictício"), lig("Senadores", "Rui Fictício")])],
      }),
    );
    expect(lista).toHaveLength(1);
    expect(lista[0].convidaPor?.grupoRegra).toBe("Presidente do Senado");
    expect(lista[0].ocorrencias.map((o) => o.origem).sort()).toEqual(["contatos", "contatos", "eleicao"]);
  });

  test("eleito ligado a duas pessoas diferentes (ambíguo) não une nem entra; cada pessoa segue no seu caso", () => {
    const lista = autoridadesRepetidas(
      [
        grupo("Presidente do Senado", [linha("Ana Pires", "Presidente do Senado Federal")]),
        grupo("Senadores", [linha("Ana Pires", "Senadora")]),
        stf("Maria Souza"),
        tse("Maria Souza"),
      ],
      eleicao({
        eleitos: [eleito("senado", "Ana", "Ana Souza Pires", "SP", [lig("Senadores", "Ana Pires"), lig("Ministros do STF", "Maria Souza")], {
          destino: "conferir", motivo: "Mais de uma pessoa casou",
        })],
      }),
    );
    expect(lista.map((a) => a.nome).sort()).toEqual(["Ana Pires", "Maria Souza"]);
    expect(lista.every((a) => a.situacao === "decidido" && a.eleicao === undefined)).toBe(true);
    expect(lista.flatMap((a) => a.ocorrencias.map((o) => o.origem))).not.toContain("eleicao");
  });

  test("destino conferir com nome parcial da Câmara junta o motivo do eixo e o do nome parcial", () => {
    const [a] = autoridadesRepetidas(
      [grupo("Governadores", [linha("Edu Fictício", "Governador de Goiás")])],
      eleicao({
        deputadosAtuais: [deputado("Edu Fictício Neto", "Eduardo Fictício Neto")],
        governadores: {
          eleitos: [governadorEleito("Edu Fictício", "Eduardo Fictício", "GO", [lig("Governadores", "Edu Fictício")], { destino: "conferir", motivo: "Planilha diz X" })],
          segundoTurno: [],
        },
      }),
    );
    expect(a.situacao).toBe("conferir");
    expect(a.motivo).toBe(`Eleição 2026: Planilha diz X · ${MOTIVO_PARCIAL}`);
    expect(a.eleicao).toBe(true);
  });

  test("destino outra_casa decide pelo grupo atual (Ata 14)", () => {
    const [a] = autoridadesRepetidas(
      [grupo("Senadores", [linha("Rui Fictício", "Senador")])],
      eleicao({ eleitos: [eleito("camara", "Rui Fictício", "Rui Fictício Lima", "SP", [lig("Senadores", "Rui Fictício")], { destino: "outra_casa" })] }),
    );
    expect(a.situacao).toBe("decidido");
    expect(a.convidaPor?.grupoRegra).toBe("Senadores");
    expect(a.motivo).toBe("Eleição 2026: convidar pelo grupo atual (Ata 14)");
    expect(a.eleicao).toBe(true);
  });

  test("dois eleitos ligados ao mesmo contato dão um caso só", () => {
    const lista = autoridadesRepetidas(
      [grupo("Senadores", [linha("Rui Fictício", "Senador")])],
      eleicao({
        eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima", "SP", [lig("Senadores", "Rui Fictício")])],
        governadores: { eleitos: [governadorEleito("Rui Fictício", "Rui Fictício Lima", "SP", [lig("Senadores", "Rui Fictício")])], segundoTurno: [] },
      }),
    );
    expect(lista).toHaveLength(1);
    expect(lista[0].ocorrencias.filter((o) => o.origem === "eleicao")).toHaveLength(2);
    expect(lista[0].eleicao).toBe(true);
  });

  test("ligação com o nome do Contatos, mas a linha está em outro grupo que o da ligação, não conta", () => {
    expect(autoridadesRepetidas(
      [grupo("Senadores", [linha("Rui Fictício", "Senador")])],
      eleicao({ eleitos: [eleito("senado", "Rui Fictício", "Rui Fictício Lima", "SP", [lig("Ex-Presidentes do Senado", "Rui Fictício")])] }),
    )).toEqual([]);
  });
});

describe("decisões do GT nos repetidos (spec 2026-10-30 §4.1.3)", () => {
  const manual = (extra: Partial<RegistroManual> & Pick<RegistroManual, "tipo" | "grupos">): RegistroManual => ({
    data: "2026-10-26", quem: "GT (planilha de 29/10)", observacao: "", validacao: "validado", ...extra,
  });
  const decidir = (h: HistoricoDecisoes, nome: string, r: RegistroManual, nomes: string[] = []): HistoricoDecisoes =>
    registrar(h, nome, nomes, r);
  const stj = (nome: string) => grupo("Ministros do STJ", [linha(nome, "Ministro do Superior Tribunal de Justiça")]);
  const tseM = (nome: string) => grupo("Ministros do TSE", [linha(nome, "Ministro do Tribunal Superior Eleitoral")]);
  const CUEVA = "Ricardo Villas Bôas Cueva";
  const decisaoCueva = decidir(HISTORICO_VAZIO, CUEVA, manual({
    tipo: "mesma_pessoa", convidaPor: "Ministros do TSE", grupos: ["Ministros do STJ", "Ministros do TSE"],
  }));

  test("Cueva com mesma pessoa → TSE: decidida pelo GT, convite pelo TSE", () => {
    const [a] = autoridadesRepetidas([stj(CUEVA), tseM(CUEVA)], undefined, decisaoCueva);
    expect(a.situacao).toBe("decidido_gt");
    expect(a.convidaPor?.grupo).toBe("Ministros do TSE");
    expect(a.noContatos).toBe("pendente");
    expect(a.decisao?.tipo).toBe("mesma_pessoa");
    expect(a.caso?.nome).toBe(CUEVA);
  });

  test("Cueva: a linha do STJ fica fosca com a decisão; a do TSE não", () => {
    const repetidas = autoridadesRepetidas([stj(CUEVA), tseM(CUEVA)], undefined, decisaoCueva);
    const c = linha(CUEVA, "Ministro");
    const noStj = etiquetaDeRepeticao(repetidas, c, "Ministros do STJ");
    expect(noStj?.fosca).toBe(true);
    expect(noStj?.etiqueta).toMatchObject({
      campo: "grupo", tom: "neutro", texto: "Será convidada pelo grupo Ministros do TSE (decisão do GT de 26/10)",
    });
    const noTse = etiquetaDeRepeticao(repetidas, c, "Ministros do TSE");
    expect(noTse?.fosca).toBe(false);
    expect(noTse?.etiqueta.tom).toBe("neutro");
    expect(noTse?.etiqueta.texto).toBe("Convidada por este grupo; também em Ministros do STJ (decisão do GT de 26/10)");
  });

  test("Nunes Marques só no TSE, com mesma pessoa → TSE: tratada no Contatos", () => {
    const h = decidir(HISTORICO_VAZIO, "Ministro Kassio Nunes Marques", manual({
      tipo: "mesma_pessoa", convidaPor: "Ministros do TSE", grupos: ["Ministros do STF", "Ministros do TSE"],
    }), ["Nunes Marques"]);
    const lista = autoridadesRepetidas([tseM("Nunes Marques"), stf("Ana Fictícia"), tse("Ana Fictícia")], undefined, h);
    const nunes = lista.find((a) => a.caso !== undefined);
    expect(nunes?.situacao).toBe("tratado");
    expect(nunes?.noContatos).toBe("tratado");
    expect(nunes?.nome).toBe("Nunes Marques");
    expect(nunes?.ocorrencias.map((o) => o.grupo)).toEqual(["Ministros do TSE"]);
    expect(lista).toHaveLength(2);
  });

  test("Hugo Motta sem decisão continua a conferir", () => {
    const [a] = autoridadesRepetidas([
      grupo("Conselho Nacional de Justiça (CNJ)", [linha("Hugo Motta", "Conselheiro")]),
      grupo("Conselho Nacional do Ministério Público (CNMP)", [linha("Hugo Motta", "Conselheiro")]),
    ], undefined, decisaoCueva);
    expect(a.situacao).toBe("conferir");
    expect(a.caso).toBeUndefined();
    expect(a.decisao).toBeUndefined();
  });

  test("Carlos Brandão com pessoas diferentes: decidida pelo GT e sem etiqueta", () => {
    const h = decidir(HISTORICO_VAZIO, "Carlos Brandão", manual({ tipo: "pessoas_diferentes", grupos: ["Governadores", "Senadores"] }));
    const grupos = [grupo("Governadores", [linha("Carlos Brandão", "Governador do Maranhão")]), grupo("Senadores", [linha("Carlos Brandão", "Senador")])];
    const repetidas = autoridadesRepetidas(grupos, undefined, h);
    expect(repetidas[0].situacao).toBe("decidido_gt");
    expect(etiquetaDeRepeticao(repetidas, linha("Carlos Brandão", "Senador"), "Senadores")).toBeUndefined();
    expect(etiquetaDeRepeticao(repetidas, linha("Carlos Brandão", "Governador"), "Governadores")).toBeUndefined();
  });

  test("grupo novo desde a decisão reabre o caso", () => {
    const [a] = autoridadesRepetidas([stj(CUEVA), tseM(CUEVA), stf(CUEVA)], undefined, decisaoCueva);
    expect(a.situacao).toBe("conferir");
    expect(a.noContatos).toBe("reaberto");
    expect(a.motivo).toBe("grupo novo desde a decisão de 26/10");
    expect(a.convidaPor).toBeUndefined();
    expect(etiquetaDeRepeticao([a], linha(CUEVA, "Ministro"), "Ministros do STJ")).toEqual({
      etiqueta: { campo: "grupo", tom: "atencao", texto: "Em mais de um grupo: conferir", explicacao: "grupo novo desde a decisão de 26/10" },
      fosca: false,
    });
  });

  test("não recebe convite: todas as linhas da pessoa ficam foscas", () => {
    const h = decidir(HISTORICO_VAZIO, "Davi Alcolumbre", manual({
      tipo: "nao_recebe_convite", data: "2026-10-28", grupos: ["Senadores", "Presidente do Senado"],
    }));
    const repetidas = autoridadesRepetidas([
      grupo("Presidente do Senado", [linha("Davi Alcolumbre", "Presidente do Senado Federal")]),
      grupo("Senadores", [linha("Davi Alcolumbre", "Senador")]),
    ], undefined, h);
    expect(repetidas[0].situacao).toBe("decidido_gt");
    for (const g of ["Senadores", "Presidente do Senado"]) {
      const m = etiquetaDeRepeticao(repetidas, linha("Davi Alcolumbre", "x"), g);
      expect(m?.fosca).toBe(true);
      expect(m?.etiqueta).toMatchObject({ tom: "neutro", texto: "Não recebe convite (decisão do GT de 28/10)" });
    }
  });

  test("ajustar no Contatos: etiqueta de atenção, sem fosco", () => {
    const h = decidir(HISTORICO_VAZIO, "Celina Leão", manual({
      tipo: "ajustar_contatos", data: "2026-10-28", convidaPor: "Governadores", grupos: ["Governadores", "Senadores"],
    }));
    const repetidas = autoridadesRepetidas([
      grupo("Governadores", [linha("Celina Leão", "Governadora do Distrito Federal")]),
      grupo("Senadores", [linha("Celina Leão", "Senadora")]),
    ], undefined, h);
    expect(repetidas[0].situacao).toBe("decidido_gt");
    for (const g of ["Governadores", "Senadores"]) {
      expect(etiquetaDeRepeticao(repetidas, linha("Celina Leão", "x"), g)).toEqual({
        etiqueta: expect.objectContaining({ campo: "grupo", tom: "atencao", texto: "Ajustar no Contatos (decisão de 28/10)" }),
        fosca: false,
      });
    }
  });

  test("caso decidido de pessoa que sumiu do Contatos", () => {
    const h = decidir(
      decidir(HISTORICO_VAZIO, "Rui Sumido", manual({ tipo: "mesma_pessoa", convidaPor: "Senadores", grupos: ["Senadores", "Ex-Presidentes do Senado"] })),
      "Bia Sumida", manual({ tipo: "nao_recebe_convite", grupos: ["Senadores", "Presidente do Senado"] }),
    );
    const lista = autoridadesRepetidas([stf(), tse()], undefined, h);
    const rui = lista.find((a) => a.nome === "Rui Sumido");
    const bia = lista.find((a) => a.nome === "Bia Sumida");
    expect(rui).toMatchObject({ situacao: "decidido_gt", motivo: "Pessoa não encontrada no Contatos", ocorrencias: [] });
    expect(bia?.situacao).toBe("tratado");
  });

  describe("eleito ligado e o grupo do convite", () => {
    const decisaoCiro = decidir(HISTORICO_VAZIO, "Ciro Fictício", manual({
      tipo: "mesma_pessoa", convidaPor: "Deputados Federais", grupos: ["Ex-Presidentes do Senado", "Deputados Federais"],
    }));
    const ciroEleito = eleito("camara", "Ciro Fictício", "Ciro Fictício de Souza", "CE", [lig("Ex-Presidentes do Senado", "Ciro Fictício")], { grupoDestino: "Deputados Federais" });

    test("o grupo de destino do eleito identifica o caso, mas não vale como grupo do convite", () => {
      // Arrange / Act
      const repetidas = autoridadesRepetidas([exPresidenteSenado("Ciro Fictício")], eleicao({ eleitos: [ciroEleito] }), decisaoCiro);
      // Assert
      expect(repetidas[0].situacao).toBe("decidido_gt");
      expect(repetidas[0].ocorrencias.find((o) => o.origem === "eleicao")?.grupoEquivalente).toBe("Deputados Federais");
      expect(repetidas[0].convidaPor).toBeUndefined();
      expect(etiquetaDeRepeticao(repetidas, linha("Ciro Fictício", "x"), "Ex-Presidentes do Senado")).toEqual({
        etiqueta: expect.objectContaining({ tom: "atencao", texto: "Grupo do convite Deputados Federais sem a pessoa no Contatos" }),
        fosca: false,
      });
    });

    test("com a planilha da Câmara, a ocorrência da Câmara vale como grupo do convite", () => {
      // Arrange / Act
      const repetidas = autoridadesRepetidas(
        [exPresidenteSenado("Ciro Fictício")],
        eleicao({ eleitos: [ciroEleito], deputadosAtuais: [deputado("Ciro Fictício", "Ciro Fictício de Souza")] }),
        decisaoCiro,
      );
      // Assert
      expect(repetidas[0].convidaPor?.origem).toBe("camara");
      expect(etiquetaDeRepeticao(repetidas, linha("Ciro Fictício", "x"), "Ex-Presidentes do Senado")).toMatchObject({
        fosca: true, etiqueta: { texto: "Será convidada pelo grupo Deputados Federais (decisão do GT de 26/10)" },
      });
    });

    test("Deltan decidido para Senadores eleitos, só ligado pelo eixo: a linha do Contatos fica em atenção, sem fosco", () => {
      // Arrange
      const h = decidir(HISTORICO_VAZIO, "Deltan Dallagnol", manual({
        tipo: "mesma_pessoa", convidaPor: GRUPO_SENADORES_ELEITOS, grupos: ["Ex-Senadores", GRUPO_SENADORES_ELEITOS],
      }));
      const deltan = eleito("senado", "Deltan Dallagnol", "Deltan Martinazzo Dallagnol", "PR", [lig("Ex-Senadores", "Deltan Dallagnol")], {
        destino: "novo", grupoDestino: GRUPO_SENADORES_ELEITOS,
      });
      // Act
      const repetidas = autoridadesRepetidas([grupo("Ex-Senadores", [linha("Deltan Dallagnol", "Ex-Senador")])], eleicao({ eleitos: [deltan] }), h);
      const marca = etiquetaDeRepeticao(repetidas, linha("Deltan Dallagnol", "x"), "Ex-Senadores");
      // Assert
      expect(repetidas[0].situacao).toBe("decidido_gt");
      expect(repetidas[0].convidaPor).toBeUndefined();
      expect(marca?.fosca).toBe(false);
      expect(marca?.etiqueta.tom).toBe("atencao");
    });
  });

  test("Cueva saiu do STJ e entrou no STF: o caso reabre, nunca decide pela regra", () => {
    // Arrange / Act
    const [a, ...resto] = autoridadesRepetidas([tseM(CUEVA), stf(CUEVA)], undefined, decisaoCueva);
    // Assert
    expect(resto).toEqual([]);
    expect(a.situacao).toBe("conferir");
    expect(a.motivo).toBe("grupo novo desde a decisão de 26/10");
    expect(a.caso?.nome).toBe(CUEVA);
  });

  test("decisão em três grupos, pessoa hoje em dois deles: vale a decisão, linha do outro grupo fosca", () => {
    // Arrange
    const h = decidir(HISTORICO_VAZIO, CUEVA, manual({
      tipo: "mesma_pessoa", convidaPor: "Ministros do TSE", grupos: ["Ministros do TSE", "Ministros do STJ", "Ministros do STF"],
    }));
    // Act
    const repetidas = autoridadesRepetidas([stj(CUEVA), tseM(CUEVA)], undefined, h);
    // Assert
    expect(repetidas[0].situacao).toBe("decidido_gt");
    expect(etiquetaDeRepeticao(repetidas, linha(CUEVA, "x"), "Ministros do STJ")?.fosca).toBe(true);
  });

  test("link do painel: sem ninguém em dois ou mais grupos, só as decisões do GT", () => {
    // Arrange
    const h = decidir(HISTORICO_VAZIO, "Nunes Marques", manual({ tipo: "mesma_pessoa", convidaPor: "Ministros do TSE", grupos: ["Ministros do STF", "Ministros do TSE"] }));
    // Act / Assert
    expect(textoDoLinkDoPainel(autoridadesRepetidas([tseM("Nunes Marques")], undefined, h))).toBe("Decisões do GT");
    expect(textoDoLinkDoPainel(autoridadesRepetidas([stf(), tse()], undefined, h))).toBe("1 autoridade em mais de um grupo");
    expect(textoDoLinkDoPainel([])).toBeUndefined();
  });

  test("filtros pelas situações novas", () => {
    const h = decidir(decisaoCueva, "Nunes Marques", manual({
      tipo: "mesma_pessoa", convidaPor: "Ministros do TSE", grupos: ["Ministros do STF", "Ministros do TSE"],
    }));
    const lista = autoridadesRepetidas([stj(CUEVA), tseM(CUEVA), tseM("Nunes Marques"), stf(), tse()], undefined, h);
    expect(filtrarRepetidas(lista, "", "decidido_gt").map((a) => a.nome)).toEqual([CUEVA]);
    expect(filtrarRepetidas(lista, "", "tratado").map((a) => a.nome)).toEqual(["Nunes Marques"]);
    expect(filtrarRepetidas(lista, "", "decidido").map((a) => a.nome)).toEqual(["Ana Fictícia"]);
  });

  test("o link conta só quem está em dois ou mais grupos (tratada e não encontrada ficam de fora)", () => {
    // Arrange
    const h = decidir(
      decidir(HISTORICO_VAZIO, "Nunes Marques", manual({ tipo: "mesma_pessoa", convidaPor: "Ministros do TSE", grupos: ["Ministros do STF", "Ministros do TSE"] })),
      "Rui Sumido", manual({ tipo: "mesma_pessoa", convidaPor: "Senadores", grupos: ["Senadores", "Ex-Presidentes do Senado"] }),
    );
    // Act
    const lista = autoridadesRepetidas([tseM("Nunes Marques"), stf(), tse()], undefined, h);
    // Assert
    expect(lista).toHaveLength(3);
    expect(textoLinkRepetidas(lista)).toBe("1 autoridade em mais de um grupo");
  });

  test("pessoa só no grupo que não convida: atenção, sem fosco", () => {
    // Arrange
    const lista = autoridadesRepetidas([stj(CUEVA)], undefined, decisaoCueva);
    // Act
    const marca = etiquetaDeRepeticao(lista, linha(CUEVA, "Ministro"), "Ministros do STJ");
    // Assert
    expect(lista[0]).toMatchObject({ situacao: "decidido_gt", noContatos: "pendente" });
    expect(lista[0].convidaPor).toBeUndefined();
    expect(marca).toEqual({
      etiqueta: expect.objectContaining({ tom: "atencao", texto: "Grupo do convite Ministros do TSE sem a pessoa no Contatos" }),
      fosca: false,
    });
  });

  test("Jader Barbalho: os dois casos valem; o eleito é outra pessoa e o convite é por Senadores", () => {
    // Arrange
    const h = decidir(
      decidir(HISTORICO_VAZIO, "Jader Barbalho", manual({
        tipo: "mesma_pessoa", convidaPor: "Senadores", grupos: ["Ex-Presidentes do Senado", "Senadores"],
      })),
      "Jader Barbalho", manual({
        tipo: "pessoas_diferentes", data: "2026-10-29", outraPessoa: [GRUPO_DEPUTADOS_ELEITOS], grupos: ["Senadores", GRUPO_DEPUTADOS_ELEITOS],
      }),
    );
    const grupos = [exPresidenteSenado("Jader Barbalho"), grupo("Senadores", [linha("Jader Barbalho", "Senador")])];
    const filho = eleito("camara", "Jader Filho", "Jader Fontenelle Barbalho Filho", "PA", [lig("Senadores", "Jader Barbalho")], {
      destino: "novo", grupoDestino: GRUPO_DEPUTADOS_ELEITOS,
    });
    // Act
    const lista = autoridadesRepetidas(grupos, eleicao({ eleitos: [filho] }), h);
    // Assert
    expect(h.casos).toHaveLength(2);
    expect(lista).toHaveLength(1);
    const [jader] = lista;
    expect(jader.situacao).toBe("decidido_gt");
    expect(jader.convidaPor?.grupo).toBe("Senadores");
    expect(jader.ocorrencias.map((o) => o.origem)).not.toContain("eleicao");
    expect(etiquetaDeRepeticao(lista, linha("Jader Barbalho", "Senador"), "Senadores")?.etiqueta.texto)
      .toBe("Convidada por este grupo; também em Ex-Presidentes do Senado (decisão do GT de 26/10)");
    expect(etiquetaDeRepeticao(lista, linha("Jader Barbalho", "x"), "Ex-Presidentes do Senado")?.fosca).toBe(true);
  });

  test("duas decisões que decidem a mesma pessoa ficam para conferir, com o caso mais recente", () => {
    // Arrange
    const h = decidir(decisaoCueva, CUEVA, manual({ tipo: "nao_recebe_convite", data: "2026-10-28", grupos: ["Ministros do STJ"] }));
    // Act
    const [a] = autoridadesRepetidas([stj(CUEVA), tseM(CUEVA)], undefined, h);
    // Assert
    expect(h.casos).toHaveLength(2);
    expect(a.situacao).toBe("conferir");
    expect(a.motivo).toBe("Duas decisões do GT para a mesma pessoa: conferir");
    expect(a.decisao?.tipo).toBe("nao_recebe_convite");
    expect(etiquetaDeRepeticao([a], linha(CUEVA, "x"), "Ministros do STJ")?.etiqueta.tom).toBe("atencao");
  });

  test("duas decisões com o mesmo grupo do convite não são conflito: vale a mais recente", () => {
    // Arrange
    const h = decidir(decisaoCueva, CUEVA, manual({ tipo: "mesma_pessoa", convidaPor: "Ministros do TSE", data: "2026-10-28", grupos: ["Ministros do STJ"] }));
    // Act
    const [a] = autoridadesRepetidas([stj(CUEVA), tseM(CUEVA)], undefined, h);
    // Assert
    expect(h.casos).toHaveLength(2);
    expect(a.situacao).toBe("decidido_gt");
    expect(a.convidaPor?.grupo).toBe("Ministros do TSE");
    expect(a.decisao?.data).toBe("2026-10-28");
  });

  test("ajustar no Contatos fora do cálculo segue a situação no Contatos", () => {
    // Arrange
    const h = decidir(
      decidir(HISTORICO_VAZIO, "Celina Leão", manual({ tipo: "ajustar_contatos", convidaPor: "Governadores", grupos: ["Governadores", "Senadores"] })),
      "Rui Sumido", manual({ tipo: "ajustar_contatos", grupos: ["Senadores", "Ex-Presidentes do Senado"] }),
    );
    // Act
    const lista = autoridadesRepetidas([grupo("Governadores", [linha("Celina Leão", "Governadora")])], undefined, h);
    // Assert
    expect(lista.find((a) => a.nome === "Celina Leão")).toMatchObject({ situacao: "tratado", noContatos: "tratado" });
    expect(lista.find((a) => a.nome === "Rui Sumido")).toMatchObject({ situacao: "tratado", noContatos: "tratado" });
  });
});
