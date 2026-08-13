#!/usr/bin/env node
// Converte data/apply-all.sql -> data/catalogo.ts (migração única do banco para arquivo).
// Depois desta conversão, data/catalogo.ts é a fonte da verdade e pode ser editado à mão.
// Ver docs/superpowers/specs/2026-08-13-catalogo-em-arquivo-sem-banco.md
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const sql = readFileSync(path.join(root, "data", "apply-all.sql"), "utf8");

const PREFIXO_GRUPO =
  "insert into public.grupos (nome, responsavel_1, responsavel_2, backup, email_resp_1, email_resp_2, email_backup) values (";
const PREFIXO_FONTE = "insert into public.fontes (grupo_id, url) select id, ";
const MEIO_FONTE = " from public.grupos where nome = ";

/** Lê um literal SQL ('...', com '' escapando aspa) a partir de i, que aponta para a aspa. */
function lerLiteral(texto, i) {
  if (texto[i] !== "'") throw new Error(`esperava um literal SQL na posição ${i}`);
  let valor = "";
  i++;
  while (i < texto.length) {
    if (texto[i] === "'" && texto[i + 1] === "'") {
      valor += "'";
      i += 2;
      continue;
    }
    if (texto[i] === "'") return { valor, fim: i + 1 };
    valor += texto[i++];
  }
  throw new Error("literal SQL não fechado");
}

/** Lê a lista de um `values (...)`, aceitando literais e NULL, até o ')' de fechamento. */
function lerValores(texto, i) {
  const valores = [];
  let atual = null;
  while (i < texto.length) {
    const c = texto[i];
    if (c === "'") {
      const r = lerLiteral(texto, i);
      atual = r.valor;
      i = r.fim;
      continue;
    }
    if (c === ",") {
      valores.push(atual);
      atual = null;
      i++;
      continue;
    }
    if (c === ")") {
      valores.push(atual);
      return { valores, fim: i + 1 };
    }
    if (texto.slice(i, i + 4).toUpperCase() === "NULL") {
      atual = null;
      i += 4;
      continue;
    }
    i++;
  }
  throw new Error("`values (...)` não fechado");
}

// ---- grupos ----
const grupos = [];
for (let i = sql.indexOf(PREFIXO_GRUPO); i !== -1; i = sql.indexOf(PREFIXO_GRUPO, i + 1)) {
  const { valores } = lerValores(sql, i + PREFIXO_GRUPO.length);
  const [nome, responsavel1, responsavel2, backup, emailResp1, emailResp2, emailBackup] = valores;
  if (!nome) throw new Error("encontrado insert de grupo sem nome");
  grupos.push({ nome, responsavel1, responsavel2, backup, emailResp1, emailResp2, emailBackup, fontes: [] });
}
if (grupos.length === 0) throw new Error("nenhum grupo encontrado no SQL — prefixo mudou?");

// ---- fontes ----
const porNome = new Map(grupos.map((g) => [g.nome, g]));
for (let i = sql.indexOf(PREFIXO_FONTE); i !== -1; i = sql.indexOf(PREFIXO_FONTE, i + 1)) {
  const u = lerLiteral(sql, i + PREFIXO_FONTE.length);
  const j = sql.indexOf(MEIO_FONTE, u.fim);
  if (j === -1) throw new Error(`fonte sem cláusula de grupo: ${u.valor}`);
  const n = lerLiteral(sql, j + MEIO_FONTE.length);
  const grupo = porNome.get(n.valor);
  if (!grupo) throw new Error(`fonte aponta para grupo inexistente: ${n.valor}`);
  if (!grupo.fontes.some((f) => f.url === u.valor)) grupo.fontes.push({ url: u.valor, ativo: true });
}

// ---- emissão ----
const OPCIONAIS = ["responsavel1", "responsavel2", "backup", "emailResp1", "emailResp2", "emailBackup"];

function emitirGrupo(g) {
  const linhas = ["  {", `    nome: ${JSON.stringify(g.nome)},`];
  for (const chave of OPCIONAIS) {
    if (g[chave] !== null && g[chave] !== undefined) {
      linhas.push(`    ${chave}: ${JSON.stringify(g[chave])},`);
    }
  }
  if (g.fontes.length === 0) {
    linhas.push("    fontes: [],");
  } else {
    linhas.push("    fontes: [");
    for (const f of g.fontes) {
      linhas.push(`      { url: ${JSON.stringify(f.url)}, ativo: ${f.ativo} },`);
    }
    linhas.push("    ],");
  }
  linhas.push("  },");
  return linhas.join("\n");
}

const conteudo = `// Catálogo de grupos e fontes oficiais — FONTE DA VERDADE da aplicação.
//
// Gerado uma única vez por scripts/gerar-catalogo.mjs a partir de data/apply-all.sql,
// na migração que removeu o Supabase. A partir daqui, EDITE ESTE ARQUIVO À MÃO:
// cadastrar uma URL nova é acrescentar uma entrada em \`fontes\` e commitar.
//
// A primeira fonte com \`ativo: true\` é a primária do grupo — a ordem importa.
// Ver docs/superpowers/specs/2026-08-13-catalogo-em-arquivo-sem-banco.md
import type { GrupoCatalogo } from "@/lib/types";

export const CATALOGO: readonly GrupoCatalogo[] = [
${grupos.map(emitirGrupo).join("\n")}
];
`;

writeFileSync(path.join(root, "data", "catalogo.ts"), conteudo, "utf8");
const totalFontes = grupos.reduce((n, g) => n + g.fontes.length, 0);
process.stdout.write(`data/catalogo.ts gerado: ${grupos.length} grupos, ${totalFontes} fontes\n`);
