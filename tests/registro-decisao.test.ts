import { describe, expect, it } from "vitest";
import {
  GRUPO_DEPUTADOS_ELEITOS, GRUPO_DEPUTADOS_FEDERAIS, GRUPO_GOVERNADORES, GRUPO_GOVERNADORES_ELEITOS, GRUPO_SENADORES, GRUPO_SENADORES_ELEITOS,
} from "@/data/grupos-posse";
import { registrar, HISTORICO_VAZIO, type RegistroColeta, type RegistroManual } from "@/lib/decisoes";
import {
  alvoDoEleito, alvoDoGovernador, alvoDoRepetido, corpoDoPedido, errosDoFormulario, FORMULARIO_VAZIO, historicoDoEleito,
  historicoDoGovernador, hojeEmBrasilia, paraRegistro, pedeConvite, registrosDoMaisRecente, textoDoRegistro, type FormularioDecisao,
} from "@/lib/registro-decisao";
import type { AutoridadeRepetida, OcorrenciaRepetida } from "@/lib/repetidos-base";
import type { EleitoClassificado, GovernadorClassificado } from "@/lib/types";

const formulario = (parcial: Partial<FormularioDecisao>): FormularioDecisao => ({ ...FORMULARIO_VAZIO, ...parcial });

const manual = (parcial: Partial<RegistroManual>): RegistroManual => ({
  tipo: "mesma_pessoa", data: "2026-10-26", quem: "Marina e Clóvis", observacao: "", validacao: "validado",
  convidaPor: "Ministros do TSE", grupos: ["Ministros do TSE", "Ministros do STF"], ...parcial,
});

const ocorrencia = (parcial: Partial<OcorrenciaRepetida>): OcorrenciaRepetida => ({
  grupo: "Ministros do STF", grupoRegra: "Ministros do STF", chave: "nunes marques", cargo: "Ministro",
  ex: false, possivelSaida: false, origem: "contatos", ...parcial,
});

describe("errosDoFormulario", () => {
  it("aponta o grupo do convite e quem decidiu quando faltam em mesma_pessoa", () => {
    // Arrange
    const f = formulario({ tipo: "mesma_pessoa", convidaPor: "", quem: "" });

    // Act
    const erros = errosDoFormulario(f);

    // Assert
    expect(erros).toHaveLength(2);
  });

  it("exige o tipo da decisão", () => {
    // Arrange
    const f = formulario({ tipo: "", quem: "Clóvis" });

    // Act
    const erros = errosDoFormulario(f);

    // Assert
    expect(erros).toEqual(["Escolha o tipo da decisão."]);
  });

  it("não exige o grupo do convite fora de mesma_pessoa", () => {
    // Arrange
    const f = formulario({ tipo: "ajustar_contatos", quem: "Clóvis" });

    // Act
    const erros = errosDoFormulario(f);

    // Assert
    expect(erros).toEqual([]);
  });

  it("não aceita quem decidiu só com espaços", () => {
    // Arrange
    const f = formulario({ tipo: "nao_recebe_convite", quem: "   " });

    // Act
    const erros = errosDoFormulario(f);

    // Assert
    expect(erros).toHaveLength(1);
  });
});

describe("paraRegistro", () => {
  it("grava a data de hoje e os grupos do caso", () => {
    // Arrange
    const f = formulario({ tipo: "mesma_pessoa", convidaPor: "Ministros do TSE", quem: " Clóvis ", observacao: " ok ", validacao: "validado" });

    // Act
    const r = paraRegistro(f, ["Ministros do TSE", "Ministros do STF"], "2026-10-30");

    // Assert
    expect(r).toEqual({
      tipo: "mesma_pessoa", data: "2026-10-30", quem: "Clóvis", observacao: "ok", validacao: "validado",
      convidaPor: "Ministros do TSE", grupos: ["Ministros do TSE", "Ministros do STF"],
    });
  });

  it("deixa de fora o grupo do convite quando o tipo não pede convite", () => {
    // Arrange
    const f = formulario({ tipo: "nao_recebe_convite", convidaPor: "Ministros do TSE", quem: "Clóvis" });

    // Act
    const r = paraRegistro(f, ["Ministros do TSE"], "2026-10-30");

    // Assert
    expect(r.convidaPor).toBeUndefined();
  });

  it("leva as ocorrências marcadas como outra pessoa", () => {
    // Arrange
    const f = formulario({ tipo: "pessoas_diferentes", outraPessoa: [GRUPO_DEPUTADOS_FEDERAIS], quem: "Clóvis", validacao: "a_validar" });

    // Act
    const r = paraRegistro(f, [GRUPO_GOVERNADORES, GRUPO_DEPUTADOS_FEDERAIS], "2026-10-30");

    // Assert
    expect(r.outraPessoa).toEqual([GRUPO_DEPUTADOS_FEDERAIS]);
    expect(r.validacao).toBe("a_validar");
  });

  it("recusa formulário sem tipo", () => {
    // Arrange
    const f = formulario({ quem: "Clóvis" });

    // Act + Assert
    expect(() => paraRegistro(f, ["Ministros do TSE"], "2026-10-30")).toThrow();
  });

  it("não muta a lista de grupos recebida", () => {
    // Arrange
    const grupos = ["Ministros do TSE"];
    const f = formulario({ tipo: "nao_recebe_convite", quem: "Clóvis" });

    // Act
    const r = paraRegistro(f, grupos, "2026-10-30");

    // Assert
    expect(r.grupos).not.toBe(grupos);
  });
});

describe("FORMULARIO_VAZIO", () => {
  it("começa com a validação em A validar", () => {
    // Arrange + Act + Assert
    expect(FORMULARIO_VAZIO.validacao).toBe("a_validar");
  });
});

describe("pedeConvite", () => {
  it("só mesma_pessoa e ajustar_contatos pedem o grupo do convite", () => {
    // Arrange + Act + Assert
    expect(pedeConvite("mesma_pessoa")).toBe(true);
    expect(pedeConvite("ajustar_contatos")).toBe(true);
    expect(pedeConvite("pessoas_diferentes")).toBe(false);
    expect(pedeConvite("nao_recebe_convite")).toBe(false);
    expect(pedeConvite("")).toBe(false);
  });
});

describe("textoDoRegistro", () => {
  it("descreve a entrada de coleta tratada", () => {
    // Arrange
    const r: RegistroColeta = { tipo: "coleta", data: "2026-10-30", situacao: "tratado", grupos: ["Ministros do TSE"] };

    // Act
    const texto = textoDoRegistro(r);

    // Assert
    expect(texto).toBe("30/10 · Coleta: Tratado no Contatos");
  });

  it("descreve a decisão de mesma pessoa com o texto da coluna Decisão do GT e a validação", () => {
    // Arrange
    const r = manual({});

    // Act
    const texto = textoDoRegistro(r);

    // Assert
    expect(texto).toBe("26/10 · Mesma pessoa: convidar pelo grupo Ministros do TSE (Marina e Clóvis) · Validado");
  });

  it("acrescenta outra pessoa e a observação", () => {
    // Arrange
    const r = manual({ outraPessoa: [GRUPO_DEPUTADOS_FEDERAIS], observacao: "Deputado homônimo", validacao: "a_validar" });

    // Act
    const texto = textoDoRegistro(r);

    // Assert
    expect(texto).toBe(
      "26/10 · Mesma pessoa: convidar pelo grupo Ministros do TSE (Marina e Clóvis) · Outra pessoa em Deputados Federais · A validar · Deputado homônimo",
    );
  });

  it("descreve não recebe convite e ajuste no Contatos", () => {
    // Arrange
    const nao = manual({ tipo: "nao_recebe_convite", convidaPor: undefined });
    const ajuste = manual({ tipo: "ajustar_contatos", convidaPor: undefined });

    // Act + Assert
    expect(textoDoRegistro(nao)).toBe("26/10 · Não recebe convite (Marina e Clóvis) · Validado");
    expect(textoDoRegistro(ajuste)).toBe("26/10 · Ajustar no Contatos (Marina e Clóvis) · Validado");
  });

  it("descreve a reabertura pela coleta", () => {
    // Arrange
    const r: RegistroColeta = { tipo: "coleta", data: "2026-10-31", situacao: "reaberto", grupos: [] };

    // Act + Assert
    expect(textoDoRegistro(r)).toBe("31/10 · Coleta: Reaberto");
  });
});

describe("registrosDoMaisRecente", () => {
  it("ordena do mais recente para o mais antigo, e no empate o último gravado vem antes", () => {
    // Arrange
    const a = manual({ data: "2026-10-26", quem: "A" });
    const b: RegistroColeta = { tipo: "coleta", data: "2026-10-30", situacao: "pendente", grupos: [] };
    const c = manual({ data: "2026-10-26", quem: "C" });

    // Act
    const ordem = registrosDoMaisRecente([a, b, c]);

    // Assert
    expect(ordem).toEqual([b, c, a]);
  });
});

describe("hojeEmBrasilia", () => {
  it("usa o dia de Brasília, não o de UTC", () => {
    // Arrange
    const madrugadaUtc = new Date("2026-10-31T02:00:00Z");

    // Act + Assert
    expect(hojeEmBrasilia(madrugadaUtc)).toBe("2026-10-30");
  });
});

describe("alvoDoRepetido", () => {
  it("tira os grupos, os convites e as ocorrências da forma equivalente", () => {
    // Arrange
    const a: AutoridadeRepetida = {
      nome: "Lucas Ribeiro", situacao: "conferir", motivo: "",
      ocorrencias: [
        ocorrencia({ grupo: "Governadores ", grupoRegra: "Governadores", chave: "lucas ribeiro" }),
        ocorrencia({ grupo: "Deputados Federais", grupoRegra: "Deputados Federais", chave: "pedro lucas fernandes ribeiro", origem: "camara" }),
      ],
    };

    // Act
    const alvo = alvoDoRepetido(a);

    // Assert
    expect(alvo.grupos).toEqual([GRUPO_GOVERNADORES, GRUPO_DEPUTADOS_FEDERAIS]);
    expect(alvo.convites).toEqual([GRUPO_GOVERNADORES, GRUPO_DEPUTADOS_FEDERAIS]);
    expect(alvo.ocorrencias.map((o) => o.valor)).toEqual([GRUPO_GOVERNADORES, GRUPO_DEPUTADOS_FEDERAIS]);
    expect(alvo.ocorrencias.map((o) => o.nomes)).toEqual([["lucas ribeiro"], ["pedro lucas fernandes ribeiro"]]);
  });

  it("junta duas ocorrências do mesmo grupo numa só marcação", () => {
    // Arrange
    const a: AutoridadeRepetida = {
      nome: "Fulano", situacao: "conferir", motivo: "",
      ocorrencias: [
        ocorrencia({ chave: "fulano de tal" }),
        ocorrencia({ chave: "fulano" }),
        ocorrencia({ grupo: "Ministros do TSE", grupoRegra: "Ministros do TSE", chave: "fulano" }),
      ],
    };

    // Act
    const alvo = alvoDoRepetido(a);

    // Assert
    expect(alvo.ocorrencias).toHaveLength(2);
    expect(alvo.ocorrencias[0].nomes).toEqual(["fulano de tal", "fulano"]);
  });

  it("autoridade tratada sem ocorrência registra com os grupos do caso", () => {
    // Arrange
    const h = registrar(HISTORICO_VAZIO, "Davi", [], manual({ grupos: ["Senadores", "Ex-Presidentes do Senado"], convidaPor: "Senadores" }));
    const a: AutoridadeRepetida = { nome: "Davi", situacao: "tratado", motivo: "", ocorrencias: [], caso: h.casos[0] };

    // Act
    const alvo = alvoDoRepetido(a);

    // Assert
    expect(alvo.grupos).toEqual(["Senadores", "Ex-Presidentes do Senado"]);
  });

  it("pessoa que saiu de um grupo do caso registra no mesmo caso", () => {
    // Arrange
    const h = registrar(HISTORICO_VAZIO, "Nunes Marques", [], manual({ grupos: ["Ministros do STF", "Ministros do TSE"] }));
    const a: AutoridadeRepetida = {
      nome: "Nunes Marques", situacao: "tratado", motivo: "", caso: h.casos[0],
      ocorrencias: [ocorrencia({ grupo: "Ministros do TSE", grupoRegra: "Ministros do TSE" })],
    };
    const f = formulario({ tipo: "ajustar_contatos", quem: "Clóvis" });

    // Act
    const alvo = alvoDoRepetido(a);
    const corpo = corpoDoPedido(alvo, f, "2026-10-30");
    const depois = registrar(h, corpo.nome, corpo.nomes, corpo.registro);

    // Assert
    expect(alvo.grupos).toEqual(["Ministros do STF", "Ministros do TSE"]);
    expect(depois.casos).toHaveLength(1);
    expect(depois.casos[0].registros).toHaveLength(2);
  });
});

describe("corpoDoPedido", () => {
  it("monta o corpo da rota sem os nomes das ocorrências marcadas como outra pessoa", () => {
    // Arrange
    const a: AutoridadeRepetida = {
      nome: "Lucas Ribeiro", situacao: "conferir", motivo: "",
      ocorrencias: [
        ocorrencia({ grupo: "Governadores", grupoRegra: "Governadores", chave: "lucas ribeiro" }),
        ocorrencia({ grupo: "Deputados Federais", grupoRegra: "Deputados Federais", chave: "pedro lucas fernandes ribeiro", origem: "camara" }),
      ],
    };
    const f = formulario({
      tipo: "mesma_pessoa", convidaPor: GRUPO_GOVERNADORES, outraPessoa: [GRUPO_DEPUTADOS_FEDERAIS], quem: "Clóvis",
    });

    // Act
    const corpo = corpoDoPedido(alvoDoRepetido(a), f, "2026-10-30");

    // Assert
    expect(corpo.nome).toBe("Lucas Ribeiro");
    expect(corpo.nomes).toEqual(["lucas ribeiro"]);
    expect(corpo.registro.grupos).toEqual([GRUPO_GOVERNADORES, GRUPO_DEPUTADOS_FEDERAIS]);
    expect(corpo.registro.outraPessoa).toEqual([GRUPO_DEPUTADOS_FEDERAIS]);
  });
});

const eleito = (parcial: Partial<EleitoClassificado>): EleitoClassificado => ({
  eleito: { casa: "senado", uf: "CE", nomeUrna: "Eunício", nomeCompleto: "Eunício Lopes de Oliveira", situacaoTse: "Eleito", statusMandato: "Novo" },
  destino: "conferir", projecao: false, motivo: "conferir", contatos: [], ...parcial,
});

describe("alvoDoEleito", () => {
  it("grava o grupo de eleitos da Casa e os grupos dos contatos ligados quando não há destino", () => {
    // Arrange
    const x = eleito({ contatos: [{ grupo: "Ex-Presidentes do Senado", nome: "Eunício Oliveira" }] });

    // Act
    const alvo = alvoDoEleito(x);

    // Assert
    expect(alvo.grupos).toEqual([GRUPO_SENADORES_ELEITOS, "Ex-Presidentes do Senado"]);
    expect(alvo.nomes).toEqual(["Eunício Lopes de Oliveira", "Eunício Oliveira"]);
    expect(alvo.ocorrencias).toEqual([{ valor: "Ex-Presidentes do Senado", rotulo: "Ex-Presidentes do Senado: Eunício Oliveira", nomes: ["Eunício Oliveira"] }]);
  });

  it("usa o grupo de destino calculado e oferece os convites da Casa", () => {
    // Arrange
    const x = eleito({
      eleito: { casa: "camara", uf: "SP", nomeUrna: "Fulana", nomeCompleto: "Fulana de Tal", situacaoTse: "Eleito", statusMandato: "Reeleito" },
      destino: "reeleito", grupoDestino: GRUPO_DEPUTADOS_FEDERAIS,
    });

    // Act
    const alvo = alvoDoEleito(x);

    // Assert
    expect(alvo.grupos).toEqual([GRUPO_DEPUTADOS_FEDERAIS]);
    expect(alvo.convites).toEqual([GRUPO_SENADORES, GRUPO_DEPUTADOS_FEDERAIS, GRUPO_DEPUTADOS_ELEITOS]);
  });

  it("oferece aos senadores eleitos os convites do Senado", () => {
    // Arrange + Act
    const alvo = alvoDoEleito(eleito({}));

    // Assert
    expect(alvo.convites).toEqual([GRUPO_SENADORES, GRUPO_DEPUTADOS_FEDERAIS, GRUPO_SENADORES_ELEITOS]);
  });
});

describe("alvoDoGovernador", () => {
  it("grava o grupo de governadores eleitos e a lista da Câmara como Deputados Federais", () => {
    // Arrange
    const x: GovernadorClassificado = {
      eleito: { uf: "PB", nomeUrna: "Lucas Ribeiro", nomeCompleto: "Lucas Ribeiro", situacaoTse: "Eleito", statusMandato: "Novo" },
      destino: "conferir", contatos: [{ grupo: "Governadores", nome: "Lucas Ribeiro" }],
      deputadoAtual: { uf: "MA", nomeParlamentar: "Pedro Lucas Fernandes" },
    };

    // Act
    const alvo = alvoDoGovernador(x);

    // Assert
    expect(alvo.grupos).toEqual([GRUPO_GOVERNADORES_ELEITOS, GRUPO_GOVERNADORES, GRUPO_DEPUTADOS_FEDERAIS]);
    expect(alvo.convites).toEqual([GRUPO_GOVERNADORES, GRUPO_GOVERNADORES_ELEITOS, GRUPO_SENADORES, GRUPO_DEPUTADOS_FEDERAIS]);
    expect(alvo.ocorrencias.map((o) => o.valor)).toEqual([GRUPO_GOVERNADORES, GRUPO_DEPUTADOS_FEDERAIS]);
  });
});

describe("historicoDoEleito", () => {
  it("acha os registros do caso do eleito, do mais recente para o mais antigo", () => {
    // Arrange
    const x = eleito({ contatos: [{ grupo: "Ex-Presidentes do Senado", nome: "Eunício Oliveira" }] });
    const r1 = manual({ data: "2026-10-26", tipo: "ajustar_contatos", convidaPor: undefined, grupos: [GRUPO_SENADORES_ELEITOS, "Ex-Presidentes do Senado"] });
    const r2 = manual({ data: "2026-10-29", convidaPor: GRUPO_SENADORES_ELEITOS, grupos: [GRUPO_SENADORES_ELEITOS, "Ex-Presidentes do Senado"] });
    const h = registrar(registrar(HISTORICO_VAZIO, "Eunício", ["Eunício Lopes de Oliveira"], r1), "Eunício", [], r2);

    // Act
    const registros = historicoDoEleito(h, x);

    // Assert
    expect(registros).toEqual([r2, r1]);
  });

  it("não acha nada sem decisões", () => {
    // Arrange + Act + Assert
    expect(historicoDoEleito(undefined, eleito({}))).toEqual([]);
  });

  it("mostra o caso sem grupos que a classificação aplica pelo nome", () => {
    // Arrange
    const h = registrar(HISTORICO_VAZIO, "Eunício", [], manual({ grupos: [], tipo: "ajustar_contatos", convidaPor: undefined }));

    // Act
    const registros = historicoDoEleito(h, eleito({}));

    // Assert
    expect(registros).toHaveLength(1);
  });

  it("não mostra a decisão do homônimo ligado por nome (Jader Filho e o pai)", () => {
    // Arrange
    const pai = manual({ grupos: ["Ex-Presidentes do Senado", GRUPO_SENADORES], convidaPor: GRUPO_SENADORES });
    const h = registrar(HISTORICO_VAZIO, "Jader Barbalho", [], pai);
    const filho = eleito({
      eleito: { casa: "senado", uf: "PA", nomeUrna: "Jader Filho", nomeCompleto: "Jader Fontenelle Barbalho Filho", situacaoTse: "Eleito", statusMandato: "Novo" },
      contatos: [{ grupo: GRUPO_SENADORES, nome: "Jader Barbalho" }],
    });

    // Act
    const registros = historicoDoEleito(h, filho);

    // Assert
    expect(registros).toEqual([]);
  });

  it("não pega caso de outra pessoa com o mesmo nome em grupo fora do eixo", () => {
    // Arrange
    const r = manual({ grupos: ["Ministros do TSE", "Ministros do STF"], convidaPor: "Ministros do TSE" });
    const h = registrar(HISTORICO_VAZIO, "Eunício", [], r);

    // Act
    const registros = historicoDoEleito(h, eleito({}));

    // Assert
    expect(registros).toEqual([]);
  });
});

describe("historicoDoGovernador", () => {
  it("acha o caso do governador eleito pelo nome de urna no eixo do governo", () => {
    // Arrange
    const r = manual({ grupos: [GRUPO_GOVERNADORES, GRUPO_GOVERNADORES_ELEITOS], convidaPor: GRUPO_GOVERNADORES });
    const h = registrar(HISTORICO_VAZIO, "Lucas Ribeiro", [], r);
    const x: GovernadorClassificado = {
      eleito: { uf: "PB", nomeUrna: "Lucas Ribeiro", nomeCompleto: "Lucas Ribeiro", situacaoTse: "Eleito", statusMandato: "Novo" },
      destino: "conferir", contatos: [],
    };

    // Act
    const registros = historicoDoGovernador(h, x);

    // Assert
    expect(registros).toHaveLength(1);
  });
});
