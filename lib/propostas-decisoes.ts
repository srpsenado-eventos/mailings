import { casosDaPessoa, dataDaDecisao, grupoEquivalente, vigente, type HistoricoDecisoes } from "@/lib/decisoes";
import type { PessoaSite, PropostaDispensada, ResultadoGrupo } from "@/lib/types";

/** Texto da linha informativa da proposta que o GT decidiu não convidar; `undefined` sem decisão que a dispense. */
function textoDaDispensa(historico: HistoricoDecisoes, nome: string, grupo: string): string | undefined {
  const casos = casosDaPessoa(historico, [nome], [grupoEquivalente(grupo, "contatos")]);
  const decisoes = casos
    .map((c) => vigente(c))
    .filter((r) => r !== undefined && r.tipo === "nao_recebe_convite");
  const ultima = decisoes.reduce<(typeof decisoes)[number]>((m, r) => (m === undefined || (r && r.data >= m.data) ? r : m), undefined);
  if (!ultima) return undefined;
  const base = `não será convidado (decisão do GT de ${dataDaDecisao(ultima.data)})`;
  const obs = ultima.observacao.trim();
  return obs ? `${base}. ${obs}` : base;
}

/**
 * Tira das propostas de inclusão de cada grupo quem o GT decidiu não convidar (`nao_recebe_convite`
 * no grupo), desconta de `resumo.novo` e guarda o motivo em `dispensados`. Pura: sem histórico (ou
 * sem nenhuma dispensa) devolve o retrato recebido.
 */
export function retratoComPropostasDecididas<T extends { grupos: ResultadoGrupo[]; resumo: { novo: number } }>(
  retrato: T,
  historico: HistoricoDecisoes | undefined,
): T {
  if (!historico || historico.casos.length === 0) return retrato;
  let removidos = 0;
  const grupos = retrato.grupos.map((g) => {
    const mantidos: PessoaSite[] = [];
    const dispensados: PropostaDispensada[] = [];
    for (const n of g.novos) {
      const texto = textoDaDispensa(historico, n.nome, g.grupo);
      if (texto === undefined) mantidos.push(n);
      else dispensados.push({ nome: n.nome, texto });
    }
    if (dispensados.length === 0) return g;
    removidos += dispensados.length;
    return { ...g, novos: mantidos, dispensados: [...(g.dispensados ?? []), ...dispensados] };
  });
  if (removidos === 0) return retrato;
  return { ...retrato, grupos, resumo: { ...retrato.resumo, novo: Math.max(0, retrato.resumo.novo - removidos) } };
}
