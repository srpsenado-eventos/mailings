import { describe, expect, it } from "vitest";
import {
  GRUPOS_POSSE,
  GRUPO_DEPUTADOS_ELEITOS,
  GRUPO_GOVERNADORES_ELEITOS,
  GRUPO_SENADORES_ELEITOS,
} from "@/data/grupos-posse";
import { grupoDoAgrupador, linhasDoAgrupador, modoDoGrupo, ROTULO_FISCALIZACAO, TITULO_AGRUPADOR } from "@/lib/agrupador";
import { NOME_GRUPO_DEPUTADOS } from "@/lib/painel-deputados";

const NEUTROS = [
  "Ministros de Estado Indicados - Posse 2027",
  "Convidados do presidente eleito - Posse 2027",
  "Convidados do vice presidente eleito - Posse 2027",
  "Convidado do presidente do Congresso e Câmara 2027",
  "Familiares do presidente eleito e do vice - 2027",
  "Chefes de Estado, Gov, Presidentes Parlam - 2027",
  "Delegações estrangeiras e organismos intern - 2027",
];

const LISTAS = [
  GRUPO_GOVERNADORES_ELEITOS,
  GRUPO_SENADORES_ELEITOS,
  "Deputados Federais",
  GRUPO_DEPUTADOS_ELEITOS,
];

describe("agrupador da Posse 2027: dados", () => {
  it("tem os 28 grupos da spec, sem rótulo repetido", () => {
    expect(GRUPOS_POSSE).toHaveLength(28);
    expect(new Set(GRUPOS_POSSE.map((g) => g.rotulo)).size).toBe(28);
  });

  it("começa por Defensor Público Geral e termina nas delegações estrangeiras", () => {
    expect(GRUPOS_POSSE[0].rotulo).toBe("Defensor Público Geral");
    expect(GRUPOS_POSSE[27].rotulo).toBe("Delegações estrangeiras e organismos intern - 2027");
  });

  it("marca como neutro exatamente os 7 grupos de convidados", () => {
    const neutros = GRUPOS_POSSE.filter((g) => g.fiscalizacao === "neutro").map((g) => g.rotulo);
    expect(neutros).toEqual(NEUTROS);
  });

  it("marca como lista exatamente os 4 grupos de eleitos e Deputados Federais", () => {
    const listas = GRUPOS_POSSE.filter((g) => g.fiscalizacao === "lista").map((g) => g.rotulo);
    expect([...listas].sort()).toEqual([...LISTAS].sort());
  });

  it("deixa os demais 17 grupos em fonte", () => {
    expect(GRUPOS_POSSE.filter((g) => g.fiscalizacao === "fonte")).toHaveLength(17);
  });

  it("usa para Deputados Federais o mesmo rótulo do painel de deputados", () => {
    expect(GRUPOS_POSSE.some((g) => g.rotulo === NOME_GRUPO_DEPUTADOS)).toBe(true);
  });
});

describe("modoDoGrupo e grupoDoAgrupador", () => {
  it("dá o mesmo modo para o rótulo com espaço e caixa diferentes dos eleitos", () => {
    expect(modoDoGrupo("Senadores Eleitos - Posse Presidencial 2027 ")).toBe("lista");
    expect(modoDoGrupo(GRUPO_SENADORES_ELEITOS)).toBe("lista");
  });

  it("dá fonte a Governadores com ou sem espaço no fim", () => {
    expect(modoDoGrupo("Governadores ")).toBe("fonte");
    expect(modoDoGrupo("Governadores")).toBe("fonte");
  });

  it("dá fonte a grupo fora do agrupador", () => {
    expect(modoDoGrupo("PILOTO")).toBe("fonte");
  });

  it("devolve neutro para um grupo de convidados", () => {
    expect(modoDoGrupo("Convidados do presidente eleito - Posse 2027")).toBe("neutro");
  });

  it("acha o grupo do agrupador pelo rótulo normalizado e devolve o rótulo oficial", () => {
    expect(grupoDoAgrupador("  senadores ELEITOS - posse presidencial 2027 ")?.rotulo).toBe(
      GRUPO_SENADORES_ELEITOS,
    );
  });

  it("casa o apelido que o Contatos ainda usa: \"Defensor\" é o Defensor Público Geral", () => {
    expect(grupoDoAgrupador("Defensor")?.rotulo).toBe("Defensor Público Geral");
    expect(grupoDoAgrupador(" defensor ")?.fiscalizacao).toBe("fonte");
  });

  it("devolve undefined para rótulo fora do agrupador", () => {
    expect(grupoDoAgrupador("PILOTO")).toBeUndefined();
  });
});

describe("linhasDoAgrupador", () => {
  const grupos = [
    { grupo: "Governadores ", contatos: [1, 2] },
    { grupo: "Defensor", contatos: [1] },
    { grupo: "PILOTO", contatos: [1] },
  ];
  const linhas = linhasDoAgrupador(grupos, { [GRUPO_SENADORES_ELEITOS]: 22 });

  it("devolve os 28 na ordem do agrupador mais o que ficou de fora", () => {
    expect(linhas).toHaveLength(29);
    expect(linhas.slice(0, 28).map((l) => l.rotulo)).toEqual(GRUPOS_POSSE.map((g) => g.rotulo));
  });

  it("conta os contatos do grupo mesmo com rótulo diferente por espaço", () => {
    expect(linhas.find((l) => l.rotulo === "Governadores")?.noContatos).toBe(2);
  });

  it("deixa noContatos 0 e preenche esperado só para a chave informada", () => {
    const senadores = linhas.find((l) => l.rotulo === GRUPO_SENADORES_ELEITOS);
    expect(senadores?.esperado).toBe(22);
    expect(senadores?.noContatos).toBe(0);
    expect(linhas.find((l) => l.rotulo === "Governadores")?.esperado).toBeUndefined();
  });

  it("conta o apelido no grupo oficial: \"Defensor\" entra em Defensor Público Geral", () => {
    expect(linhas.find((l) => l.rotulo === "Defensor Público Geral")?.noContatos).toBe(1);
    expect(linhas.some((l) => l.rotulo === "Defensor")).toBe(false);
  });

  it("coloca por último o grupo do retrato que não casa, marcado como fora do agrupador", () => {
    expect(linhas[linhas.length - 1]).toEqual({
      rotulo: "PILOTO",
      fiscalizacao: "fonte",
      noContatos: 1,
      foraDoAgrupador: true,
    });
  });

  it("não muta a entrada", () => {
    const copia = JSON.parse(JSON.stringify(grupos));
    linhasDoAgrupador(grupos, {});
    expect(grupos).toEqual(copia);
  });

  it("soma os contatos quando dois rótulos do retrato caem no mesmo grupo", () => {
    const duas = linhasDoAgrupador(
      [
        { grupo: "Governadores", contatos: [1] },
        { grupo: "Governadores ", contatos: [2, 3] },
      ],
      {},
    );
    expect(duas.find((l) => l.rotulo === "Governadores")?.noContatos).toBe(3);
  });
});

describe("textos do bloco do agrupador", () => {
  it("título conta os 28 grupos e o modo neutro usa o texto fixado pela spec", () => {
    expect(TITULO_AGRUPADOR).toBe("Grupos da Posse 2027 (28)");
    expect(ROTULO_FISCALIZACAO.neutro).toBe("Sem fonte oficial (grupo de convidados)");
  });
});
