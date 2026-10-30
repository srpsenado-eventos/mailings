import { describe, expect, it } from "vitest";
import {
  GRUPO_DEPUTADOS_ELEITOS,
  GRUPO_DEPUTADOS_FEDERAIS,
  GRUPO_GOVERNADORES_ELEITOS,
} from "@/data/grupos-posse";
import {
  acharCaso,
  casosDaPessoa,
  DecisaoInvalidaError,
  grupoEquivalente,
  gruposAtuaisParaOCaso,
  HISTORICO_VAZIO,
  registrar,
  registrarColetas,
  situacaoDoCaso,
  vigente,
  type CasoDecidido,
  type HistoricoDecisoes,
  type RegistroManual,
} from "@/lib/decisoes";

const STF = "Ministros do STF";
const TSE = "Ministros do TSE";
const STJ = "Ministros do STJ";

function congelar<T>(valor: T): T {
  if (valor !== null && typeof valor === "object") {
    Object.values(valor as Record<string, unknown>).forEach(congelar);
    Object.freeze(valor);
  }
  return valor;
}

function manual(parcial: Partial<RegistroManual> & Pick<RegistroManual, "tipo">): RegistroManual {
  return {
    data: "2026-10-29",
    quem: "GT (planilha de 29/10)",
    observacao: "",
    validacao: "validado",
    grupos: [],
    ...parcial,
  };
}

function casoCom(...registros: RegistroManual[]): CasoDecidido {
  return { id: "x", nome: "X", chaves: ["x"], registros };
}

const NUNES_MARQUES = manual({ tipo: "mesma_pessoa", convidaPor: TSE, grupos: [STF, TSE] });

describe("grupoEquivalente", () => {
  it("rótulo do Contatos com espaço e caixa diferentes vira o rótulo oficial do agrupador", () => {
    // Arrange
    const rotulo = "  governadores ELEITOS - Posse Presidencial 2027 ";
    // Act
    const grupo = grupoEquivalente(rotulo, "contatos");
    // Assert
    expect(grupo).toBe(GRUPO_GOVERNADORES_ELEITOS);
  });

  it("rótulo do Contatos fora do agrupador volta aparado", () => {
    expect(grupoEquivalente(" Ministros do STF ", "contatos")).toBe(STF);
  });

  it("a planilha da Câmara vale como o grupo Deputados Federais", () => {
    expect(grupoEquivalente("Câmara", "camara")).toBe(GRUPO_DEPUTADOS_FEDERAIS);
  });

  it("o eleito vale como o seu grupo de destino", () => {
    expect(grupoEquivalente("Eleição 2026", "eleicao", GRUPO_DEPUTADOS_ELEITOS)).toBe(GRUPO_DEPUTADOS_ELEITOS);
  });

  it("eleito sem grupo de destino devolve o grupo informado", () => {
    expect(grupoEquivalente("Eleição 2026", "eleicao")).toBe("Eleição 2026");
  });

  it("grupo de destino vazio vale como ausente", () => {
    expect(grupoEquivalente("Eleição 2026", "eleicao", "")).toBe("Eleição 2026");
  });
});

describe("registrar e acharCaso", () => {
  it("dois registros com formas diferentes do nome ficam no mesmo caso, achado pelas duas chaves", () => {
    // Arrange
    const primeiro = registrar(HISTORICO_VAZIO, "Ministro Kassio Nunes Marques", ["Ministro Kassio Nunes Marques"], NUNES_MARQUES);
    // Act
    const segundo = registrar(
      primeiro,
      "Nunes Marques",
      ["Nunes Marques", "Kassio Nunes Marques"],
      manual({ tipo: "mesma_pessoa", convidaPor: TSE, grupos: [STF, TSE], data: "2026-10-30" }),
    );
    // Assert
    expect(segundo.casos).toHaveLength(1);
    const caso = segundo.casos[0];
    expect(caso.id).toBe("kassio nunes marques#ministros do stf|ministros do tse");
    expect(caso.registros).toHaveLength(2);
    expect(caso.chaves).toEqual(expect.arrayContaining(["kassio nunes marques", "nunes marques"]));
    expect(acharCaso(segundo, ["Kassio Nunes Marques"])).toBe(caso);
    expect(acharCaso(segundo, ["Nunes Marques"])).toBe(caso);
  });

  it("nome sem caso registrado não acha nada", () => {
    const h = registrar(HISTORICO_VAZIO, "Davi Alcolumbre", ["Davi Alcolumbre"], manual({ tipo: "nao_recebe_convite" }));
    expect(acharCaso(h, ["Rodrigo Pacheco"])).toBeUndefined();
  });

  it("mesmo nome com grupos diferentes cria dois casos, cada um com o seu vigente", () => {
    // Arrange
    const exPresidente = manual({ tipo: "mesma_pessoa", convidaPor: "Senadores", grupos: ["Ex-Presidentes do Senado", "Senadores"] });
    const filho = manual({ tipo: "pessoas_diferentes", grupos: ["Senadores", GRUPO_DEPUTADOS_ELEITOS] });
    // Act
    const h1 = registrar(HISTORICO_VAZIO, "Jader Barbalho", ["Jader Barbalho"], exPresidente);
    const h2 = registrar(h1, "Jader Barbalho", ["Jader Barbalho"], filho);
    // Assert
    expect(h2.casos).toHaveLength(2);
    expect(vigente(h2.casos[0])?.tipo).toBe("mesma_pessoa");
    expect(vigente(h2.casos[1])?.tipo).toBe("pessoas_diferentes");
    expect(h2.casos[0].id).not.toBe(h2.casos[1].id);
    expect(acharCaso(h2, ["Jader Barbalho"], ["Senadores", "Ex-Presidentes do Senado"])).toBe(h2.casos[0]);
    expect(acharCaso(h2, ["Jader Barbalho"], [GRUPO_DEPUTADOS_ELEITOS])).toBe(h2.casos[1]);
  });

  it("com dois casos do mesmo nome, achar sem grupos ou com empate de grupos não acha nada", () => {
    // Arrange
    const h1 = registrar(HISTORICO_VAZIO, "Jader Barbalho", [], manual({ tipo: "mesma_pessoa", grupos: ["A", "B"] }));
    const h2 = registrar(h1, "Jader Barbalho", [], manual({ tipo: "pessoas_diferentes", grupos: ["B", "C"] }));
    // Act / Assert
    expect(acharCaso(h2, ["Jader Barbalho"])).toBeUndefined();
    expect(acharCaso(h2, ["Jader Barbalho"], ["B"])).toBeUndefined();
    expect(acharCaso(h2, ["Jader Barbalho"], ["D"])).toBeUndefined();
  });

  it("casosDaPessoa devolve todos os casos da pessoa com algum grupo em comum", () => {
    // Arrange
    const h1 = registrar(HISTORICO_VAZIO, "Jader Barbalho", [], manual({ tipo: "mesma_pessoa", convidaPor: "Senadores", grupos: ["Ex-Presidentes do Senado", "Senadores"] }));
    const h2 = registrar(h1, "Jader Barbalho", [], manual({ tipo: "pessoas_diferentes", grupos: ["Senadores", GRUPO_DEPUTADOS_ELEITOS] }));
    const todos = ["senadores", "Ex-Presidentes do Senado", GRUPO_DEPUTADOS_ELEITOS];
    // Act / Assert
    expect(casosDaPessoa(h2, ["Jader Barbalho"], todos)).toEqual(h2.casos);
    expect(casosDaPessoa(h2, ["Jader Barbalho"], ["Ex-Presidentes do Senado", "Ministros do STF"])).toEqual([h2.casos[0]]);
    expect(casosDaPessoa(h2, ["Jader Barbalho"], ["Senadores"])).toEqual(h2.casos);
    expect(casosDaPessoa(h2, ["Outra Pessoa"], todos)).toEqual([]);
    expect(casosDaPessoa(h2, ["Jader Barbalho"], ["Ministros do STF"])).toEqual([]);
  });

  it("gruposAtuaisParaOCaso tira o grupo que só outro caso da mesma pessoa cobre", () => {
    // Arrange
    const h1 = registrar(HISTORICO_VAZIO, "Jader Barbalho", [], manual({ tipo: "mesma_pessoa", convidaPor: "Senadores", grupos: ["Ex-Presidentes do Senado", "Senadores"] }));
    const h2 = registrar(h1, "Jader Barbalho", [], manual({ tipo: "pessoas_diferentes", outraPessoa: [GRUPO_DEPUTADOS_ELEITOS], grupos: ["Senadores", GRUPO_DEPUTADOS_ELEITOS] }));
    const outro = registrar(HISTORICO_VAZIO, "Outra Pessoa", [], manual({ tipo: "mesma_pessoa", convidaPor: "Senadores", grupos: ["Ex-Presidentes do Senado", "Senadores"] })).casos[0];
    const [exPresidente, filho] = h2.casos;
    const atuais = ["Senadores", "Ex-Presidentes do Senado"];
    // Act / Assert
    expect(gruposAtuaisParaOCaso(exPresidente, atuais, h2.casos)).toEqual(atuais);
    expect(gruposAtuaisParaOCaso(filho, atuais, h2.casos)).toEqual(["Senadores"]);
    expect(situacaoDoCaso(filho, gruposAtuaisParaOCaso(filho, atuais, h2.casos))).toBe("sem_efeito");
    expect(gruposAtuaisParaOCaso(filho, atuais, [filho, outro])).toEqual(atuais);
  });

  it("registro com os mesmos grupos, em outra ordem e caixa, acrescenta ao caso existente", () => {
    // Arrange
    const h1 = registrar(HISTORICO_VAZIO, "Nunes Marques", [], NUNES_MARQUES);
    // Act
    const h2 = registrar(h1, "Nunes Marques", [], manual({ tipo: "pessoas_diferentes", grupos: [" ministros do tse", STF] }));
    // Assert
    expect(h2.casos).toHaveLength(1);
    expect(h2.casos[0].registros).toHaveLength(2);
  });

  it("decisão de caso reaberto, com os grupos antigos e um novo, acrescenta ao mesmo caso", () => {
    // Arrange
    const h1 = registrar(HISTORICO_VAZIO, "Nunes Marques", [], NUNES_MARQUES);
    // Act
    const h2 = registrar(h1, "Nunes Marques", [], manual({ tipo: "mesma_pessoa", convidaPor: TSE, grupos: [STF, TSE, STJ], data: "2026-11-02" }));
    // Assert
    expect(h2.casos).toHaveLength(1);
    expect(situacaoDoCaso(h2.casos[0], [TSE, STJ])).toBe("pendente");
  });

  it("nome vazio depois da normalização lança DecisaoInvalidaError", () => {
    expect(() => registrar(HISTORICO_VAZIO, "  Ministro ", [], NUNES_MARQUES)).toThrow(DecisaoInvalidaError);
  });

  it("mudar os grupos do registro depois de registrar não muda o histórico", () => {
    // Arrange
    const r = manual({ tipo: "mesma_pessoa", convidaPor: TSE, grupos: [STF, TSE] });
    const h = registrar(HISTORICO_VAZIO, "Nunes Marques", [], r);
    // Act
    r.grupos.push(STJ);
    // Assert
    expect(vigente(h.casos[0])?.grupos).toEqual([STF, TSE]);
  });

  it("nomes diferentes sem chave em comum criam casos separados", () => {
    // Arrange
    const h1 = registrar(HISTORICO_VAZIO, "Davi Alcolumbre", ["Davi Alcolumbre"], manual({ tipo: "nao_recebe_convite" }));
    // Act
    const h2 = registrar(h1, "Eunício Oliveira", ["Eunício Oliveira"], manual({ tipo: "ajustar_contatos" }));
    // Assert
    expect(h2.casos.map((c) => c.id)).toEqual(["davi alcolumbre#", "eunicio oliveira#"]);
  });
});

describe("vigente", () => {
  it("vale o registro manual de data mais recente, mesmo gravado antes na ordem", () => {
    // Arrange
    const recente = manual({ tipo: "pessoas_diferentes", data: "2026-10-30" });
    const antigo = manual({ tipo: "mesma_pessoa", data: "2026-10-26" });
    // Act / Assert
    expect(vigente(casoCom(recente, antigo))).toBe(recente);
  });

  it("no empate de data vale o último na ordem", () => {
    const a = manual({ tipo: "pessoas_diferentes" });
    const b = manual({ tipo: "mesma_pessoa" });
    expect(vigente(casoCom(a, b))).toBe(b);
  });

  it("entradas de coleta não contam", () => {
    const caso: CasoDecidido = {
      id: "x",
      nome: "X",
      chaves: ["x"],
      registros: [{ tipo: "coleta", data: "2026-10-30", situacao: "pendente", grupos: [] }],
    };
    expect(vigente(caso)).toBeUndefined();
  });
});

describe("situacaoDoCaso", () => {
  const nunes = casoCom(NUNES_MARQUES);

  it("mesma_pessoa só no grupo do convite: tratado", () => {
    expect(situacaoDoCaso(nunes, [TSE])).toBe("tratado");
  });

  it("mesma_pessoa ainda no grupo que não convida: pendente", () => {
    expect(situacaoDoCaso(nunes, [STF, TSE])).toBe("pendente");
  });

  it("convidaPor com rótulo variante (espaço no fim, caixa diferente) acha o grupo do convite", () => {
    // Arrange
    const variante = casoCom(manual({ tipo: "mesma_pessoa", convidaPor: "ministros do TSE ", grupos: [STF, TSE] }));
    const eleito = casoCom(manual({
      tipo: "mesma_pessoa", convidaPor: "  SENADORES eleitos - Posse Presidencial 2027 ", grupos: ["Senadores eleitos - Posse Presidencial 2027"],
    }));
    // Act / Assert
    expect(situacaoDoCaso(variante, [TSE])).toBe("tratado");
    expect(situacaoDoCaso(variante, [STF, TSE])).toBe("pendente");
    expect(situacaoDoCaso(eleito, ["Senadores eleitos - Posse Presidencial 2027"])).toBe("tratado");
  });

  it("mesma_pessoa num grupo que não constava na decisão: reaberto", () => {
    expect(situacaoDoCaso(nunes, [TSE, STJ])).toBe("reaberto");
  });

  it("nao_recebe_convite fora de todos os grupos: tratado; ainda em Senadores: pendente", () => {
    // Arrange
    const davi = casoCom(manual({ tipo: "nao_recebe_convite", grupos: ["Senadores"] }));
    // Act / Assert
    expect(situacaoDoCaso(davi, [])).toBe("tratado");
    expect(situacaoDoCaso(davi, ["Senadores"])).toBe("pendente");
  });

  it("pessoas_diferentes com os mesmos grupos: sem efeito; com grupo novo: reaberto", () => {
    const caso = casoCom(manual({ tipo: "pessoas_diferentes", grupos: [STF, TSE] }));
    expect(situacaoDoCaso(caso, [STF, TSE])).toBe("sem_efeito");
    expect(situacaoDoCaso(caso, [STF, STJ])).toBe("reaberto");
  });

  it("ajustar_contatos: tratado sem grupo ou só no grupo do convite; pendente com outro grupo da decisão", () => {
    const caso = casoCom(manual({ tipo: "ajustar_contatos", convidaPor: TSE, grupos: [STF, TSE] }));
    expect(situacaoDoCaso(caso, [])).toBe("tratado");
    expect(situacaoDoCaso(caso, [TSE])).toBe("tratado");
    expect(situacaoDoCaso(caso, [STF, TSE])).toBe("pendente");
  });

  it("ajustar_contatos sem grupo do convite fecha quando a pessoa fica em um grupo só ou em nenhum", () => {
    const caso = casoCom(manual({ tipo: "ajustar_contatos", grupos: [STF, TSE] }));
    expect(situacaoDoCaso(caso, [])).toBe("tratado");
    expect(situacaoDoCaso(caso, [TSE])).toBe("tratado");
    expect(situacaoDoCaso(caso, [STF, TSE])).toBe("pendente");
  });

  it("mesma_pessoa fora de todos os grupos: pendente, porque ainda falta o grupo do convite", () => {
    expect(situacaoDoCaso(nunes, [])).toBe("pendente");
  });

  it("mesma_pessoa sem grupo do convite: pendente", () => {
    const caso = casoCom(manual({ tipo: "mesma_pessoa", grupos: [STF, TSE] }));
    expect(situacaoDoCaso(caso, [TSE])).toBe("pendente");
  });

  it("grupo do convite fora dos grupos do registro não reabre: só nele, tratado", () => {
    // Arrange: eleita decidida para o grupo de destino, ainda não cadastrada nele na decisão
    const caso = casoCom(
      manual({ tipo: "mesma_pessoa", convidaPor: GRUPO_GOVERNADORES_ELEITOS, grupos: ["Governadores"] }),
    );
    // Act / Assert
    expect(situacaoDoCaso(caso, [GRUPO_GOVERNADORES_ELEITOS])).toBe("tratado");
    expect(situacaoDoCaso(caso, ["Governadores", GRUPO_GOVERNADORES_ELEITOS])).toBe("pendente");
  });

  it("caso sem registro manual: sem efeito", () => {
    expect(situacaoDoCaso(casoCom(), [STF])).toBe("sem_efeito");
  });

  it("a decisão mais recente é a que vale", () => {
    const caso = casoCom(
      manual({ tipo: "mesma_pessoa", convidaPor: STF, grupos: [STF, TSE], data: "2026-10-26" }),
      manual({ tipo: "mesma_pessoa", convidaPor: TSE, grupos: [STF, TSE], data: "2026-10-29" }),
    );
    expect(situacaoDoCaso(caso, [TSE])).toBe("tratado");
  });
});

describe("registrarColetas", () => {
  const base = registrar(HISTORICO_VAZIO, "Nunes Marques", ["Nunes Marques"], NUNES_MARQUES);

  it("a mesma situação em duas coletas gera uma entrada só", () => {
    // Arrange
    const grupos = () => [STF, TSE];
    // Act
    const h1 = registrarColetas(base, grupos, "2026-10-30");
    const h2 = registrarColetas(h1, grupos, "2026-10-31");
    // Assert
    expect(h2.casos[0].registros).toEqual([
      NUNES_MARQUES,
      { tipo: "coleta", data: "2026-10-30", situacao: "pendente", grupos: [STF, TSE] },
    ]);
  });

  it("situação mudada acrescenta outra entrada", () => {
    // Arrange
    const h1 = registrarColetas(base, () => [STF, TSE], "2026-10-30");
    // Act
    const h2 = registrarColetas(h1, () => [TSE], "2026-11-02");
    // Assert
    expect(h2.casos[0].registros.slice(1)).toEqual([
      { tipo: "coleta", data: "2026-10-30", situacao: "pendente", grupos: [STF, TSE] },
      { tipo: "coleta", data: "2026-11-02", situacao: "tratado", grupos: [TSE] },
    ]);
  });

  it("decisão nova depois da coleta volta a registrar a situação, mesmo igual", () => {
    // Arrange
    const h1 = registrarColetas(base, () => [STF, TSE], "2026-10-30");
    const h2 = registrar(h1, "Nunes Marques", ["Nunes Marques"], manual({ ...NUNES_MARQUES, data: "2026-10-31" }));
    // Act
    const h3 = registrarColetas(h2, () => [STF, TSE], "2026-11-01");
    // Assert
    expect(h3.casos[0].registros.map((r) => r.tipo)).toEqual(["mesma_pessoa", "coleta", "mesma_pessoa", "coleta"]);
  });

  it("pessoas_diferentes sem grupo novo não gera entrada; com grupo novo gera a de reabertura", () => {
    // Arrange
    const h = registrar(HISTORICO_VAZIO, "Lucas Ribeiro", ["Lucas Ribeiro"], manual({ tipo: "pessoas_diferentes", grupos: [STF] }));
    // Act
    const semEfeito = registrarColetas(h, () => [STF], "2026-10-30");
    const reaberto = registrarColetas(h, () => [STF, STJ], "2026-10-30");
    // Assert
    expect(semEfeito.casos[0].registros).toHaveLength(1);
    expect(reaberto.casos[0].registros[1]).toEqual({
      tipo: "coleta",
      data: "2026-10-30",
      situacao: "reaberto",
      grupos: [STF, STJ],
    });
  });
});

describe("imutabilidade", () => {
  it("nenhuma função muta a entrada", () => {
    // Arrange
    const r = congelar(manual({ tipo: "mesma_pessoa", convidaPor: TSE, grupos: [STF, TSE] }));
    const vazio: HistoricoDecisoes = congelar({ versao: 1, casos: [] });
    const h1 = congelar(registrar(vazio, "Ministro Kassio Nunes Marques", ["Kassio Nunes Marques"], r));
    const nomes = congelar(["Nunes Marques", "Kassio Nunes Marques"]);
    const atuais = congelar([STF, TSE]);
    // Act
    const h2 = congelar(registrar(h1, "Nunes Marques", nomes, r));
    const h3 = registrarColetas(h2, () => atuais, "2026-10-30");
    const caso = acharCaso(h3, nomes);
    // Assert
    expect(vazio.casos).toHaveLength(0);
    expect(h1.casos[0].registros).toHaveLength(1);
    expect(h2.casos[0].registros).toHaveLength(2);
    expect(caso?.registros).toHaveLength(3);
    expect(vigente(h2.casos[0])).toEqual(r);
    expect(situacaoDoCaso(h2.casos[0], atuais)).toBe("pendente");
  });
});
