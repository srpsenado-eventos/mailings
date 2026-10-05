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

  test("aceita a planilha de endereços e normaliza cada linha", () => {
    const p = parsePayloadAnalise({
      arquivoNome: "c.xlsx",
      contatos: [{ nome: "Autoridade", grupo: "G", id: "7" }],
      arquivoEnderecosNome: "enderecos.xlsx",
      enderecos: [
        { contatoId: "7", logradouro: "Rua A", numero: "10", cep: "70070-030", uf: "DF", prioritario: true },
        { contatoId: 9, prioritario: "Sim" },
      ],
    });
    expect(p.contatos[0].id).toBe("7");
    expect(p.arquivoEnderecosNome).toBe("enderecos.xlsx");
    expect(p.enderecos).toHaveLength(2);
    expect(p.enderecos?.[0]).toMatchObject({ contatoId: "7", numero: "10", prioritario: true });
    // tipos errados vindos do JSON não derrubam a rota: viram vazio/falso
    expect(p.enderecos?.[1]).toMatchObject({ contatoId: "", prioritario: false });
  });

  test("sem a planilha de endereços, o campo fica ausente", () => {
    const p = parsePayloadAnalise({ arquivoNome: "c.xlsx", contatos: [] });
    expect(p.enderecos).toBeUndefined();
  });

  test("planilha de endereços maior que o teto é recusada", () => {
    const enderecos = Array.from({ length: 50_001 }, () => ({ contatoId: "1", prioritario: false }));
    expect(() => parsePayloadAnalise({ arquivoNome: "c.xlsx", contatos: [], enderecos })).toThrow(
      PayloadInvalidoError,
    );
  });
});

describe("payload da eleição 2026", () => {
  const base = { arquivoNome: "base.xlsx", contatos: [] };

  test("aceita eleitos, deputados atuais e nomes dos arquivos", () => {
    const p = parsePayloadAnalise({
      ...base,
      eleitos: [{ casa: "senado", uf: "MA", nomeUrna: "A", nomeCompleto: "A B", situacaoTse: "Eleito", statusMandato: "Reeleição", partido: "PXX", extra: 1 }],
      deputadosAtuais: [{ uf: "MA", nomeParlamentar: "C", nomeCivil: "C D", email: "c@camara.leg.br" }],
      arquivosEleicao: ["senado.xlsx", 7],
    });
    expect(p.eleitos).toEqual([{ casa: "senado", uf: "MA", nomeUrna: "A", nomeCompleto: "A B", situacaoTse: "Eleito", statusMandato: "Reeleição", partido: "PXX" }]);
    expect(p.deputadosAtuais?.[0]).toMatchObject({ nomeParlamentar: "C", email: "c@camara.leg.br" });
    expect(p.arquivosEleicao).toEqual(["senado.xlsx"]);
  });

  test("sem os campos da eleição, nada muda", () => {
    const p = parsePayloadAnalise(base);
    expect(p.eleitos).toBeUndefined();
    expect(p.deputadosAtuais).toBeUndefined();
  });

  test("casa desconhecida é recusada", () => {
    expect(() => parsePayloadAnalise({ ...base, eleitos: [{ casa: "assembleia" }] })).toThrow(PayloadInvalidoError);
  });

  test("lista de eleitos que não é array é recusada", () => {
    expect(() => parsePayloadAnalise({ ...base, eleitos: "x" })).toThrow(PayloadInvalidoError);
  });
});
