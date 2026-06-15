import type { ResultadoAnalise } from "@/lib/types";
import { SemaforoBadge } from "@/components/semaforo-badge";

export function ResultadoTabela({ analise }: { analise: ResultadoAnalise }) {
  return (
    <div className="space-y-6">
      {analise.grupos.map((g) => (
        <section key={g.grupo} className="rounded border bg-white p-4">
          <h2 className="mb-2 font-semibold">
            {g.grupo}{" "}
            {g.semFonte ? (
              <span className="text-sm text-red-600">
                (sem fonte cadastrada
                {g.sugestoesCadastro && g.sugestoesCadastro.length > 0 ? (
                  <>
                    {" "}— você quis dizer:{" "}
                    <span className="font-medium">{g.sugestoesCadastro.join(" · ")}</span>?
                  </>
                ) : (
                  ""
                )}
                {" "}·{" "}
                <a href="/grupos" className="underline">
                  grupos cadastrados
                </a>
                )
              </span>
            ) : g.fonteInacessivel ? (
              <span className="text-sm text-amber-600">
                (fonte inacessível — verifique manualmente:{" "}
                <a href={g.fonteUrl} className="underline" target="_blank" rel="noreferrer">
                  abrir
                </a>
                {g.erroFonte ? ` · ${g.erroFonte}` : ""})
              </span>
            ) : g.viaPesquisaAmpla ? (
              <span className="text-sm text-amber-700">
                (verificado por pesquisa ampla — Gemini + Google Search; fonte oficial não acessível
                {g.fonteUrl && g.fonteUrl.startsWith("http") ? (
                  <>
                    {" "}·{" "}
                    <a href={g.fonteUrl} className="underline" target="_blank" rel="noreferrer">
                      conferir oficial
                    </a>
                  </>
                ) : (
                  ""
                )}
                )
              </span>
            ) : (
              <a
                href={g.fonteUrl}
                className="text-sm text-blue-600 underline"
                target="_blank"
                rel="noreferrer"
              >
                fonte
              </a>
            )}
          </h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500">
              <th>Nome</th><th>Cargo</th><th>Divergências</th><th>Origem</th><th>Status</th>
            </tr></thead>
            <tbody>
              {g.contatos.map((c, i) => {
                const divs = c.comparacoes.filter((x) => x.situacao === "divergente");
                return (
                  <tr key={i} className="border-t">
                    <td>{c.contato.nome}</td>
                    <td>{c.contato.cargo ?? "—"}</td>
                    <td>
                      {c.possivelSaida
                        ? "não consta na fonte"
                        : divs.length === 0
                          ? "—"
                          : divs
                              .map(
                                (d) =>
                                  `${d.campo}: ${d.valorPlanilha} → ${d.valorSite ?? "fonte não informa"}` +
                                  (d.origemValor === "conhecimento" ? " (via IA — confira)" : ""),
                              )
                              .join("; ")}
                    </td>
                    <td>{c.origem === "pesquisa_ampla" ? "pesquisa ampla" : "oficial"}</td>
                    <td>
                      {c.possivelSaida ? (
                        <span className="text-red-600">possível saída</span>
                      ) : (
                        <SemaforoBadge status={c.semaforo} />
                      )}
                    </td>
                  </tr>
                );
              })}
              {g.novos.map((n, i) => (
                <tr key={`novo-${i}`} className="border-t">
                  <td>{n.nome}</td>
                  <td>{n.cargo ?? "—"}</td>
                  <td>—</td>
                  <td>{n.origem === "conhecimento" ? "pesquisa ampla" : "oficial"}</td>
                  <td><SemaforoBadge status="novo" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
