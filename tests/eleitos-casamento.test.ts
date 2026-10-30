import { describe, expect, test } from "vitest";
import { deputadosEmExercicio, nomesComAbreviacao } from "@/lib/eleitos-casamento";
import type { DeputadoAtual } from "@/lib/types";

const dep = (over: Partial<DeputadoAtual>): DeputadoAtual => ({
  uf: "SP", nomeParlamentar: "Fulano Fictício", nomeCivil: "FULANO DE TAL FICTICIO", ...over,
});
const eleito = (over: Partial<{ uf: string; nomeUrna: string; nomeCompleto: string }> = {}) => ({
  uf: "PR", nomeUrna: "Beltrana Fictícia", nomeCompleto: "Beltrana Maria Fictícia Souza", ...over,
});

const GUILHERME_TSE = {
  uf: "PE",
  nomeUrna: "Guilherme Uchoa Junior",
  nomeCompleto: "Guilherme Aristoteles Uchoa Cavalcanti Pessoa De Melo Junior",
};
const guilherme = (uf: string): DeputadoAtual => dep({
  uf,
  nomeParlamentar: "Guilherme Uchoa",
  nomeCivil: "GUILHERME A. UCHOA CAVALCANTI PESSOA DE MELO JUNIOR",
});

describe("deputadosEmExercicio: regra de pessoa contra a lista da Câmara (spec 4.3.2)", () => {
  test("nome civil igual vale em qualquer UF (Rosangela Moro, SP na Câmara e PR no TSE)", () => {
    const e = eleito({ uf: "PR", nomeUrna: "Rosangela Moro", nomeCompleto: "Rosangela Maria Wolff De Quadros Moro" });
    const atuais = [dep({ uf: "SP", nomeParlamentar: "Rosangela Moro", nomeCivil: "ROSANGELA MARIA WOLFF DE QUADROS MORO" })];

    expect(deputadosEmExercicio(e, atuais)).toHaveLength(1);
  });

  test("nome parlamentar igual ao de urna vale na mesma UF", () => {
    const e = eleito({ uf: "MG", nomeUrna: "Dra. Luciene Cavalcante", nomeCompleto: "Luciene Cavalcante Outra" });
    const atuais = [dep({ uf: "MG", nomeParlamentar: "Luciene Cavalcante", nomeCivil: "LUCIENE CAVALCANTE X" })];

    expect(deputadosEmExercicio(e, atuais)).toHaveLength(1);
  });

  test("nome parlamentar igual ao de urna não vale em outra UF", () => {
    const e = eleito({ uf: "MG", nomeUrna: "Luciene Cavalcante", nomeCompleto: "Luciene Cavalcante Outra" });
    const atuais = [dep({ uf: "SP", nomeParlamentar: "Luciene Cavalcante", nomeCivil: "LUCIENE CAVALCANTE X" })];

    expect(deputadosEmExercicio(e, atuais)).toHaveLength(0);
  });

  test("a abreviação do nome civil na Câmara casa o nome completo do TSE na mesma UF (Guilherme Uchoa)", () => {
    expect(deputadosEmExercicio(GUILHERME_TSE, [guilherme("PE")])).toHaveLength(1);
  });

  test("a abreviação exige a mesma UF", () => {
    expect(deputadosEmExercicio(GUILHERME_TSE, [guilherme("RJ")])).toHaveLength(0);
  });

  test("suplente em exercício conta como deputado em exercício (Professora Luciene)", () => {
    const e = eleito({ uf: "RJ", nomeUrna: "Professora Luciene", nomeCompleto: "Luciene Cavalcante Fictícia" });
    const atuais = [dep({ uf: "RJ", nomeParlamentar: "Professora Luciene", nomeCivil: "LUCIENE CAVALCANTE FICTICIA", condicao: "S" })];

    expect(deputadosEmExercicio(e, atuais)).toHaveLength(1);
  });

  test("dois deputados com o mesmo nome parlamentar na mesma UF são homônimos", () => {
    const e = eleito({ uf: "BA", nomeUrna: "Zeca Fictício", nomeCompleto: "José Carlos Fictício" });
    const atuais = [
      dep({ uf: "BA", nomeParlamentar: "Zeca Fictício", nomeCivil: "JOSE A" }),
      dep({ uf: "BA", nomeParlamentar: "Zeca Fictício", nomeCivil: "JOSE B" }),
    ];

    expect(deputadosEmExercicio(e, atuais)).toHaveLength(2);
  });

  test("dois deputados com o mesmo nome civil em UFs diferentes são homônimos pela regra do civil", () => {
    const e = eleito({ uf: "PR", nomeUrna: "Ninguém Fictício", nomeCompleto: "Maria Joana Fictícia Souza" });
    const atuais = [
      dep({ uf: "SP", nomeParlamentar: "Maria A", nomeCivil: "MARIA JOANA FICTICIA SOUZA" }),
      dep({ uf: "RJ", nomeParlamentar: "Maria B", nomeCivil: "MARIA JOANA FICTICIA SOUZA" }),
    ];

    expect(deputadosEmExercicio(e, atuais)).toHaveLength(2);
  });

  test("um deputado que satisfaz mais de uma regra é contado uma vez só", () => {
    const e = eleito({ uf: "SP", nomeUrna: "Fulano Fictício", nomeCompleto: "Fulano de Tal Ficticio" });

    expect(deputadosEmExercicio(e, [dep({ uf: "SP" })])).toHaveLength(1);
  });

  test("Duarte Junior (MG, outro nome completo) não casa Duarte Jr. (MA)", () => {
    const e = eleito({ uf: "MG", nomeUrna: "Duarte Junior", nomeCompleto: "Francisco Eduardo Duarte Junior" });
    const atuais = [dep({ uf: "MA", nomeParlamentar: "Duarte Jr.", nomeCivil: "HILDELIS SILVA DUARTE JUNIOR" })];

    expect(deputadosEmExercicio(e, atuais)).toHaveLength(0);
  });

  test("nome vazio no eleito não casa deputado de nome vazio", () => {
    const e = eleito({ uf: "SP", nomeUrna: "", nomeCompleto: "" });

    expect(deputadosEmExercicio(e, [dep({ uf: "SP", nomeParlamentar: "", nomeCivil: "" })])).toHaveLength(0);
  });

  test("lista vazia não tem ninguém em exercício", () => {
    expect(deputadosEmExercicio(eleito(), [])).toEqual([]);
  });
});

describe("nomesComAbreviacao", () => {
  test("parte de uma letra casa a parte que começa com ela", () => {
    expect(nomesComAbreviacao(
      "GUILHERME A. UCHOA CAVALCANTI PESSOA DE MELO JUNIOR",
      "Guilherme Aristoteles Uchoa Cavalcanti Pessoa De Melo Junior",
    )).toBe(true);
  });

  test("a abreviação pode estar em qualquer dos dois lados", () => {
    expect(nomesComAbreviacao("Maria J. Silva", "Maria Joana Silva")).toBe(true);
    expect(nomesComAbreviacao("Maria Joana Silva", "Maria J. Silva")).toBe(true);
  });

  test("abreviação com letra diferente não casa", () => {
    expect(nomesComAbreviacao("Maria B. Silva", "Maria Joana Silva")).toBe(false);
  });

  test("números de partes diferentes não casam", () => {
    expect(nomesComAbreviacao("Maria Silva", "Maria Joana Silva")).toBe(false);
  });

  test("sem abreviação, os nomes têm de ser iguais parte a parte", () => {
    expect(nomesComAbreviacao("Maria Joana Silva", "Maria Joana Souza")).toBe(false);
    expect(nomesComAbreviacao("Maria Joana Silva", "MARIA JOANA SILVA")).toBe(true);
  });

  test("ignora acentos e tratamentos", () => {
    expect(nomesComAbreviacao("Dra. Maria J. Silva", "Maria Joana Sílva")).toBe(true);
  });

  test("nome vazio não casa nada", () => {
    expect(nomesComAbreviacao("", "")).toBe(false);
    expect(nomesComAbreviacao("A.", "")).toBe(false);
  });
});
