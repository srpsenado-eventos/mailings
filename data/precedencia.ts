/**
 * Precedência usada para escolher por qual grupo uma autoridade presente em mais de um
 * grupo do Contatos será convidada (spec 2026-10-14). Fonte: a Nominata do GT,
 * `GT Posse/Nominata/Nominata 2027_Modelo após ajustes Daniel (1).xlsx` (Decreto 70.274/72
 * com os acréscimos do GT). Número e texto copiados da planilha; só os níveis dos grupos
 * do catálogo entram aqui.
 *
 * `ex: true` marca cargo de "ex-": perde para qualquer cargo atual, seja qual for o nível
 * (decisão do Clovis, 2026-10-13). Grupo sem `nivel` está fora da Nominata e perde para
 * qualquer cargo que esteja nela. Embaixadores e Comandantes estão sem nível até o Clovis
 * confirmar a correspondência.
 */
export interface NivelPrecedencia {
  /** Número do nível como na Nominata ("4.10.1"). */
  nivel: string;
  /** Texto da Nominata para o nível. */
  nominata: string;
}

export interface RegraPrecedencia {
  /** Nome do grupo, casado contra o rótulo do Contatos como em `lib/catalogo.ts`. */
  grupo: string;
  ex: boolean;
  /** Nível quando o cargo começa por "Presidente"/"Presidenta" (não "Vice-Presidente"). */
  presidente?: NivelPrecedencia;
  /** Nível quando o cargo cita o Distrito Federal. */
  distritoFederal?: NivelPrecedencia;
  /** Nível dos demais cargos do grupo; ausente = fora da Nominata. */
  nivel?: NivelPrecedencia;
}

const n = (nivel: string, nominata: string): NivelPrecedencia => ({ nivel, nominata });

export const PRECEDENCIA: readonly RegraPrecedencia[] = [
  { grupo: "Presidente da República", ex: false, nivel: n("1.1", "Presidente da República") },
  { grupo: "Vice-Presidente da República", ex: false, nivel: n("2.1", "Vice-presidente da República") },
  { grupo: "Presidente do Senado", ex: false, nivel: n("3.1", "Presidente do Congresso Nacional") },
  { grupo: "Presidente da Câmara dos Deputados", ex: false, nivel: n("3.2", "Presidente da Câmara dos Deputados") },
  {
    grupo: "Ministros do STF", ex: false,
    presidente: n("3.3", "Presidente do Supremo Tribunal Federal"),
    nivel: n("4.9", "Ministros do Supremo Tribunal Federal"),
  },
  { grupo: "Ex-Presidentes da República", ex: true, nivel: n("3.4", "Ex-Presidentes da República Federativa do Brasil") },
  { grupo: "Ex-Presidentes do Senado", ex: true, nivel: n("3.5", "Ex-Presidentes do Congresso Nacional") },
  { grupo: "Ministros de Estado", ex: false, nivel: n("4.1", "Ministros de Estado") },
  {
    grupo: "Ministros do TSE", ex: false,
    presidente: n("4.8", "Presidente do Tribunal Superior Eleitoral"),
    nivel: n("5.9", "Ministros do Tribunal Superior Eleitoral"),
  },
  { grupo: "Procurador-Geral da República", ex: false, nivel: n("4.10", "Procurador-geral da República") },
  { grupo: "Defensor Público Geral da União", ex: false, nivel: n("4.10.1", "Defensor Público-Geral Federal") },
  {
    grupo: "Governadores", ex: false,
    distritoFederal: n("4.11", "Governador do Distrito Federal"),
    nivel: n("4.12", "Governadores dos estados da União"),
  },
  { grupo: "Senadores", ex: false, nivel: n("4.13", "Senadores") },
  {
    grupo: "Ministros do STJ", ex: false,
    presidente: n("5.5.1", "Presidente do Superior Tribunal de Justiça"),
    nivel: n("6.1.1", "Ministros do Superior Tribunal de Justiça"),
  },
  {
    grupo: "Ministros do STM", ex: false,
    presidente: n("5.6", "Presidente do Superior Tribunal Militar"),
    nivel: n("6.2", "Ministros do Superior Tribunal Militar"),
  },
  {
    grupo: "Ministros do TST", ex: false,
    presidente: n("5.7", "Presidente do Tribunal Superior do Trabalho"),
    nivel: n("6.3", "Ministros do Tribunal Superior do Trabalho"),
  },
  {
    grupo: "Ministros do TCU", ex: false,
    presidente: n("5.8", "Presidente do Tribunal de Contas da União"),
    nivel: n("6.4", "Ministros do Tribunal de Contas da União"),
  },
  {
    grupo: "Diretor-Geral e Secretário Geral da Mesa do Senado Federal", ex: false,
    nivel: n("6.13", "Diretores-gerais das secretarias do Senado Federal e da Câmara dos Deputados"),
  },
  {
    grupo: "Presidentes das Assembleias Legislativas das UFs", ex: false,
    nivel: n("7.6", "Presidentes das assembleias legislativas dos estados da União"),
  },
  { grupo: "Ex-Senadores", ex: true },
  // A confirmar com o Clovis: 2.3 ("Embaixadores estrangeiros") se os grupos forem de embaixadores estrangeiros.
  { grupo: "Embaixadores", ex: false },
  // A confirmar com o Clovis: a Nominata ainda usa os títulos antigos dos chefes militares.
  { grupo: "Comandantes das Forças Armadas e EMCFA", ex: false },
  { grupo: "Conselho Nacional de Justiça (CNJ)", ex: false },
  { grupo: "Conselho Nacional do Ministério Público (CNMP)", ex: false },
  { grupo: "Presidente da OAB Nacional", ex: false },
];
