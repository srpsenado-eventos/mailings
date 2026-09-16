import { describe, expect, test } from "vitest";
import { compararGrupo, marcarFonteInacessivel } from "@/lib/match";
import type { ContatoPlanilha, ConteudoFonte } from "@/lib/types";

/** Cadastro coerente e conforme à tabela de protocolo: nenhuma das duas camadas acusa. */
const CADASTRO_OK = {
  tratamento: "Senhor",
  enderecamento: "A Sua Excelência o Senhor",
} as const;

function contato(p: Partial<ContatoPlanilha> = {}): ContatoPlanilha {
  return { nome: "Ana Maria Souza", grupo: "G", cargo: "Governador", ...CADASTRO_OK, ...p };
}

const fonte: ConteudoFonte = {
  url: "https://orgao.gov.br",
  textoLimpo: "Ana Maria Souza, Governador.",
  destaques: [],
  pessoas: [{ nome: "Ana Maria Souza", cargo: "Governador", origem: "pagina" }],
};

const campos = (c: { comparacoes: { campo: string }[] }): string[] =>
  c.comparacoes.map((x) => x.campo);

const divergentes = (c: { camposDivergentes: { campo: string }[] }): string[] =>
  c.camposDivergentes.map((x) => x.campo);

describe("auditoria de tratamento no contato casado", () => {
  test("as duas camadas entram nas comparações do contato casado", () => {
    const g = compararGrupo("G", [contato()], fonte);
    const origens = g.contatos[0].comparacoes.map((c) => c.origemValor);

    expect(campos(g.contatos[0])).toContain("tratamento");
    expect(campos(g.contatos[0])).toContain("enderecamento");
    expect(origens).toContain("protocolo");
  });

  test("cadastro coerente e conforme continua verde", () => {
    const g = compararGrupo("G", [contato()], fonte);

    expect(g.contatos[0].semaforo).toBe("verde");
    expect(g.contatos[0].camposDivergentes).toHaveLength(0);
  });

  test("gênero do cargo discordando do tratamento pinta amarelo (Camada A)", () => {
    const g = compararGrupo("G", [contato({ cargo: "Governadora" })], fonte);
    const coerencia = g.contatos[0].comparacoes.filter((c) => c.origemValor === "coerencia");

    expect(g.contatos[0].semaforo).toBe("amarelo");
    expect(divergentes(g.contatos[0])).toContain("tratamento");
    expect(coerencia.map((c) => c.achado)).toContain("genero_cargo_tratamento");
  });

  test("tratamento fora da tabela de protocolo pinta amarelo (Camada B)", () => {
    const g = compararGrupo("G", [contato({ tratamento: "Excelentíssimo Senhor" })], fonte);
    const t = g.contatos[0].comparacoes.find(
      (c) => c.campo === "tratamento" && c.origemValor === "protocolo",
    );

    expect(t?.situacao).toBe("divergente");
    expect(g.contatos[0].semaforo).toBe("amarelo");
  });

  test("cargo que não resolve regra fica em sem_regra e NÃO pinta amarelo", () => {
    const comMinistro: ConteudoFonte = {
      ...fonte,
      pessoas: [{ nome: "Ana Maria Souza", cargo: "Ministra do Supremo Tribunal Federal", origem: "pagina" }],
    };
    const g = compararGrupo(
      "G",
      [contato({ cargo: "Ministra do Supremo Tribunal Federal", tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" })],
      comMinistro,
    );
    const protocolo = g.contatos[0].comparacoes.filter((c) => c.origemValor === "protocolo");

    expect(protocolo.map((c) => c.situacao)).toEqual(["sem_regra", "sem_regra"]);
    expect(g.contatos[0].semaforo).toBe("verde");
  });

  test("um mesmo campo pode render mais de uma comparação", () => {
    const g = compararGrupo(
      "G",
      [contato({ cargo: "Governadora", enderecamento: "A Sua Excelência a Senhora" })],
      fonte,
    );
    const doTratamento = g.contatos[0].comparacoes.filter((c) => c.campo === "tratamento");

    expect(doTratamento.length).toBeGreaterThan(1);
    expect(divergentes(g.contatos[0]).filter((c) => c === "tratamento")).toHaveLength(2);
  });

  test("divergência de tratamento nunca vira possível saída", () => {
    const g = compararGrupo("G", [contato({ tratamento: "" })], fonte);

    expect(g.contatos[0].possivelSaida).toBeFalsy();
    expect(g.contatos[0].semaforo).toBe("amarelo");
  });
});

describe("auditoria de tratamento nos caminhos de semáforo fixo", () => {
  test("grupo sem fonte recebe as duas camadas e segue vermelho", () => {
    const g = compararGrupo("G", [contato({ cargo: "Governadora" })], undefined);

    expect(g.contatos[0].semaforo).toBe("vermelho");
    expect(campos(g.contatos[0])).toContain("tratamento");
    expect(campos(g.contatos[0])).toContain("enderecamento");
  });

  test("grupo sem fonte acusa o achado de tratamento SEM perder o campo fonte", () => {
    const g = compararGrupo("G", [contato({ cargo: "Governadora" })], undefined);

    expect(divergentes(g.contatos[0])).toContain("fonte");
    expect(divergentes(g.contatos[0])).toContain("tratamento");
  });

  test("grupo sem fonte com cadastro coerente só acusa o campo fonte", () => {
    const g = compararGrupo("G", [contato()], undefined);

    expect(divergentes(g.contatos[0])).toEqual(["fonte"]);
  });

  test("fonte inacessível recebe as duas camadas e segue indeterminado", () => {
    const g = marcarFonteInacessivel("G", [contato({ cargo: "Governadora" })], "https://x", "timeout");

    expect(g.contatos[0].semaforo).toBe("indeterminado");
    expect(campos(g.contatos[0])).toContain("tratamento");
    expect(divergentes(g.contatos[0])).toContain("tratamento");
  });

  test("fonte inacessível com cadastro coerente não acusa nada", () => {
    const g = marcarFonteInacessivel("G", [contato()], "https://x", "timeout");

    expect(g.contatos[0].camposDivergentes).toHaveLength(0);
  });

  test("possível saída acusa o tratamento SEM perder o nome, e segue vermelho", () => {
    const semPessoa: ConteudoFonte = { ...fonte, pessoas: [] };
    const g = compararGrupo("G", [contato({ cargo: "Governadora" })], semPessoa);

    expect(g.contatos[0].possivelSaida).toBe(true);
    expect(g.contatos[0].semaforo).toBe("vermelho");
    expect(divergentes(g.contatos[0])).toContain("nome");
    expect(divergentes(g.contatos[0])).toContain("tratamento");
  });

  test("possível saída com cadastro coerente segue acusando só o nome", () => {
    const semPessoa: ConteudoFonte = { ...fonte, pessoas: [] };
    const g = compararGrupo("G", [contato()], semPessoa);

    expect(divergentes(g.contatos[0])).toEqual(["nome"]);
  });
});

describe("contrato", () => {
  test("não muta o contato recebido", () => {
    const original = contato({ cargo: "Governadora" });
    const copia = { ...original };

    compararGrupo("G", [original], fonte);
    compararGrupo("G", [original], undefined);
    marcarFonteInacessivel("G", [original], "https://x", "timeout");

    expect(original).toEqual(copia);
  });
});
