#!/usr/bin/env node
// Converte a aba "Tratamentos Simplificado" do XLSX de protocolo em data/tratamentos.ts.
// Ver docs/superpowers/specs/2026-08-13-auditoria-tratamento-enderecamento.md
//
// O arquivo de origem (Regras de Atualizacao/Posse2027_TabelaTratamentos.xlsx) NÃO vem no
// clone: saiu do controle de versão no commit 16c303f porque a pasta também guarda uma
// planilha de 51 MB e um PDF com e-mails de servidores. Quem clonar o repo e rodar este
// gerador recebe ENOENT na linha da leitura abaixo. Peça o arquivo ao Clovis e coloque-o em
// "Regras de Atualizacao/Posse2027_TabelaTratamentos.xlsx" antes de rodar.
import * as XLSX from "xlsx";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const ORIGEM = path.join(root, "Regras de Atualizacao", "Posse2027_TabelaTratamentos.xlsx");
const ABA = "Tratamentos Simplificado";

const wb = XLSX.read(readFileSync(ORIGEM), { type: "buffer" });
if (!wb.Sheets[ABA]) throw new Error(`aba "${ABA}" não encontrada em ${ORIGEM}`);
const linhas = XLSX.utils.sheet_to_json(wb.Sheets[ABA], {
  header: 1,
  defval: null,
  blankrows: false,
});

/** Limpa célula: colapsa espaços e quebras, trim. null/'' => "". */
function limpar(v) {
  return v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim();
}
/** Preserva quebras de linha (endereçamento é multilinha), mas normaliza CRLF e apara. */
function limparMultilinha(v) {
  return v === null || v === undefined
    ? ""
    : String(v).replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

const regras = [];
for (const l of linhas.slice(1)) {
  const cargo = limpar(l[0]);
  // Linha de seção: sem nominata (ex.: "Poder Legislativo").
  if (l[1] === null || limpar(l[1]).length === 0) continue;
  // Cabeçalho repetido no meio da aba.
  if (cargo === "Cargo do destinatário") continue;
  if (cargo.length === 0) continue;
  regras.push({
    cargoDestinatario: limparMultilinha(l[0]),
    nominata: limparMultilinha(l[1]),
    vocativo: limparMultilinha(l[2]),
    pronome: limpar(l[3]),
    enderecamento: limparMultilinha(l[4]),
  });
}
if (regras.length === 0) throw new Error("nenhuma regra extraída — layout da aba mudou?");

const conteudo = `// Tabela de protocolo — FONTE DA VERDADE da auditoria de tratamento/endereçamento.
//
// Gerado por scripts/gerar-tratamentos.mjs a partir da aba "${ABA}" de
// Regras de Atualizacao/Posse2027_TabelaTratamentos.xlsx.
// Rode o gerador de novo se a planilha de protocolo mudar.
//
// Os textos são PADRÕES, não valores literais: contêm "(a)", alternativas com "ou" e " / ",
// feminino por extenso entre parênteses e os placeholders [Cargo], [Patente] e [Nome].
// A expansão para formas aceitas está em lib/tratamento.ts.
// Ver docs/superpowers/specs/2026-08-13-auditoria-tratamento-enderecamento.md
import type { RegraTratamento } from "@/lib/types";

export const REGRAS_TRATAMENTO: readonly RegraTratamento[] = [
${regras
  .map(
    (r) =>
      "  {\n" +
      `    cargoDestinatario: ${JSON.stringify(r.cargoDestinatario)},\n` +
      `    nominata: ${JSON.stringify(r.nominata)},\n` +
      `    vocativo: ${JSON.stringify(r.vocativo)},\n` +
      `    pronome: ${JSON.stringify(r.pronome)},\n` +
      `    enderecamento: ${JSON.stringify(r.enderecamento)},\n` +
      "  },",
  )
  .join("\n")}
];
`;

writeFileSync(path.join(root, "data", "tratamentos.ts"), conteudo, "utf8");
process.stdout.write(`data/tratamentos.ts gerado: ${regras.length} regras\n`);
