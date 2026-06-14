import { describe, expect, test } from "vitest";
import {
  compararContato,
  compararGrupo,
  compararGrupoAmplo,
  marcarFonteInacessivel,
  pontuarPessoa,
  sugerirGrupos,
} from "@/lib/match";
import type { ContatoPlanilha, ConteudoFonte } from "@/lib/types";

const fonte: ConteudoFonte = {
  url: "https://orgao.gov.br",
  textoLimpo: "Ana Maria Política Completa Presidente. João Carlos Destaque Diretor.",
  destaques: [],
  pessoas: [
    { nome: "Ana Maria Política Completa", cargo: "Presidente" },
    { nome: "João Carlos Destaque", cargo: "Diretor" },
  ],
};

function contato(p: Partial<ContatoPlanilha>): ContatoPlanilha {
  return { nome: "", grupo: "ORG", ...p };
}

describe("pontuarPessoa", () => {
  test("casa variação de nome (sobrenomes em comum)", () => {
    expect(
      pontuarPessoa("Sívio Roberto Oliveira de Amorim Júnior", "Silvio Amorim Junior"),
    ).toBeGreaterThanOrEqual(0.6);
  });

  test("nomes sem relação não casam", () => {
    expect(pontuarPessoa("Ana Maria Política", "Carlos Eduardo Souza")).toBeLessThan(0.6);
  });
});

describe("compararContato (por campo)", () => {
  test("cargo igual ao site → confere, semáforo verde", () => {
    const r = compararContato(
      contato({ nome: "Ana Maria Política Completa", cargo: "Presidente" }),
      fonte,
    );
    expect(r.semaforo).toBe("verde");
    expect(r.comparacoes.find((c) => c.campo === "cargo")?.situacao).toBe("confere");
  });

  test("cargo diferente → divergente com valorSite preenchido", () => {
    const r = compararContato(
      contato({ nome: "João Carlos Destaque", cargo: "Presidente" }),
      fonte,
    );
    const cargo = r.comparacoes.find((c) => c.campo === "cargo");
    expect(cargo?.situacao).toBe("divergente");
    expect(cargo?.valorSite).toBe("Diretor");
    expect(r.camposDivergentes.some((c) => c.campo === "cargo")).toBe(true);
    expect(r.semaforo).toBe("amarelo");
  });

  test("cargo com fragmento entre parênteses confere por tokens (não é divergência)", () => {
    const f: ConteudoFonte = {
      url: "https://stf",
      textoLimpo: "",
      destaques: [],
      pessoas: [{ nome: "Edson Fachin", cargo: "(Presidente)" }],
    };
    const r = compararContato(
      contato({ nome: "Edson Fachin", cargo: "Presidente do Supremo Tribunal Federal" }),
      f,
    );
    expect(r.comparacoes.find((c) => c.campo === "cargo")?.situacao).toBe("confere");
    expect(r.semaforo).toBe("verde");
  });

  test("cargo de 1 token não confere com prefixo negante (Presidente ≠ Vice-Presidente)", () => {
    const f: ConteudoFonte = {
      url: "https://stf",
      textoLimpo: "",
      destaques: [],
      pessoas: [{ nome: "Alexandre de Moraes", cargo: "Vice-Presidente do Supremo Tribunal Federal" }],
    };
    const r = compararContato(contato({ nome: "Alexandre de Moraes", cargo: "Presidente" }), f);
    expect(r.comparacoes.find((c) => c.campo === "cargo")?.situacao).toBe("divergente");
    expect(r.semaforo).toBe("amarelo");
  });

  test("endereço da planilha → fonte_nao_informa (não vira divergência)", () => {
    const r = compararContato(
      contato({ nome: "Ana Maria Política Completa", endereco: "Praça X" }),
      fonte,
    );
    const end = r.comparacoes.find((c) => c.campo === "endereco");
    expect(end?.situacao).toBe("fonte_nao_informa");
    expect(r.camposDivergentes.some((c) => c.campo === "endereco")).toBe(false);
  });

  test("nome ausente nas pessoas → vermelho", () => {
    const r = compararContato(contato({ nome: "Pessoa Inexistente Qualquer" }), fonte);
    expect(r.semaforo).toBe("vermelho");
  });

  test("origem é oficial por padrão", () => {
    const r = compararContato(contato({ nome: "Ana Maria Política Completa" }), fonte);
    expect(r.origem).toBe("oficial");
  });
});

describe("compararGrupo", () => {
  test("pessoa casada sai do pool de novos (sem duplo-cont)", () => {
    const r = compararGrupo("ORG", [contato({ nome: "Ana Maria Política Completa" })], fonte);
    expect(r.novos.map((n) => n.nome)).toEqual(["João Carlos Destaque"]);
    expect(r.novos.map((n) => n.nome)).not.toContain("Ana Maria Política Completa");
  });

  test("grupo sem fonte marca semFonte=true e não derruba", () => {
    const r = compararGrupo("ORG", [contato({ nome: "Ana" })], undefined);
    expect(r.semFonte).toBe(true);
    expect(r.contatos[0].semaforo).toBe("vermelho");
  });

  test("novos exige cargo: item de menu (sem cargo) não vira novo", () => {
    const f: ConteudoFonte = {
      url: "https://x",
      textoLimpo: "",
      destaques: [],
      pessoas: [
        { nome: "Mapa do Site" }, // item de menu, sem cargo
        { nome: "Ana Maria Política Completa", cargo: "Presidente" },
      ],
    };
    const r = compararGrupo("ORG", [contato({ nome: "Zzz Inexistente Pessoa" })], f);
    expect(r.novos.map((n) => n.nome)).toEqual(["Ana Maria Política Completa"]);
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

describe("compararGrupoAmplo", () => {
  test("marca viaPesquisaAmpla, origem pesquisa_ampla e preserva a URL oficial", () => {
    const r = compararGrupoAmplo(
      "ORG",
      [contato({ nome: "Ana Maria Política Completa" })],
      fonte,
      "https://oficial.gov.br",
    );
    expect(r.viaPesquisaAmpla).toBe(true);
    expect(r.semFonte).toBe(false);
    expect(r.fonteUrl).toBe("https://oficial.gov.br");
    expect(r.contatos[0].origem).toBe("pesquisa_ampla");
    expect(r.contatos[0].semaforo).toBe("verde");
  });

  test("sem URL oficial, mantém a URL da fonte ampla", () => {
    const r = compararGrupoAmplo("ORG", [contato({ nome: "Ana Maria Política Completa" })], fonte);
    expect(r.fonteUrl).toBe(fonte.url);
    expect(r.viaPesquisaAmpla).toBe(true);
  });
});

describe("sugerirGrupos", () => {
  const cadastrados = [
    "Governadores",
    "Ministros do STF",
    "Conselho Nacional de Justiça (CNJ)",
  ];

  test("sugere o nome cadastrado mais próximo de um rótulo parecido", () => {
    const s = sugerirGrupos(["governador de sao paulo"], cadastrados);
    expect(s[0]).toBe("Governadores");
  });

  test("ordena por proximidade e respeita o limite", () => {
    const s = sugerirGrupos(["ministros do stf"], cadastrados, 1);
    expect(s).toEqual(["Ministros do STF"]);
  });

  test("rótulo sem semelhança nenhuma não gera sugestão fraca", () => {
    const s = sugerirGrupos(["xpto zzz"], cadastrados);
    expect(s).toHaveLength(0);
  });

  test("segmentos vazios → sem sugestões", () => {
    expect(sugerirGrupos([], cadastrados)).toHaveLength(0);
  });
});
