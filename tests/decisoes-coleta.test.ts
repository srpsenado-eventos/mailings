import { describe, expect, test } from "vitest";
import {
  GRUPO_DEPUTADOS_ELEITOS, GRUPO_DEPUTADOS_FEDERAIS, GRUPO_GOVERNADORES, GRUPO_GOVERNADORES_ELEITOS, GRUPO_SENADORES, GRUPO_SENADORES_ELEITOS,
} from "@/data/grupos-posse";
import { situacaoDoCaso } from "@/lib/decisoes";
import { HISTORICO_VAZIO, registrar, type CasoDecidido, type RegistroManual } from "@/lib/decisoes";
import {
  AVISO_DECISOES_NAO_ATUALIZADAS, avisoDoParametro, diaDaColeta, gruposAtuaisDoCaso, registrarColetasDoRetrato, rotaDepoisDaVarredura,
} from "@/lib/decisoes-coleta";
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

  test("a planilha da Câmara é lista de fora e não entra nos grupos atuais", () => {
    const c = caso("Rui Fictício Lima");
    const eleicao = eleicaoCom({ deputadosAtuais: [deputado("Rui Fictício", "Rui Fictício Lima")] });
    expect(gruposAtuaisDoCaso(c, [grupo(GRUPO_SENADORES, ["Rui Fictício Lima"])], eleicao)).toEqual([GRUPO_SENADORES]);
  });

  test("eleito ligado entra pelos grupos do Contatos a que está ligado, nunca pelo grupo de destino", () => {
    // Arrange: ligado a uma linha de Senadores; o destino (Deputados eleitos) é lista de fora
    const c = caso("Bia Fictícia");
    const eleicao = eleicaoCom({ eleitos: [eleitoDeputado("Bia Fictícia", "Beatriz Fictícia Souza", { contatos: [{ grupo: "senadores ", nome: "Bia Fictícia" }] })] });
    // Act
    const atuais = gruposAtuaisDoCaso(c, [], eleicao);
    // Assert
    expect(atuais).toEqual([GRUPO_SENADORES]);
  });

  test("eleito sem ligação ao Contatos não acrescenta grupo", () => {
    const c = caso("Bia Fictícia");
    const eleicao = eleicaoCom({ eleitos: [eleitoDeputado("Bia Fictícia", "Beatriz Fictícia Souza", { contatos: [] })] });
    expect(gruposAtuaisDoCaso(c, [], eleicao)).toEqual([]);
  });

  test("governador eleito ligado entra pelo nome completo, com os grupos do Contatos dele", () => {
    const c = caso("Lu Fictício Completo");
    const eleicao = eleicaoCom({ governadores: { eleitos: [governador("Lu Fictício", { grupoDestino: GRUPO_GOVERNADORES_ELEITOS })], segundoTurno: [] } });
    expect(gruposAtuaisDoCaso(c, [], eleicao)).toEqual([GRUPO_GOVERNADORES]);
  });

  test("ocorrência marcada como outra pessoa fica de fora (caso Lucas Ribeiro)", () => {
    // Arrange: a linha de Deputados Federais casou pelo nome, mas é outra pessoa
    const c = caso("Lu Fictício", ["Lu Fictício Completo"], decisao({
      convidaPor: GRUPO_GOVERNADORES, grupos: [GRUPO_GOVERNADORES, GRUPO_GOVERNADORES_ELEITOS, GRUPO_DEPUTADOS_FEDERAIS],
      outraPessoa: [GRUPO_DEPUTADOS_FEDERAIS],
    }));
    const eleicao = eleicaoCom({
      deputadosAtuais: [deputado("Lu Fictício", "Pedro Lu Fictício")],
      governadores: { eleitos: [governador("Lu Fictício")], segundoTurno: [] },
    });
    // Act
    const atuais = gruposAtuaisDoCaso(c, [grupo("Governadores ", ["Lu Fictício"]), grupo(GRUPO_DEPUTADOS_FEDERAIS, ["Lu Fictício"])], eleicao);
    // Assert
    expect(atuais).toEqual([GRUPO_GOVERNADORES]);
  });

  describe("eleito decidido para Senadores eleitos (caso Deltan)", () => {
    const decidido = () => caso("Deltan Fictício", [], decisao({
      convidaPor: GRUPO_SENADORES_ELEITOS, grupos: [GRUPO_SENADORES_ELEITOS],
    }));
    const eleicao = (contatos: { grupo: string; nome: string }[]) => eleicaoCom({
      eleitos: [{
        eleito: { casa: "senado", uf: "PR", nomeUrna: "Deltan Fictício", nomeCompleto: "Deltan Fictício Completo", situacaoTse: "Eleito", statusMandato: "Novo" },
        destino: "novo", projecao: false, contatos, grupoDestino: GRUPO_SENADORES_ELEITOS,
      }],
    });

    test("ainda não cadastrado: nenhum grupo atual, pendente no Contatos", () => {
      const c = decidido();
      const atuais = gruposAtuaisDoCaso(c, [], eleicao([]));
      expect(atuais).toEqual([]);
      expect(situacaoDoCaso(c, atuais)).toBe("pendente");
    });

    test("cadastrado no grupo de destino: tratado no Contatos", () => {
      const c = decidido();
      const grupos = [grupo(GRUPO_SENADORES_ELEITOS, ["Deltan Fictício"])];
      const atuais = gruposAtuaisDoCaso(c, grupos, eleicao([{ grupo: GRUPO_SENADORES_ELEITOS, nome: "Deltan Fictício" }]));
      expect(atuais).toEqual([GRUPO_SENADORES_ELEITOS]);
      expect(situacaoDoCaso(c, atuais)).toBe("tratado");
    });
  });
});

describe("aviso das decisões depois da varredura", () => {
  test("sem aviso, a tela volta ao painel", () => {
    expect(rotaDepoisDaVarredura(undefined)).toBe("/");
  });

  test("com aviso, o painel recebe só a marca na URL e mostra o texto fixo", () => {
    const rota = rotaDepoisDaVarredura(AVISO_DECISOES_NAO_ATUALIZADAS);
    const parametro = new URL(rota, "http://localhost").searchParams.get("aviso") ?? undefined;
    expect(rota).not.toContain(" ");
    expect(avisoDoParametro(parametro)).toBe(AVISO_DECISOES_NAO_ATUALIZADAS);
  });

  test("parâmetro desconhecido ou ausente não vira aviso", () => {
    expect(avisoDoParametro(undefined)).toBeUndefined();
    expect(avisoDoParametro("<script>")).toBeUndefined();
    expect(avisoDoParametro(["decisoes", "x"])).toBe(AVISO_DECISOES_NAO_ATUALIZADAS);
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
