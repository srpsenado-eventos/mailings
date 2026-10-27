import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  compararCargoNaLista,
  compararContatoIndividual,
  compararContatoSemIndividual,
  listaDeCargos,
  marcarFonteInacessivel,
  MIN_TEXTO_PAGINA_INDIVIDUAL,
  MOTIVO_PAGINA_INDIVIDUAL_SEM_CONTEUDO,
  nomeNaPagina,
  novosForaDaPlanilha,
  OBSERVACAO_NAO_CONSTA_INDIVIDUAL,
  OBSERVACAO_NOME_VAZIO_INDIVIDUAL,
  OBSERVACAO_SEM_INDIVIDUAL,
  paginaComConteudo,
} from "@/lib/match";
import { extrairConteudo } from "@/lib/scrape";
import type { ContatoPlanilha, ConteudoFonte, FonteIndividual } from "@/lib/types";

const fixture = (nome: string) => readFileSync(resolve(__dirname, `fixtures/${nome}`), "utf-8");
const ministerio = extrairConteudo(fixture("ministerio-individual.html"), "https://www.gov.br/exemplo/pt-br/composicao/ministra");
const estado = extrairConteudo(fixture("governo-estadual.html"), "https://www.exemplar.gov.br/governo");

/** Contato com protocolo coerente: o que está sob teste é o site, não a tabela de tratamentos. */
function contato(p: Partial<ContatoPlanilha>): ContatoPlanilha {
  return { nome: "", grupo: "G", tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora", ...p };
}
const ministra = contato({ nome: "Ana Maria Política Completa", cargo: "Ministra de Estado do Exemplo" });
const governador = contato({ nome: "João Carlos Destaque Silva", cargo: "Governador do Estado Exemplar", tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" });

const indNome: FonteIndividual = { url: ministerio.url, ativo: true, chave: { nome: ministra.nome }, campos: ["nome"], navegador: "janela" };
const indNomeCargo: FonteIndividual = { url: estado.url, ativo: true, chave: { uf: "EX" }, campos: ["nome", "cargo"] };
const LISTA = { url: "https://www.gov.br/planalto/lista", cargos: ["Ministra de Estado do Exemplo", "Ministro de Estado da Fazenda", "Ministro de Estado das Cidades"] };

const captcha: ConteudoFonte = { url: ministerio.url, textoLimpo: "This question is for testing whether you are a human visitor. What code is in the image?", destaques: [], pessoas: [] };

describe("paginaComConteudo e nomeNaPagina", () => {
  test("fixture do ministério tem conteúdo e traz a pessoa estruturada", () => {
    expect(paginaComConteudo(ministerio)).toBe(true);
    expect(nomeNaPagina("Ministra ANA MARIA POLÍTICA COMPLETA", ministerio)?.pessoa?.nome).toBe("Ana Maria Política Completa");
  });

  test("fixture do governo confirma o nome pelo texto corrido, mesmo sem pessoa estruturada", () => {
    expect(paginaComConteudo(estado)).toBe(true);
    expect(nomeNaPagina("João Carlos Destaque Silva", estado)).toBeDefined();
    const soTexto: ConteudoFonte = { ...estado, pessoas: [] };
    const achado = nomeNaPagina("João Carlos Destaque Silva", soTexto);
    expect(achado).toBeDefined();
    expect(achado?.pessoa).toBeUndefined();
  });

  test("nome mais curto que o da página é reconhecido como não exato; outro nome não é confirmado; CAPTCHA é página sem conteúdo", () => {
    expect(nomeNaPagina("João Carlos Silva", estado)).toMatchObject({ exato: false, nomeNaPagina: "João Carlos Destaque Silva" });
    expect(nomeNaPagina("João Carlos Destaque Silva", estado)?.exato).toBe(true);
    expect(nomeNaPagina("Fulano de Tal", ministerio)).toBeUndefined();
    expect(captcha.textoLimpo.length).toBeLessThan(MIN_TEXTO_PAGINA_INDIVIDUAL);
    expect(paginaComConteudo(captcha)).toBe(false);
  });
});

describe("nome mais longo na página (decisão R9, spec §9)", () => {
  const ENCHIMENTO = " Página institucional do ministério, com a agenda, a biografia, os contatos do gabinete e as notícias recentes da pasta.".repeat(4);
  const paginaCom = (trecho: string): ConteudoFonte => ({
    url: ministerio.url,
    textoLimpo: `Ministro de Estado ${trecho}, nomeado em janeiro.${ENCHIMENTO}`,
    destaques: [],
    pessoas: [],
  });
  const fonte: FonteIndividual = { ...indNome, chave: { nome: "Guilherme Boulos" } };

  test("nome mais longo na página (nomes do meio a mais) reconhece a pessoa e marca nome divergente com o nome da página", () => {
    const conteudo = paginaCom("Guilherme Castro Boulos");
    expect(conteudo.textoLimpo.length).toBeGreaterThanOrEqual(MIN_TEXTO_PAGINA_INDIVIDUAL);
    const v = compararContatoIndividual({ contato: contato({ nome: "Guilherme Boulos" }), fonte, lida: { conteudo } });
    expect(v.resultado.semaforo).toBe("amarelo");
    expect(v.resultado.possivelSaida).toBeUndefined();
    expect(v.nomeConfirmado).toBe(true);
    expect(v.resultado.comparacoes.find((c) => c.campo === "nome")).toMatchObject({
      situacao: "divergente", valorEsperado: "Guilherme Castro Boulos", origemValor: "pagina", fonteUrl: ministerio.url,
    });
    expect(v.resultado.camposDivergentes).toContainEqual({ campo: "nome", valorPlanilha: "Guilherme Boulos", valorEncontrado: "Guilherme Castro Boulos" });
  });

  test("nome mais longo numa pessoa estruturada da página: divergente com o nome dela", () => {
    const conteudo: ConteudoFonte = { ...paginaCom("Fulano Qualquer"), pessoas: [{ nome: "Paulo Henrique Rodrigues Pereira", cargo: "Ministro de Estado" }] };
    const achado = nomeNaPagina("Paulo Henrique Pereira", conteudo);
    expect(achado).toMatchObject({ exato: false, nomeNaPagina: "Paulo Henrique Rodrigues Pereira" });
    expect(achado?.pessoa?.cargo).toBe("Ministro de Estado");
    const v = compararContatoIndividual({ contato: contato({ nome: "Paulo Henrique Pereira" }), fonte, lida: { conteudo } });
    expect(v.resultado.comparacoes.find((c) => c.campo === "nome")).toMatchObject({ situacao: "divergente", valorEsperado: "Paulo Henrique Rodrigues Pereira" });
    expect(v.nomeConfirmado).toBe(true);
  });

  test("janela longa demais (mais de três nomes a mais) não reconhece", () => {
    expect(nomeNaPagina("Ana Silva", paginaCom("Ana Maria Política Completa Souza Lima Silva"))).toBeUndefined();
  });

  test("conectivos da página não contam como nome a mais e entram no nome exibido", () => {
    expect(nomeNaPagina("Ana Silva", paginaCom("Ana Maria da Costa e Silva"))).toMatchObject({ exato: false, nomeNaPagina: "Ana Maria da Costa e Silva" });
  });

  test("a ordem importa: nomes trocados não reconhecem", () => {
    expect(nomeNaPagina("Boulos Guilherme", paginaCom("Guilherme Castro Boulos"))).toBeUndefined();
  });

  test("nome de uma palavra só não usa a terceira via", () => {
    expect(nomeNaPagina("Boulos", paginaCom("Guilherme Castro Boulos Filho"))?.exato).toBe(true);
    expect(nomeNaPagina("Boulinhos", paginaCom("Guilherme Castro Boulos"))).toBeUndefined();
  });

  test("nome igual continua exato e verde, sem divergência de nome", () => {
    const v = compararContatoIndividual({ contato: contato({ nome: "Guilherme Castro Boulos" }), fonte, lida: { conteudo: paginaCom("Guilherme Castro Boulos") } });
    expect(v.resultado.comparacoes.find((c) => c.campo === "nome")).toMatchObject({ situacao: "confere" });
    expect(v.resultado.camposDivergentes.find((d) => d.campo === "nome")).toBeUndefined();
  });

  test("outro nome continua possível saída", () => {
    const v = compararContatoIndividual({ contato: contato({ nome: "Fulano de Tal" }), fonte, lida: { conteudo: paginaCom("Guilherme Castro Boulos") } });
    expect(v.resultado.possivelSaida).toBe(true);
  });
});

describe("compararCargoNaLista (cargo pela lista geral, spec §5.3)", () => {
  test("denominação com mais tokens em comum é a esperada; confere pela régua de cargo", () => {
    const c = compararCargoNaLista("Ministra de Estado do Exemplo", LISTA.cargos, LISTA.url);
    expect(c).toMatchObject({ campo: "cargo", situacao: "confere", valorEsperado: "Ministra de Estado do Exemplo", fonteUrl: LISTA.url, origemValor: "pagina" });
  });

  test("gênero diferente da denominação oficial é divergente, com o texto oficial", () => {
    const c = compararCargoNaLista("Ministro de Estado do Exemplo", LISTA.cargos, LISTA.url);
    expect(c).toMatchObject({ situacao: "divergente", valorEsperado: "Ministra de Estado do Exemplo" });
  });

  test("sem token em comum, fonte não informa (pasta renomeada), sem exceção", () => {
    const c = compararCargoNaLista("Ministro de Estado da Economia", LISTA.cargos, LISTA.url);
    expect(c).toMatchObject({ situacao: "fonte_nao_informa", fonteUrl: LISTA.url });
    expect(c.valorEsperado).toBeUndefined();
  });

  test("pasta diferente com um token em comum é divergente, nunca confere", () => {
    const lista = ["Ministro de Estado do Desenvolvimento Agrário e Agricultura Familiar", "Ministro de Estado da Fazenda"];
    const c = compararCargoNaLista("Ministro de Estado do Desenvolvimento Social", lista, LISTA.url);
    expect(c).toMatchObject({ situacao: "divergente", valorEsperado: "Ministro de Estado do Desenvolvimento Agrário e Agricultura Familiar" });
  });

  test("qualificador a mais no Contatos é divergente com o texto oficial", () => {
    const oficial = "Ministra de Estado da Casa Civil da Presidência da República";
    const c = compararCargoNaLista("Ministra de Estado Chefe da Casa Civil da Presidência da República", [oficial], LISTA.url);
    expect(c).toMatchObject({ situacao: "divergente", valorEsperado: oficial });
  });

  test("só tokens genéricos diferentes continua conferindo", () => {
    const c = compararCargoNaLista("Ministro da Fazenda", ["Ministro de Estado da Fazenda"], LISTA.url);
    expect(c).toMatchObject({ situacao: "confere" });
  });

  test("listaDeCargos tira os cargos únicos das pessoas da página", () => {
    const pagina: ConteudoFonte = { url: "u", textoLimpo: "", destaques: [], pessoas: [{ nome: "A", cargo: "X" }, { nome: "B", cargo: "X" }, { nome: "C" }] };
    expect(listaDeCargos(pagina)).toEqual(["X"]);
  });
});

describe("compararContatoIndividual (tabela §5.2)", () => {
  test("individual lida, nome presente, cargo pela lista confere: verde, nome e cargo com a URL de cada fonte", () => {
    const v = compararContatoIndividual({ contato: ministra, fonte: indNome, lida: { conteudo: ministerio }, listaCargos: LISTA });
    expect(v.resultado.semaforo).toBe("verde");
    expect(v.nomeConfirmado).toBe(true);
    expect(v.lidaComConteudo).toBe(true);
    expect(v.resultado.fonteUrl).toBe(ministerio.url);
    expect(v.resultado.comparacoes.find((c) => c.campo === "nome")).toMatchObject({ situacao: "confere", fonteUrl: ministerio.url });
    expect(v.resultado.comparacoes.find((c) => c.campo === "cargo")).toMatchObject({ situacao: "confere", fonteUrl: LISTA.url });
    expect(v.novos).toEqual([]);
  });

  test("cargo diverge da lista: amarelo com o texto oficial em valorEsperado", () => {
    const v = compararContatoIndividual({ contato: { ...ministra, cargo: "Ministro de Estado do Exemplo", tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" }, fonte: indNome, lida: { conteudo: ministerio }, listaCargos: LISTA });
    expect(v.resultado.semaforo).toBe("amarelo");
    expect(v.resultado.camposDivergentes).toEqual([{ campo: "cargo", valorPlanilha: "Ministro de Estado do Exemplo", valorEncontrado: "Ministra de Estado do Exemplo" }]);
  });

  test("fonte do cargo caiu: cargo 'nao_verificado' com a URL da lista, semáforo pelo nome (verde)", () => {
    const v = compararContatoIndividual({ contato: ministra, fonte: indNome, lida: { conteudo: ministerio }, listaCargos: { url: LISTA.url, erro: "HTTP 403" } });
    expect(v.resultado.semaforo).toBe("verde");
    expect(v.resultado.comparacoes.find((c) => c.campo === "cargo")).toMatchObject({ situacao: "nao_verificado", fonteUrl: LISTA.url });
    expect(v.resultado.camposDivergentes).toEqual([]);
  });

  test("individual cobre cargo (governador): cargo pela pessoa da página, ou fonte não informa sem pessoa estruturada", () => {
    const soTexto: ConteudoFonte = { ...estado, pessoas: [] };
    const v = compararContatoIndividual({ contato: governador, fonte: indNomeCargo, lida: { conteudo: soTexto } });
    expect(v.resultado.semaforo).toBe("verde");
    expect(v.resultado.comparacoes.find((c) => c.campo === "cargo")).toMatchObject({ situacao: "fonte_nao_informa", fonteUrl: estado.url });
    const comPessoa: ConteudoFonte = { ...estado, pessoas: [{ nome: governador.nome, cargo: "Governador do Estado Exemplar" }] };
    const v2 = compararContatoIndividual({ contato: governador, fonte: indNomeCargo, lida: { conteudo: comPessoa } });
    expect(v2.resultado.comparacoes.find((c) => c.campo === "cargo")).toMatchObject({ situacao: "confere", valorEsperado: "Governador do Estado Exemplar" });
  });

  test("individual lida com conteúdo e nome ausente: vermelho, possível saída, pessoas com cargo viram novos com a URL", () => {
    const v = compararContatoIndividual({ contato: { ...ministra, nome: "Outra Pessoa Qualquer" }, fonte: indNome, lida: { conteudo: ministerio }, listaCargos: LISTA });
    expect(v.resultado).toMatchObject({ semaforo: "vermelho", possivelSaida: true, observacao: OBSERVACAO_NAO_CONSTA_INDIVIDUAL, fonteUrl: ministerio.url });
    expect(v.resultado.camposDivergentes[0]).toEqual({ campo: "nome", valorPlanilha: "Outra Pessoa Qualquer" });
    expect(v.resultado.comparacoes.find((c) => c.campo === "cargo")).toBeUndefined();
    expect(v.nomeConfirmado).toBe(false);
    expect(v.lidaComConteudo).toBe(true);
    expect(v.novos.map((n) => [n.nome, n.fonteUrl])).toEqual([["Ana Maria Política Completa", ministerio.url]]);
  });

  test("individual caiu (erro): indeterminado, nome 'nao_verificado', cargo ainda pela lista, motivo na observação", () => {
    const v = compararContatoIndividual({ contato: ministra, fonte: indNome, lida: { erro: "navegador: tempo esgotado" }, listaCargos: LISTA });
    expect(v.resultado.semaforo).toBe("indeterminado");
    expect(v.resultado.possivelSaida).toBeUndefined();
    expect(v.resultado.observacao).toContain("navegador: tempo esgotado");
    expect(v.resultado.comparacoes.find((c) => c.campo === "nome")).toMatchObject({ situacao: "nao_verificado", fonteUrl: ministerio.url });
    expect(v.resultado.comparacoes.find((c) => c.campo === "cargo")).toMatchObject({ situacao: "confere", fonteUrl: LISTA.url });
    expect(v.lidaComConteudo).toBe(false);
    expect(v.novos).toEqual([]);
  });

  test("página com texto abaixo do mínimo (CAPTCHA, só menu) é inacessível, não ausência: nunca possível saída", () => {
    const v = compararContatoIndividual({ contato: ministra, fonte: indNome, lida: { conteudo: captcha }, listaCargos: LISTA });
    expect(v.resultado.semaforo).toBe("indeterminado");
    expect(v.resultado.possivelSaida).toBeUndefined();
    expect(v.resultado.observacao).toContain(MOTIVO_PAGINA_INDIVIDUAL_SEM_CONTEUDO);
    expect(v.lidaComConteudo).toBe(false);
  });

  test("contato com nome vazio ligado por UF: indeterminado, nunca possível saída, mesmo com a página lida", () => {
    const semNome = { ...governador, nome: "  " };
    const v = compararContatoIndividual({ contato: semNome, fonte: indNomeCargo, lida: { conteudo: estado } });
    expect(v.resultado.semaforo).toBe("indeterminado");
    expect(v.resultado.possivelSaida).toBeUndefined();
    expect(v.resultado.observacao).toBe(OBSERVACAO_NOME_VAZIO_INDIVIDUAL);
    expect(v.resultado.observacao).toBe("Nome vazio no cadastro: não há o que procurar na página");
    expect(v.resultado.comparacoes.find((c) => c.campo === "nome")).toMatchObject({ situacao: "nao_verificado", fonteUrl: estado.url });
    expect(v.resultado.comparacoes.find((c) => c.campo === "cargo")).toMatchObject({ situacao: "nao_verificado", fonteUrl: estado.url });
    expect(v.nomeConfirmado).toBe(false);
    expect(v.lidaComConteudo).toBe(true);
    expect(v.novos).toEqual([]);
  });

  test("contato com nome vazio e cargo pela lista: cargo continua conferido pela lista", () => {
    const v = compararContatoIndividual({ contato: { ...ministra, nome: "" }, fonte: indNome, lida: { conteudo: ministerio }, listaCargos: LISTA });
    expect(v.resultado.semaforo).toBe("indeterminado");
    expect(v.resultado.comparacoes.find((c) => c.campo === "cargo")).toMatchObject({ situacao: "confere", fonteUrl: LISTA.url });
  });

  test("individual caiu e cobre cargo: cargo também 'nao_verificado' com a URL da individual", () => {
    const v = compararContatoIndividual({ contato: governador, fonte: indNomeCargo, lida: { erro: "HTTP 500" } });
    expect(v.resultado.comparacoes.find((c) => c.campo === "cargo")).toMatchObject({ situacao: "nao_verificado", fonteUrl: estado.url });
  });

  test("contato sem cargo não ganha comparação de cargo, em nenhum caminho", () => {
    const semCargo = { ...ministra, cargo: undefined };
    const lida = compararContatoIndividual({ contato: semCargo, fonte: indNome, lida: { conteudo: ministerio }, listaCargos: LISTA });
    const caida = compararContatoIndividual({ contato: semCargo, fonte: indNome, lida: { erro: "x" }, listaCargos: LISTA });
    expect(lida.resultado.comparacoes.find((c) => c.campo === "cargo")).toBeUndefined();
    expect(caida.resultado.comparacoes.find((c) => c.campo === "cargo")).toBeUndefined();
  });

  test("tratamento e endereçamento continuam auditados em todos os caminhos", () => {
    const incoerente = { ...ministra, tratamento: "Senhor" };
    for (const lida of [{ conteudo: ministerio }, { erro: "x" }]) {
      const v = compararContatoIndividual({ contato: incoerente, fonte: indNome, lida, listaCargos: LISTA });
      expect(v.resultado.comparacoes.some((c) => c.origemValor === "coerencia" || c.origemValor === "protocolo")).toBe(true);
    }
  });
  test("lida pela alternativa: as comparações e o fonteUrl apontam para a URL lida", () => {
    const alt = "https://www.exemplar.gov.br/governo-alternativa";
    const v = compararContatoIndividual({ contato: governador, fonte: indNomeCargo, lida: { conteudo: { ...estado, url: alt }, alternativa: { url: alt, urlPrincipal: indNomeCargo.url, motivoPrincipal: "HTTP 404" } } });
    expect(v.resultado.fonteUrl).toBe(alt);
    expect(v.resultado.comparacoes.find((c) => c.campo === "nome")?.fonteUrl).toBe(alt);
    expect(v.resultado.alternativa).toEqual({ url: alt, urlPrincipal: indNomeCargo.url, motivoPrincipal: "HTTP 404" });
  });
  test("página reaproveitada da memória da alternativa: as comparações e o fonteUrl apontam para a URL do conteúdo", () => {
    const alt = "https://www.exemplar.gov.br/governo-alternativa";
    const v = compararContatoIndividual({ contato: governador, fonte: indNomeCargo, lida: { conteudo: { ...estado, url: alt }, urlDaMemoria: alt } });
    expect(v.resultado.fonteUrl).toBe(alt);
    expect(v.resultado.comparacoes.find((c) => c.campo === "nome")?.fonteUrl).toBe(alt);
  });
});

describe("compararContatoSemIndividual (§5.4)", () => {
  test("grupo com lista de cargos (ministro): indeterminado, nome nao_verificado, cargo pela lista", () => {
    const r = compararContatoSemIndividual(ministra, { listaCargos: LISTA });
    expect(r).toMatchObject({ semaforo: "indeterminado", observacao: OBSERVACAO_SEM_INDIVIDUAL });
    expect(r.fonteUrl).toBeUndefined();
    expect(r.comparacoes.find((c) => c.campo === "nome")).toMatchObject({ situacao: "nao_verificado" });
    expect(r.comparacoes.find((c) => c.campo === "cargo")).toMatchObject({ situacao: "confere", fonteUrl: LISTA.url });
    expect(r.camposDivergentes).toEqual([]);
  });

  test("grupo sem lista de cargos (governador): vermelho com campo 'fonte', observação com a UF", () => {
    const r = compararContatoSemIndividual(governador, { uf: "MT" });
    expect(r.semaforo).toBe("vermelho");
    expect(r.possivelSaida).toBeUndefined();
    expect(r.camposDivergentes[0]).toEqual({ campo: "fonte", valorPlanilha: "sem URL cadastrada" });
    expect(r.observacao).toBe("Sem fonte individual para a UF MT");
    expect(compararContatoSemIndividual(governador, {}).observacao).toBe("UF não reconhecida no cadastro");
  });
});

describe("novosForaDaPlanilha e marcarFonteInacessivel sem URL", () => {
  test("pessoa com cargo que não casa nenhum contato vira novo; quem casa (tokens) não", () => {
    const pessoas = [{ nome: "Ana Maria Política Completa", cargo: "X" }, { nome: "Pessoa Nova da Silva", cargo: "Y" }, { nome: "Sem Cargo Algum" }];
    expect(novosForaDaPlanilha(pessoas, [ministra]).map((p) => p.nome)).toEqual(["Pessoa Nova da Silva"]);
  });

  test("marcarFonteInacessivel aceita url ausente e não grava fonteUrl", () => {
    const g = marcarFonteInacessivel("Governadores", [governador], undefined, "motivo");
    expect(g.fonteUrl).toBeUndefined();
    expect(g.contatos[0].fonteUrl).toBeUndefined();
    expect(g.contatos[0].semaforo).toBe("indeterminado");
  });
});

describe("nome mais curto em destaque (spec 2026-10-23 §4.1)", () => {
  const pagina = (destaques: string[], pessoas: { nome: string; cargo?: string }[] = []): ConteudoFonte => ({ url: "https://www.gov.br/x", textoLimpo: "Gabinete do ministro. ".repeat(20), destaques, pessoas });
  test("'Waldez Góes' em destaque reconhece 'Antônio Waldez Góes da Silva' e sai divergente com o nome da página", () => {
    const a = nomeNaPagina("Antônio Waldez Góes da Silva", pagina(["Waldez Góes"]));
    expect(a).toEqual({ nomeNaPagina: "Waldez Góes", exato: false });
  });
  test("nome curto em destaque com a pessoa estruturada do mesmo nome reconhece e traz o cargo", () => {
    const a = nomeNaPagina("Antonio Vladimir Moura Lima", pagina(["Vladimir Lima"], [{ nome: "Vladimir Lima", cargo: "Ministro de Estado das Cidades" }]));
    expect(a?.pessoa?.cargo).toBe("Ministro de Estado das Cidades");
    expect(a?.nomeNaPagina).toBe("Vladimir Lima");
    expect(a?.exato).toBe(false);
  });
  test("pessoa curta só em `pessoas`, sem destaque, não reconhece (o assessor do gabinete não esconde a saída)", () => {
    expect(nomeNaPagina("Antonio Vladimir Moura Lima", pagina([], [{ nome: "Vladimir Lima", cargo: "Assessor Especial" }]))).toBeUndefined();
  });
  test("dois destaques distintos que reconhecem: ambíguo, não reconhece", () => {
    expect(nomeNaPagina("Antônio Waldez Góes da Silva", pagina(["Waldez Góes", "Antônio Silva"]))).toBeUndefined();
  });
  test("o mesmo destaque repetido (título e negrito) não é ambiguidade", () => {
    expect(nomeNaPagina("Antônio Waldez Góes da Silva", pagina(["Waldez Góes", "WALDEZ GÓES"]))).toEqual({ nomeNaPagina: "Waldez Góes", exato: false });
  });
  test("uma parte só não reconhece", () => {
    expect(nomeNaPagina("Antônio Waldez Góes da Silva", pagina(["Waldez"]))).toBeUndefined();
  });
  test("partes fora de ordem não reconhecem", () => {
    expect(nomeNaPagina("Antônio Waldez Góes da Silva", pagina(["Góes Waldez"]))).toBeUndefined();
  });
  test("parte que não está no nome do Contatos não reconhece", () => {
    expect(nomeNaPagina("Antônio Waldez Góes da Silva", pagina(["Waldez Pereira"]))).toBeUndefined();
  });
  test("conectivos não contam como parte: 'Góes da Silva' tem duas partes e reconhece", () => {
    expect(nomeNaPagina("Antônio Waldez Góes da Silva", pagina(["Góes da Silva"]))?.exato).toBe(false);
  });
  test("o veredito do contato é amarelo, nome divergente com o nome da página, nunca saída", () => {
    const v = compararContatoIndividual({ contato: contato({ nome: "Antônio Waldez Góes da Silva" }), fonte: indNome, lida: { conteudo: pagina(["Waldez Góes"]) } });
    expect(v.resultado.semaforo).toBe("amarelo");
    expect(v.resultado.possivelSaida).toBeUndefined();
    expect(v.resultado.comparacoes.find((c) => c.campo === "nome")).toMatchObject({ situacao: "divergente", valorEsperado: "Waldez Góes" });
    expect(v.nomeConfirmado).toBe(true);
  });
});
