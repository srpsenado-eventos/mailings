import type { ComparacaoCampo, ContatoPlanilha, DeputadoAtual, Retrato } from "@/lib/types";

/** Campos do contato que o painel não mostra e que não precisam sair desta máquina. */
const CAMPOS_PESSOAIS: readonly (keyof ContatoPlanilha)[] = ["telefone", "email", "redeSocial", "foto"];
/** Comparações cujo `valorPlanilha` carrega esses mesmos dados. */
const COMPARACOES_PESSOAIS: ReadonlySet<ComparacaoCampo["campo"]> = new Set(["telefone", "email"]);

/** Lista de permitidos: só estes campos do deputado vão para a web. E-mail, telefone, prédio, sala e qualquer campo futuro ficam nesta máquina. */
const CAMPOS_DEPUTADO_PUBLICOS = ["partido", "sexo", "condicao", "eleicao2026", "idCamara"] as const;

function deputadoPublicavel(d: DeputadoAtual): DeputadoAtual {
  const publicos = CAMPOS_DEPUTADO_PUBLICOS.flatMap((c) => (d[c] === undefined ? [] : [[c, d[c]] as const]));
  return { uf: d.uf, nomeParlamentar: d.nomeParlamentar, nomeCivil: d.nomeCivil, ...Object.fromEntries(publicos) };
}

function semCamposPessoais(contato: ContatoPlanilha): ContatoPlanilha {
  const copia: ContatoPlanilha = { ...contato };
  for (const campo of CAMPOS_PESSOAIS) delete copia[campo];
  return copia;
}

/**
 * O retrato que vai para o Blob: o mesmo da máquina, sem telefone, e-mail e rede social, e
 * com `publicadoEm`. Nome, cargo, tratamento, endereçamento e endereço ficam, porque são o
 * objeto do painel e viajam atrás da senha. Os deputados atuais da eleição vão sem e-mail, telefone, prédio e sala, e o retrato sem `baseEnderecos`. Spec 2026-10-02, §6.3 e §6.5. Não muta a entrada.
 */
export function enxugarParaPublicar(retrato: Retrato, publicadoEm: string): Retrato {
  // A base de endereços inteira (PII) e a memória de leitura (só interessa à máquina) ficam aqui; só `numeroNaBase` segue (spec 2026-10-06 §3; 2026-10-20 §6).
  const { baseEnderecos: _baseEnderecos, leituras: _leituras, ...semBase } = retrato;
  return {
    ...semBase,
    publicadoEm,
    // A lista de deputados atuais traz e-mail e telefone de gabinete: só esses dados ficam nesta máquina.
    ...(retrato.eleicao
      ? { eleicao: { ...retrato.eleicao, ...(retrato.eleicao.deputadosAtuais ? { deputadosAtuais: retrato.eleicao.deputadosAtuais.map(deputadoPublicavel) } : {}) } }
      : {}),
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
