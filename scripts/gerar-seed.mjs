// Gera data/seed-grupos.sql a partir da aba "Sistema contatos - Controle".
// Idempotente: grupos via ON CONFLICT(nome) DO UPDATE; fontes via ON CONFLICT DO NOTHING.
// Só cria fonte quando "Link Site" é uma URL http(s) válida (cadastro manual de URLs).
import * as XLSX from "xlsx";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const wb = XLSX.read(readFileSync(path.join(root, "Organização Contatos - 2026.xlsx")), { type: "buffer" });
const rows = XLSX.utils.sheet_to_json(wb.Sheets["Sistema contatos - Controle"], { header: 1, defval: null, blankrows: false });

/** Limpa célula: remove \r\n, colapsa espaços, trim. null/'' => null. */
function limpar(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s.length ? s : null;
}
/** Escapa para literal SQL ('...'); null => NULL. */
function sql(v) {
  return v === null ? "NULL" : "'" + v.replace(/'/g, "''") + "'";
}
function ehUrl(v) {
  return v !== null && /^https?:\/\//i.test(v);
}

const grupos = [];
const fontes = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const nome = limpar(r[0]);
  if (!nome) continue;
  grupos.push({
    nome,
    responsavel_1: limpar(r[1]),
    responsavel_2: limpar(r[2]),
    backup: limpar(r[3]),
    email_resp_1: limpar(r[4]),
    email_resp_2: limpar(r[5]),
    email_backup: limpar(r[6]),
  });
  const link = limpar(r[9]);
  if (ehUrl(link)) fontes.push({ nome, url: link });
}

const linhas = [];
linhas.push("-- GERADO por scripts/gerar-seed.mjs a partir de 'Organização Contatos - 2026.xlsx'.");
linhas.push("-- NÃO editar à mão; rode o gerador novamente se a planilha mudar.");
linhas.push("-- Pré-requisito: migrations 0001 e 0002 aplicadas.");
linhas.push("");
linhas.push("-- ===== grupos (com responsáveis) =====");
for (const g of grupos) {
  linhas.push(
    `insert into public.grupos (nome, responsavel_1, responsavel_2, backup, email_resp_1, email_resp_2, email_backup) values (` +
      `${sql(g.nome)}, ${sql(g.responsavel_1)}, ${sql(g.responsavel_2)}, ${sql(g.backup)}, ${sql(g.email_resp_1)}, ${sql(g.email_resp_2)}, ${sql(g.email_backup)})` +
      ` on conflict (nome) do update set responsavel_1 = excluded.responsavel_1, responsavel_2 = excluded.responsavel_2, backup = excluded.backup, email_resp_1 = excluded.email_resp_1, email_resp_2 = excluded.email_resp_2, email_backup = excluded.email_backup;`,
  );
}
linhas.push("");
linhas.push(`-- ===== fontes (URLs oficiais primárias; ${fontes.length} de ${grupos.length} grupos têm URL) =====`);
for (const f of fontes) {
  linhas.push(
    `insert into public.fontes (grupo_id, url) select id, ${sql(f.url)} from public.grupos where nome = ${sql(f.nome)} on conflict (grupo_id, url) do nothing;`,
  );
}
linhas.push("");

const seedSql = linhas.join("\n");
const out = path.join(root, "data", "seed-grupos.sql");
writeFileSync(out, seedSql, "utf8");

// Arquivo único pronto para colar no SQL Editor do Supabase: migrations + seed em ordem.
const m1 = readFileSync(path.join(root, "supabase", "migrations", "0001_init.sql"), "utf8");
const m2 = readFileSync(path.join(root, "supabase", "migrations", "0002_grupos_responsaveis.sql"), "utf8");
const apply = [
  "-- GERADO por scripts/gerar-seed.mjs. Cole tudo no SQL Editor do Supabase e rode uma vez.",
  "-- Contém: migration 0001 + migration 0002 + seed dos grupos/fontes.",
  "",
  "-- ========== migration 0001_init ==========",
  m1.trim(),
  "",
  "-- ========== migration 0002_grupos_responsaveis ==========",
  m2.trim(),
  "",
  "-- ========== seed (grupos + fontes) ==========",
  seedSql.trim(),
  "",
].join("\n");
const applyOut = path.join(root, "data", "apply-all.sql");
writeFileSync(applyOut, apply, "utf8");

console.log(`grupos=${grupos.length} fontes=${fontes.length} -> ${path.relative(root, out)} + ${path.relative(root, applyOut)}`);
