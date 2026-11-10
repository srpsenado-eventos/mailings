import type { ResultadoCampo } from "./tipos";

/** Faixas de CEP por UF (prefixo de 5 dígitos), como no script do GT. */
export const FAIXAS_CEP: readonly (readonly [string, number, number])[] = [
  ["SP", 1000, 19999], ["RJ", 20000, 28999], ["ES", 29000, 29999], ["MG", 30000, 39999],
  ["BA", 40000, 48999], ["SE", 49000, 49999], ["PE", 50000, 56999], ["AL", 57000, 57999],
  ["PB", 58000, 58999], ["RN", 59000, 59999], ["CE", 60000, 63999], ["PI", 64000, 64999],
  ["MA", 65000, 65999], ["PA", 66000, 68899], ["AP", 68900, 68999], ["AM", 69000, 69299],
  ["RR", 69300, 69399], ["AM", 69400, 69899], ["AC", 69900, 69999], ["DF", 70000, 72799],
  ["GO", 72800, 72999], ["DF", 73000, 73699], ["GO", 73700, 76799], ["RO", 76800, 76999],
  ["TO", 77000, 77999], ["MT", 78000, 78899], ["MS", 79000, 79999], ["PR", 80000, 87999],
  ["SC", 88000, 89999], ["RS", 90000, 99999],
];

/** UF da faixa do CEP; só para CEP de 8 dígitos. */
export function ufDoCep(cep: string): string | undefined {
  if (!/^\d{8}$/.test(cep)) return undefined;
  const prefixo = Number(cep.slice(0, 5));
  return FAIXAS_CEP.find(([, inicio, fim]) => prefixo >= inicio && prefixo <= fim)?.[0];
}

function revisar(valor: string, regras: string[], texto: string): ResultadoCampo {
  return { valor, regras, revisao: { marca: "revisar", texto } };
}

export function tratarCep(cep: string, uf: string): ResultadoCampo {
  const original = cep.trim();
  const limpo = original.replace(/[.\-\s]/g, "");
  const soDigitos = /^\d+$/.test(limpo);
  const regras = soDigitos && limpo !== original ? ["CEP: pontuação removida"] : [];
  if (!limpo) return revisar("", [], "CEP vazio");
  if (!soDigitos) return revisar(original, [], `CEP inválido (${original})`);

  const sigla = uf.trim().toUpperCase();
  if (limpo.length === 8) {
    const doCep = ufDoCep(limpo);
    if (doCep && sigla.length === 2 && doCep !== sigla) {
      return revisar(limpo, regras, `CEP fora da faixa da UF ${sigla} (faixa do CEP: ${doCep})`);
    }
    return { valor: limpo, regras };
  }
  if (limpo.length === 7) {
    if (sigla === "SP") {
      const novo = `0${limpo}`;
      return {
        valor: novo,
        regras: [...regras, `CEP com 7 dígitos em SP: zero à esquerda (${novo})`],
        revisao: { marca: "validar", texto: "CEP completado por inferência; confirmar nos Correios", sugestao: novo },
      };
    }
    return revisar(limpo, regras, "CEP com 7 dígitos fora de SP");
  }
  return revisar(original, [], `CEP inválido (${original})`);
}
