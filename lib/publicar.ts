import type { ComparacaoCampo, ContatoPlanilha, Retrato } from "@/lib/types";

/** Campos do contato que o painel não mostra e que não precisam sair desta máquina. */
const CAMPOS_PESSOAIS: readonly (keyof ContatoPlanilha)[] = ["telefone", "email", "redeSocial", "foto"];
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
 * objeto do painel e viajam atrás da senha. A eleição vai sem `deputadosAtuais` e o retrato sem `baseEnderecos`. Spec 2026-10-02, §6.3 e §6.5. Não muta a entrada.
 */
export function enxugarParaPublicar(retrato: Retrato, publicadoEm: string): Retrato {
  // A base de endereços inteira (PII) fica nesta máquina; só `numeroNaBase` segue (spec 2026-10-06, §3).
  const { baseEnderecos: _baseEnderecos, ...semBase } = retrato;
  return {
    ...semBase,
    publicadoEm,
    // A lista de deputados atuais traz e-mail e telefone de gabinete: fica nesta máquina.
    ...(retrato.eleicao ? { eleicao: { ...retrato.eleicao, deputadosAtuais: undefined } } : {}),
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
