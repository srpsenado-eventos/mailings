import { describe, expect, test } from "vitest";
import { REGRAS_GT } from "@/data/regras-gt";
import { regrasDoGrupo, textoCurto, textoLongo } from "@/lib/regras-gt";

describe("regras do GT em vigor (spec 2026-11-04 §3.2)", () => {
  test("as cinco regras de 04/11 com os títulos da spec", () => {
    expect(REGRAS_GT.map((r) => [r.data, r.titulo])).toEqual([
      ["2026-11-04", "Nome"], ["2026-11-04", "Pessoa em mais de um grupo"], ["2026-11-04", "STM: patentes"], ["2026-11-04", "STM: abreviação"], ["2026-11-04", "Tratamento"],
    ]);
    expect(REGRAS_GT.map((r) => r.texto)).toEqual([
      "O nome é exatamente como está no site oficial do órgão, inclusive quando o GT conhece o nome político (ex.: Rodrigo Pacheco). A equipe não tem como fazer essa análise para 100% das pessoas.",
      "A pessoa fica em todos os grupos no Contatos. No Sistema Posse ela é bloqueada, por pessoa em cada grupo, no grupo que não convida, no momento em que o grupo for autorizado. O Fiscal mostra em qual grupo bloquear e registra o bloqueio feito.",
      "As patentes serão pesquisadas pelo Daniel no site do STM. Se não encontrar, o GT consulta a ASPAR do Exército. Até lá, o Fiscal não audita patente.",
      "Quando for preciso abreviar o nome, abreviar o sobrenome, nunca a patente.",
      "Tabela de tratamentos v02 (REGRA GERAL): Governador, Prefeito, Presidente de Assembleia Legislativa / Câmara Legislativa e Presidente de Câmara Municipal passam a Senhor(a); o endereçamento não muda.",
    ]);
  });
  test("regras por grupo: STM tem duas, Governadores uma, Senadores nenhuma; rótulo com variação casa pelo catálogo", () => {
    expect(regrasDoGrupo("Ministros do STM").map((r) => r.titulo)).toEqual(["STM: patentes", "STM: abreviação"]);
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
