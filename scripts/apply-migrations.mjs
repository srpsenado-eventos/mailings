#!/usr/bin/env node
// Aplica migrations e seed contra o Postgres do Supabase.
// Uso:
//   $env:DATABASE_URL = 'postgresql://postgres:<senha-url-encoded>@db.<ref>.supabase.co:5432/postgres'
//   node scripts/apply-migrations.mjs
// A senha nunca deve ser gravada em arquivo versionado — passe sempre via env.
import { readFile } from "node:fs/promises";
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Erro: DATABASE_URL nao definido no ambiente.");
  process.exit(1);
}

const arquivos = [
  "supabase/migrations/0001_init.sql",
  "supabase/migrations/0002_grupos_responsaveis.sql",
  "data/seed-grupos.sql",
];

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log("Conectado ao Postgres.");

  for (const arquivo of arquivos) {
    const sql = await readFile(arquivo, "utf8");
    process.stdout.write(`\n-> ${arquivo} (${sql.length} chars) ... `);
    await client.query(sql);
    console.log("OK");
  }

  console.log("\n=== Verificacao ===");
  const tabelas = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  console.log(
    "Tabelas em public:",
    tabelas.rows.map((r) => r.table_name).join(", "),
  );

  for (const t of ["grupos", "orgaos", "fontes"]) {
    const r = await client.query(`SELECT count(*)::int as n FROM public.${t}`);
    console.log(`  ${t}: ${r.rows[0].n} linhas`);
  }

  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'grupos'
    ORDER BY ordinal_position
  `);
  console.log("Colunas em grupos:", cols.rows.map((r) => r.column_name).join(", "));
} catch (err) {
  console.error("\nFalhou:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
