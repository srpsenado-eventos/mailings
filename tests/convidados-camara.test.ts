import { describe, expect, test } from "vitest";
import { ehListaDaCamara, lerListaDaCamara } from "@/lib/convidados/camara";
import { ColunaFaltanteError } from "@/lib/planilha";
import { montarListaPadrao } from "./fixtures/convidados/montar";
import { montarPlanilhaDaCamara } from "./fixtures/convidados/montar-camara";

describe("planilha do site da Câmara", () => {
  test("reconhece a planilha da Câmara pelas três colunas, em aba com qualquer nome", () => {
    expect(ehListaDaCamara(montarPlanilhaDaCamara([{ nomeParlamentar: "Dr. Carlos Exemplo" }], { aba: "Atualização - 09-11-2026 17-30" }))).toBe(true);
    expect(ehListaDaCamara(montarListaPadrao([]))).toBe(false);
  });
  test("monta a linha do homem no Anexo 4 no vocabulário do modelo, com a regra A", () => {
    const [l] = lerListaDaCamara(montarPlanilhaDaCamara([{ nomeParlamentar: "Dr. Carlos Exemplo", anexo: "4", gabinete: "414", tratamento: "Exmo. Senhor Deputado" }]));
    expect(l.linha).toBe(2);
    expect(l.orgao).toBe("Câmara dos Deputados");
    expect(l.valores).toEqual({ NOME: "Dr. Carlos Exemplo", TRATAMENTO: "Senhor", ENDERECAMENTO: "A Sua Excelência o Senhor", CARGO: "Deputado Federal", CEP: "70160900", LOGRADOURO: "Praça dos Três Poderes", NUMERO: "S/N", COMPLEMENTO: "Anexo 4, Gabinete 414", BAIRRO: "Zona Cívico-Administrativa", CIDADE: "Brasília", UF: "DF" });
  });
  test("mulher no Anexo 3 sai no feminino", () => {
    const [l] = lerListaDaCamara(montarPlanilhaDaCamara([{ nomeParlamentar: "Ana Exemplo", anexo: "3", gabinete: "531", tratamento: "Exma. Senhora Deputada" }]));
    expect(l.valores).toMatchObject({ TRATAMENTO: "Senhora", ENDERECAMENTO: "A Sua Excelência a Senhora", CARGO: "Deputada Federal", COMPLEMENTO: "Anexo 3, Gabinete 531" });
  });
  test("Anexo 0 segue a regra geral", () => {
    const [l] = lerListaDaCamara(montarPlanilhaDaCamara([{ nomeParlamentar: "Pedro Exemplo", anexo: "0", gabinete: "20" }]));
    expect(l.valores.COMPLEMENTO).toBe("Anexo 0, Gabinete 20");
  });
  test("tratamento que não decide o gênero deixa tratamento e endereçamento vazios e o cargo no masculino", () => {
    const [l] = lerListaDaCamara(montarPlanilhaDaCamara([{ nomeParlamentar: "Pedro Exemplo", tratamento: "" }]));
    expect(l.valores).toMatchObject({ TRATAMENTO: "", ENDERECAMENTO: "", CARGO: "Deputado Federal" });
  });
  test("tratamento com texto inesperado também não decide o gênero", () => {
    const [l] = lerListaDaCamara(montarPlanilhaDaCamara([{ nomeParlamentar: "Pedro Exemplo", tratamento: "Deputado" }]));
    expect(l.valores).toMatchObject({ TRATAMENTO: "", ENDERECAMENTO: "" });
  });
  test("sem CEP legível no complemento, CEP vazio", () => {
    const [l] = lerListaDaCamara(montarPlanilhaDaCamara([{ nomeParlamentar: "Pedro Exemplo", enderecoComplemento: "Brasília - DF" }]));
    expect(l.valores.CEP).toBe("");
  });
  test("gabinete gravado como número volta como texto; linha sem nome parlamentar é pulada", () => {
    const linhas = lerListaDaCamara(montarPlanilhaDaCamara([{ nomeParlamentar: "Pedro Exemplo", gabinete: "414" }, { nomeParlamentar: "" }]));
    expect(linhas).toHaveLength(1);
    expect(linhas[0].valores.COMPLEMENTO).toBe("Anexo 4, Gabinete 414");
  });
  test("planilha sem as três marcas é ColunaFaltanteError", () => {
    expect(() => lerListaDaCamara(montarPlanilhaDaCamara([{ nomeParlamentar: "Pedro Exemplo" }], { semColunas: ["Nome Civil"] }))).toThrow(ColunaFaltanteError);
  });
});
