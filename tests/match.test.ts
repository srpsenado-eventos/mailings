import { describe, expect, test } from "vitest";
import { compararContato, compararGrupo, marcarFonteInacessivel } from "@/lib/match";
import type { ContatoPlanilha, ConteudoFonte } from "@/lib/types";

const fonte: ConteudoFonte = {
  url: "https://orgao.gov.br",
  textoLimpo:
    "Autoridades do Órgão. Ana Maria Política Completa, Presidente. João Carlos Destaque, Diretor.",
  destaques: ["Ana Política", "João Destaque"],
};

function contato(p: Partial<ContatoPlanilha>): ContatoPlanilha {
  return { nome: "", grupo: "ORG", ...p };
}

describe("compararContato", () => {
  test("nome presente no texto → verde", () => {
    const r = compararContato(contato({ nome: "Ana Maria Política Completa" }), fonte);
    expect(r.semaforo).toBe("verde");
    expect(r.score).toBeGreaterThanOrEqual(0.85);
  });

  test("nome ausente → vermelho (possível saída)", () => {
    const r = compararContato(contato({ nome: "Pessoa Inexistente Qualquer" }), fonte);
    expect(r.semaforo).toBe("vermelho");
  });

  test("match parcial vira amarelo e lista campo divergente", () => {
    const r = compararContato(
      contato({ nome: "João Carlos Destaque", cargo: "Presidente" }),
      fonte,
    );
    expect(r.semaforo).toBe("amarelo");
    expect(r.camposDivergentes.some((c) => c.campo === "cargo")).toBe(true);
  });

  test("origem é sempre oficial na camada A", () => {
    const r = compararContato(contato({ nome: "Ana Maria Política Completa" }), fonte);
    expect(r.origem).toBe("oficial");
  });
});

describe("compararGrupo", () => {
  test("detecta possíveis novos (destaque sem contato correspondente)", () => {
    const r = compararGrupo(
      "ORG",
      [contato({ nome: "Ana Maria Política Completa" })],
      fonte,
    );
    expect(r.novos.some((n) => n.nomePolitico === "João Destaque")).toBe(true);
  });

  test("grupo sem fonte marca semFonte=true e não derruba", () => {
    const r = compararGrupo("ORG", [contato({ nome: "Ana" })], undefined);
    expect(r.semFonte).toBe(true);
    expect(r.contatos[0].semaforo).toBe("vermelho");
  });
});

describe("marcarFonteInacessivel", () => {
  test("preserva a URL, marca inacessível (≠ sem fonte) e contatos indeterminados", () => {
    const r = marcarFonteInacessivel(
      "STF",
      [contato({ nome: "Ana" }), contato({ nome: "João" })],
      "https://stf.jus.br/min",
      "HTTP 403",
    );
    expect(r.semFonte).toBe(false);
    expect(r.fonteInacessivel).toBe(true);
    expect(r.fonteUrl).toBe("https://stf.jus.br/min");
    expect(r.erroFonte).toBe("HTTP 403");
    expect(r.contatos).toHaveLength(2);
    expect(r.contatos.every((c) => c.semaforo === "indeterminado")).toBe(true);
    expect(r.contatos[0].camposDivergentes).toHaveLength(0);
    expect(r.novos).toHaveLength(0);
  });
});
