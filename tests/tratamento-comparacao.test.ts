import { describe, expect, test } from "vitest";
import { resolverRegra, comparacoesProtocolo } from "@/lib/tratamento";
import type { ContatoPlanilha, RegraTratamento } from "@/lib/types";

function regra(cargoDestinatario: string, vocativo: string, enderecamento = ""): RegraTratamento {
  return { cargoDestinatario, nominata: "", vocativo, pronome: "", enderecamento };
}

const REGRAS: RegraTratamento[] = [
  regra("Ministro de Tribunal Superior", "Senhor(a) Ministro(a)", "A Sua Excelência o(a) Senhor(a)\n[Nome]\nMinistro(a)"),
  regra("Governador", "Excelentíssimo Senhor(a) Governador(a)"),
  regra("Presidente do Congresso Nacional / Senado Federal", "Excelentíssimo(a) Senhor(a) Presidente"),
];

/** Entradas cujo `cargoDestinatario` é multilinha, como as militares da tabela real. */
const MULTILINHA: RegraTratamento[] = [
  regra(
    "Militares com patente superior\n- Almirante\n- General de Exército\n- Brigadeiro do Ar",
    "Senhor(a) [Patente]",
  ),
  regra(
    "Demais patentes militares\nEx.: Capitão de Mar e Guerra, Coronel, Major, entre outros.",
    "Senhor(a) [Patente]",
  ),
  regra(
    "Ministro de Estado\n(Incluir nesse padrão as autoridades com status de Ministro de Estado)",
    "Senhor(a) Ministro(a)",
  ),
];

function contato(extra: Partial<ContatoPlanilha> = {}): ContatoPlanilha {
  return { nome: "Ana Maria Souza", grupo: "G", ...extra };
}

describe("resolverRegra", () => {
  test("casa exatamente pelo nome normalizado", () => {
    expect(resolverRegra("governador", REGRAS, {})?.cargoDestinatario).toBe("Governador");
  });

  test("tolera acento e caixa", () => {
    expect(resolverRegra("GOVERNADOR", REGRAS, {})?.cargoDestinatario).toBe("Governador");
  });

  test("casa uma das alternativas separadas por barra no nome do cargo", () => {
    // Casamento exato contra a alternativa "Senado Federal" — determinístico, sem depender
    // do limiar de similaridade.
    const r = resolverRegra("Senado Federal", REGRAS, {});
    expect(r?.cargoDestinatario).toBe("Presidente do Congresso Nacional / Senado Federal");
  });

  test("similaridade cobre variação de gênero no cargo da planilha", () => {
    // "Governadora" × "Governador": bigramas quase idênticos, bem acima do limiar.
    expect(resolverRegra("Governadora", REGRAS, {})?.cargoDestinatario).toBe("Governador");
  });

  test("exceção manual tem precedência sobre similaridade", () => {
    const r = resolverRegra("Ministro do STF", REGRAS, { "ministro do stf": "Ministro de Tribunal Superior" });
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
    expect(resolverRegra("Coronel")?.cargoDestinatario.split("\n")[0]).toBe("Demais patentes militares");
  });
});

describe("comparacoesProtocolo", () => {
  test("tratamento correto confere, com origem protocolo", () => {
    const [t] = comparacoesProtocolo(
      contato({ cargo: "Governador", tratamento: "Excelentíssimo Senhor Governador" }),
      REGRAS,
    );
    expect(t.campo).toBe("tratamento");
    expect(t.situacao).toBe("confere");
    expect(t.origemValor).toBe("protocolo");
  });

  test("forma feminina também confere", () => {
    const [t] = comparacoesProtocolo(
      contato({ cargo: "Governador", tratamento: "Excelentíssimo Senhora Governadora" }),
      REGRAS,
    );
    expect(t.situacao).toBe("confere");
  });

  test("tratamento errado diverge e informa a forma esperada", () => {
    const [t] = comparacoesProtocolo(
      contato({ cargo: "Governador", tratamento: "Senhor Governador" }),
      REGRAS,
    );
    expect(t.situacao).toBe("divergente");
    expect(t.valorEsperado).toBe("Excelentíssimo Senhor(a) Governador(a)");
  });

  test("campo vazio com regra existente é divergente, não ausência de informação", () => {
    const [t] = comparacoesProtocolo(contato({ cargo: "Governador" }), REGRAS);
    expect(t.situacao).toBe("divergente");
    expect(t.valorPlanilha).toBe("");
  });

  test("cargo não mapeado vira sem_regra, nunca divergente", () => {
    const comps = comparacoesProtocolo(
      contato({ cargo: "Zelador do Anexo II", tratamento: "Qualquer coisa" }),
      REGRAS,
    );
    expect(comps.map((c) => c.situacao)).toEqual(["sem_regra", "sem_regra"]);
  });

  test("contato sem cargo vira sem_regra", () => {
    const comps = comparacoesProtocolo(contato({ tratamento: "Senhor Fulano" }), REGRAS);
    expect(comps.map((c) => c.situacao)).toEqual(["sem_regra", "sem_regra"]);
  });

  test("placeholder sem dado no contato vira sem_regra, não divergente", () => {
    // A regra militar usa "[Patente]"; um contato cujo cargo casa por similaridade mas
    // não preenche o placeholder não é auditável.
    const semCargo = { ...contato({ tratamento: "Senhor Almirante" }), cargo: undefined };
    const comps = comparacoesProtocolo(semCargo, MULTILINHA);
    expect(comps.map((c) => c.situacao)).toEqual(["sem_regra", "sem_regra"]);
  });

  test("endereçamento substitui [Nome] e confere", () => {
    const [, e] = comparacoesProtocolo(
      contato({
        cargo: "Ministro de Tribunal Superior",
        enderecamento: "A Sua Excelência o Senhor Ana Maria Souza Ministro",
      }),
      REGRAS,
    );
    expect(e.campo).toBe("enderecamento");
    expect(e.situacao).toBe("confere");
  });

  test("regra sem endereçamento cadastrado vira sem_regra nesse campo", () => {
    const [, e] = comparacoesProtocolo(
      contato({ cargo: "Governador", enderecamento: "Qualquer coisa" }),
      REGRAS,
    );
    expect(e.situacao).toBe("sem_regra");
  });

  test("devolve sempre as duas comparações, na ordem tratamento, enderecamento", () => {
    const comps = comparacoesProtocolo(contato({ cargo: "Governador" }), REGRAS);
    expect(comps.map((c) => c.campo)).toEqual(["tratamento", "enderecamento"]);
  });

  test("não muta o contato recebido", () => {
    const original = contato({ cargo: "Governador", tratamento: "Senhor Governador" });
    const copia = { ...original };
    comparacoesProtocolo(original, REGRAS);
    expect(original).toEqual(copia);
  });
});
