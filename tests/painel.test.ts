import { describe, expect, test } from "vitest";
import {
  camposDoEndereco,
  cartoesDoResumo,
  contarContatos,
  detalhesDoContato,
  etiquetasDoContato,
  filtrarGrupos,
  linhasDoEndereco,
  montarRetrato,
  motivoDoContato,
  procedenciaNomeCargo,
  resumoDoGrupo,
  situacaoDoContato,
  textoCabecalhoWeb,
  textoDataHora,
  textoEnderecoParaCopiar,
} from "@/lib/painel";
import type {
  ComparacaoCampo,
  EnderecoEstruturado,
  ResultadoAnalise,
  ResultadoContato,
  ResultadoGrupo,
} from "@/lib/types";

const grupoComFonte: ResultadoGrupo = {
  grupo: "ORG", fonteUrl: "https://orgao.gov.br", semFonte: false, contatos: [], novos: [],
};
const grupoSemFonte: ResultadoGrupo = { grupo: "SEM", semFonte: true, contatos: [], novos: [] };
const grupoInacessivel: ResultadoGrupo = {
  grupo: "ORG", fonteUrl: "https://orgao.gov.br", semFonte: false, fonteInacessivel: true,
  erroFonte: "HTTP 403", contatos: [], novos: [],
};

const confere = (campo: string, origemValor: ComparacaoCampo["origemValor"], valor = "x"): ComparacaoCampo => ({
  campo, valorPlanilha: valor, valorEsperado: valor, situacao: "confere", origemValor,
});
const diverge = (campo: string, origemValor: ComparacaoCampo["origemValor"], planilha: string, esperado: string): ComparacaoCampo => ({
  campo, valorPlanilha: planilha, valorEsperado: esperado, situacao: "divergente", origemValor,
});
const coerencia = (campo: string, achado: ComparacaoCampo["achado"], valorPlanilha = "Doutor"): ComparacaoCampo => ({
  campo, valorPlanilha, situacao: "divergente", origemValor: "coerencia", achado,
});

function contato(over: Partial<ResultadoContato>): ResultadoContato {
  return {
    contato: { nome: "Ana", grupo: "ORG", cargo: "Ministra", tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" },
    semaforo: "verde", score: 1, comparacoes: [], camposDivergentes: [], origem: "oficial",
    ...over,
  };
}

const textos = (c: ResultadoContato, g: ResultadoGrupo) => etiquetasDoContato(c, g).map((e) => e.texto);

describe("etiquetasDoContato", () => {
  test("tudo conferindo: cinco etiquetas 'confere', na ordem nome, cargo, tratamento, endereçamento, endereço", () => {
    const c = contato({
      comparacoes: [confere("nome", "pagina"), confere("cargo", "pagina"), confere("tratamento", "protocolo"), confere("enderecamento", "protocolo")],
      endereco: { situacao: "completo", achados: [] },
    });
    expect(textos(c, grupoComFonte)).toEqual([
      "Nome confere", "Cargo confere", "Tratamento confere", "Endereçamento confere", "Endereço completo",
    ]);
    expect(etiquetasDoContato(c, grupoComFonte).every((e) => e.tom === "ok")).toBe(true);
  });

  test("cargo divergente e tratamento sem regra: 'diverge' em atenção, 'sem regra' neutro", () => {
    const c = contato({
      semaforo: "amarelo",
      comparacoes: [
        confere("nome", "pagina"),
        diverge("cargo", "pagina", "Ministra", "Ministra Presidente"),
        { campo: "tratamento", valorPlanilha: "Senhora", situacao: "sem_regra", origemValor: "protocolo" },
        confere("enderecamento", "protocolo"),
      ],
    });
    const etiquetas = etiquetasDoContato(c, grupoComFonte);
    expect(etiquetas.find((e) => e.campo === "cargo")).toMatchObject({ campo: "cargo", texto: "Cargo diverge", tom: "atencao" });
    expect(etiquetas.find((e) => e.campo === "tratamento")).toMatchObject({ campo: "tratamento", texto: "Tratamento sem regra", tom: "neutro" });
  });

  test("cargo que o site não informa não ganha etiqueta", () => {
    const c = contato({
      comparacoes: [confere("nome", "pagina"), { campo: "cargo", valorPlanilha: "Ministra", situacao: "fonte_nao_informa", origemValor: "pagina" }],
    });
    expect(textos(c, grupoComFonte)).not.toContain("Cargo confere");
    expect(textos(c, grupoComFonte).some((t) => t.startsWith("Cargo"))).toBe(false);
  });

  test("achado de coerência no tratamento vira 'Tratamento diverge' mesmo com a Camada B conferindo", () => {
    const c = contato({
      comparacoes: [confere("tratamento", "protocolo", "Senhora"), coerencia("tratamento", "genero_cargo_tratamento")],
    });
    expect(etiquetasDoContato(c, grupoComFonte).find((e) => e.campo === "tratamento")?.texto).toBe("Tratamento diverge");
  });

  test("possível saída com achado de gênero no tratamento mostra as duas coisas: marcador primeiro, depois 'Tratamento diverge'", () => {
    const c = contato({ semaforo: "vermelho", possivelSaida: true, comparacoes: [coerencia("tratamento", "genero_cargo_tratamento")] });
    expect(textos(c, grupoComFonte).slice(0, 2)).toEqual(["Sem par na fonte", "Tratamento diverge"]);
  });

  test("possível saída: 'Sem par na fonte' primeiro, sem etiquetas de nome e cargo", () => {
    const c = contato({ semaforo: "vermelho", possivelSaida: true, comparacoes: [confere("tratamento", "protocolo"), confere("enderecamento", "protocolo")] });
    const t = textos(c, grupoComFonte);
    expect(t[0]).toBe("Sem par na fonte");
    expect(etiquetasDoContato(c, grupoComFonte)[0].tom).toBe("ruim");
    expect(t.some((x) => x.startsWith("Nome") || x.startsWith("Cargo"))).toBe(false);
  });

  test("possível saída com achado da Camada C no nome mostra as duas coisas (contrato herdado de celulaDivergencias)", () => {
    const c = contato({
      semaforo: "vermelho", possivelSaida: true,
      comparacoes: [{ campo: "nome", valorPlanilha: "Dr. Joaquim", valorEsperado: "Joaquim", situacao: "divergente", origemValor: "coerencia", achado: "nome_tratamento_academico" }],
    });
    expect(textos(c, grupoComFonte).slice(0, 2)).toEqual(["Sem par na fonte", "Nome diverge"]);
  });

  test("grupo sem fonte: nome e cargo 'não verificado' (neutro), e tratamento divergente continua 'diverge'", () => {
    const c = contato({
      semaforo: "vermelho",
      comparacoes: [diverge("tratamento", "protocolo", "Senhora", "Vossa Excelência"), confere("enderecamento", "protocolo")],
    });
    const etiquetas = etiquetasDoContato(c, grupoSemFonte);
    expect(etiquetas.find((e) => e.campo === "nome")).toMatchObject({ campo: "nome", texto: "Nome não verificado", tom: "neutro" });
    expect(etiquetas.find((e) => e.campo === "cargo")?.texto).toBe("Cargo não verificado");
    expect(etiquetas.find((e) => e.campo === "tratamento")?.texto).toBe("Tratamento diverge");
  });

  test("endereço: a_completar é neutro, pendente é atenção, nao_verificado é neutro, sem_base não aparece", () => {
    const com = (situacao: NonNullable<ResultadoContato["endereco"]>["situacao"]) =>
      etiquetasDoContato(contato({ endereco: { situacao, achados: [] } }), grupoComFonte).find((e) => e.campo === "endereco");
    expect(com("a_completar")).toMatchObject({ campo: "endereco", texto: "Endereço a completar", tom: "neutro" });
    expect(com("pendente")).toMatchObject({ campo: "endereco", texto: "Endereço a confirmar", tom: "atencao" });
    expect(com("nao_verificado")).toMatchObject({ campo: "endereco", texto: "Endereço não verificado", tom: "neutro" });
    expect(com("sem_base")).toBeUndefined();
  });
});

describe("situacaoDoContato", () => {
  test("ordem: possível saída, sem fonte, não verificado, tudo confere, N a revisar", () => {
    expect(situacaoDoContato(contato({ possivelSaida: true, semaforo: "vermelho" }), grupoComFonte)).toMatchObject({ texto: "Possível saída", tom: "ruim" });
    expect(situacaoDoContato(contato({ semaforo: "vermelho" }), grupoSemFonte)).toMatchObject({ texto: "Sem fonte", tom: "neutro" });
    expect(situacaoDoContato(contato({ semaforo: "indeterminado" }), grupoInacessivel)).toMatchObject({ texto: "Não verificado", tom: "neutro" });
    expect(situacaoDoContato(contato({ comparacoes: [confere("nome", "pagina")] }), grupoComFonte)).toMatchObject({ texto: "Nada a revisar", tom: "neutro" });
  });

  test("conta só etiquetas de atenção ou ruim; 'Endereço a completar' não entra", () => {
    const c = contato({
      semaforo: "amarelo",
      comparacoes: [diverge("cargo", "pagina", "a", "b"), diverge("tratamento", "protocolo", "a", "b")],
      endereco: { situacao: "a_completar", achados: ["sem_bairro"] },
    });
    expect(situacaoDoContato(c, grupoComFonte)).toMatchObject({ texto: "2 a revisar", tom: "atencao" });
  });

  test("endereço pendente sozinho é '1 a revisar'", () => {
    const c = contato({ comparacoes: [confere("nome", "pagina")], endereco: { situacao: "pendente", achados: ["sem_numero"] } });
    expect(situacaoDoContato(c, grupoComFonte).texto).toBe("1 a revisar");
  });
});

describe("motivoDoContato", () => {
  test("cada caso tem o seu texto, e o caso normal não tem motivo", () => {
    expect(motivoDoContato(contato({ possivelSaida: true }), grupoComFonte)).toBe("Não consta na fonte: confirmar se saiu");
    expect(motivoDoContato(contato({}), grupoSemFonte)).toBe("Sem fonte cadastrada");
    expect(motivoDoContato(contato({ semaforo: "indeterminado" }), grupoInacessivel)).toBe("Fonte fora do ar: confira à mão");
    expect(motivoDoContato(contato({ semaforo: "indeterminado" }), { ...grupoComFonte, erroFonte: "x: HTTP 403" })).toBe("Não verificado: uma fonte não respondeu");
    expect(motivoDoContato(contato({}), grupoComFonte)).toBeUndefined();
  });
});

const cartao = (c: ResultadoContato, campo: string) => {
  const achado = detalhesDoContato(c, grupoComFonte).find((x) => x.campo === campo);
  if (!achado) throw new Error(`sem cartão de ${campo}`);
  return achado;
};

describe("detalhesDoContato", () => {
  test("um cartão por campo com comparação, com origem certa e valor copiável só quando diverge", () => {
    const c = contato({
      comparacoes: [
        confere("nome", "pagina", "Ana"),
        diverge("cargo", "conhecimento", "Ministra", "Ministra Presidente"),
        diverge("tratamento", "protocolo", "Senhora", "Vossa Excelência"),
        { campo: "enderecamento", valorPlanilha: "A Sua Excelência a Senhora", situacao: "sem_regra", origemValor: "protocolo" },
      ],
    });
    const d = detalhesDoContato(c, grupoComFonte);
    expect(d.map((x) => x.campo)).toEqual(["nome", "cargo", "tratamento", "enderecamento"]);
    expect(d[0]).toMatchObject({ rotulo: "Nome", origem: "Site do órgão diz", valorPlanilha: "Ana", valorReferencia: "Ana" });
    expect(d[0].copiavel).toBeUndefined();
    expect(d[1]).toMatchObject({ origem: "Site do órgão diz", valorReferencia: "Ministra Presidente (via IA — confira)", copiavel: "Ministra Presidente" });
    expect(d[2]).toMatchObject({ origem: "Tabela de protocolo diz", valorReferencia: "Vossa Excelência", copiavel: "Vossa Excelência" });
    expect(d[3]).toMatchObject({ valorReferencia: "sem regra de protocolo para este cargo" });
    expect(d[3].copiavel).toBeUndefined();
  });

  test("site que não informa o cargo diz isso no cartão", () => {
    const c = contato({ comparacoes: [{ campo: "cargo", valorPlanilha: "Ministra", situacao: "fonte_nao_informa", origemValor: "pagina" }] });
    expect(cartao(c, "cargo").valorReferencia).toBe("o site não informa");
  });

  test("achados de coerência entram no cartão do campo, com o texto de textoCoerencia", () => {
    const c = contato({ comparacoes: [confere("tratamento", "protocolo", "Senhora"), coerencia("tratamento", "genero_cargo_tratamento")] });
    expect(cartao(c, "tratamento").coerencias).toEqual(["gênero do Cargo discorda do Tratamento"]);
  });

  test("campo só com achado de coerência (sem comparação de valor) ainda ganha cartão", () => {
    const c = contato({ comparacoes: [coerencia("enderecamento", "campo_vazio", "")] });
    const d = cartao(c, "enderecamento");
    expect(d).toMatchObject({ campo: "enderecamento", valorPlanilha: "", origem: "Tabela de protocolo diz", valorReferencia: "" });
    expect(d.coerencias[0]).toBe("campo vazio (Endereçamento)");
  });

  test("campo vazio com valor de protocolo não duplica (coerenciasVisiveis colapsa)", () => {
    const c = contato({ comparacoes: [diverge("tratamento", "protocolo", "", "Vossa Excelência"), coerencia("tratamento", "campo_vazio", "")] });
    expect(cartao(c, "tratamento").coerencias).toEqual([]);
  });

  test("os quatro campos fiscalizados aparecem sempre, mesmo sem comparação, com o valor do cadastro", () => {
    const c = contato({ semaforo: "vermelho", possivelSaida: true, comparacoes: [] });
    const d = detalhesDoContato(c, grupoComFonte);
    expect(d.map((x) => x.campo)).toEqual(["nome", "cargo", "tratamento", "enderecamento"]);
    expect(d.map((x) => x.valorPlanilha)).toEqual(["Ana", "Ministra", "Senhora", "A Sua Excelência a Senhora"]);
    expect(d.every((x) => x.valorReferencia === "")).toBe(true);
  });

  test("campo fiscalizado vazio no cadastro aparece com valor vazio, não some", () => {
    const c = contato({ contato: { nome: "Ana", grupo: "ORG" } });
    expect(cartao(c, "cargo").valorPlanilha).toBe("");
    expect(cartao(c, "tratamento").valorPlanilha).toBe("");
  });
});

describe("filtrarGrupos", () => {
  const verde = contato({ contato: { nome: "João da Silva", grupo: "ORG", cargo: "Ministro", orgao: "TST" }, comparacoes: [confere("nome", "pagina")] });
  const saida = contato({ contato: { nome: "Pedro Que Saiu", grupo: "ORG" }, semaforo: "vermelho", possivelSaida: true });
  const pendente = contato({ contato: { nome: "Maria Pendente", grupo: "ORG" }, endereco: { situacao: "pendente", achados: ["sem_numero"] } });
  const semFonte = contato({ contato: { nome: "Carla Sem Fonte", grupo: "SEM" }, semaforo: "vermelho", comparacoes: [diverge("tratamento", "protocolo", "a", "b")] });
  const grupos: ResultadoGrupo[] = [
    { ...grupoComFonte, contatos: [verde, saida, pendente], novos: [{ nome: "Nova Pessoa", cargo: "Ministra", origem: "pagina" }] },
    { ...grupoSemFonte, contatos: [semFonte] },
  ];
  const nomes = (gs: ResultadoGrupo[]) => gs.flatMap((g) => g.contatos.map((c) => c.contato.nome));

  test("tudo: devolve tudo, inclusive novos", () => {
    const r = filtrarGrupos(grupos, "tudo", "");
    expect(nomes(r)).toHaveLength(4);
    expect(r[0].novos).toHaveLength(1);
  });

  test("ressalva: tira só quem é verde com endereço em ordem; grupo sem fonte com tratamento divergente entra", () => {
    expect(nomes(filtrarGrupos(grupos, "ressalva", ""))).toEqual(["Pedro Que Saiu", "Maria Pendente", "Carla Sem Fonte"]);
  });

  test("endereco: só pendente", () => {
    expect(nomes(filtrarGrupos(grupos, "endereco", ""))).toEqual(["Maria Pendente"]);
  });

  test("saida: só possível saída; inclusao: só os novos, e grupo sem novos some", () => {
    expect(nomes(filtrarGrupos(grupos, "saida", ""))).toEqual(["Pedro Que Saiu"]);
    const inc = filtrarGrupos(grupos, "inclusao", "");
    expect(inc).toHaveLength(1);
    expect(inc[0].contatos).toEqual([]);
    expect(inc[0].novos.map((n) => n.nome)).toEqual(["Nova Pessoa"]);
  });

  test("busca ignora acento e caixa, e procura em nome, cargo e órgão", () => {
    expect(nomes(filtrarGrupos(grupos, "tudo", "joao"))).toEqual(["João da Silva"]);
    expect(nomes(filtrarGrupos(grupos, "tudo", "MINISTRO"))).toEqual(["João da Silva"]);
    expect(nomes(filtrarGrupos(grupos, "tudo", "tst"))).toEqual(["João da Silva"]);
    expect(filtrarGrupos(grupos, "tudo", "nova pessoa")[0].novos).toHaveLength(1);
  });

  test("não muta a entrada", () => {
    const antes = JSON.stringify(grupos);
    filtrarGrupos(grupos, "saida", "x");
    expect(JSON.stringify(grupos)).toBe(antes);
  });

  test("contarContatos soma os contatos dos grupos", () => {
    expect(contarContatos(grupos)).toBe(4);
  });
});

describe("cartoesDoResumo", () => {
  test("seis cartões na ordem do mockup; 'Não verificados' soma indeterminado e sem fonte", () => {
    const cartoes = cartoesDoResumo({
      total: 10, verde: 4, amarelo: 2, vermelho: 3, novo: 1, indeterminado: 1,
      enderecosAConfirmar: 5, possivelSaida: 2, contatosSemFonte: 1,
      gruposSemFonte: 1, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0,
    });
    expect(cartoes).toEqual([
      { rotulo: "Conferem", valor: 4 },
      { rotulo: "Com divergência", valor: 2 },
      { rotulo: "Possível saída", valor: 2 },
      { rotulo: "Não verificados", valor: 2 },
      { rotulo: "Propostas de inclusão", valor: 1 },
      { rotulo: "Endereços a confirmar", valor: 5 },
    ]);
  });

  test("retrato gravado por versão anterior, sem os contadores novos, mostra 0 e não NaN", () => {
    const cartoes = cartoesDoResumo({ verde: 1, amarelo: 0, indeterminado: 2, novo: 0, enderecosAConfirmar: 0 });
    expect(cartoes.map((c) => c.valor)).toEqual([1, 0, 0, 2, 0, 0]);
  });
});

describe("endereço para copiar", () => {
  const e: EnderecoEstruturado = {
    contatoId: "7", logradouro: "SAUS Quadra 3", numero: "Bloco A", complemento: "sala 412",
    bairro: "Asa Sul", cep: "70070-030", cidade: "Brasília", uf: "DF", prioritario: true,
  };

  test("três linhas: logradouro/número/complemento, bairro, CEP cidade - UF", () => {
    expect(linhasDoEndereco(e)).toEqual(["SAUS Quadra 3, Bloco A, sala 412", "Asa Sul", "70070-030 Brasília - DF"]);
    expect(textoEnderecoParaCopiar(e)).toBe("SAUS Quadra 3, Bloco A, sala 412\nAsa Sul\n70070-030 Brasília - DF");
  });

  test("campos ausentes somem sem deixar separador solto; CEP sai como está no relatório", () => {
    expect(linhasDoEndereco({ contatoId: "1", logradouro: "Rua A", cep: "1049000", uf: "SP", prioritario: false }))
      .toEqual(["Rua A", "1049000 SP"]);
    expect(linhasDoEndereco({ contatoId: "1", prioritario: false })).toEqual([]);
  });
});

describe("textoDataHora", () => {
  test("dia/mês e hora em Brasília, no formato do mockup", () => {
    expect(textoDataHora("2026-10-01T17:12:00.000Z")).toBe("01/10, 14h12");
  });
});

describe("montarRetrato", () => {
  const resultado: ResultadoAnalise = {
    arquivoNome: "c.xlsx", grupos: [],
    resumo: { total: 0, verde: 0, amarelo: 0, vermelho: 0, novo: 0, indeterminado: 0, enderecosAConfirmar: 0, possivelSaida: 0, contatosSemFonte: 0, gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0 },
  };

  test("com as duas planilhas", () => {
    const r = montarRetrato(resultado, { contatos: { nome: "c.xlsx", linhas: 418 }, enderecos: { nome: "e.xlsx", linhas: 1531 } }, new Date("2026-10-01T17:12:00.000Z"));
    expect(r).toMatchObject({ arquivoNome: "c.xlsx", geradoEm: "2026-10-01T17:12:00.000Z", planilhaContatos: { nome: "c.xlsx", linhas: 418 }, planilhaEnderecos: { nome: "e.xlsx", linhas: 1531 } });
  });

  test("sem a planilha de endereços o campo fica ausente", () => {
    const r = montarRetrato(resultado, { contatos: { nome: "c.xlsx", linhas: 1 } }, new Date());
    expect("planilhaEnderecos" in r).toBe(false);
  });
});

describe("procedenciaNomeCargo", () => {
  test("com URL http devolve a URL como texto e link", () => {
    // Arrange + Act + Assert
    expect(procedenciaNomeCargo(grupoComFonte)).toEqual({ texto: "https://orgao.gov.br", url: "https://orgao.gov.br" });
  });

  test("grupo composto só pela IA diz que veio do conhecimento da IA, sem link", () => {
    const g: ResultadoGrupo = { grupo: "TCU", fonteUrl: "pesquisa-ampla://x", viaPesquisaAmpla: true, semFonte: false, contatos: [], novos: [] };
    const p = procedenciaNomeCargo(g);
    expect(p).toEqual({ texto: "conhecimento da IA, confira" });
    expect(p?.url).toBeUndefined();
  });

  test("grupo sem fonte não tem linha de procedência", () => {
    expect(procedenciaNomeCargo(grupoSemFonte)).toBeUndefined();
  });
});

describe("situação: Tudo confere × Nada a revisar", () => {
  test("todas as etiquetas verdes → Tudo confere", () => {
    const c = contato({
      comparacoes: [confere("nome", "pagina"), confere("cargo", "pagina"), confere("tratamento", "protocolo"), confere("enderecamento", "protocolo")],
      endereco: { situacao: "completo", achados: [] },
    });
    expect(situacaoDoContato(c, grupoComFonte)).toMatchObject({ texto: "Tudo confere", tom: "ok" });
  });

  test("uma etiqueta neutra e nada a revisar → Nada a revisar", () => {
    const c = contato({
      comparacoes: [confere("nome", "pagina"), confere("cargo", "pagina"), { campo: "tratamento", valorPlanilha: "Senhora", situacao: "sem_regra", origemValor: "protocolo" }, confere("enderecamento", "protocolo")],
      endereco: { situacao: "a_completar", achados: ["sem_bairro"] },
    });
    const s = situacaoDoContato(c, grupoComFonte);
    expect(s).toMatchObject({ texto: "Nada a revisar", tom: "neutro" });
    expect(s.explicacao).toContain("não puderam ser conferidos");
  });
});

describe("cargo vazio", () => {
  test.each(["", "   ", undefined])("cargo %j vira 'Cargo vazio' em atenção, sem etiquetas de protocolo, e conta como a revisar", (cargo) => {
    const c = contato({
      contato: { nome: "Ana", grupo: "ORG", cargo, tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" },
      comparacoes: [confere("nome", "pagina"), { campo: "tratamento", valorPlanilha: "Senhora", situacao: "sem_regra", origemValor: "protocolo" }, { campo: "enderecamento", valorPlanilha: "x", situacao: "sem_regra", origemValor: "protocolo" }],
    });
    const t = textos(c, grupoComFonte);
    expect(t).toContain("Cargo vazio");
    expect(t.some((x) => x.startsWith("Tratamento") || x.startsWith("Endereçamento"))).toBe(false);
    expect(etiquetasDoContato(c, grupoComFonte).find((e) => e.campo === "cargo")?.tom).toBe("atencao");
    expect(situacaoDoContato(c, grupoComFonte).texto).toBe("1 a revisar");
  });
});

describe("cargo vazio e Camada A", () => {
  const semCargo = { nome: "Ana", grupo: "ORG", cargo: "", tratamento: "Senhor(a)", enderecamento: "A Sua Excelência a Senhora" };

  test("forma genérica no tratamento continua aparecendo e conta na situação", () => {
    const c = contato({ semaforo: "amarelo", contato: semCargo, comparacoes: [coerencia("tratamento", "forma_generica", "Senhor(a)")] });
    const t = textos(c, grupoComFonte);
    expect(t).toContain("Cargo vazio");
    expect(t).toContain("Tratamento diverge");
    expect(situacaoDoContato(c, grupoComFonte).texto).toBe("2 a revisar");
  });

  test("tudo coerente e sem cargo: nenhuma etiqueta de tratamento ou endereçamento", () => {
    const c = contato({ contato: { ...semCargo, tratamento: "Senhora" }, comparacoes: [confere("nome", "pagina")] });
    expect(textos(c, grupoComFonte).some((x) => x.startsWith("Tratamento") || x.startsWith("Endereçamento"))).toBe(false);
  });

  test("cargo vazio com possível saída: 'Sem par na fonte' primeiro, depois 'Cargo vazio'", () => {
    const c = contato({ semaforo: "vermelho", possivelSaida: true, contato: { ...semCargo, tratamento: "Senhora" } });
    expect(textos(c, grupoComFonte).slice(0, 2)).toEqual(["Sem par na fonte", "Cargo vazio"]);
    expect(situacaoDoContato(c, grupoComFonte).texto).toBe("Possível saída");
  });

  test("grupo sem fonte e cargo vazio: situação 'Sem fonte', etiqueta 'Cargo vazio' continua", () => {
    const c = contato({ semaforo: "vermelho", contato: { ...semCargo, tratamento: "Senhora" } });
    expect(situacaoDoContato(c, grupoSemFonte).texto).toBe("Sem fonte");
    expect(textos(c, grupoSemFonte)).toContain("Cargo vazio");
  });

  test("sem regra com cargo vazio explica que o cadastro não informa o cargo, sem aspas vazias", () => {
    const c = contato({
      contato: { ...semCargo, tratamento: "Senhora" },
      comparacoes: [{ campo: "cargo", valorPlanilha: "", situacao: "sem_regra", origemValor: "pagina" }],
    });
    const cargo = detalhesDoContato(c, grupoComFonte).find((d) => d.campo === "cargo");
    expect(cargo?.etiqueta?.explicacao).toBe("O cadastro não informa o cargo; sem ele não há regra de protocolo");
  });
});

describe("filtro de ressalva × situação 'a revisar'", () => {
  test("todo contato com situação 'N a revisar' passa pelo filtro de ressalva", () => {
    const vazio = { nome: "Vazio", grupo: "ORG", cargo: "", tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" };
    const contatos = [
      contato({ contato: { ...vazio, nome: "Verde" , cargo: "Ministra" }, comparacoes: [confere("nome", "pagina"), confere("cargo", "pagina")] }),
      contato({ contato: { ...vazio, nome: "Amarelo", cargo: "Ministra" }, semaforo: "amarelo", comparacoes: [diverge("cargo", "pagina", "a", "b")] }),
      contato({ contato: { ...vazio, nome: "Vermelho" }, semaforo: "vermelho", possivelSaida: true }),
      contato({ contato: vazio, comparacoes: [confere("nome", "pagina")] }),
      contato({ contato: { ...vazio, nome: "Pendente", cargo: "Ministra" }, endereco: { situacao: "pendente", achados: ["sem_numero"] } }),
    ];
    const g: ResultadoGrupo = { ...grupoComFonte, contatos, novos: [] };
    const passam = filtrarGrupos([g], "ressalva", "").flatMap((x) => x.contatos.map((c) => c.contato.nome));
    const aRevisar = contatos.filter((c) => /^\d+ a revisar$/.test(situacaoDoContato(c, g).texto)).map((c) => c.contato.nome);
    expect(aRevisar).toContain("Vazio");
    for (const nome of aRevisar) expect(passam).toContain(nome);
  });
});

describe("explicações", () => {
  test("endereço a confirmar lista os achados reais, na ordem", () => {
    const c = contato({ endereco: { situacao: "pendente", achados: ["sem_numero", "cep_ausente"] } });
    const e = etiquetasDoContato(c, grupoComFonte).find((x) => x.campo === "endereco");
    expect(e?.explicacao).toBe("Precisa de confirmação por telefone: sem número; sem CEP");
  });

  test("sem regra cita o cargo", () => {
    const c = contato({ comparacoes: [{ campo: "tratamento", valorPlanilha: "Senhora", situacao: "sem_regra", origemValor: "protocolo" }] });
    expect(etiquetasDoContato(c, grupoComFonte).find((x) => x.campo === "tratamento")?.explicacao)
      .toBe('O cargo "Ministra" não foi encontrado na tabela de protocolo; nada foi conferido');
  });

  test("a completar explica pelos achados reais, na ordem", () => {
    const explicacao = (achados: NonNullable<ResultadoContato["endereco"]>["achados"]) =>
      etiquetasDoContato(contato({ endereco: { situacao: "a_completar", achados } }), grupoComFonte).find((x) => x.campo === "endereco")?.explicacao;
    expect(explicacao(["cep_recuperavel"])).toBe("Pode ser completado na conferência dos Correios (Fase 2): CEP com dígito faltando (zero à esquerda; confirmar nos Correios)");
    expect(explicacao(["sem_bairro", "cep_recuperavel"])).toBe("Pode ser completado na conferência dos Correios (Fase 2): sem bairro (sai do CEP); CEP com dígito faltando (zero à esquerda; confirmar nos Correios)");
  });

  test("a completar fala do bairro; sem par na fonte fala da composição", () => {
    const a = contato({ endereco: { situacao: "a_completar", achados: ["sem_bairro"] } });
    expect(etiquetasDoContato(a, grupoComFonte).find((x) => x.campo === "endereco")?.explicacao).toContain("bairro");
    const s = contato({ possivelSaida: true, semaforo: "vermelho" });
    expect(etiquetasDoContato(s, grupoComFonte)[0].explicacao).toContain("composição oficial");
  });

  test("toda etiqueta tem explicação não vazia", () => {
    const c = contato({
      semaforo: "amarelo",
      comparacoes: [confere("nome", "pagina"), diverge("cargo", "pagina", "a", "b"), diverge("tratamento", "protocolo", "a", "b"), confere("enderecamento", "protocolo")],
      endereco: { situacao: "nao_verificado", achados: ["nome_ambiguo"] },
    });
    for (const e of etiquetasDoContato(c, grupoComFonte)) expect(e.explicacao.length).toBeGreaterThan(10);
  });
});

describe("filtro por grupo", () => {
  const a = contato({ contato: { nome: "Ana", grupo: "A" } });
  const b = contato({ contato: { nome: "Bia", grupo: "B" }, semaforo: "vermelho", possivelSaida: true });
  const b2 = contato({ contato: { nome: "Bruno", grupo: "B" } });
  const grupos: ResultadoGrupo[] = [
    { ...grupoComFonte, grupo: "A", contatos: [a], novos: [] },
    { ...grupoComFonte, grupo: "B", contatos: [b, b2], novos: [] },
  ];
  test("só o grupo escolhido, e os outros filtros valem dentro dele", () => {
    expect(filtrarGrupos(grupos, "tudo", "", "B").map((g) => g.grupo)).toEqual(["B"]);
    expect(filtrarGrupos(grupos, "saida", "", "B")[0].contatos.map((c) => c.contato.nome)).toEqual(["Bia"]);
    expect(filtrarGrupos(grupos, "tudo", "bruno", "B")[0].contatos).toHaveLength(1);
    expect(filtrarGrupos(grupos, "saida", "", "A")).toEqual([]);
  });
  test("sem grupo (undefined ou vazio) é como hoje", () => {
    expect(filtrarGrupos(grupos, "tudo", "")).toHaveLength(2);
    expect(filtrarGrupos(grupos, "tudo", "", "")).toHaveLength(2);
  });
});

describe("cabeçalho do modo web", () => {
  test("diz quando a varredura foi feita e quando foi publicada", () => {
    const t = textoCabecalhoWeb("2026-10-03T14:20:22.969Z", "2026-10-04T10:05:00.000Z");
    expect(t).toMatch(/^Varredura feita na máquina do GT em \d\d\/\d\d, \d\dh\d\d\. Publicada em \d\d\/\d\d, \d\dh\d\d\.$/);
  });
  test("sem publicadoEm (retrato antigo) omite a segunda frase", () => {
    expect(textoCabecalhoWeb("2026-10-03T14:20:22.969Z")).toMatch(/^Varredura feita na máquina do GT em \d\d\/\d\d, \d\dh\d\d\.$/);
  });
});

describe("número do endereço acima do limite", () => {
  const endereco = (numero: string | undefined): EnderecoEstruturado => ({
    contatoId: "7", logradouro: "Praça dos Três Poderes", numero, complemento: "Anexo II",
    bairro: "Zona Cívico-Administrativa", cep: "70165-900", cidade: "Brasília", uf: "DF", prioritario: true,
  });
  const comNumero = (nome: string, numero: string | undefined) =>
    contato({ contato: { nome, grupo: "ORG", cargo: "Ministra" }, endereco: { situacao: "completo", achados: [], endereco: endereco(numero) } });
  const longo = comNumero("Ana Longa", "Sala 12");
  const noLimite = comNumero("Bia Limite", "Sala 1");

  test("filtro 'numero' deixa só quem passa de 6 caracteres, mesmo em retrato gravado antes da regra", () => {
    const grupos: ResultadoGrupo[] = [{ ...grupoComFonte, contatos: [longo, noLimite, comNumero("Caio Vazio", undefined)], novos: [{ nome: "Nova", cargo: "Ministra", origem: "pagina" }] }];
    const r = filtrarGrupos(grupos, "numero", "");
    expect(r[0].contatos.map((c) => c.contato.nome)).toEqual(["Ana Longa"]);
    expect(r[0].novos).toEqual([]);
  });

  test("a linha ganha a etiqueta 'Número: 7 de 6' em atenção, e o contato entra na ressalva", () => {
    const e = etiquetasDoContato(longo, grupoComFonte).find((x) => x.texto === "Número: 7 de 6");
    expect(e).toMatchObject({ campo: "endereco", tom: "atencao" });
    expect(e?.explicacao).toContain("contando espaços e sinais");
    expect(textos(noLimite, grupoComFonte).some((t) => t.startsWith("Número:"))).toBe(false);
    const grupos: ResultadoGrupo[] = [{ ...grupoComFonte, contatos: [longo, noLimite] }];
    expect(filtrarGrupos(grupos, "numero", "")[0].contatos).toHaveLength(1);
    expect(filtrarGrupos(grupos, "ressalva", "").flatMap((g) => g.contatos.map((c) => c.contato.nome))).toContain("Ana Longa");
  });

  test("camposDoEndereco lista campo a campo e marca o Número com a conta e o trecho que sobra", () => {
    const campos = camposDoEndereco(longo.endereco ?? { situacao: "sem_base", achados: [] });
    expect(campos.map((c) => c.rotulo)).toEqual(["Logradouro", "Número", "Complemento", "Bairro", "Cidade / UF", "CEP"]);
    const numero = campos[1];
    expect(numero).toMatchObject({ valor: "Sala 12", tom: "atencao", excedente: "2" });
    expect(numero.nota).toBe("7 caracteres, contando espaços e sinais; o máximo é 6 (1 a mais)");
    expect(campos[0]).toEqual({ rotulo: "Logradouro", valor: "Praça dos Três Poderes" });
    expect(campos[4].valor).toBe("Brasília - DF");
  });

  test("número no limite não é marcado; campos com achado levam o rótulo do achado", () => {
    expect(camposDoEndereco(noLimite.endereco ?? { situacao: "sem_base", achados: [] })[1]).toEqual({ rotulo: "Número", valor: "Sala 1" });
    const campos = camposDoEndereco({ situacao: "pendente", achados: ["sem_numero", "cep_invalido", "sem_logradouro"], endereco: { contatoId: "1", cep: "123", prioritario: true } });
    expect(campos[0]).toMatchObject({ valor: "", tom: "atencao", nota: "sem logradouro" });
    expect(campos[1]).toMatchObject({ valor: "", tom: "atencao", nota: "sem número" });
    expect(campos[5]).toMatchObject({ valor: "123", tom: "atencao", nota: "CEP inválido" });
  });

  test("sem linha escolhida não há campo a mostrar", () => {
    expect(camposDoEndereco({ situacao: "pendente", achados: ["sem_linha"] })).toEqual([]);
  });
});

describe("resumoDoGrupo", () => {
  test("conta contatos, a revisar, possíveis saídas e propostas de inclusão; zero some", () => {
    const g: ResultadoGrupo = {
      ...grupoComFonte,
      contatos: [
        contato({ comparacoes: [confere("nome", "pagina"), confere("cargo", "pagina"), confere("tratamento", "protocolo"), confere("enderecamento", "protocolo")] }),
        contato({ semaforo: "amarelo", comparacoes: [confere("nome", "pagina"), diverge("cargo", "pagina", "Ministra", "Ministra Presidente")] }),
        contato({ semaforo: "vermelho", possivelSaida: true }),
      ],
      novos: [{ nome: "Nova", cargo: "Ministra", origem: "pagina" }],
    };
    expect(resumoDoGrupo(g)).toBe("3 contatos · 1 a revisar · 1 possível saída · 1 a incluir");
    expect(resumoDoGrupo({ ...grupoComFonte, contatos: [g.contatos[0]] })).toBe("1 contato");
  });
});
