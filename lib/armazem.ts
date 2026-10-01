import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Retrato } from "@/lib/types";

/**
 * Onde o último retrato vive entre uma abertura do app e outra. É a única persistência
 * do projeto: um arquivo, nesta máquina, fora do git. Interface injetável para a rota e
 * para o painel; em teste, a versão em memória.
 * Ver docs/superpowers/specs/2026-10-01-painel-local-retrato-em-arquivo.md
 */
export interface Armazem {
  /** `undefined` quando nunca houve varredura. Lança `RetratoIlegivelError` se o arquivo existe e não serve. */
  lerRetrato(): Promise<Retrato | undefined>;
  gravarRetrato(retrato: Retrato): Promise<void>;
}

/** O arquivo existe, mas não é um retrato (JSON quebrado ou campo obrigatório ausente). */
export class RetratoIlegivelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetratoIlegivelError";
  }
}

/** Caminho relativo à raiz do projeto. A pasta está no .gitignore. */
export const CAMINHO_RETRATO_PADRAO = join(".fiscal", "retrato.json");

export function armazemEmMemoria(inicial?: Retrato): Armazem {
  let atual = inicial;
  return {
    lerRetrato: async () => atual,
    gravarRetrato: async (retrato) => {
      atual = retrato;
    },
  };
}

/** Checagem mínima: o que o painel precisa para não quebrar. O resto é o tipo gravado por nós. */
function validarRetrato(valor: unknown): Retrato {
  if (typeof valor !== "object" || valor === null) {
    throw new RetratoIlegivelError("retrato não é um objeto");
  }
  const o = valor as Record<string, unknown>;
  if (typeof o.geradoEm !== "string" || !Array.isArray(o.grupos) || typeof o.resumo !== "object" || o.resumo === null) {
    throw new RetratoIlegivelError("retrato sem geradoEm, grupos ou resumo");
  }
  return valor as Retrato;
}

function ehArquivoAusente(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "ENOENT";
}

export function armazemEmArquivo(caminho: string): Armazem {
  return {
    async lerRetrato() {
      let texto: string;
      try {
        texto = await readFile(caminho, "utf8");
      } catch (err) {
        if (ehArquivoAusente(err)) return undefined;
        throw err;
      }
      let json: unknown;
      try {
        json = JSON.parse(texto);
      } catch {
        throw new RetratoIlegivelError("retrato não é JSON válido");
      }
      return validarRetrato(json);
    },
    async gravarRetrato(retrato) {
      // Escrita atômica: grava ao lado e renomeia, para uma queda no meio não deixar
      // um retrato pela metade. `rename` substitui o destino, inclusive no Windows.
      await mkdir(dirname(caminho), { recursive: true });
      const temporario = `${caminho}.tmp`;
      await writeFile(temporario, JSON.stringify(retrato), "utf8");
      await rename(temporario, caminho);
    },
  };
}

/** O armazém que o app usa: arquivo na raiz do projeto em que o `npm run dev` roda. */
export function armazemPadrao(): Armazem {
  return armazemEmArquivo(join(process.cwd(), CAMINHO_RETRATO_PADRAO));
}
