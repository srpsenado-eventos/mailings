import { describe, expect, test } from "vitest";
import {
  detalhesDoContato,
  etiquetasDoContato,
  motivoDoContato,
  situacaoDoContato,
} from "@/lib/painel";
import type { ComparacaoCampo, ResultadoContato, ResultadoGrupo } from "@/lib/types";

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
    expect(etiquetas.find((e) => e.campo === "cargo")).toEqual({ campo: "cargo", texto: "Cargo diverge", tom: "atencao" });
    expect(etiquetas.find((e) => e.campo === "tratamento")).toEqual({ campo: "tratamento", texto: "Tratamento sem regra", tom: "neutro" });
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
    expect(etiquetas.find((e) => e.campo === "nome")).toEqual({ campo: "nome", texto: "Nome não verificado", tom: "neutro" });
    expect(etiquetas.find((e) => e.campo === "cargo")?.texto).toBe("Cargo não verificado");
    expect(etiquetas.find((e) => e.campo === "tratamento")?.texto).toBe("Tratamento diverge");
  });

  test("endereço: a_completar é neutro, pendente é atenção, nao_verificado é neutro, sem_base não aparece", () => {
    const com = (situacao: NonNullable<ResultadoContato["endereco"]>["situacao"]) =>
      etiquetasDoContato(contato({ endereco: { situacao, achados: [] } }), grupoComFonte).find((e) => e.campo === "endereco");
    expect(com("a_completar")).toEqual({ campo: "endereco", texto: "Endereço a completar", tom: "neutro" });
    expect(com("pendente")).toEqual({ campo: "endereco", texto: "Endereço a confirmar", tom: "atencao" });
    expect(com("nao_verificado")).toEqual({ campo: "endereco", texto: "Endereço não verificado", tom: "neutro" });
    expect(com("sem_base")).toBeUndefined();
  });
});

describe("situacaoDoContato", () => {
  test("ordem: possível saída, sem fonte, não verificado, tudo confere, N a revisar", () => {
    expect(situacaoDoContato(contato({ possivelSaida: true, semaforo: "vermelho" }), grupoComFonte)).toEqual({ texto: "Possível saída", tom: "ruim" });
    expect(situacaoDoContato(contato({ semaforo: "vermelho" }), grupoSemFonte)).toEqual({ texto: "Sem fonte", tom: "neutro" });
    expect(situacaoDoContato(contato({ semaforo: "indeterminado" }), grupoInacessivel)).toEqual({ texto: "Não verificado", tom: "neutro" });
    expect(situacaoDoContato(contato({ comparacoes: [confere("nome", "pagina")] }), grupoComFonte)).toEqual({ texto: "Tudo confere", tom: "ok" });
  });

  test("conta só etiquetas de atenção ou ruim; 'Endereço a completar' não entra", () => {
    const c = contato({
      semaforo: "amarelo",
      comparacoes: [diverge("cargo", "pagina", "a", "b"), diverge("tratamento", "protocolo", "a", "b")],
      endereco: { situacao: "a_completar", achados: ["sem_bairro"] },
    });
    expect(situacaoDoContato(c, grupoComFonte)).toEqual({ texto: "2 a revisar", tom: "atencao" });
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
    expect(detalhesDoContato(c, grupoComFonte)[0].valorReferencia).toBe("o site não informa");
  });

  test("achados de coerência entram no cartão do campo, com o texto de textoCoerencia", () => {
    const c = contato({ comparacoes: [confere("tratamento", "protocolo", "Senhora"), coerencia("tratamento", "genero_cargo_tratamento")] });
    const d = detalhesDoContato(c, grupoComFonte);
    expect(d).toHaveLength(1);
    expect(d[0].coerencias).toEqual(["gênero do Cargo discorda do Tratamento"]);
  });

  test("campo só com achado de coerência (sem comparação de valor) ainda ganha cartão", () => {
    const c = contato({ comparacoes: [coerencia("enderecamento", "campo_vazio", "")] });
    const d = detalhesDoContato(c, grupoComFonte);
    expect(d[0]).toMatchObject({ campo: "enderecamento", valorPlanilha: "", origem: "Tabela de protocolo diz", valorReferencia: "" });
    expect(d[0].coerencias[0]).toBe("campo vazio (Endereçamento)");
  });

  test("campo vazio com valor de protocolo não duplica (coerenciasVisiveis colapsa)", () => {
    const c = contato({ comparacoes: [diverge("tratamento", "protocolo", "", "Vossa Excelência"), coerencia("tratamento", "campo_vazio", "")] });
    expect(detalhesDoContato(c, grupoComFonte)[0].coerencias).toEqual([]);
  });
});
