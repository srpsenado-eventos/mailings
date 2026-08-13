import Link from "next/link";
import { listarGruposComFonte } from "@/lib/catalogo";
import type { GrupoCadastro } from "@/lib/types";

export const runtime = "nodejs";

function FonteStatus({ grupo }: { grupo: GrupoCadastro }) {
  if (!grupo.temFonte) {
    return <span className="text-amber-600">— sem fonte</span>;
  }
  return (
    <a
      href={grupo.fonteUrl}
      target="_blank"
      rel="noreferrer"
      className="text-blue-700 underline break-all"
    >
      {grupo.fonteUrl}
    </a>
  );
}

export default function GruposPage() {
  const grupos = listarGruposComFonte();
  const comFonte = grupos.filter((g) => g.temFonte).length;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Grupos cadastrados</h1>
        <Link href="/" className="text-sm underline">
          ← Análise de planilha
        </Link>
      </div>

      <p className="mb-4 text-sm text-gray-600">
        {grupos.length} grupos · {comFonte} com fonte oficial · {grupos.length - comFonte} sem
        fonte
      </p>
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="p-2">Grupo</th>
              <th className="p-2">Responsável 1</th>
              <th className="p-2">Responsável 2</th>
              <th className="p-2">Backup</th>
              <th className="p-2">Fonte oficial</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={g.nome} className="border-t border-gray-100 align-top">
                <td className="p-2 font-medium">{g.nome}</td>
                <td className="p-2">
                  {g.responsavel1 ?? "—"}
                  {g.emailResp1 && <div className="text-xs text-gray-500">{g.emailResp1}</div>}
                </td>
                <td className="p-2">
                  {g.responsavel2 ?? "—"}
                  {g.emailResp2 && <div className="text-xs text-gray-500">{g.emailResp2}</div>}
                </td>
                <td className="p-2">
                  {g.backup ?? "—"}
                  {g.emailBackup && <div className="text-xs text-gray-500">{g.emailBackup}</div>}
                </td>
                <td className="p-2">
                  <FonteStatus grupo={g} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
