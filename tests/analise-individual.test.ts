import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { analisar, MOTIVO_LEITURA_SUSPEITA, type Dependencias } from "@/lib/analise";
import { OBSERVACAO_SEM_INDIVIDUAL } from "@/lib/match";
import { extrairConteudo } from "@/lib/scrape";
import type { ContatoPlanilha, ConteudoFonte, FonteIndividual, FonteCatalogo } from "@/lib/types";
import type { FonteResolvida } from "@/lib/catalogo";

const fixture = (nome: string) => readFileSync(resolve(__dirname, `fixtures/${nome}`), "utf-8");
const PROTOCOLO_F = { tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" };
const PROTOCOLO_M = { tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" };

const URL_GERAL = "https://www.gov.br/planalto/pt-br/conheca-a-presidencia/ministros-e-ministras";
const URL_MIN = "https://www.gov.br/exemplo/pt-br/composicao/ministra";
const URL_GO = "https://go.gov.br/governador";
const URL_RS = "https://rs.gov.br/governadoria";

const geral: FonteCatalogo = { url: URL_GERAL, ativo: true, campos: ["cargo"], casamento: "cargo", navegador: "janela" };
const individuaisMin: FonteIndividual[] = [
  { url: URL_MIN, ativo: true, chave: { nome: "Ana Maria Política Completa" }, campos: ["nome"], navegador: "janela" },
];
const individuaisGov: FonteIndividual[] = [
  { url: URL_GO, ativo: true, chave: { uf: "GO" }, campos: ["nome", "cargo"] },
  { url: URL_RS, ativo: true, chave: { uf: "RS" }, campos: ["nome", "cargo"] },
];

const ministra: ContatoPlanilha = { nome: "Ana Maria Política Completa", cargo: "Ministra de Estado do Exemplo", grupo: "Ministros de Estado", ...PROTOCOLO_F };
const ministroSemIndividual: ContatoPlanilha = { nome: "Beltrano Sem Página", cargo: "Ministro de Estado da Fazenda", grupo: "Ministros de Estado", ...PROTOCOLO_M };
const govGo: ContatoPlanilha = { nome: "João Carlos Destaque Silva", cargo: "Governador do Estado de Goiás", grupo: "Governadores", ...PROTOCOLO_M };
const govRs: ContatoPlanilha = { nome: "Pedro Paulo Sul Alegre", cargo: "Governador do Estado do Rio Grande do Sul", grupo: "Governadores", ...PROTOCOLO_M };
const govMt: ContatoPlanilha = { nome: "Fulano Sem Fonte", cargo: "Governador do Estado de Mato Grosso", grupo: "Governadores", ...PROTOCOLO_M };

const paginaMin = extrairConteudo(fixture("ministerio-individual.html"), URL_MIN);
const paginaGeral: ConteudoFonte = {
  url: URL_GERAL,
  textoLimpo: "Ministra de Estado do Exemplo Ana Maria Política Completa Ministro de Estado da Fazenda Fulano Fazenda",
  destaques: [],
  pessoas: [{ nome: "Ana Maria Política Completa", cargo: "Ministra de Estado do Exemplo" }, { nome: "Fulano Fazenda", cargo: "Ministro de Estado da Fazenda" }],
};
const paginaGo = extrairConteudo(fixture("governo-estadual.html"), URL_GO);
const paginaRs: ConteudoFonte = { ...extrairConteudo(fixture("governo-estadual.html"), URL_RS), pessoas: [{ nome: "Pedro Paulo Sul Alegre", cargo: "Governador do Estado do Rio Grande do Sul" }], textoLimpo: `${paginaGo.textoLimpo} Pedro Paulo Sul Alegre`.replace("João Carlos Destaque Silva", "Outro Governador Qualquer") };

function resolver(ministros: FonteResolvida, governadores: FonteResolvida): Dependencias["resolverFonte"] {
  return (grupo) => (grupo === "Ministros de Estado" ? ministros : grupo === "Governadores" ? governadores : { fontes: [], fontesIndividuais: [], sugestoes: [] });
}
const RESOLVIDA_MIN: FonteResolvida = { grupoCanonico: "Ministros de Estado", fontes: [geral], fontesIndividuais: individuaisMin, sugestoes: [] };
const RESOLVIDA_GOV: FonteResolvida = { grupoCanonico: "Governadores", fontes: [], fontesIndividuais: individuaisGov, sugestoes: [] };

/** Raspador por URL: conteúdo, ou erro quando o valor é uma mensagem. */
function rasparDe(mapa: Record<string, ConteudoFonte | string>): Dependencias["raspar"] {
  return async (fonte) => {
    const v = mapa[fonte.url];
    if (v === undefined) throw new Error(`sem página para ${fonte.url}`);
    if (typeof v === "string") throw new Error(v);
    return v;
  };
}

function deps(mapa: Record<string, ConteudoFonte | string>, extra: Partial<Dependencias> = {}): Dependencias {
  return { resolverFonte: resolver(RESOLVIDA_MIN, RESOLVIDA_GOV), raspar: rasparDe(mapa), extrairComposicao: async () => [], ...extra };
}

describe("analisar com fontes individuais (spec 2026-10-15 §4 e §5.5)", () => {
  test("ministro: individual lida e geral lida → verde; grupo lido, fonteUrl é a geral, individuais contadas", async () => {
    const r = await analisar("c.xlsx", [ministra], deps({ [URL_MIN]: paginaMin, [URL_GERAL]: paginaGeral }));
    const g = r.grupos[0];
    expect(g).toMatchObject({ semFonte: false, fonteUrl: URL_GERAL, individuais: { lidas: 1, caidas: 0 } });
    expect(g.fonteInacessivel).toBeUndefined();
    expect(g.erroFonte).toBeUndefined();
    expect(g.contatos[0].semaforo).toBe("verde");
    expect(g.contatos[0].fonteUrl).toBe(URL_MIN);
    expect(r.resumo.gruposSemFonte).toBe(0);
  });

  test("ministro: geral caiu → cargo não verificado, verde pelo nome, erroFonte identifica a geral pela URL", async () => {
    const r = await analisar("c.xlsx", [ministra], deps({ [URL_MIN]: paginaMin, [URL_GERAL]: "HTTP 403" }));
    const g = r.grupos[0];
    expect(g.contatos[0].semaforo).toBe("verde");
    expect(g.contatos[0].comparacoes.find((c) => c.campo === "cargo")?.situacao).toBe("nao_verificado");
    expect(g.erroFonte).toBe(`${URL_GERAL}: HTTP 403`);
    expect(g.fonteInacessivel).toBeUndefined();
  });

  test("ministro: individual caiu e geral lida → indeterminado, cargo conferido, individuais 0/1", async () => {
    const r = await analisar("c.xlsx", [ministra], deps({ [URL_MIN]: "navegador: tempo esgotado", [URL_GERAL]: paginaGeral }));
    const g = r.grupos[0];
    expect(g.contatos[0].semaforo).toBe("indeterminado");
    expect(g.contatos[0].possivelSaida).toBeUndefined();
    expect(g.contatos[0].comparacoes.find((c) => c.campo === "cargo")?.situacao).toBe("confere");
    expect(g.individuais).toEqual({ lidas: 0, caidas: 1 });
    expect(g.erroFonte).toBe(`${URL_MIN}: navegador: tempo esgotado`);
    expect(g.fonteInacessivel).toBeUndefined();
  });

  test("nenhuma fonte lida (CAPTCHA em todas) → grupo inacessível, todos indeterminados, nunca saída", async () => {
    const captcha = (url: string): ConteudoFonte => ({ url, textoLimpo: "What code is in the image?", destaques: [], pessoas: [] });
    const r = await analisar("c.xlsx", [ministra, ministroSemIndividual], deps({ [URL_MIN]: captcha(URL_MIN), [URL_GERAL]: captcha(URL_GERAL) }));
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBe(true);
    expect(g.contatos.every((c) => c.semaforo === "indeterminado" && !c.possivelSaida)).toBe(true);
    expect(g.erroFonte).toContain("1 página individual inacessível");
    expect(r.resumo.gruposFonteInacessivel).toBe(1);
  });

  test("ministro sem individual: indeterminado, cargo pela geral, observação própria; não conta como sem fonte", async () => {
    const r = await analisar("c.xlsx", [ministroSemIndividual], deps({ [URL_GERAL]: paginaGeral }));
    const c = r.grupos[0].contatos[0];
    expect(c).toMatchObject({ semaforo: "indeterminado", observacao: OBSERVACAO_SEM_INDIVIDUAL });
    expect(c.comparacoes.find((x) => x.campo === "cargo")).toMatchObject({ situacao: "confere", fonteUrl: URL_GERAL });
    expect(r.resumo.contatosSemFonte).toBe(0);
    expect(r.grupos[0].individuais).toEqual({ lidas: 0, caidas: 0 });
  });

  test("governadores: cada um pela sua página; sem individual (MT) é vermelho 'cadastrar fonte' e conta em contatosSemFonte; grupo sem fonteUrl", async () => {
    const r = await analisar("c.xlsx", [govGo, govRs, govMt], deps({ [URL_GO]: paginaGo, [URL_RS]: paginaRs }));
    const g = r.grupos[0];
    expect(g.semFonte).toBe(false);
    expect(g.fonteUrl).toBeUndefined();
    const [go, rs, mt] = g.contatos;
    expect(go.semaforo).toBe("verde");
    expect(go.fonteUrl).toBe(URL_GO);
    expect(rs.semaforo).toBe("verde");
    expect(rs.comparacoes.find((c) => c.campo === "cargo")?.situacao).toBe("confere");
    expect(mt.semaforo).toBe("vermelho");
    expect(mt.possivelSaida).toBeUndefined();
    expect(mt.camposDivergentes[0].campo).toBe("fonte");
    expect(mt.observacao).toBe("Sem fonte individual para a UF MT");
    expect(r.resumo.contatosSemFonte).toBe(1);
    expect(r.resumo.gruposSemFonte).toBe(0);
    expect(g.individuais).toEqual({ lidas: 2, caidas: 0 });
  });

  test("governador que saiu: página lida sem o nome → possível saída, com o novo titular em novos", async () => {
    const trocada: ConteudoFonte = { ...paginaGo, pessoas: [{ nome: "Novo Titular do Estado", cargo: "Governador" }], textoLimpo: paginaGo.textoLimpo.replace("João Carlos Destaque Silva", "Novo Titular do Estado") };
    const r = await analisar("c.xlsx", [govGo, govRs], deps({ [URL_GO]: trocada, [URL_RS]: paginaRs }));
    const g = r.grupos[0];
    expect(g.contatos[0]).toMatchObject({ semaforo: "vermelho", possivelSaida: true });
    expect(g.novos.map((n) => [n.nome, n.fonteUrl])).toEqual([["Novo Titular do Estado", URL_GO]]);
    expect(r.resumo.possivelSaida).toBe(1);
  });

  test("guarda de grupo: duas individuais lidas e nenhuma confirma o nome → leitura suspeita, sem novos", async () => {
    const semGo: ConteudoFonte = { ...paginaGo, pessoas: [], textoLimpo: paginaGo.textoLimpo.replace("João Carlos Destaque Silva", "Alguém Diferente Aqui") };
    const semRs: ConteudoFonte = { ...paginaRs, pessoas: [], textoLimpo: paginaRs.textoLimpo.replace("Pedro Paulo Sul Alegre", "Outra Pessoa Lá") };
    const r = await analisar("c.xlsx", [govGo, govRs], deps({ [URL_GO]: semGo, [URL_RS]: semRs }));
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBe(true);
    expect(g.erroFonte).toBe(MOTIVO_LEITURA_SUSPEITA);
    expect(g.contatos.every((c) => c.semaforo === "indeterminado" && !c.possivelSaida)).toBe(true);
    expect(g.novos).toEqual([]);
  });

  test("uma individual lida sem o nome, com só uma lida no grupo, continua saída (a guarda exige duas)", async () => {
    const semGo: ConteudoFonte = { ...paginaGo, pessoas: [], textoLimpo: paginaGo.textoLimpo.replace("João Carlos Destaque Silva", "Alguém Diferente Aqui") };
    const r = await analisar("c.xlsx", [govGo, govRs], deps({ [URL_GO]: semGo, [URL_RS]: "HTTP 500" }));
    expect(r.grupos[0].contatos[0].possivelSaida).toBe(true);
    expect(r.grupos[0].contatos[1].semaforo).toBe("indeterminado");
  });

  test("duas ligações à mesma URL leem a página uma vez; individual sem contato não é lida", async () => {
    const raspar = vi.fn(rasparDe({ [URL_GO]: paginaGo, [URL_RS]: paginaRs }));
    const outroGo: ContatoPlanilha = { ...govGo, nome: "Vice Governador de Goiás" };
    await analisar("c.xlsx", [govGo, outroGo], deps({}, { raspar }));
    expect(raspar.mock.calls.map((c) => c[0].url)).toEqual([URL_GO]);
  });

  test("IA não é chamada para grupo cuja primária é lista de cargos", async () => {
    const extrairComposicao = vi.fn(async () => []);
    await analisar("c.xlsx", [ministra], deps({ [URL_MIN]: paginaMin, [URL_GERAL]: paginaGeral }, { extrairComposicao }));
    expect(extrairComposicao).not.toHaveBeenCalled();
  });

  test("erroFonte e observações nunca trazem nome de contato", async () => {
    const r = await analisar("c.xlsx", [ministra, govGo], deps({ [URL_MIN]: "HTTP 403", [URL_GERAL]: "HTTP 403", [URL_GO]: "HTTP 403" }));
    const textos = r.grupos.flatMap((g) => [g.erroFonte ?? "", ...g.contatos.map((c) => c.observacao ?? "")]).join(" ");
    expect(textos).not.toContain("Ana Maria");
    expect(textos).not.toContain("João Carlos");
  });
});
