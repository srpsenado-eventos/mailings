import { describe, expect, test } from "vitest";
import { lerLista, lerListaPadrao, lerListaPadraoComAba } from "@/lib/convidados/lista";
import { ColunaFaltanteError } from "@/lib/planilha";
import { montarListaPadrao } from "./fixtures/convidados/montar";
import { montarPlanilhaDaCamara } from "./fixtures/convidados/montar-camara";

const linha = { NOME: "Ana Beatriz Exemplo Souza", orgao: "Órgão Exemplo", CARGO: "Diretora", CEP: "70165900", LOGRADOURO: "Avenida das Nações", NUMERO: "120", COMPLEMENTO: "Sala 301", BAIRRO: "Asa Sul", CIDADE: "Brasília", UF: "DF", TRATAMENTO: "Senhora", ENDERECAMENTO: "À Senhora" };

describe("lerListaPadrao", () => {
  test("lê a lista com o cabeçalho na linha 8 e numera a partir da 9", () => {
    const linhas = lerListaPadrao(montarListaPadrao([linha, { ...linha, NOME: "Carlos Eduardo Fictício Ramos" }]));
    expect(linhas).toHaveLength(2);
    expect(linhas[0].linha).toBe(9);
    expect(linhas[1].linha).toBe(10);
    expect(linhas[0].valores).toEqual({ NOME: "Ana Beatriz Exemplo Souza", TRATAMENTO: "Senhora", ENDERECAMENTO: "À Senhora", CARGO: "Diretora", CEP: "70165900", LOGRADOURO: "Avenida das Nações", NUMERO: "120", COMPLEMENTO: "Sala 301", BAIRRO: "Asa Sul", CIDADE: "Brasília", UF: "DF" });
    expect(linhas[0].orgao).toBe("Órgão Exemplo");
  });
  test("lista só com cabeçalho devolve nenhuma linha", () => {
    expect(lerListaPadrao(montarListaPadrao([]))).toEqual([]);
  });
  test("pula linha sem nome e apara espaços", () => {
    const linhas = lerListaPadrao(montarListaPadrao([{ ...linha, NOME: "  Ana Beatriz Exemplo Souza " }, { NOME: "", CEP: "1" }]));
    expect(linhas).toHaveLength(1);
    expect(linhas[0].valores.NOME).toBe("Ana Beatriz Exemplo Souza");
  });
  test("CEP gravado como número volta como texto, inclusive com 7 dígitos", () => {
    const linhas = lerListaPadrao(montarListaPadrao([{ ...linha, CEP: "1310100" }], { cepComoNumero: true }));
    expect(linhas[0].valores.CEP).toBe("1310100");
    expect(typeof linhas[0].valores.CEP).toBe("string");
  });
  test("acha o cabeçalho em outra linha e em aba com outro nome", () => {
    const linhas = lerListaPadrao(montarListaPadrao([linha], { linhaCabecalho: 3, aba: "Convidados Gabinete" }));
    expect(linhas[0].linha).toBe(4);
  });
  test("coluna ENDERECAMENTO ausente é ColunaFaltanteError com o nome da coluna", () => {
    const buf = montarListaPadrao([linha], { semColunas: ["ENDERECAMENTO"] });
    expect(() => lerListaPadrao(buf)).toThrow(ColunaFaltanteError);
    expect(() => lerListaPadrao(buf)).toThrow(/ENDERECAMENTO/);
  });
  test("com protocoloOpcional, TRATAMENTO e ENDERECAMENTO ausentes valem vazio em toda linha; as demais colunas seguem obrigatórias", () => {
    const buf = montarListaPadrao([linha, { ...linha, NOME: "Carlos Eduardo Fictício Ramos" }], { semColunas: ["TRATAMENTO", "ENDERECAMENTO"] });
    const linhas = lerListaPadrao(buf, { protocoloOpcional: true });
    expect(linhas).toHaveLength(2);
    expect(linhas.map((l) => [l.valores.TRATAMENTO, l.valores.ENDERECAMENTO])).toEqual([["", ""], ["", ""]]);
    expect(linhas[0].valores.NOME).toBe("Ana Beatriz Exemplo Souza");
    expect(() => lerListaPadrao(montarListaPadrao([linha], { semColunas: ["CEP"] }), { protocoloOpcional: true })).toThrow(ColunaFaltanteError);
  });
  test("com protocoloOpcional e as colunas presentes, os valores são lidos como sempre", () => {
    const linhas = lerListaPadrao(montarListaPadrao([linha]), { protocoloOpcional: true });
    expect(linhas[0].valores).toMatchObject({ TRATAMENTO: "Senhora", ENDERECAMENTO: "À Senhora" });
  });
  test("ÓRGÃO ausente não é erro", () => {
    const linhas = lerListaPadrao(montarListaPadrao([linha], { semColunas: ["ÓRGÃO"] }));
    expect(linhas[0].orgao).toBe("");
  });
  test("planilha sem cabeçalho reconhecível é ColunaFaltanteError", () => {
    const buf = montarListaPadrao([], { semColunas: ["NOME COMPLETO DO CONVIDADO/ NOME POLÍTICO", "CEP"] });
    expect(() => lerListaPadrao(buf)).toThrow(ColunaFaltanteError);
  });
});

describe("lerListaPadraoComAba", () => {
  test("lê a aba Lista de Convidados mesmo com a aba de orientações antes, com exemplos e cabeçalho sem as colunas do GT", () => {
    const buf = montarListaPadrao([linha], { abaDeOrientacoesAntes: true });
    const lida = lerListaPadraoComAba(buf);
    expect(lida.aba).toBe("Lista de Convidados");
    expect(lida.linhas).toHaveLength(1);
    expect(lida.linhas[0].valores.NOME).toBe("Ana Beatriz Exemplo Souza");
  });
  test("sem a aba Lista de Convidados, lê a primeira aba com o cabeçalho que não seja de orientações", () => {
    const buf = montarListaPadrao([linha], { aba: "Convidados Gabinete", abaDeOrientacoesAntes: true });
    expect(lerListaPadraoComAba(buf).aba).toBe("Convidados Gabinete");
  });
  test("aba Lista de Convidados só com cabeçalho devolve 0 linhas, nunca os exemplos da aba de orientações", () => {
    expect(lerListaPadrao(montarListaPadrao([], { abaDeOrientacoesAntes: true }))).toEqual([]);
  });
});

describe("despachante de origem", () => {
  test("planilha da Câmara é reconhecida pelas colunas", () => {
    const r = lerLista(montarPlanilhaDaCamara([{ nomeParlamentar: "Pedro Exemplo" }]));
    expect(r.origem).toBe("camara");
    expect(r.linhas).toHaveLength(1);
  });
  test("modelo Padrão devolve a origem e a aba lida", () => {
    const r = lerLista(montarListaPadrao([{ NOME: "Ana Exemplo" }]));
    expect(r.origem).toBe("padrao");
    expect(r.aba).toBe("Lista de Convidados");
  });
  test("lerLista repassa protocoloOpcional ao leitor do modelo Padrão", () => {
    const buf = montarListaPadrao([{ NOME: "Ana Exemplo" }], { semColunas: ["TRATAMENTO"] });
    expect(() => lerLista(buf)).toThrow(/TRATAMENTO/);
    expect(lerLista(buf, { protocoloOpcional: true }).linhas[0].valores.TRATAMENTO).toBe("");
  });
});
