import { get, put } from "@vercel/blob";
import { RetratoIlegivelError, validarRetrato, type Armazem } from "@/lib/armazem";
import type { Retrato } from "@/lib/types";

/**
 * Segunda implementação de `Armazem` (spec 2026-10-02 §6.1): um objeto PRIVADO no Vercel
 * Blob, um só, sem histórico, como o arquivo local. O cliente é injetável para teste; o
 * padrão usa `@vercel/blob` com o token de leitura e escrita do store. Quem lê o retrato
 * publicado é a página em modo web, atrás da senha; quem grava é `POST /api/publicar`,
 * só em modo local.
 */
export const CAMINHO_RETRATO_BLOB = "retratos/retrato.json";

export interface ClienteBlob {
  /** Texto do objeto, ou `undefined` se não existe. */
  ler(caminho: string): Promise<string | undefined>;
  gravar(caminho: string, corpo: string): Promise<void>;
}

async function textoDe(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

/** Cliente real. Não coberto por teste (fala com a rede). */
export function clienteBlobPadrao(token: string): ClienteBlob {
  return {
    async ler(caminho) {
      // `useCache: false`: a leitura tem que refletir a publicação mais recente.
      const r = await get(caminho, { access: "private", token, useCache: false });
      // 304 é inalcançável sem `ifNoneMatch`; se vier, sem stream, é tratado como ausente.
      if (!r || !r.stream) return undefined;
      return textoDe(r.stream);
    },
    async gravar(caminho, corpo) {
      await put(caminho, corpo, {
        access: "private",
        token,
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    },
  };
}

export function armazemEmBlob(cliente: ClienteBlob): Armazem {
  return {
    async lerRetrato() {
      const texto = await cliente.ler(CAMINHO_RETRATO_BLOB);
      if (texto === undefined) return undefined;
      let json: unknown;
      try {
        json = JSON.parse(texto);
      } catch {
        throw new RetratoIlegivelError("retrato publicado não é JSON válido");
      }
      return validarRetrato(json);
    },
    async gravarRetrato(retrato: Retrato) {
      await cliente.gravar(CAMINHO_RETRATO_BLOB, JSON.stringify(retrato));
    },
  };
}
