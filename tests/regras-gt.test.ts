import { describe, expect, test } from "vitest";
import { REGRAS_GT } from "@/data/regras-gt";
import { regrasDoGrupo, textoCurto, textoLongo } from "@/lib/regras-gt";

describe("regras do GT em vigor (spec 2026-11-04 §3.2)", () => {
  test("as cinco regras de 04/11 com os títulos da spec", () => {
    const de0411 = REGRAS_GT.filter((r) => r.data === "2026-11-04");
    expect(de0411.map((r) => [r.data, r.titulo])).toEqual([
      ["2026-11-04", "Nome"], ["2026-11-04", "Pessoa em mais de um grupo"], ["2026-11-04", "STM: patentes"], ["2026-11-04", "STM: abreviação"], ["2026-11-04", "Tratamento"],
    ]);
    expect(de0411.map((r) => r.texto)).toEqual([
      "O nome é exatamente como está no site oficial do órgão, inclusive quando o GT conhece o nome político (ex.: Rodrigo Pacheco). A equipe não tem como fazer essa análise para 100% das pessoas.",
      "A pessoa fica em todos os grupos no Contatos. No Sistema Posse ela é bloqueada, por pessoa em cada grupo, no grupo que não convida, no momento em que o grupo for autorizado. O Fiscal mostra em qual grupo bloquear e registra o bloqueio feito.",
      "As patentes serão pesquisadas pelo Daniel no site do STM. Se não encontrar, o GT consulta a ASPAR do Exército. Até lá, o Fiscal não audita patente.",
      "Quando for preciso abreviar o nome, abreviar o sobrenome, nunca a patente.",
      "Tabela de tratamentos v02 (REGRA GERAL): Governador, Prefeito, Presidente de Assembleia Legislativa / Câmara Legislativa e Presidente de Câmara Municipal passam a Senhor(a); o endereçamento não muda.",
    ]);
  });
  test("as três regras de 05/11 com os textos literais e os grupos", () => {
    const novas = REGRAS_GT.filter((r) => r.data === "2026-11-05");
    expect(novas.map((r) => [r.titulo, r.texto, r.grupos])).toEqual([
      ["Embaixadores", "A análise parte da lista cadastrada no Contatos: a página confere quem está cadastrado e não gera proposta de inclusão.", ["Embaixadores ( África do Sul até EUA)", "Embaixadores (Filipinas até Noruega)", "Embaixadores (Nova Zelândia até Zimbábue)"]],
      ["Presidentes de tribunal", "No tratamento, \"Excelentíssimo(a) Senhor(a)\" e \"Senhor(a)\" conferem. O nome leva \"Ministro(a)\" e o cargo traz a presidência.", ["Ministros do STF", "Ministros do STJ", "Ministros do TSE", "Ministros do TST", "Ministros do STM", "Ministros do TCU"]],
      ["Desembargadores convocados", "Tratamento e endereçamento seguem o mesmo critério dos ministros do grupo.", ["Ministros do STJ", "Ministros do TST"]],
    ]);
    expect(regrasDoGrupo("Embaixadores (Filipinas até Noruega)").map((r) => r.titulo)).toEqual(["Embaixadores"]);
    expect(regrasDoGrupo("Ministros do STJ").map((r) => r.titulo)).toEqual(["Presidentes de tribunal", "Desembargadores convocados"]);
  });
  test("regras por grupo: STM tem três, Governadores uma, Senadores nenhuma; rótulo com variação casa pelo catálogo", () => {
    expect(regrasDoGrupo("Ministros do STM").map((r) => r.titulo)).toEqual(["STM: patentes", "STM: abreviação", "Presidentes de tribunal"]);
    expect(regrasDoGrupo("Governadores").map((r) => r.titulo)).toEqual(["Tratamento"]);
    expect(regrasDoGrupo("Senadores")).toEqual([]);
    expect(regrasDoGrupo("rótulo desconhecido")).toEqual([]);
  });
  test("textos curto e longo", () => {
    const r = { data: "2026-11-04", titulo: "Nome", texto: "O nome é como no site." };
    expect(textoCurto(r)).toBe("Regra do GT de 04/11: Nome");
    expect(textoLongo(r)).toBe("04/11/2026 · Nome — O nome é como no site.");
  });
});
