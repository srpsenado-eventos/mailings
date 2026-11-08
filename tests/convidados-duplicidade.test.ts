import { describe, expect, test } from "vitest";
import { compararEnderecoCadastrado, indexarBase, mesmoGrupo, referenciaCamaraTse, repetidasNaLista, situacaoNaBase } from "@/lib/convidados/duplicidade";
import type { EnderecoEstruturado } from "@/lib/types";

const base = indexarBase([
  { id: "12345", nome: "João Pedro Simulado Nogueira", grupo: "Ministros de Estado" },
  { id: "23456", nome: "Helena Modelo Barreto", grupo: "Convidados do presidente eleito - Posse 2027" },
  { id: "34567", nome: "Marcos Vieira", grupo: "Prefeitos" },
  { id: "45678", nome: "Jose Exemplo Silva", grupo: "Deputados Federais" },
  { id: "45679", nome: "José Exemplo Silva", grupo: "Senadores" },
]);
const GRUPO = "Convidados do presidente eleito - Posse 2027";
const valores = { NOME: "x", TRATAMENTO: "", ENDERECAMENTO: "", CARGO: "", CEP: "70165900", LOGRADOURO: "Praça dos Três Poderes", NUMERO: "S/N", COMPLEMENTO: "Anexo 2", BAIRRO: "Zona Cívico-Administrativa", CIDADE: "Brasília", UF: "DF" };

describe("situação na base", () => {
  test("mesmo nome no grupo escolhido era o esperado; em outro grupo é incluir no grupo", () => {
    expect(situacaoNaBase("Helena Modelo Barreto", GRUPO, base)).toEqual({ situacao: "ja_grupo_escolhido", ocorrencias: [{ id: "23456", grupo: GRUPO }], conferir: [] });
    expect(situacaoNaBase("João Pedro Simulado Nogueira", GRUPO, base).situacao).toBe("ja_outro_grupo");
  });
  test("acento não separa a pessoa e os homônimos saem todos", () => {
    const r = situacaoNaBase("José Exemplo Silva", "Prefeitos", base);
    expect(r.situacao).toBe("ja_outro_grupo");
    expect(r.ocorrencias.map((o) => o.id)).toEqual(["45678", "45679"]);
  });
  test("grupo escolhido por apelido casa o rótulo da base", () => {
    expect(mesmoGrupo("Deputado Federal - Posse Presidencial 2027", "Deputados Federais")).toBe(true);
    expect(situacaoNaBase("Jose Exemplo Silva", "Deputado Federal - Posse Presidencial 2027", base).situacao).toBe("ja_grupo_escolhido");
  });
  test("nome parcial é novo com conferir; um token só não conta", () => {
    const r = situacaoNaBase("Marcos Genérico Vieira", GRUPO, base);
    expect(r.situacao).toBe("novo");
    expect(r.conferir).toEqual([{ id: "34567", grupo: "Prefeitos" }]);
    expect(situacaoNaBase("Marcos", GRUPO, base)).toEqual({ situacao: "novo", ocorrencias: [], conferir: [] });
  });
  test("título no nome da lista não atrapalha", () => {
    expect(situacaoNaBase("Dra. Helena Modelo Barreto", GRUPO, base).situacao).toBe("ja_grupo_escolhido");
  });
  test("contato da base com dois grupos separados por ponto e vírgula gera uma ocorrência por grupo", () => {
    const indice = indexarBase([{ id: "777", nome: "Ana Exemplo Souza", grupo: "Prefeitos; Senadores" }]);
    expect(situacaoNaBase("Ana Exemplo Souza", "Senadores", indice)).toEqual({
      situacao: "ja_grupo_escolhido",
      ocorrencias: [{ id: "777", grupo: "Prefeitos" }, { id: "777", grupo: "Senadores" }],
      conferir: [],
    });
  });
});

describe("endereço de quem já existe", () => {
  const ocorrencias = [{ id: "23456", grupo: GRUPO }];
  const cadastrado: EnderecoEstruturado = { contatoId: "23456", logradouro: "Praça dos Três Poderes", numero: "S/N", complemento: "Anexo 2", bairro: "Zona Cívico-Administrativa", cidade: "Brasília", uf: "DF", cep: "70.165-900", prioritario: true };
  test("sem endereço cadastrado em nenhum Id: endereço novo a aproveitar", () => {
    const a = compararEnderecoCadastrado(15, "Helena Modelo Barreto", valores, ocorrencias, [{ contatoId: "23456", prioritario: false }]);
    expect(a?.tipo).toBe("endereco_novo");
    expect(a?.sugestao).toBe("Aproveitar o endereço recebido no cadastro existente (Id 23456)");
  });
  test("igual a algum cadastrado (sem caixa, sem acento, CEP só dígitos): nada", () => {
    expect(compararEnderecoCadastrado(15, "x", valores, ocorrencias, [cadastrado])).toBeUndefined();
    expect(compararEnderecoCadastrado(15, "x", valores, ocorrencias, [{ ...cadastrado, contatoId: "999" }, cadastrado])).toBeUndefined();
  });
  test("diferente de todos: uma linha com o recebido e os cadastrados, prioritário primeiro", () => {
    const outro = { ...cadastrado, prioritario: false, complemento: "Anexo 1" };
    const a = compararEnderecoCadastrado(15, "x", { ...valores, COMPLEMENTO: "Anexo 3" }, ocorrencias, [outro, cadastrado]);
    expect(a?.tipo).toBe("endereco_diferente");
    expect(a?.valorRecebido).toBe("Praça dos Três Poderes, S/N, Anexo 3, Zona Cívico-Administrativa, Brasília, DF, 70165900");
    expect(a?.sugestao.indexOf("Anexo 2")).toBeLessThan(a!.sugestao.indexOf("Anexo 1"));
  });
});

describe("repetidas e referência", () => {
  test("repetida aponta a primeira ocorrência", () => {
    expect(repetidasNaLista(["Ana Exemplo", "Carlos Exemplo", "ana exemplo"])).toEqual([undefined, undefined, 0]);
  });
  test("referência da Câmara e do TSE no gênero da pessoa", () => {
    const ref = { deputados: [{ uf: "DF", nomeParlamentar: "Paulo Amostra Teixeira", nomeCivil: "Paulo Amostra Teixeira" }], eleitos: [{ casa: "senado" as const, uf: "GO", nomeUrna: "Luciana Protótipo", nomeCompleto: "Luciana Protótipo Andrade", situacaoTse: "Eleito", statusMandato: "Novo", genero: "Feminino" }], governadores: [] };
    expect(referenciaCamaraTse("Paulo Amostra Teixeira", ref)).toBe("Consta na lista da Câmara (deputado em exercício)");
    expect(referenciaCamaraTse("Luciana Protótipo Andrade", ref)).toBe("Eleita em 2026: Senadora por GO (TSE)");
    expect(referenciaCamaraTse("Ninguém Exemplo", ref)).toBe("");
  });
  test("gênero vazio usa a forma com (a) e as referências se juntam por ponto médio", () => {
    const ref = {
      deputados: [{ uf: "SP", nomeParlamentar: "Rui Teste", nomeCivil: "Rui Teste Lima" }],
      eleitos: [],
      governadores: [{ uf: "SP", nomeUrna: "Rui Teste", nomeCompleto: "Rui Teste Lima", situacaoTse: "Eleito", statusMandato: "Novo" }],
    };
    expect(referenciaCamaraTse("Rui Teste", ref)).toBe("Consta na lista da Câmara (deputado em exercício) · Eleito(a) em 2026: Governador(a) por SP (TSE)");
  });
});
