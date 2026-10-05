"use client";
import { useState } from "react";
import { Etiqueta } from "@/components/etiqueta";
import { rotuloAchadoEndereco } from "@/lib/endereco";
import {
  camposDoEndereco,
  detalhesDoContato,
  EXPLICACAO_NOVO,
  etiquetaDeEndereco,
  etiquetasDoContato,
  motivoDoContato,
  procedenciaNomeCargo,
  situacaoDoContato,
  textoDataHora,
  textoEnderecoParaCopiar,
  type CampoEndereco,
} from "@/lib/painel";
import type { ResultadoContato, ResultadoGrupo, Retrato } from "@/lib/types";

const COLUNAS = "grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,2.6fr)_minmax(0,1fr)] items-start gap-4 px-4 py-3";

function BotaoCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  if (typeof navigator === "undefined" || !navigator.clipboard) return null;
  return (
    <button
      type="button"
      className="mt-1.5 rounded border border-acao-borda bg-cartao px-2 py-0.5 text-[11px] text-acao"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        } catch {
          /* o navegador negou: o valor continua selecionável na tela */
        }
      }}
    >
      {copiado ? "Copiado" : "Copiar"}
    </button>
  );
}

function ValorDoCampo({ campo }: { campo: CampoEndereco }) {
  if (!campo.valor) return <span className="text-cinza">(vazio)</span>;
  if (!campo.excedente) return <>{campo.valor}</>;
  const cabe = campo.valor.slice(0, campo.valor.length - campo.excedente.length);
  return (
    <span className="whitespace-pre">
      {cabe}<mark className="rounded-sm bg-atencao-fundo px-0.5 text-atencao underline decoration-2">{campo.excedente}</mark>
    </span>
  );
}

function CamposDoEndereco({ campos }: { campos: CampoEndereco[] }) {
  return (
    <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
      {campos.map((campo) => (
        <div key={campo.rotulo} className="contents">
          <dt className="text-xs leading-6 text-cinza-claro">{campo.rotulo}</dt>
          <dd className={campo.tom === "atencao" ? "font-medium text-atencao" : "font-medium"}>
            <ValorDoCampo campo={campo} />
            {campo.nota && <span className={`ml-2 text-xs font-normal ${campo.tom === "atencao" ? "text-atencao" : "text-cinza"}`}>{campo.nota}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function BlocoEndereco({ c, retrato }: { c: ResultadoContato; retrato: Retrato }) {
  const a = c.endereco;
  if (!a || a.situacao === "sem_base") return null;
  const etiqueta = etiquetaDeEndereco(c);
  return (
    <div className="rounded-lg border border-atencao-borda bg-[#fffdf8] p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">Endereço</span>
        {etiqueta && <Etiqueta texto={etiqueta.texto} tom={etiqueta.tom} explicacao={etiqueta.explicacao} />}
        {retrato.planilhaEnderecos && (
          <span className="ml-auto text-xs text-cinza-claro">{retrato.planilhaEnderecos.nome}{a.endereco?.enderecoId ? ` · id ${a.endereco.enderecoId}` : ""}</span>
        )}
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-xs text-cinza-claro">No cadastro</div>
          <div className="mt-1 text-sm leading-relaxed">{c.contato.endereco?.trim() || "(vazio)"}</div>
        </div>
        <div>
          <div className="text-xs text-cinza-claro">No relatório de endereços</div>
          {a.endereco ? (
            <>
              <CamposDoEndereco campos={camposDoEndereco(a)} />
              <BotaoCopiar texto={textoEnderecoParaCopiar(a.endereco)} />
            </>
          ) : (
            <div className="mt-1 text-sm text-cinza">sem linha no relatório</div>
          )}
        </div>
      </div>
      <ul className="mt-3 space-y-1 border-t border-atencao-borda pt-3 text-xs text-atencao">
        {a.achados.map((ach) => <li key={ach}>{rotuloAchadoEndereco(ach)}</li>)}
        <li className="text-cinza">Correios: não conferido nesta versão</li>
      </ul>
    </div>
  );
}

function Detalhe({ c, g, retrato }: { c: ResultadoContato; g: ResultadoGrupo; retrato: Retrato }) {
  const cartoes = detalhesDoContato(c, g);
  const p = procedenciaNomeCargo(g);
  return (
    <div className="space-y-4 border-t border-separador bg-fundo/60 px-4 py-4">
      {cartoes.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cartoes.map((d) => (
            <div key={d.campo} className="rounded-lg border border-borda bg-cartao p-3.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{d.rotulo}</span>
                {d.etiqueta && <Etiqueta texto={d.etiqueta.texto.replace(`${d.rotulo} `, "")} tom={d.etiqueta.tom} explicacao={d.etiqueta.explicacao} />}
              </div>
              <div className="mt-2 text-xs text-cinza-claro">No cadastro</div>
              <div className="text-sm">{d.valorPlanilha || "(vazio)"}</div>
              <div className="mt-2 text-xs text-cinza-claro">{d.origem}</div>
              <div className="text-sm font-medium">{d.valorReferencia || "—"}</div>
              {d.copiavel && <BotaoCopiar texto={d.copiavel} />}
              {d.coerencias.map((t) => <div key={t} className="mt-1.5 text-xs text-atencao">{t}</div>)}
            </div>
          ))}
        </div>
      )}
      <BlocoEndereco c={c} retrato={retrato} />
      <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-cinza-claro">De onde veio cada resposta</h3>
      <ul className="mt-1 text-xs leading-relaxed text-cinza">
        {p && (
          <li>Nome e cargo: {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="text-acao underline">{p.texto}</a> : p.texto}, lido em {textoDataHora(retrato.geradoEm)}</li>
        )}
        <li>Tratamento e endereçamento: tabela de protocolo (Posse2027_TabelaTratamentos.xlsx)</li>
        {retrato.planilhaEnderecos && <li>Endereço: {retrato.planilhaEnderecos.nome}</li>}
      </ul>
      </div>
    </div>
  );
}

export function LinhaContato({ c, g, retrato }: { c: ResultadoContato; g: ResultadoGrupo; retrato: Retrato }) {
  const [aberto, setAberto] = useState(false);
  const etiquetas = etiquetasDoContato(c, g);
  const situacao = situacaoDoContato(c, g);
  const motivo = motivoDoContato(c, g);
  const subtitulo = motivo ?? [c.contato.tratamento, c.contato.enderecamento].filter(Boolean).join(" · ");
  return (
    <div className="border-t border-separador">
      <div className={`${COLUNAS} cursor-pointer hover:bg-fundo/60`} onClick={() => setAberto((v) => !v)}>
        <button type="button" aria-expanded={aberto} className="text-left">
          <span className="block text-sm font-medium text-tinta">{c.contato.nome}</span>
          {subtitulo && <span className={`block text-xs ${motivo ? "text-atencao" : "text-cinza"}`}>{subtitulo}</span>}
        </button>
        <div className="text-sm text-cinza">{c.contato.cargo ?? "—"}</div>
        <div className="flex flex-wrap gap-1.5">
          {etiquetas.map((e) => <Etiqueta key={`${e.campo}-${e.texto}`} texto={e.texto} tom={e.tom} explicacao={e.explicacao} />)}
        </div>
        <div><Etiqueta texto={situacao.texto} tom={situacao.tom} explicacao={situacao.explicacao} /></div>
      </div>
      {aberto && <Detalhe c={c} g={g} retrato={retrato} />}
    </div>
  );
}

/** `nota`: fonte rotulada ("fora de exercício: Ocupação de cargo de ministro"), quando a pessoa veio de uma fonte secundária. */
export function LinhaNovo({ nome, cargo, viaIa, nota }: { nome: string; cargo?: string; viaIa: boolean; nota?: string }) {
  return (
    <div className="border-t border-separador">
      <div className={COLUNAS}>
        <div>
          <span className="block text-sm font-medium">{nome}</span>
          <span className="block text-xs text-atencao">Está na fonte, falta no cadastro</span>
        </div>
        <div className="text-sm text-cinza">—</div>
        <div className="flex flex-wrap gap-1.5">
          {cargo && <Etiqueta texto={`Site: ${cargo}${viaIa ? " (via IA)" : ""}`} tom="neutro" explicacao={EXPLICACAO_NOVO} />}
          {nota && <Etiqueta texto={nota} tom="neutro" />}
        </div>
        <div><Etiqueta texto="Avaliar inclusão" tom="atencao" /></div>
      </div>
    </div>
  );
}

export { COLUNAS as CLASSES_COLUNAS };
