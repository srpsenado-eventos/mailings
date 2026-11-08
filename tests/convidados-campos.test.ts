import { describe, expect, test } from "vitest";
import { abreviarLote, ehEnderecoDoDf, tratarNumero } from "@/lib/convidados/numero";
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

describe("número", () => {
  const base = { logradouro: "Rua Exemplo", complemento: "", uf: "DF", cidade: "Brasília" };
  test("número curto fica como veio", () => {
    expect(tratarNumero({ ...base, numero: "120" })).toMatchObject({ numero: "120", regras: [] });
  });
  test("Lote 12 Casa 3 no Número: S/N e Lt 12 Cs 3 no Complemento (regra A)", () => {
    const r = tratarNumero({ ...base, numero: "Lote 12 Casa 3" });
    expect(r.numero).toBe("S/N");
    expect(r.complemento).toBe("Lt 12 Cs 3");
    expect(r.regras[0]).toMatch(/regra A/);
    expect(r.revisao).toBeUndefined();
  });
  test("regra A preserva o Complemento que já existia", () => {
    expect(tratarNumero({ ...base, numero: "Bloco 4", complemento: "Sala 2" }).complemento).toBe("Bl 4, Sala 2");
  });
  test("regra A com Complemento acima de 30 marca REVISAR e mantém o valor", () => {
    const r = tratarNumero({ ...base, numero: "Bloco 4", complemento: "Edifício Exemplo Sala 2 Andar 5" });
    expect(r.complemento).toBe("Bl 4, Edifício Exemplo Sala 2 Andar 5");
    expect(r.revisao).toEqual({ marca: "revisar", texto: "Complemento acima de 30 depois da regra A" });
  });
  test("acima de 6 sem marca conhecida é REVISAR, valor mantido", () => {
    const r = tratarNumero({ ...base, numero: "1234567" });
    expect(r.numero).toBe("1234567");
    expect(r.revisao?.marca).toBe("revisar");
    expect(r.revisao?.texto).toBe("Número acima de 6 caracteres sem lote/casa/bloco");
  });
  test("vazio no DF vira S/N; vazio em Brasília sem UF também", () => {
    expect(tratarNumero({ ...base, numero: "" }).numero).toBe("S/N");
    expect(tratarNumero({ ...base, numero: "", uf: "" }).numero).toBe("S/N");
    expect(ehEnderecoDoDf("", "BSB")).toBe(true);
    expect(ehEnderecoDoDf("GO", "Brasília")).toBe(false);
  });
  test("vazio no DF com Lote 12 no Logradouro: lote vai ao Complemento e sai do Logradouro", () => {
    const r = tratarNumero({ ...base, numero: "", logradouro: "Quadra 5 Conjunto B Lote 12" });
    expect(r).toMatchObject({ numero: "S/N", logradouro: "Quadra 5 Conjunto B", complemento: "Lt 12" });
    expect(r.regras).toContain("Lote/Casa/Chácara do Logradouro levado ao Complemento (regra A dos Correios)");
  });
  test("vazio fora do DF: S/N só com indicação no logradouro, senão REVISAR", () => {
    expect(tratarNumero({ ...base, numero: "", uf: "MG", cidade: "Belo Horizonte", logradouro: "Rua Exemplo, s/n" }).numero).toBe("S/N");
    const r = tratarNumero({ ...base, numero: "", uf: "MG", cidade: "Belo Horizonte" });
    expect(r.numero).toBe("");
    expect(r.revisao).toEqual({ marca: "revisar", texto: "Número não informado" });
  });
  test("abreviarLote cobre lote, casa, chácara e bloco", () => {
    expect(abreviarLote("Chácara 7 Bloco B")).toBe("Ch 7 Bl B");
    expect(abreviarLote("Lotes 1, 2")).toBe("Lt 1, 2");
  });
});
