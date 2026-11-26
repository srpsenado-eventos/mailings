import { describe, expect, test } from "vitest";
import { GRUPO_DEPUTADOS_ELEITOS, GRUPO_SENADORES_ELEITOS } from "@/data/grupos-posse";
import { lerLista, lerListaPadrao } from "@/lib/convidados/lista";
import { MOTIVO_SEM_GENERO, MOTIVO_SEM_REGRA, preencherProtocolo } from "@/lib/convidados/preencher-protocolo";
import { tratarLista } from "@/lib/convidados/tratar";
import { ColunaFaltanteError } from "@/lib/planilha";
import { montarListaPadrao } from "./fixtures/convidados/montar";

const DEPUTADOS = "Deputados Federais";
/** Cargo com regra na tabela v02 e sem marca de gênero no léxico de cargos. */
const PRESIDENTE = "Presidente da República Federativa do Brasil";
const SEM_PROTOCOLO = ["TRATAMENTO", "ENDERECAMENTO"];
const endereco = { CEP: "70160900", LOGRADOURO: "Câmara dos Deputados, Praça dos Três Poderes", NUMERO: "S/N", COMPLEMENTO: "Anexo IV - 9º andar - Gab. 901", BAIRRO: "Zona Cívico-Administrativa", CIDADE: "Brasília", UF: "DF" };

describe("preencherProtocolo (função pura)", () => {
  test("grupo de eleitos: Senhor / Ao Senhor e Senhora / À Senhora pelo gênero do cargo, com a regra dos eleitos", () => {
    // Arrange
    const ele = { cargo: "Deputado Federal eleito", grupo: GRUPO_DEPUTADOS_ELEITOS, tratamento: "", enderecamento: "" };
    const ela = { cargo: "Deputada Federal eleita", grupo: GRUPO_DEPUTADOS_ELEITOS, tratamento: "", enderecamento: "" };
    // Act
    const dele = preencherProtocolo(ele);
    const dela = preencherProtocolo(ela);
    // Assert
    expect(dele).toEqual({ tratamento: "Senhor", enderecamento: "Ao Senhor", regras: ["Tratamento preenchido pela regra: eleitos (19/11)", "Endereçamento preenchido pela regra: eleitos (19/11)"] });
    expect(dela).toMatchObject({ tratamento: "Senhora", enderecamento: "À Senhora" });
    expect(dela.motivoSemPreenchimento).toBeUndefined();
  });
  test("o grupo de eleitos casa por mesmoGrupo, em outra caixa e com espaços, e vale para os senadores eleitos", () => {
    const r = preencherProtocolo({ cargo: "Senadora eleita", grupo: ` ${GRUPO_SENADORES_ELEITOS.toUpperCase()} `, tratamento: "", enderecamento: "" });
    expect(r).toMatchObject({ tratamento: "Senhora", enderecamento: "À Senhora" });
  });
  test("demais grupos: tabela v02 para o cargo, no gênero do cargo", () => {
    const r = preencherProtocolo({ cargo: "Deputada Federal", grupo: DEPUTADOS, tratamento: "", enderecamento: "" });
    expect(r).toEqual({ tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora", regras: ["Tratamento preenchido pela regra: tabela v02 para 'Deputada Federal'", "Endereçamento preenchido pela regra: tabela v02 para 'Deputada Federal'"] });
    expect(preencherProtocolo({ cargo: "Deputado Federal", grupo: DEPUTADOS, tratamento: "", enderecamento: "" })).toMatchObject({ tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" });
  });
  test("só o campo vazio é preenchido; o preenchido volta igual (aparado) e sem regra para ele", () => {
    const r = preencherProtocolo({ cargo: "Deputado Federal", grupo: DEPUTADOS, tratamento: " Excelentíssimo Senhor ", enderecamento: "" });
    expect(r.tratamento).toBe("Excelentíssimo Senhor");
    expect(r.enderecamento).toBe("A Sua Excelência o Senhor");
    expect(r.regras).toEqual(["Endereçamento preenchido pela regra: tabela v02 para 'Deputado Federal'"]);
  });
  test("os dois preenchidos: nada muda, nenhuma regra, nenhum motivo", () => {
    const r = preencherProtocolo({ cargo: "", grupo: DEPUTADOS, tratamento: "Senhor", enderecamento: "Ao Senhor" });
    expect(r).toEqual({ tratamento: "Senhor", enderecamento: "Ao Senhor", regras: [] });
  });
  test("cargo vazio deixa os dois vazios: nunca Senhor por padrão", () => {
    const r = preencherProtocolo({ cargo: "", grupo: GRUPO_DEPUTADOS_ELEITOS, tratamento: "", enderecamento: "" });
    expect(r).toEqual({ tratamento: "", enderecamento: "", regras: [], motivoSemPreenchimento: MOTIVO_SEM_GENERO });
  });
  test("cargo sem regra na tabela fora dos eleitos deixa os dois vazios com o motivo", () => {
    const r = preencherProtocolo({ cargo: "Assessor Especial", grupo: DEPUTADOS, tratamento: "", enderecamento: "" });
    expect(r).toEqual({ tratamento: "", enderecamento: "", regras: [], motivoSemPreenchimento: MOTIVO_SEM_REGRA });
  });
  test("cargo com regra mas sem gênero ('Presidente do Tribunal Exemplo', 'Membro') deixa os dois vazios, nos eleitos e nos demais: nunca Senhor por padrão", () => {
    const vazio = { tratamento: "", enderecamento: "", regras: [], motivoSemPreenchimento: MOTIVO_SEM_GENERO };
    for (const cargo of ["Presidente do Tribunal Exemplo", "Membro"]) {
      expect(preencherProtocolo({ cargo, grupo: GRUPO_DEPUTADOS_ELEITOS, tratamento: "", enderecamento: "" })).toEqual(vazio);
      expect(preencherProtocolo({ cargo, grupo: GRUPO_SENADORES_ELEITOS, tratamento: "", enderecamento: "" })).toEqual(vazio);
    }
    // Fora dos eleitos, um cargo com regra na tabela e sem gênero no léxico: a Presidência da República.
    expect(preencherProtocolo({ cargo: PRESIDENTE, grupo: DEPUTADOS, tratamento: "", enderecamento: "" })).toEqual(vazio);
    // "Presidente do Tribunal Exemplo" não está na tabela: fora dos eleitos o motivo é a falta de regra, que vem antes do gênero.
    expect(preencherProtocolo({ cargo: "Presidente do Tribunal Exemplo", grupo: DEPUTADOS, tratamento: "", enderecamento: "" }).motivoSemPreenchimento).toBe(MOTIVO_SEM_REGRA);
  });
  test("cargo sem gênero e Tratamento 'Senhora' preenchido: o endereçamento sai no feminino pela forma preenchida", () => {
    const r = preencherProtocolo({ cargo: PRESIDENTE, grupo: DEPUTADOS, tratamento: "Senhora", enderecamento: "" });
    expect(r.tratamento).toBe("Senhora");
    expect(r.enderecamento).toBe("A Sua Excelência a Senhora");
    expect(r.regras).toEqual([`Endereçamento preenchido pela regra: tabela v02 para '${PRESIDENTE}'`]);
    expect(r.motivoSemPreenchimento).toBeUndefined();
    const eleito = preencherProtocolo({ cargo: "Membro", grupo: GRUPO_DEPUTADOS_ELEITOS, tratamento: "", enderecamento: "À Senhora" });
    expect(eleito).toMatchObject({ tratamento: "Senhora", enderecamento: "À Senhora" });
  });
  test("os cargos da rodada real continuam decidindo o gênero pelo cargo", () => {
    const protocolo = (cargo: string, grupo: string) => {
      const r = preencherProtocolo({ cargo, grupo, tratamento: "", enderecamento: "" });
      return [r.tratamento, r.enderecamento];
    };
    expect(protocolo("Deputado Federal", DEPUTADOS)).toEqual(["Senhor", "A Sua Excelência o Senhor"]);
    expect(protocolo("Deputada Federal", DEPUTADOS)).toEqual(["Senhora", "A Sua Excelência a Senhora"]);
    expect(protocolo("Deputado Federal eleito", GRUPO_DEPUTADOS_ELEITOS)).toEqual(["Senhor", "Ao Senhor"]);
    expect(protocolo("Deputada Federal eleita", GRUPO_DEPUTADOS_ELEITOS)).toEqual(["Senhora", "À Senhora"]);
  });
  test("não muta a entrada", () => {
    const entrada = { cargo: "Deputado Federal", grupo: DEPUTADOS, tratamento: "", enderecamento: "" };
    const copia = { ...entrada };
    preencherProtocolo(entrada);
    expect(entrada).toEqual(copia);
  });
});

describe("tratarLista com preencherProtocolo (spec 2026-11-08 §16.7, critérios 1 e 2)", () => {
  const eleitos = [
    { NOME: "Ana Exemplo", CARGO: "Deputada Federal eleita", ...endereco },
    { NOME: "Bruno Exemplo", CARGO: "Deputado Federal eleito", ...endereco },
  ];
  test("lista sem as colunas: sem a opção é ColunaFaltanteError com os dois nomes; com a opção, lê com os campos vazios", () => {
    const buf = montarListaPadrao(eleitos, { semColunas: SEM_PROTOCOLO });
    expect(() => lerLista(buf)).toThrow(ColunaFaltanteError);
    expect(() => lerLista(buf)).toThrow(/TRATAMENTO.*ENDERECAMENTO/);
    const lida = lerLista(buf, { protocoloOpcional: true });
    expect(lida.origem).toBe("padrao");
    expect(lida.linhas.map((l) => [l.valores.TRATAMENTO, l.valores.ENDERECAMENTO])).toEqual([["", ""], ["", ""]]);
  });
  test("grupo de eleitos: campos preenchidos, alterados, com a regra dos eleitos, CARGO inalterado, linha no arquivo", () => {
    const linhas = lerListaPadrao(montarListaPadrao(eleitos, { semColunas: SEM_PROTOCOLO }), { protocoloOpcional: true });
    const r = tratarLista({ linhas, grupo: GRUPO_DEPUTADOS_ELEITOS, base: [], enderecos: [], preencherProtocolo: true });
    const [ela, ele] = r.linhas;
    expect(ela.gravado).toMatchObject({ TRATAMENTO: "Senhora", ENDERECAMENTO: "À Senhora", CARGO: "Deputada Federal eleita" });
    expect(ele.gravado).toMatchObject({ TRATAMENTO: "Senhor", ENDERECAMENTO: "Ao Senhor", CARGO: "Deputado Federal eleito" });
    expect(ela.camposAlterados).toEqual(["TRATAMENTO", "ENDERECAMENTO"]);
    expect(ela.regras).toEqual(["Tratamento preenchido pela regra: eleitos (19/11)", "Endereçamento preenchido pela regra: eleitos (19/11)"]);
    expect(r.linhas.every((l) => l.situacao === "novo" && l.entraNoArquivo && l.achados.length === 0)).toBe(true);
    expect(r.preencherProtocolo).toBe(true);
    expect(r.contagens).toMatchObject({ novos: 2, novosAlterados: 2, semProtocolo: 0, protocoloPreenchido: 2 });
  });
  test("grupo Deputados Federais: tabela v02 para 'Deputada Federal'; sem regra fica fora do arquivo com o motivo; preenchido não muda e continua REVISAR", () => {
    const casos = [
      { NOME: "Ana Exemplo", CARGO: "Deputada Federal", ...endereco },
      { NOME: "Carla Exemplo", CARGO: "Assessor Especial", ...endereco },
      { NOME: "Davi Exemplo", CARGO: "Deputado Federal", TRATAMENTO: "Excelentíssimo Senhor", ENDERECAMENTO: "A Sua Excelência o Senhor", ...endereco },
    ];
    const r = tratarLista({ linhas: lerListaPadrao(montarListaPadrao(casos)), grupo: DEPUTADOS, base: [], enderecos: [], preencherProtocolo: true });
    const [ana, carla, davi] = r.linhas;
    expect(ana.gravado).toMatchObject({ TRATAMENTO: "Senhora", ENDERECAMENTO: "A Sua Excelência a Senhora" });
    expect(ana.regras).toContain("Tratamento preenchido pela regra: tabela v02 para 'Deputada Federal'");
    expect(ana.achados).toEqual([]);

    expect(carla.situacao).toBe("sem_protocolo");
    expect(carla.entraNoArquivo).toBe(false);
    expect(carla.gravado).toMatchObject({ TRATAMENTO: "", ENDERECAMENTO: "" });
    expect(carla.achados.map((a) => [a.campo, a.tipo, a.motivo])).toEqual([["TRATAMENTO", "revisar", MOTIVO_SEM_REGRA], ["ENDERECAMENTO", "revisar", MOTIVO_SEM_REGRA]]);

    expect(davi.gravado.TRATAMENTO).toBe("Excelentíssimo Senhor");
    expect(davi.camposAlterados).toEqual([]);
    expect(davi.achados.map((a) => [a.campo, a.sugestao])).toEqual([["TRATAMENTO", "Senhor"]]);
    expect(r.contagens).toMatchObject({ novos: 2, semProtocolo: 1, protocoloPreenchido: 1 });
  });
  test("cargo vazio fica fora do arquivo com 'Cargo não decide o gênero'", () => {
    const r = tratarLista({ linhas: lerListaPadrao(montarListaPadrao([{ NOME: "Eva Exemplo", CARGO: "", ...endereco }])), grupo: GRUPO_DEPUTADOS_ELEITOS, base: [], enderecos: [], preencherProtocolo: true });
    expect(r.linhas[0].situacao).toBe("sem_protocolo");
    expect(r.linhas[0].achados.map((a) => a.motivo)).toEqual([MOTIVO_SEM_GENERO, MOTIVO_SEM_GENERO]);
    expect(r.contagens.protocoloPreenchido).toBe(0);
  });
  test("opção desligada (padrão): nada é preenchido, motivo de sempre, rodada diz que não preencheu", () => {
    const r = tratarLista({ linhas: lerListaPadrao(montarListaPadrao(eleitos)), grupo: GRUPO_DEPUTADOS_ELEITOS, base: [], enderecos: [] });
    expect(r.preencherProtocolo).toBe(false);
    expect(r.linhas.every((l) => l.situacao === "sem_protocolo" && l.gravado.TRATAMENTO === "")).toBe(true);
    expect(r.linhas[0].achados[0].motivo).toMatch(/obrigatórios no modelo/);
    expect(r.contagens).toMatchObject({ semProtocolo: 2, protocoloPreenchido: 0 });
  });
  test("linha já cadastrada no grupo não ganha achado de protocolo, mesmo com a opção e os campos vazios", () => {
    const base = [{ id: "1", nome: "Ana Exemplo", grupo: GRUPO_DEPUTADOS_ELEITOS, cargo: undefined, tratamento: "", enderecamento: "" }];
    const r = tratarLista({ linhas: lerListaPadrao(montarListaPadrao([{ NOME: "Ana Exemplo", CARGO: "", ...endereco }])), grupo: GRUPO_DEPUTADOS_ELEITOS, base, enderecos: [], preencherProtocolo: true });
    expect(r.linhas[0].situacao).toBe("ja_grupo_escolhido");
    expect(r.linhas[0].achados.some((a) => a.motivo === MOTIVO_SEM_GENERO)).toBe(false);
  });
});

describe("bairro da Câmara pelo CEP e S/N em caixa alta na rodada (critério 3)", () => {
  const linha = { NOME: "Ana Exemplo", CARGO: "Deputada Federal", TRATAMENTO: "Senhora", ENDERECAMENTO: "A Sua Excelência a Senhora", ...endereco };
  test("Bairro vazio com CEP 70160-900, DF e Brasília vira Zona Cívico-Administrativa, alterado, com a regra do CEP", () => {
    const r = tratarLista({ linhas: lerListaPadrao(montarListaPadrao([{ ...linha, BAIRRO: "", CEP: "70160-900" }])), grupo: DEPUTADOS, base: [], enderecos: [] });
    const l = r.linhas[0];
    expect(l.gravado.BAIRRO).toBe("Zona Cívico-Administrativa");
    expect(l.gravado.CEP).toBe("70160900");
    expect(l.camposAlterados).toEqual(expect.arrayContaining(["BAIRRO", "CEP"]));
    expect(l.regras).toContain("Bairro preenchido pelo CEP 70160-900 (Praça dos Três Poderes)");
    expect(l.achados.filter((a) => a.campo === "BAIRRO")).toEqual([]);
    expect(l.marcas).not.toContain("revisar");
  });
  test("Bairro vazio com CEP 70165900 fica vazio e REVISAR 'Bairro vazio'", () => {
    const r = tratarLista({ linhas: lerListaPadrao(montarListaPadrao([{ ...linha, BAIRRO: "", CEP: "70165900" }])), grupo: DEPUTADOS, base: [], enderecos: [] });
    const l = r.linhas[0];
    expect(l.gravado.BAIRRO).toBe("");
    expect(l.achados.map((a) => [a.campo, a.motivo])).toEqual([["BAIRRO", "Bairro vazio"]]);
    expect(l.marcas).toContain("revisar");
  });
  test("Número 's/n' sai 'S/N', alterado, com a regra; 'S/N' recebido não é alterado", () => {
    const r = tratarLista({ linhas: lerListaPadrao(montarListaPadrao([{ ...linha, NUMERO: "s/n" }, { ...linha, NOME: "Bruno Exemplo", NUMERO: "S/N" }])), grupo: DEPUTADOS, base: [], enderecos: [] });
    expect(r.linhas[0].gravado.NUMERO).toBe("S/N");
    expect(r.linhas[0].camposAlterados).toEqual(["NUMERO"]);
    expect(r.linhas[0].regras).toEqual(["Número S/N em caixa alta"]);
    expect(r.linhas[1].camposAlterados).toEqual([]);
  });
});
