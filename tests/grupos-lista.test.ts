import { describe, expect, test } from "vitest";
import { aplicarListas, composicaoDaLista } from "@/lib/grupos-lista";
import { compararContatoSemFonteOficial, MOTIVO_SEM_LISTA } from "@/lib/match";
import { OBSERVACAO_NOME_URNA } from "@/lib/eleitos";
import {
  GRUPO_DEPUTADOS_ELEITOS,
  GRUPO_DEPUTADOS_FEDERAIS,
  GRUPO_GOVERNADORES_ELEITOS,
  GRUPO_SENADORES_ELEITOS,
} from "@/data/grupos-posse";
import type {
  ContatoPlanilha,
  DeputadoAtual,
  EleitoClassificado,
  EleitoPlanilha,
  GovernadorClassificado,
  GovernadorPlanilha,
  ResultadoAnalise,
  ResultadoEleicao,
  ResultadoGrupo,
  ResumoAnalise,
} from "@/lib/types";

const eleito = (over: Partial<EleitoPlanilha> = {}): EleitoPlanilha => ({
  casa: "senado", uf: "PR", nomeUrna: "Deltan Dallagnol", nomeCompleto: "Deltan Martinazzo Dallagnol",
  situacaoTse: "Eleito", statusMandato: "Mandato novo (atual deputado federal)", ...over,
});
const classificado = (e: EleitoPlanilha, grupoDestino: string | undefined): EleitoClassificado => ({
  eleito: e, destino: grupoDestino ? "novo" : "conferir", projecao: false, contatos: [],
  ...(grupoDestino ? { grupoDestino } : {}),
});
const governador = (over: Partial<GovernadorPlanilha> = {}): GovernadorPlanilha => ({
  uf: "ES", nomeUrna: "Joana Fictícia", nomeCompleto: "Joana Maria Fictícia", situacaoTse: "Eleito",
  statusMandato: "Mandato novo", ...over,
});
const govClassificado = (g: GovernadorPlanilha, grupoDestino?: string): GovernadorClassificado => ({
  eleito: g, destino: grupoDestino === GRUPO_GOVERNADORES_ELEITOS ? "novo" : "reeleito", contatos: [],
  ...(grupoDestino ? { grupoDestino } : {}),
});
const deputado = (over: Partial<DeputadoAtual> = {}): DeputadoAtual => ({
  uf: "BA", nomeParlamentar: "Leo Fictício", nomeCivil: "LEONARDO SILVA FICTÍCIO", condicao: "Titular", ...over,
});

const RESUMO_ZERO: ResumoAnalise = {
  total: 0, verde: 0, amarelo: 0, vermelho: 0, novo: 0, indeterminado: 0, enderecosAConfirmar: 0,
  possivelSaida: 0, contatosSemFonte: 0, gruposSemFonte: 0, gruposFonteInacessivel: 0,
  gruposViaPesquisaAmpla: 0, gruposReaproveitados: 0, urlsCaidasRepetidas: 0, gruposComMudanca: 0,
};

/** Grupo `lista` como a análise o entrega (Tarefa 2): todo contato indeterminado, sem a lista. */
const grupoLista = (rotulo: string, contatos: ContatoPlanilha[]): ResultadoGrupo => ({
  grupo: rotulo, semFonte: false, fiscalizacao: "lista",
  contatos: contatos.map((c) => compararContatoSemFonteOficial(c, "lista")), novos: [],
});
const analise = (grupos: ResultadoGrupo[], eleicao?: ResultadoEleicao): ResultadoAnalise => {
  const total = grupos.reduce((n, g) => n + g.contatos.length, 0);
  return {
    arquivoNome: "base.xlsx", grupos,
    resumo: { ...RESUMO_ZERO, total, indeterminado: total },
    ...(eleicao ? { eleicao } : {}),
  };
};
const eleicao = (over: Partial<ResultadoEleicao> = {}): ResultadoEleicao => ({
  arquivos: ["Senadores Eleitos 2026.xlsx"], eleitos: [classificado(eleito(), GRUPO_SENADORES_ELEITOS)],
  camaraNoContatos: false, ...over,
});

/** Tratamento e endereçamento coerentes, para que só nome e cargo decidam o semáforo. */
const SENHOR = { tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" };
const SENHORA = { tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" };

const deltan: ContatoPlanilha = {
  ...SENHOR, id: "1", nome: "Deltan Dallagnol", grupo: GRUPO_SENADORES_ELEITOS, cargo: "Senador", departamento: "PARANÁ",
};
const fulano: ContatoPlanilha = {
  ...SENHOR, id: "2", nome: "Fulano de Tal", grupo: GRUPO_SENADORES_ELEITOS, cargo: "Senador", departamento: "PARANÁ",
};

describe("composicaoDaLista (spec 2026-10-30 §4.6)", () => {
  test("senadores eleitos: só os classificados com esse grupo de destino, com o cargo Senador", () => {
    const outro = classificado(eleito({ nomeUrna: "Beltrano", nomeCompleto: "Beltrano Silva" }), "Senadores");
    const conferir = classificado(eleito({ nomeUrna: "Ciclano", nomeCompleto: "Ciclano Souza" }), undefined);
    const lista = composicaoDaLista(GRUPO_SENADORES_ELEITOS, eleicao({ eleitos: [classificado(eleito(), GRUPO_SENADORES_ELEITOS), outro, conferir] }));
    expect(lista).toEqual([{ nome: "Deltan Dallagnol", nomeCompleto: "Deltan Martinazzo Dallagnol", uf: "PR", cargoEsperado: "Senador" }]);
  });

  test("o rótulo do Contatos com espaço e caixa diferentes acha o mesmo grupo", () => {
    const lista = composicaoDaLista("Senadores Eleitos - Posse Presidencial 2027 ", eleicao());
    expect(lista).toHaveLength(1);
  });

  test("senadora eleita tem o cargo esperado no feminino", () => {
    const e = classificado(eleito({ genero: "Feminino" }), GRUPO_SENADORES_ELEITOS);
    expect(composicaoDaLista(GRUPO_SENADORES_ELEITOS, eleicao({ eleitos: [e] }))?.[0].cargoEsperado).toBe("Senadora");
  });

  test("deputados eleitos: cargo Deputado Federal", () => {
    const e = classificado(eleito({ casa: "camara", uf: "SP", nomeUrna: "Novo Deputado", nomeCompleto: "Novo Deputado Silva" }), GRUPO_DEPUTADOS_ELEITOS);
    const lista = composicaoDaLista(GRUPO_DEPUTADOS_ELEITOS, eleicao({ eleitos: [e] }));
    expect(lista).toEqual([{ nome: "Novo Deputado", nomeCompleto: "Novo Deputado Silva", uf: "SP", cargoEsperado: "Deputado Federal" }]);
  });

  test("governadores eleitos: os de destino novo, com o cargo pela UF por extenso; DF é Distrito Federal", () => {
    const gov = {
      eleitos: [
        govClassificado(governador(), GRUPO_GOVERNADORES_ELEITOS),
        govClassificado(governador({ uf: "DF", nomeUrna: "Gov DF", nomeCompleto: "Gov do DF" }), GRUPO_GOVERNADORES_ELEITOS),
        govClassificado(governador({ uf: "SP", nomeUrna: "Reeleito", nomeCompleto: "Reeleito Silva" }), "Governadores"),
      ],
      segundoTurno: [],
    };
    const lista = composicaoDaLista(GRUPO_GOVERNADORES_ELEITOS, eleicao({ governadores: gov }));
    expect(lista?.map((p) => p.cargoEsperado)).toEqual(["Governador do Estado de Espírito Santo", "Governador do Distrito Federal"]);
  });

  test("Deputados Federais: a lista de exercício da Câmara, nome parlamentar e nome civil", () => {
    const lista = composicaoDaLista(GRUPO_DEPUTADOS_FEDERAIS, eleicao({ deputadosAtuais: [deputado()] }));
    expect(lista).toEqual([{ nome: "Leo Fictício", nomeCompleto: "LEONARDO SILVA FICTÍCIO", uf: "BA", cargoEsperado: "Deputado Federal" }]);
  });

  test("sem a planilha do grupo na varredura não há lista", () => {
    expect(composicaoDaLista(GRUPO_DEPUTADOS_FEDERAIS, eleicao())).toBeUndefined();
    expect(composicaoDaLista(GRUPO_GOVERNADORES_ELEITOS, eleicao())).toBeUndefined();
    expect(composicaoDaLista(GRUPO_DEPUTADOS_ELEITOS, eleicao())).toBeUndefined();
    expect(composicaoDaLista("Senadores", eleicao())).toBeUndefined();
  });
});

describe("aplicarListas (spec 2026-10-30 §4.6)", () => {
  test("contato que casa o eleito da lista do grupo sai verde, sem observação de lista", () => {
    const r = aplicarListas(analise([grupoLista(GRUPO_SENADORES_ELEITOS, [deltan])], eleicao()), "30/10");
    const [c] = r.grupos[0].contatos;
    expect(c.semaforo).toBe("verde");
    expect(c.possivelSaida).toBeUndefined();
    expect(c.observacao).toBeUndefined();
    expect(c.comparacoes.find((x) => x.campo === "nome")).toMatchObject({ situacao: "confere", valorEsperado: "Deltan Dallagnol" });
    expect(c.comparacoes.find((x) => x.campo === "cargo")).toMatchObject({ situacao: "confere", valorEsperado: "Senador" });
    expect(r.resumo).toMatchObject({ verde: 1, indeterminado: 0, total: 1 });
  });

  test("contato que não casa ninguém sai indeterminado, com a lista e a data, nunca possível saída", () => {
    const r = aplicarListas(analise([grupoLista(GRUPO_SENADORES_ELEITOS, [fulano])], eleicao()), "30/10");
    const [c] = r.grupos[0].contatos;
    expect(c.semaforo).toBe("indeterminado");
    expect(c.observacao).toContain("Não está na lista de Senadores eleitos - Posse Presidencial 2027");
    expect(c.observacao).toBe("Não está na lista de Senadores eleitos - Posse Presidencial 2027 (planilha do TSE de 30/10)");
    expect(c.possivelSaida).toBeUndefined();
    expect(r.grupos[0].novos).toEqual([]);
  });

  test("nome igual ao nome completo do TSE confere", () => {
    const r = aplicarListas(analise([grupoLista(GRUPO_SENADORES_ELEITOS, [{ ...deltan, nome: "Deltan Martinazzo Dallagnol" }])], eleicao()), "30/10");
    expect(r.grupos[0].contatos[0].semaforo).toBe("verde");
  });

  test("nome que casa mas difere do de urna e do completo sai amarelo, com o nome de urna esperado", () => {
    const contato = { ...deltan, nome: "Dallagnol Deltan" };
    const r = aplicarListas(analise([grupoLista(GRUPO_SENADORES_ELEITOS, [contato])], eleicao()), "30/10");
    const [c] = r.grupos[0].contatos;
    expect(c.semaforo).toBe("amarelo");
    expect(c.observacao).toBe(OBSERVACAO_NOME_URNA);
    expect(c.camposDivergentes).toContainEqual({ campo: "nome", valorPlanilha: "Dallagnol Deltan", valorEncontrado: "Deltan Dallagnol" });
    expect(r.resumo).toMatchObject({ amarelo: 1, indeterminado: 0 });
  });

  test("cargo de outro papel diverge pelo papel", () => {
    const r = aplicarListas(analise([grupoLista(GRUPO_SENADORES_ELEITOS, [{ ...deltan, cargo: "Deputado Federal" }])], eleicao()), "30/10");
    const [c] = r.grupos[0].contatos;
    expect(c.semaforo).toBe("amarelo");
    expect(c.comparacoes.find((x) => x.campo === "cargo")).toMatchObject({ situacao: "divergente", valorEsperado: "Senador" });
  });

  test("contato de outra UF não casa o eleito", () => {
    const r = aplicarListas(analise([grupoLista(GRUPO_SENADORES_ELEITOS, [{ ...deltan, departamento: "SÃO PAULO" }])], eleicao()), "30/10");
    expect(r.grupos[0].contatos[0].semaforo).toBe("indeterminado");
  });

  test("Deputados Federais: casa pelo nome parlamentar; ausente cita a planilha da Câmara", () => {
    const leo: ContatoPlanilha = { ...SENHOR, nome: "Leo Fictício", grupo: GRUPO_DEPUTADOS_FEDERAIS, cargo: "Deputado Federal", departamento: "BAHIA" };
    const outro: ContatoPlanilha = { ...SENHOR, nome: "Sicrano Inexistente", grupo: GRUPO_DEPUTADOS_FEDERAIS, cargo: "Deputado Federal", departamento: "BAHIA" };
    const r = aplicarListas(analise([grupoLista(GRUPO_DEPUTADOS_FEDERAIS, [leo, outro])], eleicao({ deputadosAtuais: [deputado()] })), "30/10");
    const [a, b] = r.grupos[0].contatos;
    expect(a.semaforo).toBe("verde");
    expect(b.semaforo).toBe("indeterminado");
    expect(b.observacao).toBe("Não está na lista de Deputados Federais (planilha da Câmara de 30/10)");
  });

  test("governador eleito casa pela UF do cargo quando o departamento vem vazio", () => {
    const joana: ContatoPlanilha = { ...SENHORA, nome: "Joana Fictícia", grupo: GRUPO_GOVERNADORES_ELEITOS, cargo: "Governadora do Estado do Espírito Santo - ES" };
    const gov = { eleitos: [govClassificado(governador({ genero: "Feminino" }), GRUPO_GOVERNADORES_ELEITOS)], segundoTurno: [] };
    const r = aplicarListas(analise([grupoLista(GRUPO_GOVERNADORES_ELEITOS, [joana])], eleicao({ governadores: gov })), "30/10");
    expect(r.grupos[0].contatos[0].semaforo).toBe("verde");
  });

  test("preserva endereço e eleição já anexados ao contato", () => {
    const g = grupoLista(GRUPO_SENADORES_ELEITOS, [deltan]);
    const endereco = { situacao: "completo" as const, achados: [], formatado: "Rua X" };
    const eleicaoContato = {
      casa: "senado" as const, destino: "novo" as const, projecao: false, uf: "PR", situacaoTse: "Eleito",
      statusMandato: "Mandato novo", nomeUrna: "Deltan Dallagnol",
    };
    const comExtras = { ...g, contatos: [{ ...g.contatos[0], endereco, eleicao: eleicaoContato }] };
    const r = aplicarListas(analise([comExtras], eleicao()), "30/10");
    expect(r.grupos[0].contatos[0]).toMatchObject({ endereco, eleicao: eleicaoContato, semaforo: "verde" });
  });

  test("grupo lista sem a sua planilha continua indeterminado com o motivo de sem a lista", () => {
    const dep: ContatoPlanilha = { ...SENHOR, nome: "Leo Fictício", grupo: GRUPO_DEPUTADOS_FEDERAIS, cargo: "Deputado Federal", departamento: "BAHIA" };
    const entrada = analise([grupoLista(GRUPO_DEPUTADOS_FEDERAIS, [dep])], eleicao());
    const r = aplicarListas(entrada, "30/10");
    expect(r.grupos[0]).toEqual(entrada.grupos[0]);
    expect(r.grupos[0].contatos[0].observacao).toBe(MOTIVO_SEM_LISTA);
  });

  test("sem eleição no resultado, nada muda: o grupo fica indeterminado com o motivo de sem a lista", () => {
    const entrada = analise([grupoLista(GRUPO_SENADORES_ELEITOS, [deltan])]);
    const r = aplicarListas(entrada, "30/10");
    expect(r).toEqual(entrada);
    expect(r.grupos[0].contatos[0]).toMatchObject({ semaforo: "indeterminado", observacao: MOTIVO_SEM_LISTA });
    expect(r.grupos[0].contatos[0].possivelSaida).toBeUndefined();
  });

  test("grupo de fonte não é tocado, e a entrada não é mutada", () => {
    const fonteGrupo: ResultadoGrupo = { grupo: "Senadores", semFonte: false, contatos: [compararContatoSemFonteOficial(deltan, "lista")], novos: [] };
    const entrada = analise([fonteGrupo, grupoLista(GRUPO_SENADORES_ELEITOS, [deltan])], eleicao());
    const copia = structuredClone(entrada);
    const r = aplicarListas(entrada, "30/10");
    expect(r.grupos[0]).toBe(entrada.grupos[0]);
    expect(entrada).toEqual(copia);
  });
});
