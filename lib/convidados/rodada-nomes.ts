const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"] as const;
const TAMANHO_MAXIMO_GRUPO = 40;

export function sufixoDaData(d: Date): string {
  const dia = String(d.getDate()).padStart(2, "0");
  return `${dia}${MESES[d.getMonth()]}${d.getFullYear()}`;
}

export function grupoNoNomeDeArquivo(grupo: string): string {
  return grupo
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TAMANHO_MAXIMO_GRUPO)
    .trim();
}

export function nomeImportacao(grupo: string, sufixo: string): string {
  return `Importacao PRODASEN - ${grupoNoNomeDeArquivo(grupo)} - ${sufixo}.xlsx`;
}

export function nomeConferencia(sufixo: string): string {
  return `Conferencia - Lista de Convidados - ${sufixo}.xlsx`;
}

export function nomeDaPastaDaRodada(sufixo: string, existentes: readonly string[]): string {
  if (!existentes.includes(sufixo)) return sufixo;
  let n = 2;
  while (existentes.includes(`${sufixo}-${n}`)) n += 1;
  return `${sufixo}-${n}`;
}

const PADRAO_DATA_BASE = /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})(?:\s+(\d{1,2})h)?/;

export function dataNoNomeDaBase(nomeArquivo: string): number | undefined {
  const m = PADRAO_DATA_BASE.exec(nomeArquivo);
  if (!m) return undefined;
  const mes = MESES.indexOf(m[2].toUpperCase() as (typeof MESES)[number]);
  if (mes < 0) return undefined;
  return new Date(Number(m[3]), mes, Number(m[1]), m[4] ? Number(m[4]) : 0).getTime();
}

export function maisRecente(nomes: readonly string[], prefixo: string): string | undefined {
  const alvo = prefixo.toLowerCase();
  let melhor: { nome: string; data: number } | undefined;
  for (const nome of nomes) {
    if (!nome.toLowerCase().startsWith(alvo)) continue;
    const data = dataNoNomeDaBase(nome);
    if (data === undefined) continue;
    if (!melhor || data > melhor.data) melhor = { nome, data };
  }
  return melhor?.nome;
}
