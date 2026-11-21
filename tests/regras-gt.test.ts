import { describe, expect, test } from "vitest";
import { REGRAS_GT } from "@/data/regras-gt";
import { GRUPO_DEPUTADOS_ELEITOS, GRUPO_GOVERNADORES, GRUPO_GOVERNADORES_ELEITOS, GRUPO_MINISTROS_INDICADOS, GRUPO_SENADORES_ELEITOS } from "@/data/grupos-posse";
import { regrasDoGrupo, textoCurto, textoLongo } from "@/lib/regras-gt";

describe("regras do GT em vigor (spec 2026-11-04 §3.2)", () => {
  test("as três regras de 04/11 que seguem em vigor, com os títulos da spec", () => {
    const de0411 = REGRAS_GT.filter((r) => r.data === "2026-11-04");
    expect(de0411.map((r) => [r.data, r.titulo])).toEqual([
      ["2026-11-04", "Nome"], ["2026-11-04", "Pessoa em mais de um grupo"], ["2026-11-04", "Tratamento"],
    ]);
    expect(de0411.map((r) => r.texto)).toEqual([
      "O nome é exatamente como está no site oficial do órgão, inclusive quando o GT conhece o nome político (ex.: Rodrigo Pacheco). A equipe não tem como fazer essa análise para 100% das pessoas.",
      "A pessoa fica em todos os grupos no Contatos. No Sistema Posse ela é bloqueada, por pessoa em cada grupo, no grupo que não convida, no momento em que o grupo for autorizado. O Fiscal mostra em qual grupo bloquear e registra o bloqueio feito.",
      "Tabela de tratamentos v02 (REGRA GERAL): Governador, Prefeito, Presidente de Assembleia Legislativa / Câmara Legislativa e Presidente de Câmara Municipal passam a Senhor(a); o endereçamento não muda.",
    ]);
  });
  test("as três regras de 13/11: TSE, STM e Chefes de Estado", () => {
    const de1311 = REGRAS_GT.filter((r) => r.data === "2026-11-13");
    expect(de1311.map((r) => [r.titulo, r.texto, r.grupos])).toEqual([
      ["TSE: tribunal de origem", "Membros do TSE que também são ministros do STF ou do STJ são convidados por esses tribunais; o Presidente do TSE é convidado pelo TSE; os juristas ficam no TSE.", ["Ministros do STF", "Ministros do STJ", "Ministros do TSE"]],
      ["STM: patente como no site", "Patente como no site do STM (Quem é Quem), abreviada como lá; Dr. e Dra. não entram no nome; limite de 50 caracteres.", ["Ministros do STM"]],
      ["Chefes de Estado", "Chefes de Estado, chefes de governo e presidentes de parlamento: tratamento Excelentíssimo(a) Senhor(a) e endereçamento A Sua Excelência o(a) Senhor(a), em paralelo às autoridades nacionais do mesmo nível.", ["Chefes de Estado, Gov, Presidentes Parlam - 2027"]],
    ]);
    expect(REGRAS_GT.some((r) => r.titulo === "STM: patentes" || r.titulo === "STM: abreviação")).toBe(false);
    expect(regrasDoGrupo("Ministros do TSE").map((r) => r.titulo)).toContain("TSE: tribunal de origem");
  });
  test("as três regras de 05/11 com os textos literais e os grupos; a dos presidentes de tribunal saiu", () => {
    const novas = REGRAS_GT.filter((r) => r.data === "2026-11-05").slice(0, 3);
    expect(REGRAS_GT.filter((r) => r.data === "2026-11-05").some((r) => r.titulo === "Presidentes de tribunal")).toBe(false);
    expect(novas.map((r) => [r.titulo, r.texto, r.grupos])).toEqual([
      ["Embaixadores", "A análise parte da lista cadastrada no Contatos: a página confere quem está cadastrado e não gera proposta de inclusão.", ["Embaixadores ( África do Sul até EUA)", "Embaixadores (Filipinas até Noruega)", "Embaixadores (Nova Zelândia até Zimbábue)"]],
      ["Desembargadores convocados", "Tratamento e endereçamento seguem o mesmo critério dos ministros do grupo.", ["Ministros do STJ", "Ministros do TST"]],
      ["Presidentes do Congresso e da Câmara", "Ativos: tratamento Excelentíssimo Senhor e endereçamento A Sua Excelência o Senhor.", ["Presidente da Câmara dos Deputados", "Presidente do Senado", "Senadores (Acre a Goiás)", "Senadores (Maranhão ao Piauí)", "Senadores (Rio a Tocantins)"]],
    ]);
    expect(regrasDoGrupo("Embaixadores (Filipinas até Noruega)").map((r) => r.titulo)).toEqual(["Embaixadores"]);
    expect(regrasDoGrupo("Ministros do STJ").map((r) => r.titulo)).toEqual(["Desembargadores convocados", "TSE: tribunal de origem", "Presidentes de tribunal"]);
  });
  test("as duas regras de 05/11 sobre os presidentes do Congresso (spec 2026-11-05 §7.6)", () => {
    const novas = REGRAS_GT.filter((r) => r.titulo === "Presidentes do Congresso e da Câmara" || r.titulo === "Ex-Presidentes do Congresso");
    expect(novas.map((r) => [r.data, r.titulo, r.texto])).toEqual([
      ["2026-11-05", "Presidentes do Congresso e da Câmara", "Ativos: tratamento Excelentíssimo Senhor e endereçamento A Sua Excelência o Senhor."],
      ["2026-11-05", "Ex-Presidentes do Congresso", "Cargo: Presidente do Congresso Nacional no período de AAAA a AAAA, ou em AAAA para um único ano. Tratamento Senhor e endereçamento A Sua Excelência o Senhor."],
    ]);
    expect(regrasDoGrupo("Presidente da Câmara dos Deputados").map((r) => r.titulo)).toEqual(["Presidentes do Congresso e da Câmara", "Presidente da Câmara: nome"]);
    expect(regrasDoGrupo("Senadores (Rio a Tocantins)").map((r) => r.titulo)).toEqual(["Presidentes do Congresso e da Câmara"]);
    expect(regrasDoGrupo("Presidente do Senado").map((r) => r.titulo)).toEqual(["Presidentes do Congresso e da Câmara"]);
    expect(regrasDoGrupo("Ex-Presidentes do Congresso").map((r) => r.titulo)).toEqual(["Ex-Presidentes do Congresso"]);
  });
  test("regras por grupo: STM tem duas, Governadores uma, Senadores a dos presidentes do Congresso; rótulo com variação casa pelo catálogo", () => {
    expect(regrasDoGrupo("Ministros do STM").map((r) => r.titulo)).toEqual(["STM: patente como no site", "Presidentes de tribunal"]);
    expect(regrasDoGrupo("Governadores").map((r) => r.titulo)).toEqual(["Tratamento", "Governadores: cargo"]);
    expect(regrasDoGrupo("Senadores").map((r) => r.titulo)).toEqual(["Presidentes do Congresso e da Câmara"]);
    expect(regrasDoGrupo("rótulo desconhecido")).toEqual([]);
  });
  test("as seis regras de 19/11 com os textos literais e os grupos (spec 2026-11-19 §2.6)", () => {
    const de1911 = REGRAS_GT.filter((r) => r.data === "2026-11-19");
    expect(de1911.map((r) => [r.titulo, r.texto, r.grupos])).toEqual([
      ["Eleitos", "Senadores, deputados federais e governadores eleitos: tratamento Senhor(a) e endereçamento Ao Senhor / À Senhora; o cargo fica como no Contatos (Senador(a) eleito(a), Deputado(a) Federal eleito(a), Governador(a) eleito(a) do estado de X).", [GRUPO_SENADORES_ELEITOS, GRUPO_DEPUTADOS_ELEITOS, GRUPO_GOVERNADORES_ELEITOS]],
      ["Presidentes de tribunal", "Tratamento Excelentíssimo(a) Senhor(a) só no Presidente do STF; nos presidentes do STJ, STM, TCU, TSE e TST, Senhor(a). Endereçamento A Sua Excelência o(a) Senhor(a) nos seis. O nome leva \"Ministro(a)\" e o cargo traz a presidência.", ["Ministros do STF", "Ministros do STJ", "Ministros do TSE", "Ministros do TST", "Ministros do STM", "Ministros do TCU"]],
      ["Presidente da Câmara: nome", "O nome leva \"Deputado(a) Federal\" antes, como no Contatos; o cargo é Presidente da Câmara dos Deputados.", ["Presidente da Câmara dos Deputados"]],
      ["Ministros de Estado indicados", "Tratamento Senhor(a); cargo \"Ministro(a) indicado(a) de Estado da <Pasta>\" ou \"Ministro(a) indicado(a) da <Pasta>\", como nos ministros atuais; endereçamento ainda a definir pelo GT.", [GRUPO_MINISTROS_INDICADOS]],
      ["Governadores: cargo", "Cargo \"Governador(a) do estado de(a/o) X\" com \"estado\" em minúscula (Manual de Comunicação do Senado); DF é \"Governador(a) do Distrito Federal\".", [GRUPO_GOVERNADORES, GRUPO_GOVERNADORES_ELEITOS]],
      ["Ministros de Estado: CGU", "O cargo do ministro da CGU é \"Ministro da Controladoria-Geral da União\", conferido na página \"Quem é quem\" da CGU; os demais seguem a página do Planalto.", ["Ministros de Estado"]],
    ]);
  });
  test("grupos do agrupador sem canônico casam pelo segmento do rótulo, sem repetir regra", () => {
    expect(regrasDoGrupo(GRUPO_SENADORES_ELEITOS).map((r) => r.titulo)).toContain("Eleitos");
    expect(regrasDoGrupo("Senadores; " + GRUPO_SENADORES_ELEITOS).map((r) => r.titulo)).toContain("Eleitos");
    // Grupo neutro não soma o canônico "Ministros de Estado" que o rótulo resolve: sem a regra da CGU.
    expect(regrasDoGrupo(GRUPO_MINISTROS_INDICADOS).map((r) => r.titulo)).toEqual(["Ministros de Estado indicados"]);
    expect(regrasDoGrupo("Ministros de Estado").map((r) => r.titulo)).toEqual(["Ministros de Estado: CGU"]);
    expect(regrasDoGrupo("Ministros do STJ").filter((r) => r.titulo === "Presidentes de tribunal")).toHaveLength(1);
  });
  test("textos curto e longo", () => {
    const r = { data: "2026-11-04", titulo: "Nome", texto: "O nome é como no site." };
    expect(textoCurto(r)).toBe("Regra do GT de 04/11: Nome");
    expect(textoLongo(r)).toBe("04/11/2026 · Nome — O nome é como no site.");
  });
});
