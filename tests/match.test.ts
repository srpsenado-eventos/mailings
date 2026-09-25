import { describe, expect, test } from "vitest";
import {
  compararContato,
  compararGrupo,
  marcarFonteInacessivel,
  mesclarComposicao,
  pontuarPessoa,
  sugerirGrupos,
  unirFontes,
} from "@/lib/match";
import type { ContatoPlanilha, ConteudoFonte, PessoaSite } from "@/lib/types";

const fonte: ConteudoFonte = {
  url: "https://orgao.gov.br",
  textoLimpo: "Ana Maria Política Completa Presidente. João Carlos Destaque Diretor.",
  destaques: [],
  pessoas: [
    { nome: "Ana Maria Política Completa", cargo: "Presidente" },
    { nome: "João Carlos Destaque", cargo: "Diretor" },
  ],
};

/**
 * Contato de teste com `Tratamento` e `Endereçamento` coerentes e conformes à tabela de
 * protocolo. A auditoria dos dois campos roda em todo contato, e célula vazia é achado
 * por si só — sem eles, um teste que audita o site pintaria amarelo por outro motivo.
 */
function contato(p: Partial<ContatoPlanilha>): ContatoPlanilha {
  return {
    nome: "",
    grupo: "ORG",
    tratamento: "Senhor",
    enderecamento: "A Sua Excelência o Senhor",
    ...p,
  };
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

  test("cargo diferente → divergente com valorEsperado preenchido", () => {
    const r = compararContato(
      contato({ nome: "João Carlos Destaque", cargo: "Presidente" }),
      fonte,
    );
    const cargo = r.comparacoes.find((c) => c.campo === "cargo");
    expect(cargo?.situacao).toBe("divergente");
    expect(cargo?.valorEsperado).toBe("Diretor");
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

  test("cargo enriquecido pela fonte confirma o papel da planilha (Ministro (Decano))", () => {
    const f: ConteudoFonte = {
      url: "https://stf",
      textoLimpo: "",
      destaques: [],
      pessoas: [{ nome: "Gilmar Mendes", cargo: "Ministro (Decano)" }],
    };
    const r = compararContato(
      contato({ nome: "Gilmar Mendes", cargo: "Ministro do Supremo Tribunal Federal" }),
      f,
    );
    expect(r.comparacoes.find((c) => c.campo === "cargo")?.situacao).toBe("confere");
    expect(r.semaforo).toBe("verde");
  });

  test("papel da planilha confirmado mesmo com papel extra na fonte (Presidente)", () => {
    const f: ConteudoFonte = {
      url: "https://stf",
      textoLimpo: "",
      destaques: [],
      pessoas: [{ nome: "Edson Fachin", cargo: "Ministro (Presidente)" }],
    };
    const r = compararContato(
      contato({ nome: "Edson Fachin", cargo: "Presidente do Supremo Tribunal Federal" }),
      f,
    );
    expect(r.comparacoes.find((c) => c.campo === "cargo")?.situacao).toBe("confere");
    expect(r.semaforo).toBe("verde");
  });

  test("mudança real de papel (promoção Ministro→Presidente) ainda é divergente", () => {
    const f: ConteudoFonte = {
      url: "https://stf",
      textoLimpo: "",
      destaques: [],
      pessoas: [{ nome: "Fulano Promovido", cargo: "Presidente do Supremo Tribunal Federal" }],
    };
    const r = compararContato(
      contato({ nome: "Fulano Promovido", cargo: "Ministro do Supremo Tribunal Federal" }),
      f,
    );
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

describe("auditoria por campo (IA-first)", () => {
  test("nome divergente do site é flagrado (site é parâmetro)", () => {
    const f: ConteudoFonte = {
      url: "https://x", textoLimpo: "", destaques: [],
      pessoas: [{ nome: "Bruno Dantas", cargo: "Ministro", origem: "pagina" }],
    };
    const r = compararContato(contato({ nome: "Bruno Dantas Nascimento", cargo: "Ministro" }), f);
    const nome = r.comparacoes.find((c) => c.campo === "nome");
    expect(nome?.situacao).toBe("divergente");
    expect(nome?.valorEsperado).toBe("Bruno Dantas");
    expect(r.semaforo).toBe("amarelo");
  });

  test("endereço carrega a origem do dado (conhecimento → confira)", () => {
    const f: ConteudoFonte = {
      url: "https://x", textoLimpo: "", destaques: [],
      pessoas: [{ nome: "Ana Lima", cargo: "Conselheira", endereco: "SAFS Q4", origem: "conhecimento" }],
    };
    const r = compararContato(contato({ nome: "Ana Lima", endereco: "Rua Antiga" }), f);
    const end = r.comparacoes.find((c) => c.campo === "endereco");
    expect(end?.situacao).toBe("divergente");
    expect(end?.origemValor).toBe("conhecimento");
    expect(r.origem).toBe("pesquisa_ampla"); // pessoa veio do conhecimento da IA
  });

  test("não casado → possivelSaida (não é 'fonte não informa')", () => {
    const f: ConteudoFonte = {
      url: "https://x", textoLimpo: "", destaques: [],
      pessoas: [{ nome: "Outra Pessoa Qualquer", cargo: "X", origem: "pagina" }],
    };
    const r = compararContato(contato({ nome: "Zzz Inexistente Pessoa" }), f);
    expect(r.possivelSaida).toBe(true);
    expect(r.semaforo).toBe("vermelho");
    expect(r.observacao).toMatch(/possível saída/i);
  });
});

describe("mesclarComposicao (Camada 1 base + resgate da IA)", () => {
  const alvo = [contato({ nome: "Bruno Dantas Nascimento" })];
  const ia: PessoaSite[] = [
    { nome: "Bruno Dantas Nascimento", cargo: "Ministro", origem: "conhecimento" },
  ];

  test("página ilegível (sem pessoas) → usa a composição da IA (cobertura)", () => {
    expect(mesclarComposicao([], ia, alvo)).toEqual(ia);
  });

  test("página legível → base oficial + resgate de contato que a página não trouxe", () => {
    const pagina: PessoaSite[] = [
      { nome: "Walton Alencar Rodrigues", cargo: "Ministro", origem: "pagina" },
    ];
    const r = mesclarComposicao(pagina, ia, alvo);
    expect(r.map((p) => p.nome)).toEqual([
      "Walton Alencar Rodrigues",
      "Bruno Dantas Nascimento",
    ]);
  });

  test("página legível → NÃO anexa pessoa da IA que nenhum contato casa (sem ruído)", () => {
    const pagina: PessoaSite[] = [
      { nome: "Walton Alencar Rodrigues", cargo: "Ministro", origem: "pagina" },
    ];
    const iaInventada: PessoaSite[] = [
      { nome: "Pessoa Aleatoria Inventada", cargo: "Ministro", origem: "conhecimento" },
    ];
    expect(mesclarComposicao(pagina, iaInventada, alvo).map((p) => p.nome)).toEqual([
      "Walton Alencar Rodrigues",
    ]);
  });

  test("página legível → NÃO duplica quem a IA repete e a página já tem", () => {
    const pagina: PessoaSite[] = [
      { nome: "Bruno Dantas Nascimento", cargo: "Ministro", origem: "pagina" },
    ];
    const r = mesclarComposicao(pagina, ia, alvo);
    expect(r.map((p) => p.nome)).toEqual(["Bruno Dantas Nascimento"]);
    expect(r[0].origem).toBe("pagina"); // a página vence (oficial)
  });
});

describe("unirFontes", () => {
  test("mantém a ordem das fontes e não duplica quem aparece nas duas", () => {
    const primaria = [{ nome: "Alan Rick", fonteUrl: "https://a" }];
    const secundaria = [
      { nome: "Alan Rick", fonteUrl: "https://b", rotuloFonte: "fora de exercício" },
      { nome: "Wellington Dias", fonteUrl: "https://b", rotuloFonte: "fora de exercício" },
    ];
    const unida = unirFontes([primaria, secundaria]);
    expect(unida.map((p) => p.nome)).toEqual(["Alan Rick", "Wellington Dias"]);
    expect(unida[0].fonteUrl).toBe("https://a");
  });

  test("lista vazia de fontes devolve composição vazia", () => {
    expect(unirFontes([])).toEqual([]);
  });

  test("duas pessoas distintas da MESMA fonte não se comparam entre si, mesmo pontuando alto", () => {
    // "Carlos Eduardo Silva" e "Carlos Eduardo Souza" compartilham 2 de 3 tokens fortes
    // (score 0,667 ≥ LIMIAR_PESSOA) — mas são pessoas diferentes na mesma página, e a
    // deduplicação só pode olhar fontes ANTERIORES, nunca a própria lista.
    const fonte = [{ nome: "Carlos Eduardo Silva" }, { nome: "Carlos Eduardo Souza" }];
    const unida = unirFontes([fonte]);
    expect(unida.map((p) => p.nome)).toEqual(["Carlos Eduardo Silva", "Carlos Eduardo Souza"]);
  });

  test("nome de uma fonte anterior ainda funde com o de uma fonte seguinte (Weverton / Weverton Rocha)", () => {
    const primaria = [{ nome: "Weverton" }];
    const secundaria = [{ nome: "Weverton Rocha" }];
    const unida = unirFontes([primaria, secundaria]);
    expect(unida.map((p) => p.nome)).toEqual(["Weverton"]);
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

describe("veredito com fonte rotulada", () => {
  const CADASTRO_OK = { tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" };

  const fonteSenadores: ConteudoFonte = {
    url: "https://senado.leg.br/em-exercicio",
    textoLimpo: "",
    destaques: [],
    pessoas: [
      { nome: "Weverton", uf: "MA", origem: "pagina", fonteUrl: "https://senado.leg.br/em-exercicio" },
      {
        nome: "Wellington Dias",
        uf: "PI",
        origem: "pagina",
        contexto: "Ocupação de cargo de ministro/secretário",
        rotuloFonte: "fora de exercício",
        fonteUrl: "https://senado.leg.br/fora-de-exercicio",
        propoeInclusao: true,
      },
      {
        nome: "Eduardo Girão",
        uf: "CE",
        origem: "pagina",
        contexto: "Licença com convocação de suplente (superior a 120 dias)",
        rotuloFonte: "fora de exercício",
        fonteUrl: "https://senado.leg.br/fora-de-exercicio",
        propoeInclusao: true,
      },
    ],
  };

  test("quem casa pela fonte rotulada sai verde, com a nota e o motivo", () => {
    const r = compararGrupo(
      "Senadores (Maranhão ao Piauí)",
      [{ nome: "Wellington Dias", grupo: "Senadores (Maranhão ao Piauí)", ...CADASTRO_OK }],
      fonteSenadores,
      "Senadores (Maranhão ao Piauí)",
      ["MA", "PI"],
    );
    const c = r.contatos[0];
    expect(c.semaforo).toBe("verde");
    expect(c.possivelSaida).toBeUndefined();
    expect(c.observacao).toBe("fora de exercício — Ocupação de cargo de ministro/secretário");
    expect(c.fonteUrl).toBe("https://senado.leg.br/fora-de-exercicio");
  });

  test("proposta de inclusão só sai no grupo da faixa de UF", () => {
    const r = compararGrupo(
      "Senadores (Maranhão ao Piauí)",
      [{ nome: "Weverton", grupo: "Senadores (Maranhão ao Piauí)", ...CADASTRO_OK }],
      fonteSenadores,
      "Senadores (Maranhão ao Piauí)",
      ["MA", "PI"],
    );
    expect(r.novos.map((n) => n.nome)).toEqual(["Wellington Dias"]);
  });

  test("pessoa de fonte que não propõe inclusão e não tem cargo não vira novo", () => {
    const r = compararGrupo(
      "Senadores (Maranhão ao Piauí)",
      [{ nome: "Wellington Dias", grupo: "Senadores (Maranhão ao Piauí)", ...CADASTRO_OK }],
      fonteSenadores,
      "Senadores (Maranhão ao Piauí)",
      ["MA", "PI"],
    );
    expect(r.novos.map((n) => n.nome)).not.toContain("Weverton");
  });
});
