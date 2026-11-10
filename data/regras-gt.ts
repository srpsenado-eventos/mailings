/**
 * Regras do GT em vigor (spec 2026-11-04 §3.2). Cada entrada nova é decisão do Clovis, como no
 * catálogo: nenhuma regra entra por inferência.
 */
export interface RegraGt {
  /** AAAA-MM-DD da decisão. */
  data: string;
  titulo: string;
  texto: string;
  /** Grupos canônicos em que a regra também aparece no cabeçalho do grupo. */
  grupos?: readonly string[];
}

export const REGRAS_GT: readonly RegraGt[] = [
  {
    data: "2026-11-04",
    titulo: "Nome",
    texto: "O nome é exatamente como está no site oficial do órgão, inclusive quando o GT conhece o nome político (ex.: Rodrigo Pacheco). A equipe não tem como fazer essa análise para 100% das pessoas.",
  },
  {
    data: "2026-11-04",
    titulo: "Pessoa em mais de um grupo",
    texto: "A pessoa fica em todos os grupos no Contatos. No Sistema Posse ela é bloqueada, por pessoa em cada grupo, no grupo que não convida, no momento em que o grupo for autorizado. O Fiscal mostra em qual grupo bloquear e registra o bloqueio feito.",
  },
  {
    data: "2026-11-04",
    titulo: "STM: patentes",
    texto: "As patentes serão pesquisadas pelo Daniel no site do STM. Se não encontrar, o GT consulta a ASPAR do Exército. Até lá, o Fiscal não audita patente.",
    grupos: ["Ministros do STM"],
  },
  {
    data: "2026-11-04",
    titulo: "STM: abreviação",
    texto: "Quando for preciso abreviar o nome, abreviar o sobrenome, nunca a patente.",
    grupos: ["Ministros do STM"],
  },
  {
    data: "2026-11-04",
    titulo: "Tratamento",
    texto: "Tabela de tratamentos v02 (REGRA GERAL): Governador, Prefeito, Presidente de Assembleia Legislativa / Câmara Legislativa e Presidente de Câmara Municipal passam a Senhor(a); o endereçamento não muda.",
    grupos: ["Governadores"],
  },
  {
    data: "2026-11-05",
    titulo: "Embaixadores",
    texto: "A análise parte da lista cadastrada no Contatos: a página confere quem está cadastrado e não gera proposta de inclusão.",
    grupos: ["Embaixadores ( África do Sul até EUA)", "Embaixadores (Filipinas até Noruega)", "Embaixadores (Nova Zelândia até Zimbábue)"],
  },
  {
    data: "2026-11-05",
    titulo: "Presidentes de tribunal",
    texto: "No tratamento, \"Excelentíssimo(a) Senhor(a)\" e \"Senhor(a)\" conferem. O nome leva \"Ministro(a)\" e o cargo traz a presidência.",
    grupos: ["Ministros do STF", "Ministros do STJ", "Ministros do TSE", "Ministros do TST", "Ministros do STM", "Ministros do TCU"],
  },
  {
    data: "2026-11-05",
    titulo: "Desembargadores convocados",
    texto: "Tratamento e endereçamento seguem o mesmo critério dos ministros do grupo.",
    grupos: ["Ministros do STJ", "Ministros do TST"],
  },
  {
    data: "2026-11-05",
    titulo: "Presidentes do Congresso e da Câmara",
    texto: "Ativos: tratamento Excelentíssimo Senhor e endereçamento A Sua Excelência o Senhor.",
    grupos: ["Presidente da Câmara dos Deputados", "Presidente do Senado", "Senadores (Acre a Goiás)", "Senadores (Maranhão ao Piauí)", "Senadores (Rio a Tocantins)"],
  },
  {
    data: "2026-11-05",
    titulo: "Ex-Presidentes do Congresso",
    texto: "Cargo: Presidente do Congresso Nacional no período de AAAA a AAAA, ou em AAAA para um único ano. Tratamento Senhor e endereçamento A Sua Excelência o Senhor.",
    grupos: ["Ex-Presidentes do Congresso"],
  },
];
