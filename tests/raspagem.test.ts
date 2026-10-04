import { describe, expect, test, vi } from "vitest";
import { rasparFonte, type Raspadores } from "@/lib/raspagem";
import type { ConteudoFonte, FonteCatalogo } from "@/lib/types";

const vazio = (url: string): ConteudoFonte => ({ url, textoLimpo: "", destaques: [], pessoas: [] });

function raspadoresFalsos(): Raspadores & { porFetch: ReturnType<typeof vi.fn>; porNavegador: ReturnType<typeof vi.fn> } {
  return {
    porFetch: vi.fn(async (url: string) => vazio(url)),
    porNavegador: vi.fn(async (url: string) => vazio(url)),
  };
}

describe("rasparFonte escolhe o caminho pela fonte do catálogo", () => {
  test("fonte comum vai pelo fetch, com a extração que ela declara", async () => {
    const r = raspadoresFalsos();
    const fonte: FonteCatalogo = { url: "https://x.gov.br/lista", ativo: true, tabela: { colunas: { nome: 0 } } };
    await rasparFonte(fonte, r);
    expect(r.porFetch).toHaveBeenCalledWith("https://x.gov.br/lista", { tabela: fonte.tabela });
    expect(r.porNavegador).not.toHaveBeenCalled();
  });

  test("fonte com navegador vai pelo Chrome e nunca pelo fetch", async () => {
    const r = raspadoresFalsos();
    await rasparFonte({ url: "https://portal.tcu.gov.br/autoridades", ativo: true, navegador: true }, r);
    expect(r.porNavegador).toHaveBeenCalledWith("https://portal.tcu.gov.br/autoridades", {});
    expect(r.porFetch).not.toHaveBeenCalled();
  });

  test("só a URL cadastrada chega ao navegador (nenhuma transformação)", async () => {
    const r = raspadoresFalsos();
    await rasparFonte({ url: "https://portal.tcu.gov.br/autoridades?x=1", ativo: true, navegador: true }, r);
    expect(r.porNavegador.mock.calls[0][0]).toBe("https://portal.tcu.gov.br/autoridades?x=1");
  });
});
