import { GRUPOS_POSSE, type GrupoPosse, type ModoFiscalizacao } from "@/data/grupos-posse";
import { normalizarTexto } from "@/lib/normalize";

export interface LinhaAgrupador {
  rotulo: string;
  fiscalizacao: ModoFiscalizacao;
  noContatos: number;
  esperado?: number;
  foraDoAgrupador?: true;
}

const POR_ROTULO_NORMALIZADO: ReadonlyMap<string, GrupoPosse> = new Map(
  GRUPOS_POSSE.map((g) => [normalizarTexto(g.rotulo), g]),
);

/** Grupo do agrupador da Posse 2027 que casa o rótulo do Contatos (igualdade após `normalizarTexto`). */
export function grupoDoAgrupador(rotulo: string): GrupoPosse | undefined {
  return POR_ROTULO_NORMALIZADO.get(normalizarTexto(rotulo));
}

/** Modo de fiscalização do rótulo; grupo fora do agrupador segue a página oficial. */
export function modoDoGrupo(rotulo: string): ModoFiscalizacao {
  return grupoDoAgrupador(rotulo)?.fiscalizacao ?? "fonte";
}

/**
 * Linhas do bloco "Grupos da Posse 2027": os 28 do agrupador na ordem da lista (0 contatos quando
 * vazio), depois os grupos do retrato que não casam, marcados `foraDoAgrupador`.
 * `esperados` é indexado pelo rótulo oficial do agrupador.
 */
export function linhasDoAgrupador(
  grupos: readonly { grupo: string; contatos: readonly unknown[] }[],
  esperados: Readonly<Record<string, number>>,
): LinhaAgrupador[] {
  const contagem = new Map<string, number>();
  const fora = new Map<string, LinhaAgrupador>();

  for (const { grupo, contatos } of grupos) {
    const oficial = grupoDoAgrupador(grupo);
    if (oficial) {
      contagem.set(oficial.rotulo, (contagem.get(oficial.rotulo) ?? 0) + contatos.length);
      continue;
    }
    const chave = normalizarTexto(grupo);
    const anterior = fora.get(chave);
    fora.set(chave, {
      rotulo: anterior?.rotulo ?? grupo.trim(),
      fiscalizacao: "fonte",
      noContatos: (anterior?.noContatos ?? 0) + contatos.length,
      foraDoAgrupador: true,
    });
  }

  const doAgrupador = GRUPOS_POSSE.map((g): LinhaAgrupador => {
    const base: LinhaAgrupador = {
      rotulo: g.rotulo,
      fiscalizacao: g.fiscalizacao,
      noContatos: contagem.get(g.rotulo) ?? 0,
    };
    return Object.hasOwn(esperados, g.rotulo) ? { ...base, esperado: esperados[g.rotulo] } : base;
  });

  return [...doAgrupador, ...fora.values()];
}
