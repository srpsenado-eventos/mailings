import { describe, expect, test } from "vitest";
import { triarArquivosSoltos } from "@/lib/arquivos-soltos";

const arquivo = (name: string) => ({ name });

describe("triarArquivosSoltos", () => {
  test("passo de um arquivo: uma planilha .xlsx entra, sem aviso", () => {
    expect(triarArquivosSoltos([arquivo("BASE GRUPOS POSSE.xlsx")], false)).toEqual({ aceitos: [arquivo("BASE GRUPOS POSSE.xlsx")], aviso: null });
  });

  test("a extensão é comparada sem caixa e .csv também entra", () => {
    const r = triarArquivosSoltos([arquivo("base.XLSX"), arquivo("outra.Csv")], true);
    expect(r.aceitos.map((a) => a.name)).toEqual(["base.XLSX", "outra.Csv"]);
    expect(r.aviso).toBeNull();
  });

  test("passo múltiplo aceita todas as planilhas de uma vez, na ordem soltada", () => {
    const r = triarArquivosSoltos([arquivo("a.xlsx"), arquivo("b.xlsx"), arquivo("c.xlsx"), arquivo("d.xlsx")], true);
    expect(r.aceitos.map((a) => a.name)).toEqual(["a.xlsx", "b.xlsx", "c.xlsx", "d.xlsx"]);
    expect(r.aviso).toBeNull();
  });

  test("arquivo de outro tipo é recusado com aviso que o nomeia; o resto entra", () => {
    const r = triarArquivosSoltos([arquivo("foto.png"), arquivo("lista.xlsx")], true);
    expect(r.aceitos).toEqual([arquivo("lista.xlsx")]);
    expect(r.aviso).toBe('Só planilhas .xlsx ou .csv: "foto.png" foi ignorado.');
  });

  test("vários recusados: o aviso lista todos, no plural", () => {
    const r = triarArquivosSoltos([arquivo("a.pdf"), arquivo("b.docx"), arquivo("c.xls")], true);
    expect(r.aceitos).toEqual([]);
    expect(r.aviso).toBe('Só planilhas .xlsx ou .csv: "a.pdf", "b.docx" e "c.xls" foram ignorados.');
  });

  test("passo de um arquivo com mais de uma planilha: nada entra e o aviso pede uma por vez", () => {
    const r = triarArquivosSoltos([arquivo("a.xlsx"), arquivo("b.xlsx")], false);
    expect(r.aceitos).toEqual([]);
    expect(r.aviso).toBe("Este passo aceita um arquivo só: solte uma planilha por vez.");
  });

  test("recusa e excesso juntos: os dois avisos, nessa ordem", () => {
    const r = triarArquivosSoltos([arquivo("a.xlsx"), arquivo("b.xlsx"), arquivo("c.txt")], false);
    expect(r.aceitos).toEqual([]);
    expect(r.aviso).toBe('Só planilhas .xlsx ou .csv: "c.txt" foi ignorado. Este passo aceita um arquivo só: solte uma planilha por vez.');
  });

  test("nada solto: aviso de nenhum arquivo", () => {
    expect(triarArquivosSoltos([], true)).toEqual({ aceitos: [], aviso: "Nenhum arquivo foi solto." });
  });

  test("não muda a lista recebida", () => {
    const lista = [arquivo("x.png"), arquivo("a.xlsx")];
    triarArquivosSoltos(lista, true);
    expect(lista).toEqual([arquivo("x.png"), arquivo("a.xlsx")]);
  });
});
