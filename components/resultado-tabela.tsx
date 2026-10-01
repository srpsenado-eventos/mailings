import type { ResultadoAnalise } from "@/lib/types";
import { SemaforoBadge } from "@/components/semaforo-badge";
import { celulaDivergencias } from "@/lib/celula-divergencias";
import { rotuloAchadoEndereco } from "@/lib/endereco";

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
            {/* Falha parcial: o grupo foi comparado com as fontes que responderam, mas a
                composição está incompleta. Sem este aviso a tela mostra um link azul comum
                e parece um veredito completo — era o que o `erroFonte` prometia e não
                entregava. O ramo de fonte inacessível já exibe o motivo no próprio texto. */}
            {g.erroFonte && !g.fonteInacessivel ? (
              <span className="text-sm text-amber-700"> · uma fonte não respondeu: {g.erroFonte}</span>
            ) : null}
          </h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500">
              <th>Nome</th><th>Cargo</th><th>Endereço</th><th>Divergências</th><th>Origem</th><th>Status</th>
            </tr></thead>
            <tbody>
              {g.contatos.map((c, i) => (
                <tr key={i} className="border-t">
                  <td>
                    {c.contato.nome}
                    {/* `g.erroFonte` já avisa no cabeçalho do grupo: repetir por contato
                        devolveria o ruído que o commit 58d743b tirou. No export a linha
                        precisa se sustentar sozinha, e lá a ressalva continua. */}
                    {c.observacao &&
                    !c.possivelSaida &&
                    !g.semFonte &&
                    !g.fonteInacessivel &&
                    !g.erroFonte ? (
                      <span className="block text-xs text-gray-500">{c.observacao}</span>
                    ) : null}
                  </td>
                  <td>{c.contato.cargo ?? "—"}</td>
                  <td>
                    {c.endereco && c.endereco.situacao !== "sem_base" ? (
                      <span
                        className={
                          c.endereco.situacao === "pendente"
                            ? "text-amber-700"
                            : c.endereco.situacao === "completo"
                              ? "text-gray-600"
                              : "text-gray-700"
                        }
                        title={c.endereco.achados.map(rotuloAchadoEndereco).join("; ")}
                      >
                        {c.endereco.situacao === "completo"
                          ? "completo"
                          : c.endereco.situacao === "a_completar"
                            ? "a completar"
                            : c.endereco.situacao === "pendente"
                              ? "a confirmar"
                              : "não verificado"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{celulaDivergencias(c.comparacoes, c.possivelSaida)}</td>
                  <td>{c.origem === "pesquisa_ampla" ? "pesquisa ampla" : "oficial"}</td>
                  <td>
                    {c.possivelSaida ? (
                      <span className="text-red-600">possível saída</span>
                    ) : (
                      <SemaforoBadge status={c.semaforo} />
                    )}
                  </td>
                </tr>
              ))}
              {g.novos.map((n, i) => (
                <tr key={`novo-${i}`} className="border-t">
                  <td>{n.nome}</td>
                  <td>{n.cargo ?? (n.rotuloFonte ? `${n.rotuloFonte}${n.contexto ? ` — ${n.contexto}` : ""}` : "—")}</td>
                  <td>—</td>
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
