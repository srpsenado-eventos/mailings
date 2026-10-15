import { describe, expect, test, vi } from "vitest";
import { MOTIVO_SESSAO_AUSENTE, RASPADORES_PADRAO, rasparFonte, type Raspadores } from "@/lib/raspagem";
import type { ConteudoFonte, FonteCatalogo } from "@/lib/types";

const vazio = (url: string): ConteudoFonte => ({ url, textoLimpo: "", destaques: [], pessoas: [] });

function raspadoresFalsos(): Raspadores & {
  porFetch: ReturnType<typeof vi.fn>;
  porNavegador: ReturnType<typeof vi.fn>;
  porJanela: ReturnType<typeof vi.fn>;
} {
  return {
    porFetch: vi.fn(async (url: string) => vazio(url)),
    porNavegador: vi.fn(async (url: string) => vazio(url)),
    porJanela: vi.fn(async (url: string) => vazio(url)),
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
    await rasparFonte({ url: "https://portal.tcu.gov.br/autoridades", navegador: true }, r);
    expect(r.porNavegador).toHaveBeenCalledWith("https://portal.tcu.gov.br/autoridades", {});
    expect(r.porFetch).not.toHaveBeenCalled();
  });

  test("só a URL cadastrada chega ao navegador (nenhuma transformação)", async () => {
    const r = raspadoresFalsos();
    await rasparFonte({ url: "https://portal.tcu.gov.br/autoridades?x=1", navegador: true }, r);
    expect(r.porNavegador.mock.calls[0][0]).toBe("https://portal.tcu.gov.br/autoridades?x=1");
  });

  test("fonte 'janela' vai pela sessão com janela, nunca pelo headless nem pelo fetch", async () => {
    const r = raspadoresFalsos();
    await rasparFonte({ url: "https://www.gov.br/planalto/lista", navegador: "janela" }, r);
    expect(r.porJanela).toHaveBeenCalledWith("https://www.gov.br/planalto/lista", {});
    expect(r.porNavegador).not.toHaveBeenCalled();
    expect(r.porFetch).not.toHaveBeenCalled();
  });

  test("fonte individual (sem `ativo` nem `tabela`) é legível pelo mesmo caminho", async () => {
    const r = raspadoresFalsos();
    await rasparFonte({ url: "https://go.gov.br/governador" }, r);
    expect(r.porFetch).toHaveBeenCalledWith("https://go.gov.br/governador", {});
  });

  test("sem sessão aberta, fonte 'janela' falha com ScrapeError claro (RASPADORES_PADRAO)", async () => {
    await expect(rasparFonte({ url: "https://www.gov.br/x", navegador: "janela" }, { ...RASPADORES_PADRAO, porFetch: vi.fn(), porNavegador: vi.fn() }))
      .rejects.toMatchObject({ motivo: MOTIVO_SESSAO_AUSENTE });
  });
});
