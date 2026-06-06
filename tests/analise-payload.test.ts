import { describe, expect, test } from "vitest";
import { parsePayloadAnalise, PayloadInvalidoError } from "@/lib/analise-payload";

describe("parsePayloadAnalise", () => {
  test("aceita payload válido e devolve arquivoNome + contatos", () => {
    const corpo = {
      arquivoNome: "CNJ.xlsx",
      contatos: [{ nome: "Ana", grupo: "CNJ", cargo: "Conselheira" }],
    };

    const r = parsePayloadAnalise(corpo);

    expect(r.arquivoNome).toBe("CNJ.xlsx");
    expect(r.contatos).toHaveLength(1);
    expect(r.contatos[0]).toMatchObject({ nome: "Ana", grupo: "CNJ", cargo: "Conselheira" });
  });

  test("faz narrow seguro: nome/grupo ausentes viram string vazia, opcionais viram undefined", () => {
    const corpo = { arquivoNome: "x.csv", contatos: [{ telefone: 61_999, lixo: true }] };

    const r = parsePayloadAnalise(corpo);

    expect(r.contatos[0].nome).toBe("");
    expect(r.contatos[0].grupo).toBe("");
    // telefone numérico não é string → vira undefined (sem coerção silenciosa)
    expect(r.contatos[0].telefone).toBeUndefined();
    expect(r.contatos[0].cargo).toBeUndefined();
  });

  test("lança PayloadInvalidoError quando arquivoNome está ausente", () => {
    expect(() => parsePayloadAnalise({ contatos: [] })).toThrow(PayloadInvalidoError);
    expect(() => parsePayloadAnalise({ contatos: [] })).toThrow(/arquivo/i);
  });

  test("lança PayloadInvalidoError quando contatos não é array", () => {
    expect(() => parsePayloadAnalise({ arquivoNome: "a.xlsx", contatos: "x" })).toThrow(
      PayloadInvalidoError,
    );
  });

  test("lança PayloadInvalidoError quando o corpo não é objeto", () => {
    expect(() => parsePayloadAnalise(null)).toThrow(PayloadInvalidoError);
    expect(() => parsePayloadAnalise("texto")).toThrow(PayloadInvalidoError);
  });

  test("lança PayloadInvalidoError acima do teto de contatos", () => {
    const muitos = Array.from({ length: 50_001 }, () => ({ nome: "x", grupo: "g" }));
    expect(() => parsePayloadAnalise({ arquivoNome: "a.xlsx", contatos: muitos })).toThrow(
      /muito grande/i,
    );
  });
});
