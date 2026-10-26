import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { extrairConteudoPdf, lerTextoPdf, raspar } from "@/lib/scrape";

const textoStj = readFileSync(resolve(__dirname, "fixtures/stj-composicao.txt"), "utf-8");
const URL = "https://www.stj.jus.br/x/Composicao-do-STJ.pdf";

describe("leitura de PDF (spec 2026-10-23 §5.1)", () => {
  test("texto do PDF do STJ: os 2 convocados (nomes seguidos de **), com a data da composição no contexto", async () => {
    const c = await extrairConteudoPdf(new Uint8Array(), URL, { marcador: ["**"] }, async () => textoStj);
    expect(c.url).toBe(URL);
    expect(c.pessoas).toHaveLength(2);
    expect(c.pessoas.every((p) => /^Composição – \d{2}\/\d{2}\/\d{4}$/.test(p.contexto ?? ""))).toBe(true);
    expect(c.textoLimpo).toBe(textoStj);
  });
  test("sem marcador, PDF dá texto e nenhuma pessoa", async () => {
    const c = await extrairConteudoPdf(new Uint8Array(), URL, {}, async () => textoStj);
    expect(c.pessoas).toEqual([]);
  });
  test("pdf-parse real lê o PDF mínimo da fixture", async () => {
    const texto = await lerTextoPdf(new Uint8Array(readFileSync(resolve(__dirname, "fixtures/pdf-minimo.pdf"))));
    expect(texto).toContain("Fulano De Teste");
  });
  test("raspar com tipo pdf baixa os bytes e extrai pelo marcador", async () => {
    const bytes = readFileSync(resolve(__dirname, "fixtures/pdf-minimo.pdf"));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => "application/pdf" }, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })));
    const c = await raspar(URL, { tipo: "pdf", marcador: ["**"] });
    expect(c.pessoas.map((p) => p.nome)).toEqual(["Fulano De Teste"]);
    vi.unstubAllGlobals();
  });
});
