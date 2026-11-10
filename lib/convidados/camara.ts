import * as XLSX from "xlsx";
import { normalizarTexto } from "@/lib/normalize";
import { ColunaFaltanteError } from "@/lib/planilha";
import type { LinhaLista, Valores } from "./tipos";

/** Colunas que identificam o `deputado.xls` do site da Câmara (as mesmas marcas de `lib/planilha-eleitos.ts`), já normalizadas. */
export const MARCAS_CAMARA = ["nome parlamentar", "titular/suplente/efetivado", "nome civil"] as const;

/** Endereço fixo da Câmara; o Número é S/N pela regra A dos Correios ("Anexo 4" passa de 6 caracteres). */
export const ENDERECO_CAMARA = {
  LOGRADOURO: "Praça dos Três Poderes",
  NUMERO: "S/N",
  BAIRRO: "Zona Cívico-Administrativa",
  CIDADE: "Brasília",
  UF: "DF",
} as const;

/** Quantas linhas, do topo de cada aba, são varridas à procura do cabeçalho. */
const LINHAS_PROCURADAS = 30;
const ORGAO_CAMARA = "Câmara dos Deputados";

const texto = (v: unknown): string => String(v ?? "").trim();

type Matriz = unknown[][];

interface AbaDaCamara {
  nome: string;
  matriz: Matriz;
  posicao: number;
}

function posicaoDoCabecalho(matriz: Matriz): number {
  const limite = Math.min(matriz.length, LINHAS_PROCURADAS);
  for (let i = 0; i < limite; i++) {
    const celulas = matriz[i].map((c) => normalizarTexto(texto(c)));
    if (celulas.every((c) => c === "")) continue;
    // Só a primeira linha não vazia pode ser o cabeçalho.
    return MARCAS_CAMARA.every((m) => celulas.includes(m)) ? i : -1;
  }
  return -1;
}

function acharAba(buffer: ArrayBuffer): AbaDaCamara | undefined {
  const wb = XLSX.read(buffer, { type: "array" });
  for (const nome of wb.SheetNames) {
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, defval: "", raw: false });
    const posicao = posicaoDoCabecalho(matriz);
    if (posicao >= 0) return { nome, matriz, posicao };
  }
  return undefined;
}

/** Nome da aba em que a planilha da Câmara foi reconhecida; `undefined` quando o arquivo não é dela. */
export function abaDaListaDaCamara(buffer: ArrayBuffer): string | undefined {
  return acharAba(buffer)?.nome;
}

export function ehListaDaCamara(buffer: ArrayBuffer): boolean {
  return acharAba(buffer) !== undefined;
}

export function generoDoTratamentoDaCamara(tratamento: string): "f" | "m" | undefined {
  const t = normalizarTexto(tratamento);
  if (/\bsenhora\b/.test(t)) return "f";
  if (/\bsenhor\b/.test(t)) return "m";
  return undefined;
}

export function cepDoComplementoDaCamara(complemento: string): string {
  const achado = /CEP\s*([\d.\-]+)/i.exec(complemento);
  return achado ? achado[1].replace(/\D/g, "") : "";
}

export function complementoDaCamara(anexo: string, gabinete: string): string {
  const partes = [anexo.trim() !== "" ? `Anexo ${anexo.trim()}` : "", gabinete.trim() !== "" ? `Gabinete ${gabinete.trim()}` : ""];
  return partes.filter((p) => p !== "").join(", ");
}

function protocoloDoGenero(genero: "f" | "m" | undefined): Pick<Valores, "TRATAMENTO" | "ENDERECAMENTO" | "CARGO"> {
  if (genero === "f") return { TRATAMENTO: "Senhora", ENDERECAMENTO: "A Sua Excelência a Senhora", CARGO: "Deputada Federal" };
  if (genero === "m") return { TRATAMENTO: "Senhor", ENDERECAMENTO: "A Sua Excelência o Senhor", CARGO: "Deputado Federal" };
  // Gênero que a Câmara não decide: nunca "Senhor" por padrão; a linha cai em "Tratamento ou Endereçamento vazio".
  return { TRATAMENTO: "", ENDERECAMENTO: "", CARGO: "Deputado Federal" };
}

export function lerListaDaCamara(buffer: ArrayBuffer): LinhaLista[] {
  const aba = acharAba(buffer);
  if (!aba) throw new ColunaFaltanteError([...MARCAS_CAMARA]);
  const cabecalho = aba.matriz[aba.posicao].map((c) => normalizarTexto(texto(c)));
  const iNome = cabecalho.indexOf("nome parlamentar");
  const iAnexo = cabecalho.indexOf("anexo");
  const iGabinete = cabecalho.indexOf("gabinete");
  const iComplemento = cabecalho.indexOf("endereco (complemento)");
  const iTratamento = cabecalho.indexOf("tratamento");
  const celula = (celulas: unknown[], i: number): string => (i >= 0 ? texto(celulas[i]) : "");

  const linhas: LinhaLista[] = [];
  aba.matriz.slice(aba.posicao + 1).forEach((celulas, i) => {
    const nome = celula(celulas, iNome);
    if (!nome) return;
    const protocolo = protocoloDoGenero(generoDoTratamentoDaCamara(celula(celulas, iTratamento)));
    linhas.push({
      linha: aba.posicao + 2 + i,
      orgao: ORGAO_CAMARA,
      valores: {
        NOME: nome,
        ...protocolo,
        CEP: cepDoComplementoDaCamara(celula(celulas, iComplemento)),
        LOGRADOURO: ENDERECO_CAMARA.LOGRADOURO,
        NUMERO: ENDERECO_CAMARA.NUMERO,
        COMPLEMENTO: complementoDaCamara(celula(celulas, iAnexo), celula(celulas, iGabinete)),
        BAIRRO: ENDERECO_CAMARA.BAIRRO,
        CIDADE: ENDERECO_CAMARA.CIDADE,
        UF: ENDERECO_CAMARA.UF,
      },
    });
  });
  return linhas;
}
