import { describe, expect, test } from "vitest";
import {
  resolverRegra,
  comparacoesProtocolo,
  linhaDeEnderecamento,
  formaNominal,
} from "@/lib/tratamento";
import type { ContatoPlanilha, RegraTratamento } from "@/lib/types";

function regra(cargoDestinatario: string, vocativo: string, enderecamento = ""): RegraTratamento {
  return { cargoDestinatario, nominata: "", vocativo, pronome: "", enderecamento };
}

const REGRAS: RegraTratamento[] = [
  regra(
    "Ministro de Tribunal Superior",
    "Senhor(a) Ministro(a)",
    "A Sua Excelência o(a) Senhor(a)\n[Nome]\nMinistro(a)\nTribunal Superior",
  ),
  regra(
    "Governador",
    "Excelentíssimo Senhor(a) Governador(a)",
    "A Sua Excelência o(a) Senhor(a)\n[Nome]\nGovernador(a) do Estado",
  ),
  regra("Vereador", "Senhor(a) Vereador(a)"),
  regra(
    "Cônsul",
    "Senhor(a) Cônsul (Consulesa)",
    "Ao Senhor (À Senhora)\n[Nome]\nCônsul (Consulesa)",
  ),
  regra("Papa", "Santíssimo Padre", "A Sua Santidade o Senhor\n[Nome]\nPapa"),
];

/** Entradas cujo `cargoDestinatario` é multilinha, como as militares da tabela real. */
const MULTILINHA: RegraTratamento[] = [
  regra(
    "Militares com patente superior\n- Almirante\n- General de Exército\n- Brigadeiro do Ar",
    "Senhor(a) [Patente]",
    "A Sua Excelência o(a) Senhor(a)\n[Patente] [Nome]",
  ),
  regra(
    "Demais patentes militares\nEx.: Capitão de Mar e Guerra, Coronel, Major, entre outros.",
    "Senhor(a) [Patente]",
    "Ao Senhor (À Senhora)\n[Patente] [Nome]",
  ),
  regra(
    "Ministro de Estado\n(Incluir nesse padrão as autoridades com status de Ministro de Estado)",
    "Senhor(a) Ministro(a)",
    "A Sua Excelência o(a) Senhor(a)\n[Nome]\nMinistro(a) de Estado",
  ),
];

function contato(extra: Partial<ContatoPlanilha> = {}): ContatoPlanilha {
  return { nome: "Ana Maria Souza", grupo: "G", ...extra };
}

// ---------------------------------------------------------------------------
// Decisão 1 — o cadastro guarda só a primeira linha do bloco de endereçamento.
// ---------------------------------------------------------------------------

describe("linhaDeEnderecamento", () => {
  test("devolve só a primeira das quatro linhas do bloco", () => {
    const bloco = "A Sua Excelência o(a) Senhor(a)\n[Nome]\nPresidente\nSupremo Tribunal Federal";
    expect(linhaDeEnderecamento(bloco)).toBe("A Sua Excelência o(a) Senhor(a)");
  });

  test("apara o espaço que a planilha de protocolo deixa no fim da linha", () => {
    expect(linhaDeEnderecamento("A Sua Excelência o(a) Senhor(a) \nMinistro(a) [Nome]")).toBe(
      "A Sua Excelência o(a) Senhor(a)",
    );
  });

  test("bloco ausente ou vazio devolve undefined", () => {
    expect(linhaDeEnderecamento(undefined)).toBeUndefined();
    expect(linhaDeEnderecamento("   \n[Nome]")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Decisão 2 — o tratamento é a forma nominal da mesma primeira linha.
// ---------------------------------------------------------------------------

describe("formaNominal — as oito primeiras linhas da tabela real", () => {
  const casos: ReadonlyArray<readonly [string, string]> = [
    ["A Sua Excelência o(a) Senhor(a)", "Senhor(a)"],
    ["Ao Senhor (À Senhora)", "Senhor (Senhora)"],
    ["A Sua Excelência Reverendíssima o Senhor", "Senhor"],
    ["A Sua Santidade o Senhor", "Senhor"],
    ["A Sua Eminência o Senhor", "Senhor"],
    ["Ao Reverendíssimo Senhor", "Senhor"],
    ["Ao Reverendo Senhor", "Senhor"],
    ["Ao Magnífico Senhor (À Magnífica Senhora)", "Senhor (Senhora)"],
  ];

  for (const [linha, esperado] of casos) {
    test(`extrai "${esperado}" de "${linha}"`, () => {
      expect(formaNominal(linha)).toBe(esperado);
    });
  }

  test("a forma feminina perde o mesmo preâmbulo que a masculina", () => {
    // Sem isso "Ao Magnífico Senhor (À Magnífica Senhora)" aceitaria "Senhor" mas
    // reprovaria "Senhora", acusando uma autoridade corretamente cadastrada.
    expect(formaNominal("Ao Magnífico Senhor (À Magnífica Senhora)")).not.toContain("Magnífica");
  });

  test("linha sem núcleo nominal devolve undefined, para virar sem_regra", () => {
    expect(formaNominal("Ao Excelentíssimo Chefe de Gabinete")).toBeUndefined();
    expect(formaNominal("")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Decisão 3 — margem sobre o segundo colocado e qualificador de titularidade.
// ---------------------------------------------------------------------------

describe("resolverRegra", () => {
  test("casa exatamente pelo nome normalizado", () => {
    expect(resolverRegra("governador", REGRAS, {})?.cargoDestinatario).toBe("Governador");
  });

  test("tolera acento e caixa", () => {
    expect(resolverRegra("GOVERNADOR", REGRAS, {})?.cargoDestinatario).toBe("Governador");
  });

  test("casa uma das alternativas separadas por barra no nome do cargo", () => {
    const comBarra = [regra("Presidente do Congresso Nacional / Senado Federal", "V")];
    const r = resolverRegra("Senado Federal", comBarra, {});
    expect(r?.cargoDestinatario).toBe("Presidente do Congresso Nacional / Senado Federal");
  });

  test("similaridade cobre variação de gênero no cargo da planilha", () => {
    expect(resolverRegra("Governadora", REGRAS, {})?.cargoDestinatario).toBe("Governador");
  });

  test("exceção manual tem precedência sobre similaridade", () => {
    const r = resolverRegra("Ministro do STF", REGRAS, {
      "ministro do stf": "Ministro de Tribunal Superior",
    });
    expect(r?.cargoDestinatario).toBe("Ministro de Tribunal Superior");
  });

  test("cargo ausente devolve undefined", () => {
    expect(resolverRegra(undefined, REGRAS, {})).toBeUndefined();
  });

  test("cargo sem correspondência plausível devolve undefined", () => {
    expect(resolverRegra("Zelador do Anexo II", REGRAS, {})).toBeUndefined();
  });

  test("casa patente listada como item de detalhe com hífen", () => {
    const r = resolverRegra("General de Exército", MULTILINHA, {});
    expect(r?.cargoDestinatario.split("\n")[0]).toBe("Militares com patente superior");
  });

  test("casa patente listada como exemplo depois de Ex.:", () => {
    const r = resolverRegra("Coronel", MULTILINHA, {});
    expect(r?.cargoDestinatario.split("\n")[0]).toBe("Demais patentes militares");
  });

  test("o fecho 'entre outros' da lista de exemplos não é candidato", () => {
    expect(resolverRegra("entre outros", MULTILINHA, {})).toBeUndefined();
  });

  test("linha de nota entre parênteses não é candidato", () => {
    const nota = "Incluir nesse padrão as autoridades com status de Ministro de Estado";
    expect(resolverRegra(nota, MULTILINHA, {})).toBeUndefined();
  });

  test("usa a tabela de protocolo real quando não recebe regras injetadas", () => {
    expect(resolverRegra("Coronel")?.cargoDestinatario.split("\n")[0]).toBe(
      "Demais patentes militares",
    );
  });

  test("empate técnico entre duas regras devolve undefined, não a primeira", () => {
    // Dois candidatos quase igualmente parecidos: acertar por sorteio é pior que sem_regra.
    const empatadas = [
      regra("Presidente do Supremo Tribunal Federal", "V"),
      regra("Ministro de Tribunal Superior", "V"),
    ];
    expect(resolverRegra("Ministro do Supremo Tribunal Federal", empatadas, {})).toBeUndefined();
  });

  test("vantagem folgada sobre o segundo colocado continua resolvendo", () => {
    const r = resolverRegra("Ministro do Superior Tribunal de Justiça", REGRAS, {});
    expect(r?.cargoDestinatario).toBe("Ministro de Tribunal Superior");
  });

  test("candidato único não precisa de margem", () => {
    const so = [regra("Governador", "V")];
    expect(resolverRegra("Governadores", so, {})?.cargoDestinatario).toBe("Governador");
  });

  test("vice não herda a regra do titular", () => {
    const so = [regra("Presidente do Supremo Tribunal Federal", "V")];
    expect(resolverRegra("Vice-Presidente do Supremo Tribunal Federal", so, {})).toBeUndefined();
  });

  test("ex-ocupante não herda a regra do titular", () => {
    const so = [regra("Presidente do Congresso Nacional / Senado Federal", "V")];
    expect(resolverRegra("Ex-Presidente do Senado Federal", so, {})).toBeUndefined();
  });

  test("substituto não herda a regra do titular", () => {
    const so = [regra("Ministro de Tribunal Superior", "V")];
    expect(
      resolverRegra("Ministro Substituto do Superior Tribunal de Justiça", so, {}),
    ).toBeUndefined();
  });

  test("regra que já é de vice casa cargo de vice", () => {
    const vices = [regra("Vice-Governador", "V"), regra("Governador", "V")];
    expect(resolverRegra("Vice-Governador do Pará", vices, {})?.cargoDestinatario).toBe(
      "Vice-Governador",
    );
  });

  test("casamento exato vence mesmo sem margem sobre o segundo", () => {
    const quase = [regra("Governador", "V"), regra("Governadores", "V")];
    expect(resolverRegra("Governador", quase, {})?.cargoDestinatario).toBe("Governador");
  });

  test("exceção manual vence mesmo quando o cargo traz qualificador", () => {
    const so = [regra("Ministro de Tribunal Superior", "V")];
    const r = resolverRegra("Vice-Presidente do Superior Tribunal Militar", so, {
      "vice-presidente do superior tribunal militar": "Ministro de Tribunal Superior",
    });
    expect(r?.cargoDestinatario).toBe("Ministro de Tribunal Superior");
  });
});

// ---------------------------------------------------------------------------
// Contrato da Camada B.
// ---------------------------------------------------------------------------

describe("comparacoesProtocolo — endereçamento (Decisão 1)", () => {
  test("a primeira linha do bloco confere", () => {
    const [, e] = comparacoesProtocolo(
      contato({ cargo: "Governador", enderecamento: "A Sua Excelência o Senhor" }),
      REGRAS,
    );
    expect(e.campo).toBe("enderecamento");
    expect(e.situacao).toBe("confere");
    expect(e.origemValor).toBe("protocolo");
  });

  test("a forma feminina da primeira linha confere", () => {
    const [, e] = comparacoesProtocolo(
      contato({ cargo: "Governador", enderecamento: "A Sua Excelência a Senhora" }),
      REGRAS,
    );
    expect(e.situacao).toBe("confere");
  });

  test("o bloco inteiro não é o valor esperado", () => {
    const [, e] = comparacoesProtocolo(
      contato({ cargo: "Governador", enderecamento: "A Sua Excelência o Senhor" }),
      REGRAS,
    );
    expect(e.valorEsperado).toBe("A Sua Excelência o(a) Senhor(a)");
    expect(e.valorEsperado).not.toContain("[Nome]");
  });

  test("primeira linha errada diverge", () => {
    const [, e] = comparacoesProtocolo(
      contato({ cargo: "Governador", enderecamento: "Ao Senhor" }),
      REGRAS,
    );
    expect(e.situacao).toBe("divergente");
  });

  test("a contração 'Ao Senhor (À Senhora)' aceita as duas formas", () => {
    const masculino = comparacoesProtocolo(
      contato({ cargo: "Cônsul", enderecamento: "Ao Senhor" }),
      REGRAS,
    )[1];
    const feminino = comparacoesProtocolo(
      contato({ cargo: "Cônsul", enderecamento: "À Senhora" }),
      REGRAS,
    )[1];
    expect(masculino.situacao).toBe("confere");
    expect(feminino.situacao).toBe("confere");
  });

  test("regra sem endereçamento cadastrado vira sem_regra nesse campo", () => {
    const [, e] = comparacoesProtocolo(
      contato({ cargo: "Vereador", enderecamento: "Qualquer coisa" }),
      REGRAS,
    );
    expect(e.situacao).toBe("sem_regra");
  });
});

describe("comparacoesProtocolo — tratamento (Decisão 2)", () => {
  test("a forma nominal confere, e o vocativo epistolar não é o alvo", () => {
    const [t] = comparacoesProtocolo(
      contato({ cargo: "Governador", tratamento: "Senhor" }),
      REGRAS,
    );
    expect(t.campo).toBe("tratamento");
    expect(t.situacao).toBe("confere");
    expect(t.valorEsperado).toBe("Senhor(a)");
  });

  test("a forma feminina também confere", () => {
    const [t] = comparacoesProtocolo(
      contato({ cargo: "Governador", tratamento: "Senhora" }),
      REGRAS,
    );
    expect(t.situacao).toBe("confere");
  });

  test("valor da coluna errada da tabela diverge", () => {
    const [t] = comparacoesProtocolo(
      contato({ cargo: "Governador", tratamento: "Vossa Excelência" }),
      REGRAS,
    );
    expect(t.situacao).toBe("divergente");
  });

  test("a regra masculina só aceita o masculino", () => {
    const masculino = comparacoesProtocolo(
      contato({ cargo: "Papa", tratamento: "Senhor" }),
      REGRAS,
    )[0];
    const feminino = comparacoesProtocolo(
      contato({ cargo: "Papa", tratamento: "Senhora" }),
      REGRAS,
    )[0];
    expect(masculino.situacao).toBe("confere");
    expect(feminino.situacao).toBe("divergente");
  });

  test("linha de endereçamento sem núcleo nominal vira sem_regra, nunca divergente", () => {
    const semNucleo = [regra("Chefe de Gabinete", "V", "Ao Excelentíssimo Chefe de Gabinete\n[Nome]")];
    const [t] = comparacoesProtocolo(
      contato({ cargo: "Chefe de Gabinete", tratamento: "Senhor" }),
      semNucleo,
    );
    expect(t.situacao).toBe("sem_regra");
  });
});

describe("comparacoesProtocolo — contrato", () => {
  test("cargo não mapeado vira sem_regra, nunca divergente", () => {
    const comps = comparacoesProtocolo(
      contato({ cargo: "Zelador do Anexo II", tratamento: "Qualquer coisa" }),
      REGRAS,
    );
    expect(comps.map((c) => c.situacao)).toEqual(["sem_regra", "sem_regra"]);
  });

  test("contato sem cargo vira sem_regra", () => {
    const comps = comparacoesProtocolo(contato({ tratamento: "Senhor" }), REGRAS);
    expect(comps.map((c) => c.situacao)).toEqual(["sem_regra", "sem_regra"]);
  });

  test("forma genérica do contato vira sem_regra: quem acusa é a Camada A", () => {
    const comps = comparacoesProtocolo(
      contato({
        cargo: "Governador",
        tratamento: "Senhor(a)",
        enderecamento: "A Sua Excelência o(a) Senhor(a)",
      }),
      REGRAS,
    );
    expect(comps.map((c) => c.situacao)).toEqual(["sem_regra", "sem_regra"]);
  });

  test("campo vazio com regra existente é divergente, não ausência de informação", () => {
    const [t] = comparacoesProtocolo(contato({ cargo: "Governador" }), REGRAS);
    expect(t.situacao).toBe("divergente");
    expect(t.valorPlanilha).toBe("");
  });

  test("devolve sempre as duas comparações, na ordem tratamento, enderecamento", () => {
    const comps = comparacoesProtocolo(contato({ cargo: "Governador" }), REGRAS);
    expect(comps.map((c) => c.campo)).toEqual(["tratamento", "enderecamento"]);
  });

  test("não muta o contato recebido", () => {
    const original = contato({ cargo: "Governador", tratamento: "Senhor" });
    const copia = { ...original };
    comparacoesProtocolo(original, REGRAS);
    expect(original).toEqual(copia);
  });
});
