import { describe, expect, test } from "vitest";
import { abreviarAteCaber, classeDoSegmento, encaixarLogradouroComplemento, PASSOS_LOGRADOURO } from "@/lib/convidados/abreviacoes";

describe("logradouro e complemento", () => {
  test("logradouro de 71 caracteres do DF cabe em 50 só com o primeiro passo que basta", () => {
    const r = encaixarLogradouroComplemento("Setor de Autarquias Sul Quadra 3 Bloco C Edifício Sede da Associação", "5º andar, Sala 512");
    expect(r.logradouro).toBe("SAS Quadra 3 Bloco C Edifício Sede da Associação");
    expect(r.logradouro.length).toBeLessThanOrEqual(50);
    expect(r.regras).toEqual(["Logradouro acima de 50: abreviado (Setor de Autarquias Sul = SAS)"]);
    expect(r.complemento).toBe("5º andar, Sala 512");
    expect(r.revisao).toBeUndefined();
  });
  test("quando o primeiro passo não basta, os seguintes entram na ordem", () => {
    const r = encaixarLogradouroComplemento("Setor de Autarquias Sul Quadra 3 Bloco C Edifício Sede da Associação Exemplo", "");
    expect(r.logradouro).toBe("SAS Qd 3 Bl C Edifício Sede da Associação Exemplo");
    expect(r.regras).toEqual(["Logradouro acima de 50: abreviado (Setor de Autarquias Sul = SAS, Quadra = Qd, Bloco = Bl)"]);
  });
  test("não abrevia o que já cabe", () => {
    const r = encaixarLogradouroComplemento("Avenida das Nações", "Sala 301");
    expect(r).toMatchObject({ logradouro: "Avenida das Nações", complemento: "Sala 301", trechoQueNaoCoube: "", regras: [] });
  });
  test("abreviarAteCaber para no passo em que coube e respeita a caixa", () => {
    expect(abreviarAteCaber("Quadra 5 Conjunto B", 10, PASSOS_LOGRADOURO)).toEqual({ valor: "Qd 5 Cj B", passos: ["Quadra = Qd", "Conjunto = Cj"] });
    expect(abreviarAteCaber("quadra 5", 4, PASSOS_LOGRADOURO).valor).toBe("qd 5");
  });
  test("complemento acima de 30 usa nível 1 e, se não bastar, nível 2 sem preposições", () => {
    const r = encaixarLogradouroComplemento("Esplanada dos Ministérios Bloco A", "Edifício Anexo, 5º andar, Sala 512 do Gabinete");
    expect(r.complemento.length).toBeLessThanOrEqual(30);
    expect(r.complemento).toBe("Ed Anexo, 5º And, Sl 512 Gab");
    expect(r.regras.some((x) => x.startsWith("Complemento abreviado (nível 2"))).toBe(true);
    expect(r.trechoQueNaoCoube).toBe("");
  });
  test("o que não cabe no Complemento vai para o trecho que não coube, o menos essencial primeiro, e é REVISAR", () => {
    const r = encaixarLogradouroComplemento("Rua Exemplo", "Condomínio Residencial das Palmeiras Imperiais, Torre Norte, Bloco B, Apartamento 1204");
    expect(r.complemento).toBe("Torre Norte, Bl B, Apto 1204");
    expect(r.trechoQueNaoCoube).toBe("Cond Res Palmeiras Imperiais");
    expect(r.revisao).toEqual({ marca: "revisar", texto: "Complemento acima de 30: trecho não coube" });
    expect(classeDoSegmento("Sala 512")).toBe(0);
    expect(classeDoSegmento("2º And")).toBe(1);
    expect(classeDoSegmento("Ed Sede")).toBe(2);
    expect(classeDoSegmento("Portaria Norte")).toBe(3);
  });
  test("excedente do logradouro vai ao início do Complemento e andar nunca sobe ao Logradouro", () => {
    const r = encaixarLogradouroComplemento("Rodovia Exemplo Longa Demais Para Caber Quilômetro 12, Galpão 7, Portaria Norte", "2º andar");
    expect(r.logradouro.length).toBeLessThanOrEqual(50);
    expect(r.complemento.startsWith("Galpão 7") || r.complemento.startsWith("Portaria Norte")).toBe(true);
    expect(r.logradouro).not.toMatch(/andar/i);
    expect(r.regras).toContain("Logradouro: trecho movido para o Complemento");
  });
  test("logradouro de um segmento só que não cabe nem abreviado não é cortado e vira REVISAR", () => {
    const longo = "Rua Exemplo Muito Longa Sem Nenhuma Abreviação Possível Número Um";
    const r = encaixarLogradouroComplemento(longo, "");
    expect(r.logradouro).toBe(longo);
    expect(r.revisao).toEqual({ marca: "revisar", texto: "Logradouro acima de 50 mesmo abreviado" });
    expect(r.trechoQueNaoCoube).toBe("");
  });
});
