import { describe, expect, test } from "vitest";
import {
  TEXTO_MAIS_DE_UM_GRUPO,
  TEXTO_REGISTRO_NAO_LIDO,
  TEXTO_SEM_DECISAO,
  textoDoRegistroGt,
} from "@/lib/convidados/registro-gt";
import { HISTORICO_VAZIO, registrar, registrarBloqueio, type HistoricoDecisoes, type RegistroManual } from "@/lib/decisoes";

/** Nomes fictícios; grupos reais do agrupador, porque o texto cita o grupo do convite. */
const NOME = "Fulano Exemplo Duplo";
const SENADORES = "Senadores";
const GOVERNADORES = "Governadores";
const EMBAIXADORES = "Embaixadores";

const registro = (sobrescrita: Partial<RegistroManual>): RegistroManual => ({
  tipo: "mesma_pessoa",
  data: "2026-11-19",
  quem: "GT",
  observacao: "",
  validacao: "validado",
  convidaPor: SENADORES,
  grupos: [SENADORES, GOVERNADORES],
  ...sobrescrita,
});

const emDoisGrupos = [{ id: "1", grupo: SENADORES }, { id: "2", grupo: GOVERNADORES }];

function comDecisao(sobrescrita: Partial<RegistroManual> = {}, nome = NOME): HistoricoDecisoes {
  return registrar(HISTORICO_VAZIO, nome, [], registro(sobrescrita));
}

describe("textoDoRegistroGt", () => {
  test("histórico não lido: aviso em quem tem ocorrência e nada em quem não tem", () => {
    expect(textoDoRegistroGt({ nome: NOME, ocorrencias: emDoisGrupos, grupoEscolhido: SENADORES, historico: null })).toBe(TEXTO_REGISTRO_NAO_LIDO);
    expect(textoDoRegistroGt({ nome: NOME, ocorrencias: [], grupoEscolhido: SENADORES, historico: null })).toBe("");
  });

  test("pessoa em dois grupos sem caso: 'Em mais de um grupo · sem decisão registrada'", () => {
    const texto = textoDoRegistroGt({ nome: NOME, ocorrencias: emDoisGrupos, grupoEscolhido: SENADORES, historico: HISTORICO_VAZIO });
    expect(texto).toBe(TEXTO_MAIS_DE_UM_GRUPO);
    expect(texto).toBe("Em mais de um grupo · sem decisão registrada");
  });

  test("duas ocorrências no mesmo grupo contam um grupo só: 'sem decisão registrada'", () => {
    const ocorrencias = [{ id: "1", grupo: SENADORES }, { id: "9", grupo: "senadores " }];
    expect(textoDoRegistroGt({ nome: NOME, ocorrencias, grupoEscolhido: SENADORES, historico: HISTORICO_VAZIO })).toBe(TEXTO_SEM_DECISAO);
  });

  test("pessoa nova sem caso: vazio", () => {
    expect(textoDoRegistroGt({ nome: NOME, ocorrencias: [], grupoEscolhido: SENADORES, historico: HISTORICO_VAZIO })).toBe("");
  });

  test("mesma_pessoa validado com convidaPor e bloqueio pendente (critério 5 do §16.7)", () => {
    const texto = textoDoRegistroGt({ nome: NOME, ocorrencias: emDoisGrupos, grupoEscolhido: SENADORES, historico: comDecisao() });
    expect(texto).toBe("Decisão do GT (19/11/2026, validado): mesma pessoa · convite pelo grupo Senadores · Pendente de bloqueio no Posse");
  });

  test("bloqueio já registrado no grupo a bloquear deixa a decisão sem pendência", () => {
    const historico = registrarBloqueio(comDecisao(), NOME, [], [SENADORES, GOVERNADORES], {
      tipo: "bloqueio", grupo: GOVERNADORES, data: "2026-11-20", quem: "GT", observacao: "",
    });
    const texto = textoDoRegistroGt({ nome: NOME, ocorrencias: emDoisGrupos, grupoEscolhido: SENADORES, historico });
    expect(texto).toBe("Decisão do GT (19/11/2026, validado): mesma pessoa · convite pelo grupo Senadores");
  });

  test("nao_recebe_convite a validar, com observação: todos os grupos atuais pedem bloqueio", () => {
    const historico = comDecisao({ tipo: "nao_recebe_convite", data: "2026-11-20", validacao: "a_validar", observacao: " Não vai à posse. ", convidaPor: undefined, grupos: [EMBAIXADORES] });
    const texto = textoDoRegistroGt({ nome: NOME, ocorrencias: [{ id: "7", grupo: EMBAIXADORES }], grupoEscolhido: EMBAIXADORES, historico });
    expect(texto).toBe("Decisão do GT (20/11/2026, a validar): não recebe convite · Não vai à posse. · Pendente de bloqueio no Posse");
  });

  test("duas decisões em dois casos saem separadas por ' | ', na ordem do histórico", () => {
    const primeiro = comDecisao();
    const historico = registrar(primeiro, NOME, [], registro({
      tipo: "ajustar_contatos", data: "2026-11-21", observacao: "Corrigir o cargo.", convidaPor: undefined, grupos: [SENADORES, EMBAIXADORES],
    }));
    expect(historico.casos).toHaveLength(2);
    const ocorrencias = [...emDoisGrupos, { id: "3", grupo: EMBAIXADORES }];
    const texto = textoDoRegistroGt({ nome: NOME, ocorrencias, grupoEscolhido: SENADORES, historico });
    // Cada caso vê um grupo que a sua decisão não cobre: reaberto, sem quadro de bloqueio.
    expect(texto).toBe(
      "Decisão do GT (19/11/2026, validado): mesma pessoa · convite pelo grupo Senadores"
      + " | Decisão do GT (21/11/2026, validado): ajustar no Contatos · Corrigir o cargo.",
    );
  });

  test("pessoa nova com caso antigo pelo nome: 'sem decisão registrada' quando o grupo escolhido não é do caso", () => {
    const historico = comDecisao();
    expect(textoDoRegistroGt({ nome: "fulano exemplo DUPLO", ocorrencias: [], grupoEscolhido: EMBAIXADORES, historico })).toBe(TEXTO_SEM_DECISAO);
  });

  test("pessoa nova que volta a um grupo do caso vê a decisão, com o convite a cadastrar", () => {
    const texto = textoDoRegistroGt({ nome: NOME, ocorrencias: [], grupoEscolhido: GOVERNADORES, historico: comDecisao() });
    expect(texto).toBe("Decisão do GT (19/11/2026, validado): mesma pessoa · convite pelo grupo Senadores · Pendente: a cadastrar no grupo do convite");
  });

  test("pessoas_diferentes sem convite nem observação sai só com o cabeçalho da decisão", () => {
    const historico = comDecisao({ tipo: "pessoas_diferentes", convidaPor: undefined });
    const texto = textoDoRegistroGt({ nome: NOME, ocorrencias: emDoisGrupos, grupoEscolhido: SENADORES, historico });
    expect(texto).toBe("Decisão do GT (19/11/2026, validado): pessoas diferentes");
  });

  test("não muta o histórico nem as ocorrências", () => {
    const historico = comDecisao();
    const antes = JSON.stringify(historico);
    const ocorrencias = [...emDoisGrupos];
    textoDoRegistroGt({ nome: NOME, ocorrencias, grupoEscolhido: SENADORES, historico });
    expect(JSON.stringify(historico)).toBe(antes);
    expect(ocorrencias).toEqual(emDoisGrupos);
  });
});
