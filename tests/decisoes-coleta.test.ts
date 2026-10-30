import { describe, expect, test } from "vitest";
import { GRUPO_DEPUTADOS_ELEITOS, GRUPO_DEPUTADOS_FEDERAIS, GRUPO_GOVERNADORES, GRUPO_GOVERNADORES_ELEITOS, GRUPO_SENADORES } from "@/data/grupos-posse";
import { HISTORICO_VAZIO, registrar, type CasoDecidido, type RegistroManual } from "@/lib/decisoes";
import { diaDaColeta, gruposAtuaisDoCaso, registrarColetasDoRetrato } from "@/lib/decisoes-coleta";
import type {
  DeputadoAtual, EleitoClassificado, GovernadorClassificado, ResultadoContato, ResultadoEleicao, ResultadoGrupo,
} from "@/lib/types";

const linha = (nome: string): ResultadoContato => ({
  contato: { nome, cargo: "x", grupo: "x" }, semaforo: "verde", score: 1, comparacoes: [], camposDivergentes: [], origem: "oficial",
});
const grupo = (nome: string, nomes: string[]): ResultadoGrupo => ({ grupo: nome, semFonte: false, contatos: nomes.map(linha), novos: [] });

const decisao = (extra: Partial<RegistroManual> = {}): RegistroManual => ({
  tipo: "mesma_pessoa", data: "2026-10-26", quem: "GT", observacao: "", validacao: "validado",
  convidaPor: "Ministros do TSE", grupos: ["Ministros do STJ", "Ministros do TSE"], ...extra,
});

const caso = (nome: string, nomes: string[] = [], r: RegistroManual = decisao()): CasoDecidido =>
  registrar(HISTORICO_VAZIO, nome, nomes, r).casos[0];

const deputado = (nomeParlamentar: string, nomeCivil: string): DeputadoAtual => ({ uf: "PB", nomeParlamentar, nomeCivil });

const eleicaoCom = (extra: Partial<ResultadoEleicao>): ResultadoEleicao => ({ arquivos: [], eleitos: [], camaraNoContatos: false, ...extra });

const eleitoDeputado = (nomeUrna: string, nomeCompleto: string, extra: Partial<EleitoClassificado> = {}): EleitoClassificado => ({
  eleito: { casa: "camara", uf: "SP", nomeUrna, nomeCompleto, situacaoTse: "Eleito", statusMandato: "Novo" },
  destino: "novo", projecao: false, contatos: [{ grupo: "Senadores", nome: nomeUrna }], grupoDestino: GRUPO_DEPUTADOS_ELEITOS, ...extra,
});

const governador = (nomeUrna: string, extra: Partial<GovernadorClassificado> = {}): GovernadorClassificado => ({
  eleito: { uf: "PB", nomeUrna, nomeCompleto: `${nomeUrna} Completo`, situacaoTse: "Eleito", statusMandato: "Reeleito" },
  destino: "reeleito", contatos: [{ grupo: "Governadores", nome: nomeUrna }], grupoDestino: GRUPO_GOVERNADORES, ...extra,
});

describe("gruposAtuaisDoCaso", () => {
  test("pega os grupos do Contatos em que o nome normalizado é chave do caso, em forma equivalente", () => {
    // Arrange: rótulo com espaço no fim e outra caixa cai no rótulo oficial do agrupador
    const c = caso("Ana Fictícia");
    const grupos = [grupo("Ministros do STJ", ["Ana Fictícia"]), grupo("ministros do tse ", ["Dra. Ana Fictícia"]), grupo("Ministros do STF", ["Outra Pessoa"])];
    // Act
    const atuais = gruposAtuaisDoCaso(c, grupos);
    // Assert
    expect(atuais).toEqual(["Ministros do STJ", "Ministros do TSE"]);
  });

  test("acha a pessoa por qualquer forma de nome do caso", () => {
    const c = caso("Ministro Kassio Nunes Marques", ["Nunes Marques"]);
    expect(gruposAtuaisDoCaso(c, [grupo("Ministros do STF", ["Nunes Marques"])])).toEqual(["Ministros do STF"]);
  });

  test("grupo repetido conta uma vez", () => {
    const c = caso("Ana Fictícia");
    expect(gruposAtuaisDoCaso(c, [grupo("Ministros do STJ", ["Ana Fictícia", "Ana Fictícia"]), grupo("Ministros do STJ ", ["Ana Fictícia"])]))
      .toEqual(["Ministros do STJ"]);
  });

  test("deputado da planilha da Câmara vale como Deputados Federais, pelo nome parlamentar ou civil", () => {
    const c = caso("Rui Fictício Lima");
    const eleicao = eleicaoCom({ deputadosAtuais: [deputado("Rui Fictício", "Rui Fictício Lima")] });
    expect(gruposAtuaisDoCaso(c, [grupo(GRUPO_SENADORES, ["Rui Fictício Lima"])], eleicao)).toEqual([GRUPO_SENADORES, GRUPO_DEPUTADOS_FEDERAIS]);
  });

  test("com o grupo Deputados Federais no Contatos, a planilha da Câmara não conta", () => {
    const c = caso("Rui Fictício");
    const eleicao = eleicaoCom({ camaraNoContatos: true, deputadosAtuais: [deputado("Rui Fictício", "Rui Fictício Lima")] });
    expect(gruposAtuaisDoCaso(c, [grupo(GRUPO_SENADORES, ["Rui Fictício"])], eleicao)).toEqual([GRUPO_SENADORES]);
  });

  test("eleito ligado vale como o seu grupo de destino", () => {
    const c = caso("Bia Fictícia");
    const eleicao = eleicaoCom({ eleitos: [eleitoDeputado("Bia Fictícia", "Beatriz Fictícia Souza")] });
    expect(gruposAtuaisDoCaso(c, [grupo(GRUPO_SENADORES, ["Bia Fictícia"])], eleicao)).toEqual([GRUPO_SENADORES, GRUPO_DEPUTADOS_ELEITOS]);
  });

  test("eleito sem ligação ao Contatos, ou sem grupo de destino, não conta", () => {
    const c = caso("Bia Fictícia");
    const eleicao = eleicaoCom({
      eleitos: [
        eleitoDeputado("Bia Fictícia", "Beatriz Fictícia Souza", { contatos: [] }),
        eleitoDeputado("Bia Fictícia", "Beatriz Fictícia Souza", { destino: "conferir", grupoDestino: undefined }),
      ],
    });
    expect(gruposAtuaisDoCaso(c, [], eleicao)).toEqual([]);
  });

  test("governador eleito ligado entra pelo nome completo", () => {
    const c = caso("Lu Fictício Completo");
    const eleicao = eleicaoCom({ governadores: { eleitos: [governador("Lu Fictício", { grupoDestino: GRUPO_GOVERNADORES_ELEITOS })], segundoTurno: [] } });
    expect(gruposAtuaisDoCaso(c, [], eleicao)).toEqual([GRUPO_GOVERNADORES_ELEITOS]);
  });

  test("ocorrência marcada como outra pessoa fica de fora (caso Lucas Ribeiro)", () => {
    // Arrange: mesma pessoa em Governadores e Governadores eleitos; o deputado da Câmara é outro
    const c = caso("Lu Fictício", ["Lu Fictício Completo"], decisao({
      convidaPor: GRUPO_GOVERNADORES, grupos: [GRUPO_GOVERNADORES, GRUPO_GOVERNADORES_ELEITOS, GRUPO_DEPUTADOS_FEDERAIS],
      outraPessoa: [GRUPO_DEPUTADOS_FEDERAIS],
    }));
    const eleicao = eleicaoCom({
      deputadosAtuais: [deputado("Lu Fictício", "Pedro Lu Fictício")],
      governadores: { eleitos: [governador("Lu Fictício")], segundoTurno: [] },
    });
    // Act
    const atuais = gruposAtuaisDoCaso(c, [grupo("Governadores ", ["Lu Fictício"])], eleicao);
    // Assert
    expect(atuais).toEqual([GRUPO_GOVERNADORES]);
  });
});

describe("diaDaColeta", () => {
  test("data da varredura no fuso de Brasília", () => {
    expect(diaDaColeta("2026-10-30T14:00:00.000Z")).toBe("2026-10-30");
    expect(diaDaColeta("2026-10-31T02:00:00.000Z")).toBe("2026-10-30");
  });
});

describe("registrarColetasDoRetrato", () => {
  test("acrescenta a coleta com a data da varredura e os grupos atuais", () => {
    // Arrange
    const h = registrar(HISTORICO_VAZIO, "Ana Fictícia", [], decisao());
    const retrato = { geradoEm: "2026-10-31T01:00:00.000Z", grupos: [grupo("Ministros do TSE", ["Ana Fictícia"])] };
    // Act
    const novo = registrarColetasDoRetrato(h, retrato);
    // Assert
    expect(novo.casos[0].registros.at(-1)).toEqual({ tipo: "coleta", data: "2026-10-30", situacao: "tratado", grupos: ["Ministros do TSE"] });
  });

  test("sem mudança de situação devolve o mesmo histórico", () => {
    const h = registrar(HISTORICO_VAZIO, "Ana Fictícia", [], decisao());
    const retrato = { geradoEm: "2026-10-30T14:00:00.000Z", grupos: [grupo("Ministros do TSE", ["Ana Fictícia"])] };
    const uma = registrarColetasDoRetrato(h, retrato);
    expect(registrarColetasDoRetrato(uma, retrato)).toBe(uma);
  });

  test("histórico vazio volta como está", () => {
    expect(registrarColetasDoRetrato(HISTORICO_VAZIO, { geradoEm: "2026-10-30T14:00:00.000Z", grupos: [] })).toBe(HISTORICO_VAZIO);
  });
});
