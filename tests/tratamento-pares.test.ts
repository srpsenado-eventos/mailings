import { describe, expect, test } from "vitest";
import { aplicarPares, contagemDosPares, maioriaDosPares, nucleoDoCargo } from "@/lib/tratamento-pares";
import type { ComparacaoCampo, ContatoPlanilha, ResultadoContato, ResultadoGrupo } from "@/lib/types";

const GRUPO = "Ministros do STF";
const CARGO = "Ministro do Supremo Tribunal Federal";

/** Contato com as duas comparações de protocolo "sem regra", como a Camada B as deixa. */
function semRegra(over: Partial<ContatoPlanilha>, semaforo: ResultadoContato["semaforo"] = "verde"): ResultadoContato {
  const contato: ContatoPlanilha = {
    nome: "Fulano",
    grupo: GRUPO,
    cargo: CARGO,
    tratamento: "Senhor",
    enderecamento: "A Sua Excelência o Senhor",
    ...over,
  };
  const comparacoes: ComparacaoCampo[] = [
    { campo: "nome", valorPlanilha: contato.nome, valorEsperado: contato.nome, situacao: "confere", origemValor: "pagina" },
    { campo: "tratamento", valorPlanilha: contato.tratamento ?? "", situacao: "sem_regra", origemValor: "protocolo" },
    { campo: "enderecamento", valorPlanilha: contato.enderecamento ?? "", situacao: "sem_regra", origemValor: "protocolo" },
  ];
  return { contato, semaforo, score: 1, comparacoes, camposDivergentes: [], origem: "oficial" };
}

function grupoCom(contatos: ResultadoContato[]): ResultadoGrupo {
  return { grupo: GRUPO, semFonte: false, contatos, novos: [] };
}

const comparacao = (c: ResultadoContato, campo: string) => c.comparacoes.find((x) => x.campo === campo && x.origemValor !== "coerencia");

describe("nucleoDoCargo", () => {
  test("corta a UF do governador e mantém 'do estado'", () => {
    expect(nucleoDoCargo("Governador do Estado de Sergipe")).toBe("governador do estado");
    expect(nucleoDoCargo("Governadora do Estado do Espírito Santo - ES")).toBe("governador do estado");
  });

  test("Distrito Federal é par dos estados", () => {
    expect(nucleoDoCargo("Governadora do Distrito Federal")).toBe("governador do estado");
  });

  test("embaixador e encarregado de negócios ficam só com o núcleo, sem o país", () => {
    expect(nucleoDoCargo("Embaixadora de Gana")).toBe("embaixador");
    expect(nucleoDoCargo("Embaixador da República Federal da Alemanha")).toBe("embaixador");
    expect(nucleoDoCargo("Encarregado de Negócios da Embaixada do Iraque")).toBe("encarregado de negocios");
  });

  test("ministro de tribunal fica inteiro, e o presidente não é par dele", () => {
    expect(nucleoDoCargo(CARGO)).toBe("ministro do supremo tribunal federal");
    expect(nucleoDoCargo("Ministra do Supremo Tribunal Federal")).toBe("ministro do supremo tribunal federal");
    expect(nucleoDoCargo("Presidente do Supremo Tribunal Federal")).not.toBe(nucleoDoCargo(CARGO));
  });

  test("o período do ex-presidente não separa os pares", () => {
    expect(nucleoDoCargo("Presidente do Senado Federal de 2019 a 2021")).toBe("presidente do senado federal");
  });
});

describe("maioriaDosPares", () => {
  test("Senhora conta como Senhor; a grafia mais frequente é o valor", () => {
    expect(maioriaDosPares(["Senhor", "Senhor", "Senhora", "Excelentíssimo Senhor"])).toEqual({ valor: "Senhor", n: 3, m: 4 });
  });

  test("endereçamento no feminino conta como o masculino, com o artigo", () => {
    expect(maioriaDosPares(["A Sua Excelência o Senhor", "A Sua Excelência a Senhora", "Ao Senhor"])).toEqual({
      valor: "A Sua Excelência o Senhor",
      n: 2,
      m: 3,
    });
  });

  test("empate não é maioria (Ponto 4)", () => {
    expect(maioriaDosPares(["Senhor", "Doutor"])).toBeUndefined();
    expect(maioriaDosPares(["Senhor", "Senhor", "Doutor", "Doutor"])).toBeUndefined();
  });

  test("um par só não é maioria (Ponto 4)", () => {
    expect(maioriaDosPares(["Senhor"])).toBeUndefined();
  });

  test("valores vazios não contam", () => {
    expect(maioriaDosPares(["Senhor", "", "  "])).toBeUndefined();
    expect(maioriaDosPares(["Senhor", "", "Senhor"])).toEqual({ valor: "Senhor", n: 2, m: 2 });
  });

  test("espaços dobrados e caixa não separam valores", () => {
    expect(maioriaDosPares(["Senhor ", "SENHOR", "Doutor"])?.n).toBe(2);
  });
});

describe("aplicarPares", () => {
  const seteEUm = () => [
    ...Array.from({ length: 7 }, (_, i) => semRegra({ nome: `Ministro ${i}` })),
    semRegra({ nome: "Ministro Doutor", tratamento: "Doutor" }),
  ];

  test("7 'Senhor' e 1 'Doutor': os 7 conferem pelos pares, o 'Doutor' diverge e pinta amarelo", () => {
    // Arrange
    const grupo = grupoCom(seteEUm());

    // Act
    const r = aplicarPares(grupo);

    // Assert
    for (const c of r.contatos.slice(0, 7)) {
      expect(comparacao(c, "tratamento")).toMatchObject({
        situacao: "confere",
        origemValor: "pares",
        valorEsperado: "Senhor",
        observacao: "Pela maioria dos pares: 6 de 7 no grupo usam Senhor",
      });
      expect(c.semaforo).toBe("verde");
    }
    const doutor = r.contatos[7];
    expect(comparacao(doutor, "tratamento")).toMatchObject({
      situacao: "divergente",
      origemValor: "pares",
      valorPlanilha: "Doutor",
      valorEsperado: "Senhor",
      observacao: "Pela maioria dos pares: 7 de 7 no grupo usam Senhor",
    });
    expect(doutor.semaforo).toBe("amarelo");
    expect(doutor.camposDivergentes).toEqual([{ campo: "tratamento", valorPlanilha: "Doutor", valorEncontrado: "Senhor" }]);
  });

  test("endereçamento tem a sua própria maioria", () => {
    const r = aplicarPares(grupoCom(seteEUm()));
    expect(comparacao(r.contatos[7], "enderecamento")).toMatchObject({ situacao: "confere", origemValor: "pares", valorEsperado: "A Sua Excelência o Senhor" });
  });

  test("contato feminino: o esperado sai no feminino", () => {
    // Arrange
    const ministra = semRegra({ nome: "Ministra", cargo: "Ministra do Supremo Tribunal Federal", tratamento: "Doutora", enderecamento: "Ao Senhor" });
    const grupo = grupoCom([...seteEUm().slice(0, 7), ministra]);

    // Act
    const r = aplicarPares(grupo);

    // Assert
    expect(comparacao(r.contatos[7], "tratamento")).toMatchObject({ situacao: "divergente", valorEsperado: "Senhora" });
    expect(comparacao(r.contatos[7], "enderecamento")).toMatchObject({ situacao: "divergente", valorEsperado: "A Sua Excelência a Senhora" });
  });

  test("contato feminino com 'Senhor': esperado 'Senhora'; o gênero fica com a Camada A", () => {
    const ministra = semRegra({ nome: "Ministra", cargo: "Ministra do Supremo Tribunal Federal", tratamento: "Senhor" });
    const r = aplicarPares(grupoCom([...seteEUm().slice(0, 7), ministra]));
    expect(comparacao(r.contatos[7], "tratamento")).toMatchObject({ situacao: "confere", valorEsperado: "Senhora" });
  });

  test("feminino com 'Senhora' confere com a maioria 'Senhor'", () => {
    const ministra = semRegra({ nome: "Ministra", cargo: "Ministra do Supremo Tribunal Federal", tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" });
    const r = aplicarPares(grupoCom([...seteEUm().slice(0, 7), ministra]));
    expect(comparacao(r.contatos[7], "tratamento")).toMatchObject({ situacao: "confere", valorEsperado: "Senhora" });
    expect(comparacao(r.contatos[7], "enderecamento")).toMatchObject({ situacao: "confere", valorEsperado: "A Sua Excelência a Senhora" });
    expect(r.contatos[7].semaforo).toBe("verde");
  });

  test("grupo com um contato só fica inalterado (Ponto 4)", () => {
    const grupo = grupoCom([semRegra({ tratamento: "Doutor" })]);
    expect(aplicarPares(grupo)).toEqual(grupo);
  });

  test("sem maioria entre os pares continua sem regra (Ponto 4)", () => {
    // Com 2 contatos, cada um tem um par só; com 3 em 1 × 1 × 1, os pares empatam.
    const dois = grupoCom([semRegra({ nome: "A", tratamento: "Senhor" }), semRegra({ nome: "B", tratamento: "Doutor" })]);
    const tres = grupoCom([
      semRegra({ nome: "A", tratamento: "Senhor" }),
      semRegra({ nome: "B", tratamento: "Doutor" }),
      semRegra({ nome: "C", tratamento: "Excelentíssimo Senhor" }),
    ]);
    for (const r of [aplicarPares(dois), aplicarPares(tres)]) {
      expect(r.contatos.every((c) => comparacao(c, "tratamento")?.situacao === "sem_regra")).toBe(true);
      expect(r.contatos.every((c) => c.semaforo === "verde")).toBe(true);
    }
  });

  test("contato com regra da tabela fica inalterado", () => {
    // Arrange
    const comRegra = semRegra({ nome: "Com Regra", tratamento: "Doutor" });
    const protocolo: ResultadoContato = {
      ...comRegra,
      comparacoes: comRegra.comparacoes.map((c) =>
        c.campo === "tratamento" ? { ...c, situacao: "confere" as const, valorEsperado: "Doutor" } : c,
      ),
    };
    const grupo = grupoCom([...seteEUm().slice(0, 7), protocolo]);

    // Act
    const r = aplicarPares(grupo);

    // Assert
    expect(comparacao(r.contatos[7], "tratamento")).toEqual({ campo: "tratamento", valorPlanilha: "Doutor", valorEsperado: "Doutor", situacao: "confere", origemValor: "protocolo" });
  });

  test("pares são só os de mesmo núcleo do cargo: o presidente não entra na maioria dos ministros", () => {
    const presidente = semRegra({ nome: "Presidente", cargo: "Presidente do Supremo Tribunal Federal", tratamento: "Excelentíssimo Senhor" });
    const r = aplicarPares(grupoCom([semRegra({ nome: "A" }), semRegra({ nome: "B" }), semRegra({ nome: "C" }), presidente]));
    expect(comparacao(r.contatos[3], "tratamento")?.situacao).toBe("sem_regra");
    expect(comparacao(r.contatos[0], "tratamento")).toMatchObject({ situacao: "confere", observacao: "Pela maioria dos pares: 2 de 2 no grupo usam Senhor" });
  });

  test("nunca muda vermelho, indeterminado nem possível saída", () => {
    const saida = { ...semRegra({ nome: "Saiu", tratamento: "Doutor" }, "vermelho"), possivelSaida: true };
    const indet = semRegra({ nome: "Indet", tratamento: "Doutor" }, "indeterminado");
    const r = aplicarPares(grupoCom([semRegra({ nome: "A" }), semRegra({ nome: "B" }), semRegra({ nome: "C" }), saida, indet]));
    expect(r.contatos[3]).toMatchObject({ semaforo: "vermelho", possivelSaida: true });
    expect(comparacao(r.contatos[3], "tratamento")?.situacao).toBe("divergente");
    expect(r.contatos[4].semaforo).toBe("indeterminado");
  });

  test("forma genérica fica sem regra (a Camada A já acusa)", () => {
    const generico = semRegra({ nome: "G", tratamento: "Senhor(a)" });
    const r = aplicarPares(grupoCom([semRegra({ nome: "A" }), semRegra({ nome: "B" }), generico]));
    expect(comparacao(r.contatos[2], "tratamento")?.situacao).toBe("sem_regra");
  });

  test("não muta o grupo de entrada", () => {
    const grupo = grupoCom(seteEUm());
    const copia = structuredClone(grupo);
    aplicarPares(grupo);
    expect(grupo).toEqual(copia);
  });
});

describe("contagemDosPares", () => {
  test("lê N e M da observação dos pares", () => {
    expect(contagemDosPares("Pela maioria dos pares: 6 de 7 no grupo usam Senhor")).toEqual({ n: 6, m: 7 });
    expect(contagemDosPares("Informar o período da presidência")).toBeUndefined();
    expect(contagemDosPares(undefined)).toBeUndefined();
  });
});
