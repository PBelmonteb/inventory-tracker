"use client";

// Simulador de correo entrante (solo modo demo): hace POST al mismo
// endpoint /api/email-caso que usará el Email Worker de Cloudflare,
// para demostrar el flujo "llega correo → se crea caso" sin nada externo.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label, Select } from "@/components/ui";
import type { CasoCompraConRelaciones, EstadoCasoCompra, Proveedor } from "@/lib/types";
import { CheckCircle2, MailOpen } from "lucide-react";

const EJEMPLO_ASUNTO = "Re: Cotización perfil aluminio PERF-001";
const EJEMPLO_CUERPO =
  "Buen día, les cotizamos 500 m del perfil PERF-001 en $42,750.00 MXN. Entrega en 5 días hábiles. Quedamos atentos.";

const ABIERTOS: EstadoCasoCompra[] = ["pendiente", "cotizando", "ordenado"];

type Resultado = {
  referencia: string | null;
  // Presentes solo cuando se creó un caso nuevo (no cuando se ligó a uno
  // existente vía matchReferenciaEnAsunto).
  titulo?: string;
  proveedor?: string;
  material?: string | null;
  monto_estimado?: number;
  vinculado?: boolean;
};

export function SimuladorEmail({
  open,
  onClose,
  proveedores,
  casos,
}: {
  open: boolean;
  onClose: () => void;
  proveedores: Proveedor[];
  casos: CasoCompraConRelaciones[];
}) {
  const router = useRouter();
  const conContacto = proveedores.filter((p) => p.contacto);
  const casosConCodigo = casos.filter(
    (c) => c.referencia && ABIERTOS.includes(c.estado)
  );
  const [de, setDe] = useState("");
  const [asunto, setAsunto] = useState(EJEMPLO_ASUNTO);
  const [cuerpo, setCuerpo] = useState(EJEMPLO_CUERPO);
  const [modoRespuesta, setModoRespuesta] = useState(false);
  const [casoId, setCasoId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (open) {
      setDe(conContacto[0]?.contacto ?? "");
      setAsunto(EJEMPLO_ASUNTO);
      setCuerpo(EJEMPLO_CUERPO);
      setModoRespuesta(false);
      setCasoId("");
      setError(null);
      setResultado(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // El código del caso viaja en el asunto (lib/plantillas-correo.ts) — al
  // elegir uno aquí se arma un asunto realista para probar que el webhook
  // lo liga solo (evento "correo_recibido") en vez de crear un caso nuevo.
  function elegirCasoRespuesta(id: string) {
    setCasoId(id);
    const caso = casos.find((c) => c.id === id);
    if (!caso) return;
    setAsunto(`Re: ${caso.titulo} [${caso.referencia}]`);
    setCuerpo(
      "Buen día, confirmamos el precio y las condiciones. Quedamos atentos a sus indicaciones."
    );
    const proveedor = proveedores.find((p) => p.id === caso.proveedor_id);
    if (proveedor?.contacto) setDe(proveedor.contacto);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/email-caso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          de,
          asunto,
          cuerpo,
          mensajeId: `<sim-${Date.now()}@demo.local>`,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Error al procesar el correo");
        return;
      }
      setResultado({ ...data.caso, vinculado: Boolean(data.vinculado) });
      router.refresh();
    } catch {
      setError("No se pudo contactar el endpoint");
    } finally {
      setCargando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Simular correo entrante">
      {resultado ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-emerald-500/10 px-4 py-3">
            {resultado.vinculado ? (
              <>
                <MailOpen className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div className="text-sm">
                  <p className="font-medium text-emerald-700 dark:text-emerald-400">
                    Correo ligado a un caso existente
                  </p>
                  <p className="mt-1 text-muted">
                    Se registró como evento &quot;correo recibido&quot; en el
                    timeline del caso{" "}
                    <span className="font-medium text-fg">
                      {resultado.referencia}
                    </span>{" "}
                    — no se creó un caso nuevo.
                  </p>
                </div>
              </>
            ) : (
              <>
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div className="text-sm">
                  <p className="font-medium text-emerald-700 dark:text-emerald-400">
                    Caso creado automáticamente
                  </p>
                  <p className="mt-1 text-muted">
                    <span className="font-medium text-fg">{resultado.titulo}</span>
                    {resultado.referencia && <> · {resultado.referencia}</>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Proveedor: {resultado.proveedor}
                    {resultado.material && <> · Material: {resultado.material}</>}
                    {(resultado.monto_estimado ?? 0) > 0 && (
                      <>
                        {" · Monto detectado: $"}
                        {resultado.monto_estimado!.toLocaleString("es-MX")}
                      </>
                    )}
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setResultado(null)}>
              Simular otro
            </Button>
            <Button onClick={onClose}>Ver en el pipeline</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-3">
          <p className="rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-xs text-muted">
            Esto envía el correo al mismo endpoint que usará Cloudflare Email
            Routing en producción. Solo remitentes que coinciden con el
            contacto de un proveedor crean caso.
          </p>

          {casosConCodigo.length > 0 && (
            <div className="rounded-lg border border-line bg-surface-2/40 p-2.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={modoRespuesta}
                  onChange={(e) => {
                    setModoRespuesta(e.target.checked);
                    if (!e.target.checked) setCasoId("");
                  }}
                  className="h-4 w-4 cursor-pointer rounded border-line accent-accent"
                />
                Es una respuesta a un caso existente
              </label>
              {modoRespuesta && (
                <Select
                  className="mt-2"
                  value={casoId}
                  onChange={(e) => elegirCasoRespuesta(e.target.value)}
                  aria-label="Caso al que responde este correo"
                >
                  <option value="">— Selecciona un caso —</option>
                  {casosConCodigo.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.referencia} — {c.titulo}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="sim-de">De (remitente)</Label>
            <Select
              id="sim-de"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              required
            >
              {conContacto.map((p) => (
                <option key={p.id} value={p.contacto!}>
                  {p.contacto} — {p.nombre}
                </option>
              ))}
              <option value="desconocido@spam.com">
                desconocido@spam.com — (no registrado)
              </option>
            </Select>
          </div>

          <div>
            <Label htmlFor="sim-asunto">Asunto</Label>
            <Input
              id="sim-asunto"
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="sim-cuerpo">Cuerpo del correo</Label>
            <textarea
              id="sim-cuerpo"
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-faint outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <p className="mt-1 text-xs text-faint">
              Tip: incluye un SKU (PERF-001) y un monto ($42,750.00) para ver
              el matching automático.
            </p>
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
            <Button type="submit" disabled={cargando}>
              {cargando ? "Procesando..." : "Enviar correo"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
