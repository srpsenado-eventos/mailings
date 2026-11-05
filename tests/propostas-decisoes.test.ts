import { describe, expect, test } from "vitest";
import { retratoComPropostasDecididas } from "@/lib/propostas-decisoes";
import { quadroDeBloqueio, registrar, situacaoDoCaso, HISTORICO_VAZIO, type HistoricoDecisoes, type RegistroManual } from "@/lib/decisoes";
import { filtrarGrupos, resumoDoGrupo } from "@/lib/painel";
import type { ResultadoGrupo } from "@/lib/types";

const GRUPO = "Senadores titulares fora de exercício - Posse 2027";
const OBS = "Eleito Deputado Estadual. Será convocada a suplente.";

function registro(extra: Partial<RegistroManual> = {}): RegistroManual {
  return { tipo: "nao_recebe_convite", data: "2026-11-05", quem: "GT", observacao: OBS, validacao: "validado", grupos: [GRUPO], ...extra };
}

function historico(r: RegistroManual): HistoricoDecisoes {
  return registrar(HISTORICO_VAZIO, "Diego Tavares", ["Diego Tavares"], r);
}

function retrato(nomeGrupo = GRUPO) {
  const grupos: ResultadoGrupo[] = [{
    grupo: nomeGrupo,
    semFonte: false,
    contatos: [],
    novos: [{ nome: "Diego Tavares", cargo: "Senador" }, { nome: "Outra Pessoa", cargo: "Senadora" }],
  }];
  return { grupos, resumo: { novo: 2 } };
}

describe("retratoComPropostasDecididas", () => {
  test("tira do grupo a proposta com decisão nao_recebe_convite e explica o motivo", () => {
    const r = retratoComPropostasDecididas(retrato(), historico(registro()));
    expect(r.grupos[0].novos.map((n) => n.nome)).toEqual(["Outra Pessoa"]);
    expect(r.resumo.novo).toBe(1);
    expect(r.grupos[0].dispensados).toEqual([{
      nome: "Diego Tavares",
      texto: "não será convidado (decisão do GT de 05/11). Eleito Deputado Estadual. Será convocada a suplente.",
    }]);
  });

  test("mantém a proposta do mesmo nome em outro grupo sem decisão", () => {
    const r = retratoComPropostasDecididas(retrato("Senadores - Posse 2027"), historico(registro()));
    expect(r.grupos[0].novos).toHaveLength(2);
    expect(r.resumo.novo).toBe(2);
    expect(r.grupos[0].dispensados).toBeUndefined();
  });

  test("mantém a proposta quando a decisão é de outro tipo", () => {
    const r = retratoComPropostasDecididas(retrato(), historico(registro({ tipo: "mesma_pessoa", convidaPor: "Senadores" })));
    expect(r.grupos[0].novos).toHaveLength(2);
    expect(r.resumo.novo).toBe(2);
  });

  test("reconhece o nome com caixa e acento diferentes", () => {
    const base = retrato();
    const entrada = { ...base, grupos: [{ ...base.grupos[0], novos: [{ nome: "DIÉGO TÁVARES", cargo: "Senador" }] }], resumo: { novo: 1 } };
    const r = retratoComPropostasDecididas(entrada, historico(registro()));
    expect(r.grupos[0].novos).toHaveLength(0);
    expect(r.resumo.novo).toBe(0);
    expect(r.grupos[0].dispensados?.[0].nome).toBe("DIÉGO TÁVARES");
  });

  test("sem histórico devolve o mesmo retrato", () => {
    const entrada = retrato();
    expect(retratoComPropostasDecididas(entrada, undefined)).toBe(entrada);
  });

  test("não muta a entrada", () => {
    const entrada = retrato();
    const copia = structuredClone(entrada);
    retratoComPropostasDecididas(entrada, historico(registro()));
    expect(entrada).toEqual(copia);
  });
});

describe("caso de pessoa sem ocorrência no Contatos", () => {
  test("fica tratado e sem pendência de bloqueio", () => {
    const caso = historico(registro()).casos[0];
    expect(situacaoDoCaso(caso, [])).toBe("tratado");
    expect(quadroDeBloqueio(caso, []).pendencias).toEqual([]);
  });
});

describe("painel com propostas dispensadas", () => {
  const g: ResultadoGrupo = { grupo: GRUPO, semFonte: false, contatos: [], novos: [{ nome: "X", cargo: "Senador" }], dispensados: [{ nome: "Diego Tavares", texto: "t" }] };

  test("filtrarGrupos mantém dispensados com o filtro tudo", () => {
    expect(filtrarGrupos([g], "tudo", "")[0].dispensados).toHaveLength(1);
  });

  test("resumoDoGrupo não conta dispensado como a incluir", () => {
    expect(resumoDoGrupo({ ...g, novos: [] })).not.toContain("a incluir");
  });
});
