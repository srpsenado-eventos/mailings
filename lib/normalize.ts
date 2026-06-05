/** Remove acentos, baixa a caixa, colapsa espaços e faz trim. */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove marcas de combinação (acentos)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const TRATAMENTOS = [
  "exmo.", "exma.", "excelentissimo", "excelentissima",
  "sr.", "sra.", "dr.", "dra.",
  "senador", "senadora", "deputado", "deputada",
  "ministro", "ministra", "presidente", "governador", "governadora",
  "vereador", "vereadora", "prefeito", "prefeita", "desembargador", "desembargadora",
];

/** Remove prefixos de tratamento do início do nome, preservando a caixa original. */
export function removerTratamentos(nome: string): string {
  let resultado = nome.trim();
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const t of TRATAMENTOS) {
      const prefixo = t.endsWith(".") ? t : `${t} `;
      const inicio = resultado.toLowerCase();
      const alvo = t.endsWith(".")
        ? inicio.startsWith(t)
        : inicio.startsWith(`${t} `);
      if (alvo) {
        resultado = resultado.slice(prefixo.length).trim();
        mudou = true;
      }
    }
  }
  return resultado;
}

/** Pipeline padrão para comparar nomes: sem tratamento + normalizado. */
export function normalizarNome(nome: string): string {
  return normalizarTexto(removerTratamentos(nome));
}
