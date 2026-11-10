import { describe, expect, test } from "vitest";
import { HISTORICO_VAZIO, registrar, type HistoricoDecisoes, type RegistroManual } from "@/lib/decisoes";
import { filtrarGrupos } from "@/lib/painel";
import {
  contarBloqueiosDoGrupo, ehLinhaABloquear, textosDeBloqueioDoGrupo, totalABloquear,
} from "@/lib/painel-bloqueio";
import { autoridadesRepetidas } from "@/lib/repetidos";
import type { ResultadoContato, ResultadoGrupo } from "@/lib/types";

const linha = (nome: string, cargo: string, extra: Partial<ResultadoContato> = {}): ResultadoContato => ({
  contato: { nome, cargo, grupo: "x" }, semaforo: "verde", score: 1, comparacoes: [], camposDivergentes: [], origem: "oficial", ...extra,
});
const grupo = (nome: string, contatos: ResultadoContato[]): ResultadoGrupo => ({ grupo: nome, semFonte: false, contatos, novos: [] });
const manual = (extra: Partial<RegistroManual> & Pick<RegistroManual, "tipo" | "grupos">): RegistroManual => ({
  data: "2026-10-26", quem: "GT (planilha de 29/10)", observacao: "", validacao: "validado", ...extra,
});
const stj = (nome: string) => grupo("Ministros do STJ", [linha(nome, "Ministro do Superior Tribunal de Justiça")]);
const tseM = (nome: string) => grupo("Ministros do TSE", [linha(nome, "Ministro do Tribunal Superior Eleitoral")]);
const CUEVA = "Ricardo Villas Bôas Cueva";
const decisaoCueva = registrar(HISTORICO_VAZIO, CUEVA, [], manual({
  tipo: "mesma_pessoa", convidaPor: "Ministros do TSE", grupos: ["Ministros do STJ", "Ministros do TSE"],
}));
const comBloqueio = (h: HistoricoDecisoes, grupoDoBloqueio: string, data = "2026-11-05"): HistoricoDecisoes => ({
  versao: 1, casos: h.casos.map((c) => ({ ...c, registros: [...c.registros, { tipo: "bloqueio" as const, grupo: grupoDoBloqueio, data, quem: "Marina", observacao: "" }] })),
});

describe("bloqueio no Posse no painel (spec 2026-11-04 §3.1.4)", () => {
  test("conta a bloquear e bloqueadas por grupo e o total do cartão", () => {
    const grupos = [stj(CUEVA), tseM(CUEVA)];
    const antes = autoridadesRepetidas(grupos, undefined, decisaoCueva);
    expect(contarBloqueiosDoGrupo(antes, grupos[0])).toEqual({ aBloquear: 1, bloqueadas: 0 });
    expect(contarBloqueiosDoGrupo(antes, grupos[1])).toEqual({ aBloquear: 0, bloqueadas: 0 });
    expect(totalABloquear(antes, grupos)).toBe(1);
    const depois = autoridadesRepetidas(grupos, undefined, comBloqueio(decisaoCueva, "Ministros do STJ"));
    expect(contarBloqueiosDoGrupo(depois, grupos[0])).toEqual({ aBloquear: 0, bloqueadas: 1 });
    expect(totalABloquear(depois, grupos)).toBe(0);
  });

  test("bloqueio no grupo do convite não conta como bloqueada", () => {
    const grupos = [stj(CUEVA), tseM(CUEVA)];
    const lista = autoridadesRepetidas(grupos, undefined, comBloqueio(comBloqueio(decisaoCueva, "Ministros do STJ"), "Ministros do TSE"));
    expect(contarBloqueiosDoGrupo(lista, grupos[1])).toEqual({ aBloquear: 0, bloqueadas: 0 });
  });

  test("textos do cabeçalho", () => {
    expect(textosDeBloqueioDoGrupo({ aBloquear: 2, bloqueadas: 1 })).toEqual([
      { texto: "2 a bloquear no Posse ao autorizar este grupo", tom: "atencao" },
      { texto: "1 bloqueada no Posse", tom: "neutro" },
    ]);
    expect(textosDeBloqueioDoGrupo({ aBloquear: 0, bloqueadas: 3 })).toEqual([{ texto: "3 bloqueadas no Posse", tom: "neutro" }]);
    expect(textosDeBloqueioDoGrupo({ aBloquear: 0, bloqueadas: 0 })).toEqual([]);
  });

  test("filtro A bloquear no Posse deixa só os grupos e as linhas a bloquear", () => {
    const grupos = [stj(CUEVA), tseM(CUEVA), grupo("Senadores", [linha("Rui Fictício", "Senador")])];
    const lista = autoridadesRepetidas(grupos, undefined, decisaoCueva);
    const filtrados = filtrarGrupos(grupos, "a_bloquear", "", undefined, ehLinhaABloquear(lista));
    expect(filtrados.map((g) => [g.grupo, g.contatos.length])).toEqual([["Ministros do STJ", 1]]);
    expect(filtrarGrupos(grupos, "a_bloquear", "")).toEqual([]);
  });
});
