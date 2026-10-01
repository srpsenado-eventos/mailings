import { describe, expect, test } from "vitest";
import { resolverGrupoEFonte } from "@/lib/catalogo";
import type { GrupoCatalogo } from "@/lib/types";

const catalogo: readonly GrupoCatalogo[] = [
  {
    nome: "Ministros do TST",
    responsavel1: "Priscilla Flores",
    fontes: [{ url: "https://www.tst.jus.br/ministros", ativo: true }],
  },
  { nome: "Governadores", fontes: [] },
];

describe("resolverGrupoEFonte: responsável", () => {
  test("devolve o responsavel1 do grupo casado", () => {
    expect(resolverGrupoEFonte("Ministros do TST", catalogo).responsavel).toBe("Priscilla Flores");
  });

  test("grupo sem responsável não ganha o campo", () => {
    expect(resolverGrupoEFonte("Governadores", catalogo).responsavel).toBeUndefined();
  });
});
