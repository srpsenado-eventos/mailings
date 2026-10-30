import { describe, expect, test } from "vitest";
import {
  aplicarNomesDoContatos,
  compararContato,
  compararContatoSemFonteOficial,
  compararGrupo,
  contarContatosCasados,
  marcarFonteInacessivel,
  mesclarComposicao,
  MOTIVO_SEM_LISTA,
  novosForaDaPlanilha,
  OBSERVACAO_SEM_FONTE_OFICIAL,
  pontuarPessoa,
  situacaoCampo,
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

  test("proposta de inclusão sem UF publicada entra no grupo: o filtro não inventa exclusão", () => {
    // Arrange: a fonte não publicou a UF desta pessoa. A direção é conservadora de
    // propósito — é melhor propor no grupo errado do que deixar autoridade de fora.
    const semUf: ConteudoFonte = {
      ...fonteSenadores,
      pessoas: [
        {
          nome: "Fulana de Tal",
          origem: "pagina",
          rotuloFonte: "fora de exercício",
          propoeInclusao: true,
        },
      ],
    };

    // Act
    const r = compararGrupo("Senadores (Maranhão ao Piauí)", [], semUf, undefined, ["MA", "PI"]);

    // Assert
    expect(r.novos.map((n) => n.nome)).toEqual(["Fulana de Tal"]);
  });

  test("grupo sem faixa de UF cadastrada não filtra proposta nenhuma", () => {
    // Arrange/Act: mesmo cadastro, sem `ufs` — nada a filtrar, tudo passa.
    const r = compararGrupo("Senadores (Maranhão ao Piauí)", [], fonteSenadores, undefined);

    // Assert
    expect(r.novos.map((n) => n.nome)).toEqual(["Wellington Dias", "Eduardo Girão"]);
  });
});

describe("compararGrupo com fonte incompleta (alguma fonte do grupo não respondeu)", () => {
  const CADASTRO_OK = { tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" };
  const fonte: ConteudoFonte = {
    url: "https://orgao.gov.br",
    textoLimpo: "",
    destaques: [],
    pessoas: [{ nome: "Ana Maria Política Completa", origem: "pagina" }],
  };
  const ausente = { nome: "Beatriz Sousa Ausente", grupo: "ORG", ...CADASTRO_OK };

  test("quem não casa fica indeterminado, nunca possível saída", () => {
    // Arrange/Act
    const r = compararGrupo("ORG", [ausente], fonte, "ORG", undefined, true);

    // Assert
    const c = r.contatos[0];
    expect(c.semaforo).toBe("indeterminado");
    expect(c.possivelSaida).toBeUndefined();
    expect(c.observacao).toMatch(/não respondeu/);
  });

  test("com todas as fontes de pé, quem não casa segue possível saída", () => {
    // Arrange/Act
    const r = compararGrupo("ORG", [ausente], fonte, "ORG");

    // Assert
    const c = r.contatos[0];
    expect(c.semaforo).toBe("vermelho");
    expect(c.possivelSaida).toBe(true);
  });
});

describe("contarContatosCasados (spec 2026-10-20 §5.1)", () => {
  const contatos = [
    { nome: "Ana Maria Política Completa", grupo: "G" },
    { nome: "Beto Carlos Exemplo", grupo: "G" },
    { nome: "Carla Ninguém Sabe", grupo: "G" },
  ];
  test("conta quantos contatos casam alguém da composição pela régua de mesclarComposicao", () => {
    const pessoas = [{ nome: "Ana Maria Política Completa" }, { nome: "Beto Exemplo" }, { nome: "Zé Outro" }];
    expect(contarContatosCasados(contatos, pessoas)).toBe(2);
  });
  test("composição vazia casa zero", () => {
    expect(contarContatosCasados(contatos, [])).toBe(0);
  });
});

describe("nome em destaque (spec 2026-10-30 §3.1, STJ)", () => {
  const STJ: ConteudoFonte = {
    url: "https://www.stj.jus.br/web/verMinistrosSTJ?parametro=1",
    textoLimpo: "",
    destaques: [],
    pessoas: [{ nome: "Sérgio Luíz Kukina", nomeDestaque: "Sérgio Kukina" }],
  };
  const nomeDe = (r: ReturnType<typeof compararContato>) => r.comparacoes.find((c) => c.campo === "nome");

  test("contato igual ao destaque confere", () => {
    // Arrange / Act
    const r = compararContato(contato({ nome: "Sérgio Kukina" }), STJ);

    // Assert
    expect(nomeDe(r)?.situacao).toBe("confere");
    expect(nomeDe(r)?.valorEsperado).toBe("Sérgio Kukina");
    expect(r.semaforo).toBe("verde");
  });

  test("contato igual ao nome completo, mas não ao destaque, diverge com o destaque como esperado", () => {
    const r = compararContato(contato({ nome: "Sérgio Luíz Kukina" }), STJ);
    expect(nomeDe(r)?.situacao).toBe("divergente");
    expect(nomeDe(r)?.valorEsperado).toBe("Sérgio Kukina");
    expect(r.camposDivergentes).toContainEqual({ campo: "nome", valorPlanilha: "Sérgio Luíz Kukina", valorEncontrado: "Sérgio Kukina" });
  });

  test("pessoa sem destaque segue como hoje: o nome completo é o esperado", () => {
    const semDestaque: ConteudoFonte = { ...STJ, pessoas: [{ nome: "Sérgio Luíz Kukina" }] };
    expect(nomeDe(compararContato(contato({ nome: "Sérgio Luíz Kukina" }), semDestaque))?.situacao).toBe("confere");
    const curto = nomeDe(compararContato(contato({ nome: "Sérgio Kukina" }), semDestaque));
    expect(curto?.situacao).toBe("divergente");
    expect(curto?.valorEsperado).toBe("Sérgio Luíz Kukina");
  });

  test("o casamento considera também o destaque (o maior dos dois escores)", () => {
    // Arrange — pelo nome completo só 2 de 5 partes casam; pelo destaque, 2 de 2
    const pessoa: PessoaSite = { nome: "Ana Bia Carla Dora Eva", nomeDestaque: "Ana Eva" };
    const f: ConteudoFonte = { ...STJ, pessoas: [pessoa] };
    const c = contato({ nome: "Ana Eva Fabi Gina Hele" });
    expect(pontuarPessoa(c.nome, pessoa.nome)).toBeLessThan(0.6);

    // Act
    const r = compararContato(c, f);

    // Assert
    expect(r.possivelSaida).toBeUndefined();
    expect(nomeDe(r)?.valorEsperado).toBe("Ana Eva");
    expect(contarContatosCasados([c], [pessoa])).toBe(1);
  });

  test("destaque de uma palavra só não vale para o casamento, mas continua o nome esperado", () => {
    // Arrange — "Moura" sozinho casaria "Moura Ribeiro" com a pessoa errada
    const errada: PessoaSite = { nome: "Maria Thereza Rocha de Assis Moura", nomeDestaque: "Moura" };
    const certa: PessoaSite = { nome: "Paulo Dias de Moura Ribeiro", nomeDestaque: "Moura Ribeiro" };
    const c = contato({ nome: "Moura Ribeiro" });

    // Act
    const r = compararContato(c, { ...STJ, pessoas: [errada, certa] });
    const soErrada = compararContato(c, { ...STJ, pessoas: [errada] });

    // Assert
    expect(nomeDe(r)?.valorEsperado).toBe("Moura Ribeiro");
    expect(nomeDe(r)?.situacao).toBe("confere");
    expect(soErrada.possivelSaida).toBe(true);
    expect(contarContatosCasados([c], [errada])).toBe(0);
    const pelaPessoa = compararContato(contato({ nome: "Maria Thereza Rocha de Assis Moura" }), { ...STJ, pessoas: [errada] });
    expect(nomeDe(pelaPessoa)?.valorEsperado).toBe("Moura");
  });

  test("presidente do STJ com destaque: confere pelo destaque, com o prefixo \"Ministro\" e sem achado de prefixo", () => {
    // Arrange
    const pessoa: PessoaSite = { nome: "Antonio Herman de Vasconcellos e Benjamin", nomeDestaque: "Herman Benjamin", cargo: "Presidente" };
    const c = contato({ nome: "Ministro Herman Benjamin", grupo: "STJ", cargo: "Presidente do Superior Tribunal de Justiça" });

    // Act
    const g = compararGrupo("STJ", [c], { ...STJ, pessoas: [pessoa] }, "Ministros do STJ");
    const r = g.contatos[0];

    // Assert
    expect(nomeDe(r)?.situacao).toBe("confere");
    expect(nomeDe(r)?.valorEsperado).toBe("Ministro Herman Benjamin");
    expect(r.comparacoes.find((x) => x.campo === "cargo")?.situacao).toBe("confere");
    expect(r.comparacoes.some((x) => x.achado === "nome_sem_prefixo")).toBe(false);
  });

  test("proposta de inclusão mostra o nome em destaque e guarda o completo no contexto", () => {
    // Arrange
    const nova: PessoaSite = { nome: "Maria Thereza Rocha de Assis Moura", nomeDestaque: "Maria Thereza Moura", cargo: "Ministra" };
    const semDestaque: PessoaSite = { nome: "Paulo Dias Exemplo", cargo: "Ministro", contexto: "Convocado" };

    // Act
    const g = compararGrupo("STJ", [], { ...STJ, pessoas: [nova, semDestaque] });
    const fora = novosForaDaPlanilha([nova, semDestaque], []);

    // Assert
    for (const novos of [g.novos, fora]) {
      expect(novos[0].nome).toBe("Maria Thereza Moura");
      expect(novos[0].contexto).toBe("Nome completo: Maria Thereza Rocha de Assis Moura");
      expect(novos[1]).toEqual(semDestaque);
    }
  });
});

describe("aplicarNomesDoContatos (spec 2026-10-23 §4.2)", () => {
  const contatos = [{ nome: "Garibaldi Alves Filho", grupo: "G", tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" }, { nome: "Outra Pessoa Qualquer", grupo: "G", tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" }];
  const fonte = { url: "https://x.leg.br", textoLimpo: "", destaques: [], pessoas: [{ nome: "Garibaldi Alves" }, { nome: "Outra Pessoa" }] };
  test("nome da lista que casou sai confere com o nome do Contatos; os demais não mudam", () => {
    const g = aplicarNomesDoContatos(compararGrupo("G", contatos, fonte), ["Garibaldi Alves Filho"]);
    const [gar, outra] = g.contatos;
    expect(gar.comparacoes.find((c) => c.campo === "nome")).toMatchObject({ situacao: "confere", valorEsperado: "Garibaldi Alves Filho" });
    expect(gar.semaforo).toBe("verde");
    expect(gar.camposDivergentes.some((d) => d.campo === "nome")).toBe(false);
    expect(outra.comparacoes.find((c) => c.campo === "nome")?.situacao).toBe("divergente");
  });
  test("nome da lista que não casou ninguém continua possível saída", () => {
    const g = aplicarNomesDoContatos(compararGrupo("G", contatos, { ...fonte, pessoas: [{ nome: "Ninguém Conhecido" }] }), ["Garibaldi Alves Filho"]);
    expect(g.contatos[0].possivelSaida).toBe(true);
  });
  test("lista vazia devolve o grupo igual", () => {
    const antes = compararGrupo("G", contatos, fonte);
    expect(aplicarNomesDoContatos(antes, [])).toEqual(antes);
  });
});

describe("compararContatoSemFonteOficial (spec 2026-10-30 §4.5)", () => {
  const OK: ContatoPlanilha = {
    nome: "Fulano de Tal",
    grupo: "Convidados do presidente eleito - Posse 2027",
    tratamento: "Senhor",
    enderecamento: "A Sua Excelência o Senhor",
    telefone: "(61) 1111-1111",
  };

  test("neutro com tratamento coerente sai verde, com a observação de sem fonte oficial", () => {
    const r = compararContatoSemFonteOficial(OK, "neutro");
    expect(r.semaforo).toBe("verde");
    expect(r.observacao).toBe(OBSERVACAO_SEM_FONTE_OFICIAL);
    expect(r.possivelSaida).toBeUndefined();
    expect(r.camposDivergentes.some((d) => d.campo === "fonte")).toBe(false);
    expect(r.comparacoes.filter((c) => c.campo === "nome" || c.campo === "cargo").every((c) => c.situacao === "fonte_nao_informa")).toBe(true);
    expect(r.comparacoes.some((c) => c.campo === "telefone" && c.situacao === "fonte_nao_informa")).toBe(true);
  });

  test("neutro com tratamento divergente do gênero do cargo sai amarelo, nunca saída", () => {
    const r = compararContatoSemFonteOficial({ ...OK, tratamento: "Senhora", cargo: "Ministro de Estado" }, "neutro");
    expect(r.semaforo).toBe("amarelo");
    expect(r.camposDivergentes.length).toBeGreaterThan(0);
    expect(r.possivelSaida).toBeUndefined();
  });

  test("lista sai indeterminado com o motivo de sem a lista, nunca saída", () => {
    const r = compararContatoSemFonteOficial(OK, "lista");
    expect(r.semaforo).toBe("indeterminado");
    expect(r.observacao).toBe(MOTIVO_SEM_LISTA);
    expect(r.possivelSaida).toBeUndefined();
    expect(r.camposDivergentes.some((d) => d.campo === "fonte")).toBe(false);
  });
});

describe("cargo nos tribunais (spec 2026-10-30 §3.2)", () => {
  const TRIBUNAL = { tribunal: true };

  test("função de tribunal da página confirma o Ministro do Contatos", () => {
    expect(situacaoCampo("Ministro do Superior Tribunal de Justiça", "Vice-Presidente e Corregedor-Geral da Justiça Federal", TRIBUNAL)).toBe("confere");
    expect(situacaoCampo("Ministro do Superior Tribunal de Justiça", "Diretor-Geral da ENFAM", TRIBUNAL)).toBe("confere");
    expect(situacaoCampo("Ministro do TSE", "(Corregedor-Geral)", TRIBUNAL)).toBe("confere");
    expect(situacaoCampo("Ministro do Tribunal Superior do Trabalho", "Corregedor-Geral da Justiça do Trabalho", TRIBUNAL)).toBe("confere");
    expect(situacaoCampo("Ministro do STF", "Ministro (Decano)", TRIBUNAL)).toBe("confere");
    expect(situacaoCampo("Ministra do STJ", "Ouvidora", TRIBUNAL)).toBe("confere");
  });

  test("Ministro(a) da página confirma a Ministra do Contatos", () => {
    expect(situacaoCampo("Ministra do STM", "Ministro(a)", TRIBUNAL)).toBe("confere");
    expect(situacaoCampo("Ministro do STM", "Ministro(a)", TRIBUNAL)).toBe("confere");
  });

  test("um gênero explícito na página não confirma o outro gênero do Contatos", () => {
    expect(situacaoCampo("Ministra do STF", "Ministro", TRIBUNAL)).toBe("divergente");
    expect(situacaoCampo("Ministro do STF", "Ministra", TRIBUNAL)).toBe("divergente");
  });

  test("Presidente do tribunal é confirmado por Presidente ou só por Ministro", () => {
    expect(situacaoCampo("Presidente do Supremo Tribunal Federal", "Ministro", TRIBUNAL)).toBe("confere");
    expect(situacaoCampo("Presidente do Supremo Tribunal Federal", "Ministro(a)", TRIBUNAL)).toBe("confere");
    expect(situacaoCampo("Presidente do Supremo Tribunal Federal", "Presidente", TRIBUNAL)).toBe("confere");
    expect(situacaoCampo("Presidente do Supremo Tribunal Federal", "PRESIDENTE:", TRIBUNAL)).toBe("confere");
    expect(situacaoCampo("Presidente do Superior Tribunal de Justiça", "Presidente:", TRIBUNAL)).toBe("confere");
  });

  test("função específica diferente não confirma Presidente do tribunal", () => {
    expect(situacaoCampo("Presidente do Supremo Tribunal Federal", "Vice-Presidente", TRIBUNAL)).toBe("divergente");
    expect(situacaoCampo("Presidente do TST", "Corregedor-Geral da Justiça do Trabalho", TRIBUNAL)).toBe("divergente");
  });

  test("página que diz Presidente para quem está cadastrado como Ministro diverge", () => {
    expect(situacaoCampo("Ministro do STF", "Presidente", TRIBUNAL)).toBe("divergente");
    expect(situacaoCampo("Ministro do STF", "PRESIDENTE:", TRIBUNAL)).toBe("divergente");
  });

  test("Substituto, Interino e Ex- continuam negando a função no tribunal", () => {
    expect(situacaoCampo("Ministro do Tribunal de Contas da União", "Ministro-Substituto", TRIBUNAL)).toBe("divergente");
    expect(situacaoCampo("Presidente do STF", "Ex-Presidente", TRIBUNAL)).toBe("divergente");
    expect(situacaoCampo("Ministra do STJ", "Decana", TRIBUNAL)).toBe("confere");
  });

  test("Ministro/Ministra da página no tribunal confirma os dois gêneros", () => {
    expect(situacaoCampo("Ministra do STF", "Ministro/Ministra", TRIBUNAL)).toBe("confere");
    expect(situacaoCampo("Ministro do STF", "Ministro/Ministra", TRIBUNAL)).toBe("confere");
  });

  test("Vice Presidente com espaço é vice, não presidência própria", () => {
    expect(situacaoCampo("Ministro do STJ", "Vice Presidente", TRIBUNAL)).toBe("confere");
    expect(situacaoCampo("Presidente do STJ", "Vice Presidente", TRIBUNAL)).toBe("divergente");
  });

  test("Ministra do Contatos com função no masculino explícito na página diverge (escolha da revisão)", () => {
    expect(situacaoCampo("Ministra do TST", "Corregedor-Geral da Justiça do Trabalho", TRIBUNAL)).toBe("divergente");
    expect(situacaoCampo("Ministra do TST", "Corregedora-Geral da Justiça do Trabalho", TRIBUNAL)).toBe("confere");
  });

  test("convocado continua comparado como hoje", () => {
    expect(situacaoCampo("Desembargador Convocado do STJ", "Desembargador Convocado", TRIBUNAL)).toBe("confere");
    expect(situacaoCampo("Desembargador Convocado do STJ", "Vice-Presidente", TRIBUNAL)).toBe("divergente");
  });

  test("fora de tribunal as funções não confirmam Ministro e a regra de papel continua", () => {
    expect(situacaoCampo("Ministro do Superior Tribunal de Justiça", "Vice-Presidente e Corregedor-Geral da Justiça Federal")).toBe("divergente");
    expect(situacaoCampo("Governador do Estado de Sergipe", "Secretário Especial de Governo")).toBe("divergente");
    expect(situacaoCampo("Presidente", "Vice-Presidente")).toBe("divergente");
    expect(situacaoCampo("Ministra de Estado", "Ministro de Estado")).toBe("divergente");
  });

  test("gênero neutro da página vale em qualquer grupo: Ministro(a) e Ministro/Ministra confirmam os dois", () => {
    expect(situacaoCampo("Ministra de Estado", "Ministro(a) de Estado")).toBe("confere");
    expect(situacaoCampo("Ministro de Estado", "Ministro(a) de Estado")).toBe("confere");
    expect(situacaoCampo("Ministra de Estado", "Ministro/Ministra de Estado")).toBe("confere");
    expect(situacaoCampo("Ministro de Estado", "Ministro/Ministra de Estado")).toBe("confere");
  });

  test("compararGrupo de tribunal confirma o cargo pela função da página", () => {
    const f: ConteudoFonte = {
      url: "https://tse",
      textoLimpo: "",
      destaques: [],
      pessoas: [{ nome: "Fulano de Tal Silva", cargo: "(Corregedor-Geral)" }],
    };
    const r = compararGrupo("TSE", [contato({ nome: "Fulano de Tal Silva", cargo: "Ministro do TSE" })], f, "Ministros do TSE");
    expect(r.contatos[0].comparacoes.find((c) => c.campo === "cargo")?.situacao).toBe("confere");
  });

  test("troca de presidência no tribunal: esperado é Presidente do tribunal, não o texto da página", () => {
    const f: ConteudoFonte = {
      url: "https://tse",
      textoLimpo: "",
      destaques: [],
      pessoas: [{ nome: "Fulano de Tal Silva", cargo: "(Presidente)" }],
    };
    const r = compararGrupo("TSE", [contato({ nome: "Fulano de Tal Silva", cargo: "Ministro do Tribunal Superior Eleitoral" })], f, "Ministros do TSE");
    expect(r.contatos[0].comparacoes.find((c) => c.campo === "cargo")).toMatchObject({
      situacao: "divergente",
      valorEsperado: "Presidente do Tribunal Superior Eleitoral",
    });
  });

  test("fora da troca de presidência o esperado continua o da página", () => {
    const f: ConteudoFonte = {
      url: "https://stf",
      textoLimpo: "",
      destaques: [],
      pessoas: [{ nome: "Fulano de Tal Silva", cargo: "Vice-Presidente" }],
    };
    const r = compararGrupo("STF", [contato({ nome: "Fulano de Tal Silva", cargo: "Presidente do Supremo Tribunal Federal" })], f, "Ministros do STF");
    expect(r.contatos[0].comparacoes.find((c) => c.campo === "cargo")).toMatchObject({ situacao: "divergente", valorEsperado: "Vice-Presidente" });
  });

  test("compararGrupo fora de tribunal mantém a divergência pela mesma página", () => {
    const f: ConteudoFonte = {
      url: "https://orgao",
      textoLimpo: "",
      destaques: [],
      pessoas: [{ nome: "Fulano de Tal Silva", cargo: "(Corregedor-Geral)" }],
    };
    const r = compararGrupo("ORG", [contato({ nome: "Fulano de Tal Silva", cargo: "Ministro do TSE" })], f, "ORG");
    expect(r.contatos[0].comparacoes.find((c) => c.campo === "cargo")?.situacao).toBe("divergente");
  });
});

describe("cargo do ex-presidente com o período (spec 2026-10-30 §3.5)", () => {
  test("o período não atrapalha o papel: confere com a página que diz o cargo sem período", () => {
    // Assert
    expect(situacaoCampo("Presidente do Senado Federal de 2019 a 2021", "Presidente do Senado Federal")).toBe("confere");
    expect(situacaoCampo("Presidente do Senado Federal de 1995 a 1997 e de 2009 a 2011", "Presidente do Senado Federal")).toBe("confere");
  });

  test('"1º Vice-Presidente" na página continua divergente', () => {
    // Assert
    expect(situacaoCampo("Presidente do Senado Federal de 2019 a 2021", "1º Vice-Presidente")).toBe("divergente");
  });
});
