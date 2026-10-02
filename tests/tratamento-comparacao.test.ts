import { describe, expect, test } from "vitest";
import {
  resolverRegra,
  comparacoesProtocolo,
  comparacoesCoerencia,
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

// ---------------------------------------------------------------------------
// Guarda-corpo contra a tabela REAL (`REGRAS_TRATAMENTO`, sem injeção).
//
// Os testes acima usam micro-tabelas injetadas de uma ou duas regras: corretos, mas
// sintéticos — "vice não herda a regra do titular" passaria mesmo sem `MARGEM_CARGO`,
// porque o filtro de qualificador já esvazia a lista de candidatos. Contra as ~38 regras
// reais, `LIMIAR_CARGO` (0,6) e `MARGEM_CARGO` (0,12) foram calibrados com folga medida de
// só 0,001 e 0,031 (ver docs/superpowers/specs), e o "Pós-implementação" do plano convida
// a mexer nelas depois do merge. Isto fixa o comportamento ATUAL da resolução, incluindo
// casos em que `sem_regra` é o resultado seguro e não o desejável — se alguém melhorar a
// resolução de cargo, é esperado que alguns destes testes mudem, e a mudança tem que ser
// deliberada, não um efeito colateral silencioso.
//
// Os números de cada comentário foram medidos diretamente contra `REGRAS_TRATAMENTO`
// nesta revisão (2026-09-16), reproduzindo a lógica de `resolverRegra` (candidato só
// concorre com a mesma assinatura de qualificador do alvo, e o score é o maior entre as
// formas candidatas de cada regra). Duas das seis previsões do brief da revisão final não
// bateram com o código: ver o relatório da correção para o detalhe.
describe("resolverRegra — tabela real, sem tabela injetada (guarda-corpo)", () => {
  test("'Presidente da República' cai em sem_regra: margem curta demais sobre o 2º colocado", () => {
    // Medido: 1º "Presidente de empresa pública" 0,756; 2º "Presidente da República
    // Federativa do Brasil" 0,690; margem 0,066, abaixo de MARGEM_CARGO (0,12). É o caso
    // mais perigoso da tabela: "Presidente de empresa pública" endereça "Ao Senhor (À
    // Senhora)", não "A Sua Excelência", e o contato é o mais importante da Posse.
    expect(resolverRegra("Presidente da República")).toBeUndefined();
  });

  test("'Ministro do Supremo Tribunal Federal' cai em sem_regra: quase confunde com a Presidência do STF", () => {
    // Medido: 1º "Presidente do Supremo Tribunal Federal" 0,719; 2º "Ministro de Tribunal
    // Superior" 0,679; margem 0,040, abaixo de MARGEM_CARGO.
    expect(resolverRegra("Ministro do Supremo Tribunal Federal")).toBeUndefined();
  });

  test("'Ex-Presidente do Senado Federal' cai em sem_regra: nenhuma regra real tem qualificador 'ex'", () => {
    // A tabela real não tem nenhuma entrada cujo cargo carregue o qualificador "ex" (só
    // "Demais patentes militares" cita "Ex.:" como abertura de lista de exemplos, o que não
    // é qualificador de titularidade). O filtro de qualificador (`QUALIFICADORES`) esvazia
    // a lista de candidatos antes mesmo de calcular similaridade — `melhor` fica undefined.
    expect(resolverRegra("Ex-Presidente do Senado Federal")).toBeUndefined();
  });

  test("'Vice-Presidente do Superior Tribunal Militar' cai em sem_regra: fica abaixo do piso de similaridade, não da margem", () => {
    // Medido: o único candidato qualificado como "vice" com score relevante é
    // "Vice-Presidente da República Federativa do Brasil", a 0,488 — abaixo de LIMIAR_CARGO
    // (0,6). A margem sobre o 2º colocado ("Militares com patente superior", via
    // "Vice-Almirante") é 0,142, folgada — quem barra aqui é o piso de similaridade, não a
    // margem. Divergência do relatório da revisão final registrada abaixo.
    expect(resolverRegra("Vice-Presidente do Superior Tribunal Militar")).toBeUndefined();
  });

  test("'Deputado Federal' cai em sem_regra: empate exato entre as duas variantes de Senador/Deputado", () => {
    // Medido: "Senador / Deputado Federal (com cargo)" e "Senador / Deputado Federal (sem
    // cargo)" empatam em 0,737 cada — margem 0,000 entre o 1º e o 2º colocados, os dois
    // vindos de regras diferentes. "Presidente do Congresso Nacional / Senado Federal" fica
    // em 3º lugar, a 0,692, fora da disputa. Divergência do relatório da revisão final
    // registrada abaixo.
    expect(resolverRegra("Deputado Federal")).toBeUndefined();
  });

  test("'Presidente da República Federativa do Brasil' resolve por casamento exato", () => {
    expect(resolverRegra("Presidente da República Federativa do Brasil")?.cargoDestinatario).toBe(
      "Presidente da República Federativa do Brasil",
    );
  });

  test("'Coronel' resolve para as patentes militares por casamento exato num item de exemplo", () => {
    expect(resolverRegra("Coronel")?.cargoDestinatario.split("\n")[0]).toBe(
      "Demais patentes militares",
    );
  });

  test("'Senador' resolve para a primeira regra cadastrada, mesmo empatando com a segunda", () => {
    // "Senador" casa exatamente as duas regras "Senador / Deputado Federal (com/sem
    // cargo)" — o casamento exato vence sem precisar de margem, e `regras.find` devolve a
    // primeira do array, que é a variante "(com cargo)".
    expect(resolverRegra("Senador")?.cargoDestinatario.split("\n")[0]).toBe(
      "Senador / Deputado Federal (com cargo)",
    );
  });

  test("'Embaixador de Gana' resolve para Embaixador, com margem folgada sobre Desembargador", () => {
    // Medido: 1º "Embaixador" 0,750; 2º "Desembargador" 0,593; margem 0,157.
    expect(resolverRegra("Embaixador de Gana")?.cargoDestinatario).toBe("Embaixador");
  });

  test("'Embaixadora de Gana' TAMBÉM resolve para Embaixador — não é o caso-limite do relatório", () => {
    // Divergência do relatório da revisão final: o brief previa `sem_regra` aqui (margem
    // 0,115, a um passo do corte). Medido contra o código real: "Embaixador" é a ÚNICA
    // entrada da tabela para esse cargo (não há "Embaixador(a)" nem "Embaixatriz" como
    // candidato), e "embaixadora de gana" bate 0,720 contra ela — 2º colocado
    // "Desembargador" a 0,571, margem 0,149, folgada acima de MARGEM_CARGO. O caso resolve,
    // ponto final; não há fronteira apertada entre masculino e feminino aqui hoje. Ver
    // relatório da correção para a divergência completa.
    expect(resolverRegra("Embaixadora de Gana")?.cargoDestinatario).toBe("Embaixador");
  });
});

describe("resolverRegra: gênero não muda a regra encontrada (tabela real)", () => {
  test.each([
    ["Senadora", "Senador"],
    ["Encarregada de Negócios", "Encarregado de Negócios"],
    ["Governadora do Estado do Acre", "Governador do Estado do Acre"],
  ])("%s resolve igual a %s", (feminino, masculino) => {
    expect(resolverRegra(feminino)?.cargoDestinatario).toBe(resolverRegra(masculino)?.cargoDestinatario);
  });

  test("Senadora encontra a regra de Senador (hoje caía em sem regra)", () => {
    expect(resolverRegra("Senadora")).toBeDefined();
    expect(resolverRegra("Senadora")?.cargoDestinatario).toBe(resolverRegra("Senador")?.cargoDestinatario);
  });
});

describe("Senadora com tratamento e endereçamento femininos (tabela real)", () => {
  test("Camada B confere tratamento e endereçamento, e a Camada A não acha nada", () => {
    // Arrange
    const contato: ContatoPlanilha = { nome: "Ana", grupo: "Senadores", cargo: "Senadora", tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" };
    // Act
    const protocolo = comparacoesProtocolo(contato);
    // Assert
    expect(protocolo.find((c) => c.campo === "tratamento")?.situacao).toBe("confere");
    expect(protocolo.find((c) => c.campo === "enderecamento")?.situacao).toBe("confere");
    expect(comparacoesCoerencia(contato)).toEqual([]);
  });
});
