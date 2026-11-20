import { describe, expect, test } from "vitest";
import { analisar, type Dependencias } from "@/lib/analise";
import type { ConteudoFonte, ContatoPlanilha, FonteCatalogo, FonteIndividual, LeiturasGuardadas } from "@/lib/types";
import type { FonteResolvida } from "@/lib/catalogo";

const PROTOCOLO_M = { tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" };
const PADDING = " Texto institucional da página, repetido apenas para a leitura ter conteúdo legível.".repeat(6);

const URL_EX = "https://exemplo.leg.br/ex-presidentes";
const URL_COMP_EX = "https://exemplo.leg.br/senador/perfil/1";
const URL_OUTRA = "https://exemplo.leg.br/outro";
const URL_MIN = "https://exemplo.gov.br/ministros";
const URL_COMP_MIN = "https://exemplo.gov.br/controladoria/quem-e-quem";

const pagina = (url: string, texto: string, pessoas: ConteudoFonte["pessoas"] = []): ConteudoFonte => ({
  url,
  textoLimpo: texto + PADDING,
  destaques: [],
  pessoas,
});

// Ex-Presidentes: a página de grupo traz o nome abreviado; a individual, o nome completo.
const grupoEx = pagina(URL_EX, "Garibaldi Alves Outro Fictício", [{ nome: "Garibaldi Alves" }, { nome: "Outro Fictício" }]);
const compEx = pagina(URL_COMP_EX, "Senador Garibaldi Alves Filho Perfil parlamentar");
const compExSemNome = pagina(URL_COMP_EX, "Perfil parlamentar de outra pessoa qualquer");
const grupoExSemGaribaldi = pagina(URL_EX, "Outro Fictício Terceiro Fictício", [{ nome: "Outro Fictício" }, { nome: "Terceiro Fictício" }]);

const garibaldi: ContatoPlanilha = { nome: "Garibaldi Alves Filho", cargo: "Presidente do Congresso Nacional", grupo: "Ex-Presidentes do Congresso", ...PROTOCOLO_M };
const outro: ContatoPlanilha = { nome: "Outro Fictício", cargo: "Presidente do Congresso Nacional", grupo: "Ex-Presidentes do Congresso", ...PROTOCOLO_M };
const semPagina: ContatoPlanilha = { ...outro, nome: "Sem Página Fictício" };

const complementarEx: FonteIndividual = { url: URL_COMP_EX, ativo: true, chave: { nome: "Garibaldi Alves Filho" }, campos: ["nome"], complementar: true };
const fonteGrupoEx: FonteCatalogo = { url: URL_EX, ativo: true };
const resolvidaEx = (individuais: FonteIndividual[]): FonteResolvida => ({
  grupoCanonico: "Ex-Presidentes do Congresso",
  fontes: [fonteGrupoEx],
  fontesIndividuais: individuais,
  sugestoes: [],
});

// Ministros de Estado: a página do Planalto dá o cargo pela pasta; a da CGU, nome e cargo do ministro.
const grupoMin = pagina(URL_MIN, "Ministro de Estado da Fazenda Beltrano Fazenda Fictício Ministro da Controladoria-Geral da União Fulano Controlador Fictício", [
  { nome: "Beltrano Fazenda Fictício", cargo: "Ministro de Estado da Fazenda" },
  { nome: "Fulano Controlador Fictício", cargo: "Ministro de Estado da Controladoria-Geral da União" },
]);
const compMin = pagina(URL_COMP_MIN, "Fulano Controlador Fictício Ministro da Controladoria-Geral da União", [
  { nome: "Fulano Controlador Fictício", cargo: "Ministro da Controladoria-Geral da União" },
]);
const beltrano: ContatoPlanilha = { nome: "Beltrano Fazenda Fictício", cargo: "Ministro de Estado da Fazenda", grupo: "Ministros de Estado", ...PROTOCOLO_M };
const fulano: ContatoPlanilha = { nome: "Fulano Controlador Fictício", cargo: "Ministro da Controladoria-Geral da União", grupo: "Ministros de Estado", ...PROTOCOLO_M };
const complementarMin: FonteIndividual = {
  url: URL_COMP_MIN,
  ativo: true,
  chave: { nome: "Fulano Controlador Fictício" },
  campos: ["nome", "cargo"],
  navegador: "janela",
  complementar: true,
};
const resolvidaMin: FonteResolvida = { grupoCanonico: "Ministros de Estado", fontes: [{ url: URL_MIN, ativo: true }], fontesIndividuais: [complementarMin], sugestoes: [] };

function deps(resolvida: FonteResolvida, mapa: Record<string, ConteudoFonte | string>, extra: Partial<Dependencias> = {}): Dependencias {
  return {
    resolverFonte: () => resolvida,
    raspar: async (f) => {
      const v = mapa[f.url];
      if (v === undefined) throw new Error(`sem página para ${f.url}`);
      if (typeof v === "string") throw new Error(v);
      return v;
    },
    extrairComposicao: async () => [],
    ...extra,
  };
}

type Resultado = Awaited<ReturnType<typeof analisar>>;
const contato = (r: Resultado, nome: string) => r.grupos[0].contatos.find((c) => c.contato.nome === nome)!;
const campo = (r: Resultado, nome: string, c: "nome" | "cargo") => contato(r, nome).comparacoes.find((x) => x.campo === c);

describe("fonte individual complementar (spec 2026-11-19 v2 §2.3)", () => {
  test("o contato ligado confere o nome pela página dele; os outros saem como no caminho de grupo", async () => {
    const com = await analisar("c.xlsx", [garibaldi, outro], deps(resolvidaEx([complementarEx]), { [URL_EX]: grupoEx, [URL_COMP_EX]: compEx }));
    const sem = await analisar("c.xlsx", [garibaldi, outro], deps(resolvidaEx([]), { [URL_EX]: grupoEx }));
    expect(campo(com, "Garibaldi Alves Filho", "nome")).toMatchObject({ situacao: "confere", fonteUrl: URL_COMP_EX });
    expect(contato(com, "Garibaldi Alves Filho").possivelSaida).toBeUndefined();
    expect(com.grupos[0].contatos.flatMap((c) => c.camposDivergentes.filter((d) => d.campo === "fonte"))).toEqual([]);
    expect(contato(com, "Outro Fictício")).toEqual(contato(sem, "Outro Fictício"));
    expect(com.grupos[0].individuais).toEqual({ lidas: 1, caidas: 0 });
    expect(com.grupos[0].fonteUrl).toBe(URL_EX);
  });

  test("complementar caída: nome não verificado com a URL da página, semáforo do grupo, URL tentada nas falhas", async () => {
    const com = await analisar("c.xlsx", [garibaldi, outro], deps(resolvidaEx([complementarEx]), { [URL_EX]: grupoEx, [URL_COMP_EX]: "HTTP 503" }));
    expect(campo(com, "Garibaldi Alves Filho", "nome")).toMatchObject({ situacao: "nao_verificado", fonteUrl: URL_COMP_EX });
    expect(contato(com, "Garibaldi Alves Filho").possivelSaida).toBeUndefined();
    expect(com.grupos[0].individuais).toEqual({ lidas: 0, caidas: 1 });
    expect(com.falhas?.[URL_COMP_EX]).toBeDefined();
  });

  test("complementar caída: o semáforo é o que o caminho de grupo daria sem a complementar, sem a divergência de nome", async () => {
    const sem = await analisar("c.xlsx", [garibaldi, outro], deps(resolvidaEx([]), { [URL_EX]: grupoEx }));
    const com = await analisar("c.xlsx", [garibaldi, outro], deps(resolvidaEx([complementarEx]), { [URL_EX]: grupoEx, [URL_COMP_EX]: "HTTP 503" }));
    const divergeSemNome = contato(sem, "Garibaldi Alves Filho").camposDivergentes.filter((d) => d.campo !== "nome").length > 0;
    expect(contato(com, "Garibaldi Alves Filho").semaforo).toBe(divergeSemNome ? "amarelo" : "verde");
  });

  test("fora da composição do grupo continua possível saída, mesmo com a página confirmando o nome", async () => {
    const r = await analisar("c.xlsx", [garibaldi, outro], deps(resolvidaEx([complementarEx]), { [URL_EX]: grupoExSemGaribaldi, [URL_COMP_EX]: compEx }));
    expect(contato(r, "Garibaldi Alves Filho")).toMatchObject({ possivelSaida: true, semaforo: "vermelho" });
    // A página confirma o nome, mas a presença é só do grupo: nada é trocado no contato vermelho.
    const c = contato(r, "Garibaldi Alves Filho");
    expect(c.camposDivergentes).toContainEqual({ campo: "nome", valorPlanilha: "Garibaldi Alves Filho" });
    expect(c.comparacoes.find((x) => x.campo === "nome" && x.situacao === "confere")).toBeUndefined();
  });

  test("contato indeterminado pelo grupo (leitura parcial): nada é trocado, a página ainda é lida e tentada", async () => {
    const URL_EX2 = "https://exemplo.leg.br/ex-presidentes-2";
    const resolvida: FonteResolvida = { ...resolvidaEx([complementarEx]), fontes: [fonteGrupoEx, { url: URL_EX2, ativo: true }] };
    const mapa = { [URL_EX]: grupoExSemGaribaldi, [URL_EX2]: "HTTP 503", [URL_COMP_EX]: compEx };
    const com = await analisar("c.xlsx", [garibaldi, outro], deps(resolvida, mapa));
    const sem = await analisar("c.xlsx", [garibaldi, outro], deps({ ...resolvida, fontesIndividuais: [] }, mapa));
    expect(contato(sem, "Garibaldi Alves Filho").semaforo).toBe("indeterminado");
    expect(contato(com, "Garibaldi Alves Filho")).toEqual(contato(sem, "Garibaldi Alves Filho"));
    expect(com.leituras?.[URL_COMP_EX]).toBeDefined();
  });

  test("página lida sem o nome: nada trocado e a observação acrescentada", async () => {
    const com = await analisar("c.xlsx", [garibaldi, outro], deps(resolvidaEx([complementarEx]), { [URL_EX]: grupoEx, [URL_COMP_EX]: compExSemNome }));
    const sem = await analisar("c.xlsx", [garibaldi, outro], deps(resolvidaEx([]), { [URL_EX]: grupoEx }));
    const c = contato(com, "Garibaldi Alves Filho");
    expect(c.comparacoes).toEqual(contato(sem, "Garibaldi Alves Filho").comparacoes);
    expect(c.observacao).toContain(`Página complementar lida, mas o nome não foi encontrado nela: ${URL_COMP_EX}`);
    expect(c.possivelSaida).toBeUndefined();
  });

  test("achado de coerência do grupo no mesmo campo não é trocado nem duplicado pela página complementar", async () => {
    const complementar: FonteIndividual = { ...complementarEx, campos: ["nome", "cargo"] };
    const compCargo = pagina(URL_COMP_EX, "Senador Garibaldi Alves Filho Perfil parlamentar", [{ nome: "Garibaldi Alves Filho", cargo: "Presidente do Congresso Nacional" }]);
    const comEx: ContatoPlanilha = { ...garibaldi, cargo: "Ex-Presidente do Senado" };
    const r = await analisar("c.xlsx", [comEx, outro], deps(resolvidaEx([complementar]), { [URL_EX]: grupoEx, [URL_COMP_EX]: compCargo }));
    const cargos = contato(r, "Garibaldi Alves Filho").comparacoes.filter((x) => x.campo === "cargo");
    expect(cargos.filter((x) => x.achado === "cargo_ex_presidente")).toHaveLength(1);
    const daPagina = cargos.filter((x) => !x.achado);
    expect(daPagina).toHaveLength(1);
    expect(daPagina[0].fonteUrl).toBe(URL_COMP_EX);
    expect(cargos).toHaveLength(2);
  });

  test("Ministros de Estado: o cargo da CGU confere pela página individual; os demais seguem a pasta", async () => {
    const r = await analisar("c.xlsx", [beltrano, fulano], deps(resolvidaMin, { [URL_MIN]: grupoMin, [URL_COMP_MIN]: compMin }));
    expect(campo(r, "Fulano Controlador Fictício", "cargo")).toMatchObject({ situacao: "confere", fonteUrl: URL_COMP_MIN });
    expect(campo(r, "Fulano Controlador Fictício", "nome")).toMatchObject({ situacao: "confere", fonteUrl: URL_COMP_MIN });
    const semCgu = await analisar("c.xlsx", [beltrano, fulano], deps({ ...resolvidaMin, fontesIndividuais: [] }, { [URL_MIN]: grupoMin }));
    expect(contato(r, "Beltrano Fazenda Fictício")).toEqual(contato(semCgu, "Beltrano Fazenda Fictício"));
    expect(campo(r, "Beltrano Fazenda Fictício", "cargo")?.situacao).toBe("confere");
    expect(r.grupos[0].novos).toEqual([]);
  });

  test("memória: complementar caída hoje reaproveita a leitura guardada (leituraDe) e conta em reaproveitadas", async () => {
    const lidaEm = "2026-11-16T15:00:00.000Z";
    const memoria: LeiturasGuardadas = { [URL_COMP_EX]: { url: URL_COMP_EX, lidaEm, conteudo: compEx } };
    const r = await analisar(
      "c.xlsx",
      [garibaldi, outro],
      deps(resolvidaEx([complementarEx]), { [URL_EX]: grupoEx, [URL_COMP_EX]: "HTTP 429" }, { leiturasAnteriores: memoria, agora: () => new Date("2026-11-19T12:00:00.000Z") }),
    );
    expect(contato(r, "Garibaldi Alves Filho").leituraDe).toBe(lidaEm);
    expect(campo(r, "Garibaldi Alves Filho", "nome")).toMatchObject({ situacao: "confere", fonteUrl: URL_COMP_EX });
    expect(r.grupos[0].individuais).toEqual({ lidas: 0, caidas: 0, reaproveitadas: 1 });
    expect(r.leituras?.[URL_COMP_EX]?.lidaEm).toBe(lidaEm);
  });

  test("a leitura boa da complementar entra na memória, junto com a do grupo", async () => {
    const r = await analisar("c.xlsx", [garibaldi, outro], deps(resolvidaEx([complementarEx]), { [URL_EX]: grupoEx, [URL_COMP_EX]: compEx }));
    expect(r.leituras?.[URL_COMP_EX]).toBeDefined();
    expect(r.leituras?.[URL_EX]).toBeDefined();
  });

  test("grupo com uma individual não complementar segue o caminho por contato de hoje", async () => {
    const outraIndividual: FonteIndividual = { url: URL_OUTRA, ativo: true, chave: { nome: "Outro Fictício" }, campos: ["nome"] };
    const r = await analisar(
      "c.xlsx",
      [garibaldi, outro, semPagina],
      deps(resolvidaEx([complementarEx, outraIndividual]), { [URL_COMP_EX]: compEx, [URL_OUTRA]: pagina(URL_OUTRA, "Outro Fictício") }),
    );
    expect(contato(r, "Sem Página Fictício").camposDivergentes.some((d) => d.campo === "fonte")).toBe(true);
    expect(contato(r, "Garibaldi Alves Filho").fonteUrl).toBe(URL_COMP_EX);
  });
});
