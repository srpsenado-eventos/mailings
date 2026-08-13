import { describe, expect, test } from "vitest";
import { REGRAS_TRATAMENTO } from "@/data/tratamentos";

describe("tabela de protocolo real (data/tratamentos.ts)", () => {
  test("tem as 38 entradas da aba Simplificado", () => {
    expect(REGRAS_TRATAMENTO).toHaveLength(38);
  });

  test("não inclui os cabeçalhos repetidos da planilha", () => {
    const cabecalhos = REGRAS_TRATAMENTO.filter(
      (r) => r.cargoDestinatario.trim() === "Cargo do destinatário",
    );
    expect(cabecalhos).toEqual([]);
  });

  test("não inclui as linhas de seção (sem nominata)", () => {
    const semNominata = REGRAS_TRATAMENTO.filter((r) => r.nominata.trim().length === 0);
    expect(semNominata.map((r) => r.cargoDestinatario)).toEqual([]);
  });

  test("toda entrada tem cargo e vocativo não-vazios", () => {
    const incompletas = REGRAS_TRATAMENTO.filter(
      (r) => r.cargoDestinatario.trim().length === 0 || r.vocativo.trim().length === 0,
    );
    expect(incompletas).toEqual([]);
  });

  test("preserva os casos-limite que a expansão precisa tratar", () => {
    // `cargoDestinatario` guarda o texto multilinha da célula: a 1ª linha é o nome do
    // cargo e as demais são notas ou listas de patentes. O casamento usa a 1ª linha.
    const primeiraLinha = (r: { cargoDestinatario: string }) =>
      r.cargoDestinatario.split("\n")[0].trim();
    const nomes = REGRAS_TRATAMENTO.map(primeiraLinha);
    expect(nomes).toContain("Cardeal");
    expect(nomes).toContain("Cônsul");
    expect(nomes).toContain("Militares com patente superior");
    const cardeal = REGRAS_TRATAMENTO.find((r) => primeiraLinha(r) === "Cardeal");
    expect(cardeal?.vocativo).toContain("ou");
  });

  test("preserva as linhas de detalhe do cargo (patentes militares)", () => {
    const militares = REGRAS_TRATAMENTO.find(
      (r) => r.cargoDestinatario.split("\n")[0].trim() === "Militares com patente superior",
    );
    expect(militares?.cargoDestinatario).toContain("General de Exército");
  });
});
