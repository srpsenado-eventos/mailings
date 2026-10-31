import { describe, expect, test } from "vitest";
import {
  aplicarListas,
  composicaoDaLista,
  OBSERVACAO_ELEITO_A_CONFERIR,
  OBSERVACAO_NOME_PARLAMENTAR,
  observacaoNomeAmbiguo,
} from "@/lib/grupos-lista";
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
    expect(lista).toEqual([{ nome: "Deltan Dallagnol", nomeCompleto: "Deltan Martinazzo Dallagnol", uf: "PR", cargoEsperado: "Senador", cargoFeminino: "Senadora" }]);
  });

  test("o rótulo do Contatos com espaço e caixa diferentes acha o mesmo grupo", () => {
    const lista = composicaoDaLista("Senadores Eleitos - Posse Presidencial 2027 ", eleicao());
    expect(lista).toHaveLength(1);
  });

  test("senadora eleita tem o cargo esperado no feminino, sem forma alternativa", () => {
    const e = classificado(eleito({ genero: "Feminino" }), GRUPO_SENADORES_ELEITOS);
    const [p] = composicaoDaLista(GRUPO_SENADORES_ELEITOS, eleicao({ eleitos: [e] })) ?? [];
    expect(p.cargoEsperado).toBe("Senadora");
    expect(p.cargoFeminino).toBeUndefined();
  });

  test("senador eleito com gênero masculino não aceita a forma feminina", () => {
    const e = classificado(eleito({ genero: "Masculino" }), GRUPO_SENADORES_ELEITOS);
    const [p] = composicaoDaLista(GRUPO_SENADORES_ELEITOS, eleicao({ eleitos: [e] })) ?? [];
    expect(p).toMatchObject({ cargoEsperado: "Senador" });
    expect(p.cargoFeminino).toBeUndefined();
  });

  test("deputados eleitos: cargo Deputado Federal", () => {
    const e = classificado(eleito({ casa: "camara", uf: "SP", nomeUrna: "Novo Deputado", nomeCompleto: "Novo Deputado Silva" }), GRUPO_DEPUTADOS_ELEITOS);
    const lista = composicaoDaLista(GRUPO_DEPUTADOS_ELEITOS, eleicao({ eleitos: [e] }));
    expect(lista).toEqual([{ nome: "Novo Deputado", nomeCompleto: "Novo Deputado Silva", uf: "SP", cargoEsperado: "Deputado Federal", cargoFeminino: "Deputada Federal" }]);
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
    expect(lista).toEqual([{ nome: "Leo Fictício", nomeCompleto: "LEONARDO SILVA FICTÍCIO", uf: "BA", cargoEsperado: "Deputado Federal", cargoFeminino: "Deputada Federal" }]);
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

  test("nome igual ao nome completo do TSE acha a pessoa, mas diverge: o esperado é o nome de urna", () => {
    const r = aplicarListas(analise([grupoLista(GRUPO_SENADORES_ELEITOS, [{ ...deltan, nome: "Deltan Martinazzo Dallagnol" }])], eleicao()), "30/10");
    const [c] = r.grupos[0].contatos;
    expect(c.semaforo).toBe("amarelo");
    expect(c.observacao).toBe(OBSERVACAO_NOME_URNA);
    expect(c.comparacoes.find((x) => x.campo === "nome")).toMatchObject({ situacao: "divergente", valorEsperado: "Deltan Dallagnol" });
  });

  test("sem gênero na lista, a forma feminina do cargo também confirma", () => {
    const r = aplicarListas(analise([grupoLista(GRUPO_SENADORES_ELEITOS, [{ ...deltan, ...SENHORA, cargo: "Senadora" }])], eleicao()), "30/10");
    const [c] = r.grupos[0].contatos;
    expect(c.semaforo).toBe("verde");
    expect(c.comparacoes.find((x) => x.campo === "cargo")).toMatchObject({ situacao: "confere", valorEsperado: "Senadora" });
  });

  test("com gênero masculino na lista, o cargo feminino diverge", () => {
    const e = eleicao({ eleitos: [classificado(eleito({ genero: "Masculino" }), GRUPO_SENADORES_ELEITOS)] });
    const r = aplicarListas(analise([grupoLista(GRUPO_SENADORES_ELEITOS, [{ ...deltan, ...SENHORA, cargo: "Senadora" }])], e), "30/10");
    expect(r.grupos[0].contatos[0].comparacoes.find((x) => x.campo === "cargo")).toMatchObject({ situacao: "divergente", valorEsperado: "Senador" });
  });

  test("eleito a conferir cadastrado no grupo sai indeterminado com o motivo próprio, não fora da lista", () => {
    const g = grupoLista(GRUPO_SENADORES_ELEITOS, [fulano]);
    const eleicaoContato = {
      casa: "senado" as const, destino: "conferir" as const, projecao: false, uf: "PR", situacaoTse: "Eleito",
      statusMandato: "Reeleição", nomeUrna: "Fulano de Tal",
    };
    const comConferir = { ...g, contatos: [{ ...g.contatos[0], eleicao: eleicaoContato }] };
    const r = aplicarListas(analise([comConferir], eleicao()), "30/10");
    const [c] = r.grupos[0].contatos;
    expect(c).toMatchObject({ semaforo: "indeterminado", observacao: OBSERVACAO_ELEITO_A_CONFERIR, eleicao: eleicaoContato });
    expect(c.possivelSaida).toBeUndefined();
  });

  test("governador eleito a conferir também sai com o motivo próprio", () => {
    const joana: ContatoPlanilha = { ...SENHORA, nome: "Joana Fictícia", grupo: GRUPO_GOVERNADORES_ELEITOS, cargo: "Governadora do Estado do Espírito Santo - ES" };
    const g = grupoLista(GRUPO_GOVERNADORES_ELEITOS, [joana]);
    const eleicaoGoverno = { destino: "conferir" as const, uf: "ES", situacaoTse: "Eleito", statusMandato: "Mandato novo", nomeUrna: "Joana Fictícia" };
    const gov = { eleitos: [govClassificado(governador(), GRUPO_GOVERNADORES_ELEITOS)], segundoTurno: [] };
    const r = aplicarListas(analise([{ ...g, contatos: [{ ...g.contatos[0], eleicaoGoverno }] }], eleicao({ governadores: gov })), "30/10");
    expect(r.grupos[0].contatos[0]).toMatchObject({ semaforo: "indeterminado", observacao: OBSERVACAO_ELEITO_A_CONFERIR });
  });

  test("em Deputados Federais o deputado atual com eleição a conferir segue a comparação com a lista da Câmara", () => {
    // Arrange
    const leo: ContatoPlanilha = { ...SENHOR, nome: "Leo Fictício", grupo: GRUPO_DEPUTADOS_FEDERAIS, cargo: "Deputado Federal", departamento: "BAHIA" };
    const g = grupoLista(GRUPO_DEPUTADOS_FEDERAIS, [leo]);
    const eleicaoContato = {
      casa: "camara" as const, destino: "conferir" as const, projecao: false, uf: "BA", situacaoTse: "Eleito",
      statusMandato: "Reeleição", nomeUrna: "Leo Fictício",
    };
    const comConferir = { ...g, contatos: [{ ...g.contatos[0], eleicao: eleicaoContato }] };

    // Act
    const r = aplicarListas(analise([comConferir], eleicao({ deputadosAtuais: [deputado()] })), "30/10");

    // Assert
    const [c] = r.grupos[0].contatos;
    expect(c.semaforo).toBe("verde");
    expect(c.observacao).toBeUndefined();
    expect(c.eleicao).toEqual(eleicaoContato);
  });

  test("contato que casa duas pessoas da lista sem nome igual sai indeterminado, sem propor o nome de outra", () => {
    const leo: ContatoPlanilha = { ...SENHOR, nome: "Leo Fictício", grupo: GRUPO_DEPUTADOS_FEDERAIS, cargo: "Deputado Federal", departamento: "BAHIA" };
    const atuais = [
      deputado({ nomeParlamentar: "Leo Fictício Souza", nomeCivil: "LEONARDO FICTÍCIO SOUZA" }),
      deputado({ nomeParlamentar: "Leo Fictício Lima", nomeCivil: "LEONARDO FICTÍCIO LIMA" }),
    ];
    const r = aplicarListas(analise([grupoLista(GRUPO_DEPUTADOS_FEDERAIS, [leo])], eleicao({ deputadosAtuais: atuais })), "30/10");
    const [c] = r.grupos[0].contatos;
    expect(c.semaforo).toBe("indeterminado");
    expect(c.observacao).toBe("Nome casa mais de uma pessoa da lista de Deputados Federais: conferir");
    expect(c.observacao).toBe(observacaoNomeAmbiguo(GRUPO_DEPUTADOS_FEDERAIS));
    expect(c.comparacoes.find((x) => x.campo === "nome")?.valorEsperado).toBeUndefined();
    expect(c.possivelSaida).toBeUndefined();
  });

  test("entre duas pessoas que casam, a única de nome igual é a escolhida", () => {
    const leo: ContatoPlanilha = { ...SENHOR, nome: "Leo Fictício", grupo: GRUPO_DEPUTADOS_FEDERAIS, cargo: "Deputado Federal", departamento: "BAHIA" };
    const atuais = [deputado({ nomeParlamentar: "Leo Fictício Souza", nomeCivil: "LEONARDO FICTÍCIO SOUZA" }), deputado()];
    const r = aplicarListas(analise([grupoLista(GRUPO_DEPUTADOS_FEDERAIS, [leo])], eleicao({ deputadosAtuais: atuais })), "30/10");
    expect(r.grupos[0].contatos[0].semaforo).toBe("verde");
  });

  test("Deputados Federais: nome divergente do parlamentar leva a observação da Câmara, não a do TSE", () => {
    const leo: ContatoPlanilha = { ...SENHOR, nome: "Leonardo Silva Fictício", grupo: GRUPO_DEPUTADOS_FEDERAIS, cargo: "Deputado Federal", departamento: "BAHIA" };
    const r = aplicarListas(analise([grupoLista(GRUPO_DEPUTADOS_FEDERAIS, [leo])], eleicao({ deputadosAtuais: [deputado()] })), "30/10");
    const [c] = r.grupos[0].contatos;
    expect(c.semaforo).toBe("amarelo");
    expect(c.observacao).toBe(OBSERVACAO_NOME_PARLAMENTAR);
    expect(c.comparacoes.find((x) => x.campo === "nome")).toMatchObject({ situacao: "divergente", valorEsperado: "Leo Fictício" });
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

  test("tratamento sem regra na tabela segue julgado pelos pares depois da comparação com a lista (spec 2026-10-30 §3.4)", () => {
    // Arrange: cargo fora da tabela de protocolo; ninguém está na lista do TSE.
    const pessoa = (id: string, nome: string, tratamento: string): ContatoPlanilha => ({
      ...SENHOR, id, nome, tratamento, grupo: GRUPO_SENADORES_ELEITOS, cargo: "Parlamentar Eleito", departamento: "PARANÁ",
    });
    const lote = [pessoa("1", "Ana Um", "Senhor"), pessoa("2", "Bia Dois", "Senhor"), pessoa("3", "Caio Tres", "Senhor"), pessoa("4", "Davi Quatro", "Doutor")];

    // Act
    const r = aplicarListas(analise([grupoLista(GRUPO_SENADORES_ELEITOS, lote)], eleicao()), "30/10");

    // Assert
    const davi = r.grupos[0].contatos[3];
    expect(davi.comparacoes.find((x) => x.campo === "tratamento" && x.origemValor === "pares")).toMatchObject({ situacao: "divergente", valorEsperado: "Senhor" });
    expect(davi.semaforo).toBe("indeterminado");
    expect(davi.possivelSaida).toBeUndefined();
  });
});
