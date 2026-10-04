import type { ComparacaoCampo, ContatoPlanilha, Retrato } from "@/lib/types";

/** Campos do contato que o painel não mostra e que não precisam sair desta máquina. */
const CAMPOS_PESSOAIS = ["telefone", "email", "redeSocial"] as const;
/** Comparações cujo `valorPlanilha` carrega esses mesmos dados. */
const COMPARACOES_PESSOAIS: ReadonlySet<ComparacaoCampo["campo"]> = new Set(["telefone", "email"]);

function semCamposPessoais(contato: ContatoPlanilha): ContatoPlanilha {
  const copia: ContatoPlanilha = { ...contato };
  for (const campo of CAMPOS_PESSOAIS) delete copia[campo];
  return copia;
}

/**
 * O retrato que vai para o Blob: o mesmo da máquina, sem telefone, e-mail e rede social, e
 * com `publicadoEm`. Nome, cargo, tratamento, endereçamento e endereço ficam, porque são o
 * objeto do painel e viajam atrás da senha. Spec 2026-10-02, §6.3 e §6.5. Não muta a entrada.
 */
export function enxugarParaPublicar(retrato: Retrato, publicadoEm: string): Retrato {
  return {
    ...retrato,
    publicadoEm,
    grupos: retrato.grupos.map((g) => ({
      ...g,
      contatos: g.contatos.map((c) => ({
        ...c,
        contato: semCamposPessoais(c.contato),
        comparacoes: c.comparacoes.filter((x) => !COMPARACOES_PESSOAIS.has(x.campo)),
      })),
    })),
  };
}
