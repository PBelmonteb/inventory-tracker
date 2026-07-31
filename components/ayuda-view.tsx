"use client";

import { useMemo, useState } from "react";
import { HelpCircle, Search, ChevronDown, Sparkles } from "lucide-react";
import { Card, Input } from "@/components/ui";
import { normalizarTexto } from "@/lib/utils";
import { faqParaRol, type FAQCategoria } from "@/lib/faq";
import { NovedadesView } from "@/components/novedades-view";

type TabId = "faq" | "novedades";

export function AyudaView({
  esGestor,
  tabInicial,
}: {
  esGestor: boolean;
  tabInicial?: TabId;
}) {
  const [tab, setTab] = useState<TabId>(tabInicial ?? "faq");
  const [busqueda, setBusqueda] = useState("");
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

  const categorias = useMemo(() => faqParaRol(esGestor), [esGestor]);

  const filtradas = useMemo<FAQCategoria[]>(() => {
    const q = normalizarTexto(busqueda);
    if (!q) return categorias;
    return categorias
      .map((cat) => ({
        categoria: cat.categoria,
        items: cat.items.filter((item) =>
          normalizarTexto(
            item.pregunta + " " + item.pasos.join(" ") + " " + (item.nota ?? "")
          ).includes(q)
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [categorias, busqueda]);

  function toggle(pregunta: string) {
    setAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(pregunta)) next.delete(pregunta);
      else next.add(pregunta);
      return next;
    });
  }

  const sinResultados = busqueda.trim() !== "" && filtradas.length === 0;

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <div className="mb-6 flex items-center gap-2">
        <HelpCircle className="h-6 w-6 text-accent" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
            Ayuda
          </h1>
          <p className="mt-1 text-sm text-muted">
            Qué se puede hacer en la app y cómo, paso a paso.
          </p>
        </div>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
        <button
          type="button"
          onClick={() => setTab("faq")}
          className={
            "flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors " +
            (tab === "faq" ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2 hover:text-fg")
          }
        >
          <HelpCircle className="h-4 w-4" /> Preguntas frecuentes
        </button>
        <button
          type="button"
          onClick={() => setTab("novedades")}
          className={
            "flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors " +
            (tab === "novedades" ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2 hover:text-fg")
          }
        >
          <Sparkles className="h-4 w-4" /> Novedades
        </button>
      </div>

      {tab === "faq" && (
        <>
          <div className="relative mb-8">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Busca por palabra: autorizar, conteo, traslado..."
              className="pl-9"
            />
          </div>

          {sinResultados ? (
            <Card className="p-6 text-center text-sm text-muted">
              No encontramos nada con &quot;{busqueda}&quot;. Prueba con otra palabra.
            </Card>
          ) : (
            <div className="space-y-8">
              {filtradas.map((cat) => (
                <section key={cat.categoria}>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">
                    {cat.categoria}
                  </h2>
                  <Card className="divide-y divide-line overflow-hidden">
                    {cat.items.map((item) => {
                      const abierta = abiertas.has(item.pregunta);
                      return (
                        <div key={item.pregunta}>
                          <button
                            type="button"
                            onClick={() => toggle(item.pregunta)}
                            className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left hover:bg-surface-2"
                            aria-expanded={abierta}
                          >
                            <span className="text-sm font-medium text-fg">
                              {item.pregunta}
                            </span>
                            <ChevronDown
                              className={`h-4 w-4 shrink-0 text-faint transition-transform ${
                                abierta ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                          {abierta && (
                            <div className="px-4 pb-4">
                              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
                                {item.pasos.map((paso, i) => (
                                  <li key={i}>{paso}</li>
                                ))}
                              </ol>
                              {item.nota && (
                                <p className="mt-2 text-xs text-faint">
                                  {item.nota}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </Card>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "novedades" && <NovedadesView />}
    </div>
  );
}
