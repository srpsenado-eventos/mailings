import { describe, expect, test } from "vitest";
import { casaDeputado, compararComSite, generoDoSexo, TEXTO_SITUACAO_DIVERGENCIA, valoresDoSite } from "@/lib/convidados/divergencias";
import { nomeDivergencias } from "@/lib/convidados/rodada-nomes";
import { DEPUTADOS_DO_SITE, deputado, LINHAS_DA_LISTA, linhasTratadas } from "./fixtures/convidados/divergencias";

describe("casamento da linha com o deputado do site", () => {
  test("nome igual ao parlamentar ou ao civil casa em qualquer UF; nome civil com abreviação também", () => {
    expect(casaDeputado("Ana Exemplo", DEPUTADOS_DO_SITE[0])).toBe(true);
    expect(casaDeputado("ANA MARIA EXEMPLO", DEPUTADOS_DO_SITE[0])).toBe(true);
    expect(casaDeputado("J. Exemplo Silva", DEPUTADOS_DO_SITE[1])).toBe(true);
    expect(casaDeputado("Carlos Saiu Exemplo", DEPUTADOS_DO_SITE[1])).toBe(false);
    expect(casaDeputado("", DEPUTADOS_DO_SITE[0])).toBe(false);
  });
  test("deputado sem nome civil só casa pelo parlamentar", () => {
    expect(casaDeputado("J. Exemplo", deputado({ nomeParlamentar: "Jose Exemplo", nomeCivil: "" }))).toBe(false);
    expect(casaDeputado("José Exemplo", deputado({ nomeParlamentar: "Jose Exemplo", nomeCivil: "" }))).toBe(true);
  });
});

describe("compararComSite: critério 4 do §16.7", () => {
  const d = compararComSite(linhasTratadas(), DEPUTADOS_DO_SITE);

  test("duas permanecem (uma pelo nome parlamentar, outra pelo nome civil abreviado), uma saiu, um entrou", () => {
    expect(d.linhas.map((l) => l.situacao)).toEqual(["permanece", "permanece", "saiu"]);
    expect(d.linhas[0].deputado?.nomeParlamentar).toBe("Ana Exemplo");
    expect(d.linhas[1].deputado?.nomeCivil).toBe("José Exemplo Silva");
    expect(d.linhas[2].deputado).toBeUndefined();
    expect(d.entraram).toHaveLength(1);
    expect(d.entraram[0].situacao).toBe("entrou");
    expect(d.entraram[0].deputado.nomeParlamentar).toBe("Beatriz Entrou Exemplo");
    expect(d.contagens).toEqual({ permanece: 2, saiu: 1, entrou: 1, conferir: 0 });
  });
  test("mantém a ordem da lista e os valores gravados da rodada", () => {
    expect(d.linhas.map((l) => l.linha.linha)).toEqual([9, 10, 11]);
    expect(d.linhas.map((l) => l.linha.gravado.NOME)).toEqual(LINHAS_DA_LISTA.map((l) => l.NOME));
  });
  test("quem entrou leva os valores de §15.2, com o protocolo no gênero e o endereço da Câmara", () => {
    expect(d.entraram[0].valores).toEqual({
      NOME: "Beatriz Entrou Exemplo",
      TRATAMENTO: "Senhora",
      ENDERECAMENTO: "A Sua Excelência a Senhora",
      CARGO: "Deputada Federal",
      CEP: "70160900",
      LOGRADOURO: "Praça dos Três Poderes",
      NUMERO: "S/N",
      COMPLEMENTO: "Anexo 4, Gabinete 414",
      BAIRRO: "Zona Cívico-Administrativa",
      CIDADE: "Brasília",
      UF: "DF",
    });
  });
});

describe("homônimos saem Conferir nas duas pontas", () => {
  test("dois deputados do site com o mesmo nome parlamentar casando uma linha", () => {
    const linhas = linhasTratadas([{ NOME: "Pedro Exemplo", TRATAMENTO: "Senhor", ENDERECAMENTO: "A Sua Excelência o Senhor", CARGO: "Deputado Federal" }]);
    const site = [deputado({ nomeParlamentar: "Pedro Exemplo", uf: "BA" }), deputado({ nomeParlamentar: "Pedro Exemplo", uf: "CE" })];
    const d = compararComSite(linhas, site);
    expect(d.linhas[0].situacao).toBe("conferir");
    expect(d.linhas[0].deputado).toBeUndefined();
    expect(d.entraram.map((e) => e.situacao)).toEqual(["conferir", "conferir"]);
    expect(d.contagens).toEqual({ permanece: 0, saiu: 0, entrou: 0, conferir: 3 });
  });
  test("um deputado casado por duas linhas distintas da lista (uma pelo nome parlamentar, outra pelo civil)", () => {
    const protocolo = { TRATAMENTO: "Senhor", ENDERECAMENTO: "A Sua Excelência o Senhor", CARGO: "Deputado Federal" };
    const linhas = linhasTratadas([{ NOME: "Zé Exemplo", ...protocolo }, { NOME: "José Exemplo Silva", ...protocolo }]);
    const d = compararComSite(linhas, [deputado({ nomeParlamentar: "Zé Exemplo", nomeCivil: "José Exemplo Silva" })]);
    expect(d.linhas.map((l) => l.situacao)).toEqual(["conferir", "conferir"]);
    expect(d.linhas[0].deputado?.nomeParlamentar).toBe("Zé Exemplo");
    expect(d.entraram).toHaveLength(1);
    expect(d.entraram[0].situacao).toBe("conferir");
    expect(d.contagens.conferir).toBe(3);
  });
});

describe("abreviação só na falta do nome exato; repetida fica fora", () => {
  const protocolo = { TRATAMENTO: "Senhor", ENDERECAMENTO: "A Sua Excelência o Senhor", CARGO: "Deputado Federal" };
  test("linha que casa um deputado pelo nome exato não tenta a abreviação em outro: permanece, sem conferir", () => {
    const linhas = linhasTratadas([{ NOME: "J. Exemplo Silva", ...protocolo }]);
    const site = [
      deputado({ nomeParlamentar: "J. Exemplo Silva", nomeCivil: "Joaquim Exemplo Silva", uf: "BA" }),
      deputado({ nomeParlamentar: "Zé Exemplo", nomeCivil: "José Exemplo Silva", uf: "SP" }),
    ];
    const d = compararComSite(linhas, site);
    expect(d.linhas[0].situacao).toBe("permanece");
    expect(d.linhas[0].deputado?.uf).toBe("BA");
    expect(d.entraram.map((e) => [e.deputado.uf, e.situacao])).toEqual([["SP", "entrou"]]);
    expect(d.contagens).toEqual({ permanece: 1, saiu: 0, entrou: 1, conferir: 0 });
  });
  test("sem nome exato, a abreviação do nome civil ainda casa", () => {
    const d = compararComSite(linhasTratadas([{ NOME: "J. Exemplo Silva", ...protocolo }]), [deputado({ nomeParlamentar: "Zé Exemplo", nomeCivil: "José Exemplo Silva" })]);
    expect(d.linhas[0].situacao).toBe("permanece");
  });
  test("linha repetida na própria lista sai 'repetida', não casa ninguém e não conta", () => {
    const linhas = linhasTratadas([{ NOME: "Pedro Exemplo", ...protocolo }, { NOME: "Pedro Exemplo", ...protocolo }]);
    expect(linhas[1].situacao).toBe("repetida");
    const d = compararComSite(linhas, [deputado({ nomeParlamentar: "Pedro Exemplo" })]);
    expect(d.linhas.map((l) => l.situacao)).toEqual(["permanece", "repetida"]);
    expect(d.linhas[1].deputado).toBeUndefined();
    expect(d.entraram).toEqual([]);
    expect(d.contagens).toEqual({ permanece: 1, saiu: 0, entrou: 0, conferir: 0 });
    expect(TEXTO_SITUACAO_DIVERGENCIA.repetida).toBe("Repetida na própria lista");
  });
});

describe("casos de borda", () => {
  test("site vazio: toda linha saiu; lista vazia: todo deputado entrou", () => {
    const soLinhas = compararComSite(linhasTratadas(), []);
    expect(soLinhas.linhas.every((l) => l.situacao === "saiu")).toBe(true);
    expect(soLinhas.contagens).toEqual({ permanece: 0, saiu: 3, entrou: 0, conferir: 0 });
    const soSite = compararComSite([], DEPUTADOS_DO_SITE);
    expect(soSite.linhas).toEqual([]);
    expect(soSite.entraram.map((e) => e.situacao)).toEqual(["entrou", "entrou", "entrou"]);
    expect(soSite.contagens).toEqual({ permanece: 0, saiu: 0, entrou: 3, conferir: 0 });
  });
  test("não muda as linhas recebidas", () => {
    const linhas = linhasTratadas();
    const copia = structuredClone(linhas);
    compararComSite(linhas, DEPUTADOS_DO_SITE);
    expect(linhas).toEqual(copia);
  });
});

describe("valores de quem entrou", () => {
  test("sexo pela primeira letra: F, Feminino, M, Masculino; outro texto não decide", () => {
    expect(generoDoSexo("F")).toBe("f");
    expect(generoDoSexo("Feminino")).toBe("f");
    expect(generoDoSexo("m")).toBe("m");
    expect(generoDoSexo("Masculino")).toBe("m");
    expect(generoDoSexo(undefined)).toBeUndefined();
    expect(generoDoSexo("")).toBeUndefined();
    expect(generoDoSexo("X")).toBeUndefined();
  });
  test("sem sexo, tratamento e endereçamento vazios e cargo no masculino; sem prédio e sala, complemento vazio", () => {
    const v = valoresDoSite(deputado({ nomeParlamentar: "Pedro Exemplo" }));
    expect(v).toMatchObject({ NOME: "Pedro Exemplo", TRATAMENTO: "", ENDERECAMENTO: "", CARGO: "Deputado Federal", COMPLEMENTO: "", CEP: "70160900" });
  });
  test("só o prédio ou só a sala entram no complemento", () => {
    expect(valoresDoSite(deputado({ nomeParlamentar: "Pedro Exemplo", predio: "4" })).COMPLEMENTO).toBe("Anexo 4");
    expect(valoresDoSite(deputado({ nomeParlamentar: "Pedro Exemplo", sala: "414" })).COMPLEMENTO).toBe("Gabinete 414");
  });
});

describe("textos e nome do arquivo", () => {
  test("texto de cada situação como a spec pede", () => {
    expect(TEXTO_SITUACAO_DIVERGENCIA).toEqual({ permanece: "Permanece", saiu: "Saiu", entrou: "Entrou", conferir: "Conferir", repetida: "Repetida na própria lista" });
  });
  test("nome da planilha de divergências", () => {
    expect(nomeDivergencias("25NOV2026")).toBe("Divergencias Camara - Deputados Federais - 25NOV2026.xlsx");
  });
});
