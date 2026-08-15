"use server";

// AI Insights — briefing gerencial generado por IA a partir de los mismos
// datos que ya calcula Análisis (reportes, clasificación ABC/XYZ, MRP,
// tendencia de KPIs). Nada de esto se llama todavía en producción: sin
// ANTHROPIC_API_KEY, se degrada con gracia igual que RESEND_API_KEY o
// VAPID_* — el botón queda ahí, pero avisa que falta configurar en vez de
// fingir un resultado. En cuanto se agregue la variable a .env.local, esta
// función ya intenta la llamada real, sin más cambios de código.
//
// Esqueleto a propósito, sin SDK nuevo: una llamada fetch directa a la
// Messages API de Anthropic, para no sumar una dependencia a package.json
// solo para dejar esto listo.

import { getCurrentProfile, esGestor } from "@/lib/auth";
import { DEMO } from "@/lib/config";
import { getReportes } from "@/lib/reportes";
import { getClasificacionABCXYZ, getCorridaMRP } from "@/lib/data";
import { getTendenciaKPIs } from "@/lib/reportes-gerenciales";

export type ResultadoInsightsIA =
  | { ok: true; briefing: string; generadoAt: string }
  | { ok: false; error: string };

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-5";

// Server Actions deben ser funciones async -- aunque esta no necesite
// esperar nada, un archivo "use server" no puede exportar una función
// síncrona (rompe el build de Next.js, no solo un lint).
export async function aiInsightsConfigurado(): Promise<boolean> {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function generarInsightsIA(): Promise<ResultadoInsightsIA> {
  const profile = await getCurrentProfile();
  if (!profile || !esGestor(profile)) return { ok: false, error: "No autorizado" };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        "AI Insights no está configurado — agrega ANTHROPIC_API_KEY a tus variables de entorno (.env.local) para activarlo.",
    };
  }
  if (DEMO) {
    return {
      ok: false,
      error: "AI Insights requiere el backend de Supabase conectado (no disponible en modo demo).",
    };
  }

  const contexto = await construirContexto();

  try {
    const respuesta = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content:
              "Eres un analista de operaciones para una PYME de manufactura que usa esta app de inventario. " +
              "Con los datos abajo (JSON), escribe un briefing breve en español, lenguaje llano (nada de jerga " +
              "técnica ni nombres de tablas/campos), con dos secciones: '## Lo más importante' (máximo 4 puntos) " +
              "y '## Sugerencias de optimización' (2-3 acciones concretas y accionables). " +
              `Datos:\n${JSON.stringify(contexto)}`,
          },
        ],
      }),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      return {
        ok: false,
        error: `La IA no respondió correctamente (${respuesta.status}): ${detalle.slice(0, 300)}`,
      };
    }

    const data = (await respuesta.json()) as {
      content?: { type: string; text?: string }[];
    };
    const briefing = data.content?.find((c) => c.type === "text")?.text ?? "";
    if (!briefing) return { ok: false, error: "La IA respondió sin contenido de texto." };

    return { ok: true, briefing, generadoAt: new Date().toISOString() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? `No se pudo conectar con la IA: ${err.message}` : "Error al conectar con la IA",
    };
  }
}

// Resumen compacto (no el historial completo) -- suficiente para que la IA
// tenga contexto real sin mandar toda la base de datos en cada llamada.
async function construirContexto() {
  const [reportes, clasificacion, mrp, tendencia] = await Promise.all([
    getReportes(),
    getClasificacionABCXYZ(),
    getCorridaMRP(),
    getTendenciaKPIs("mensual", 6),
  ]);

  return {
    inventario: {
      valorTotal: Math.round(reportes.valorTotal),
      valorEnvejecido: Math.round(reportes.valorEnvejecido),
      totalMateriales: reportes.totalMateriales,
      porComprarAhora: reportes.comprarAhora.slice(0, 10).map((m) => ({
        nombre: m.nombre,
        stock: m.stock_actual,
        minimo: m.stock_minimo,
      })),
      masEnvejecidos: reportes.materialesEnvejecidos.slice(0, 10).map((m) => ({
        nombre: m.nombre,
        valor: Math.round(m.valor),
        diasEdad: m.diasEdad,
      })),
      valorPorCategoria: reportes.porCategoria.slice(0, 8),
    },
    clasificacionABCXYZ: clasificacion
      .filter((m) => m.claseABC === "A")
      .slice(0, 10)
      .map((m) => ({
        nombre: m.nombre,
        claseABC: m.claseABC,
        claseXYZ: m.claseXYZ,
        pctValor: Math.round(m.pctValor * 10) / 10,
      })),
    mrp: {
      accionesPendientes: mrp.requerimientos.filter((r) => r.accion !== "ninguna").length,
      materialesConCicloBOM: mrp.materialesConCicloBOM.length,
    },
    tendenciaUltimos6Meses: tendencia.map((p) => ({
      periodo: p.periodoInicio,
      comprasCreadas: p.compras.casosCreados,
      comprasAutorizadas: p.compras.casosAutorizados,
      montoAutorizado: Math.round(p.compras.montoTotalAutorizado),
      ventasEntregadas: p.ventas.casosEntregados,
      montoEntregado: Math.round(p.ventas.montoEntregado),
      conteosConDiferencia: p.conteos.conDiferencia,
    })),
  };
}
