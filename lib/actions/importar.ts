"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeSupabase } from "@/lib/supabase/errors";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";

export interface FilaImport {
  sku?: string | null;
  nombre: string;
  descripcion?: string | null;
  categoria?: string | null;
  ubicacion?: string | null;
  proveedor?: string | null;
  unidad?: string | null;
  stock_minimo?: number;
  costo_unitario?: number;
  stock_inicial?: number;
}

export type ImportResult =
  | { ok: true; creados: number; errores: string[] }
  | { ok: false; error: string };

/** Resuelve un id de catálogo por nombre, creándolo si no existe. */
async function resolverCatalogo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tabla: "categorias" | "ubicaciones" | "proveedores",
  nombre: string | null | undefined,
  cache: Map<string, string>
): Promise<string | null> {
  const limpio = (nombre ?? "").trim();
  if (!limpio) return null;
  const clave = `${tabla}:${limpio.toLowerCase()}`;
  if (cache.has(clave)) return cache.get(clave)!;

  const { data: existente } = await supabase
    .from(tabla)
    .select("id")
    .ilike("nombre", limpio)
    .maybeSingle();

  let id = existente?.id as string | undefined;
  if (!id) {
    const { data: creado, error } = await supabase
      .from(tabla)
      .insert({ nombre: limpio })
      .select("id")
      .single();
    if (error) throw new Error(`No se pudo crear ${tabla} "${limpio}": ${mensajeSupabase(error)}`);
    id = creado!.id as string;
  }
  cache.set(clave, id!);
  return id!;
}

export async function importarMateriales(
  filas: FilaImport[]
): Promise<ImportResult> {
  if (DEMO) return importarDemo(filas);

  const supabase = await createClient();
  const cache = new Map<string, string>();
  const errores: string[] = [];
  let creados = 0;

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const nLinea = i + 2; // +2: encabezado + base 1
    try {
      if (!fila.nombre || !fila.nombre.trim()) {
        errores.push(`Fila ${nLinea}: nombre vacío, omitida`);
        continue;
      }

      const categoria_id = await resolverCatalogo(
        supabase,
        "categorias",
        fila.categoria,
        cache
      );
      const ubicacion_id = await resolverCatalogo(
        supabase,
        "ubicaciones",
        fila.ubicacion,
        cache
      );
      const proveedor_id = await resolverCatalogo(
        supabase,
        "proveedores",
        fila.proveedor,
        cache
      );

      const { data: material, error } = await supabase
        .from("materiales")
        .insert({
          sku: fila.sku?.trim() || null,
          nombre: fila.nombre.trim(),
          descripcion: fila.descripcion?.trim() || null,
          categoria_id,
          ubicacion_id,
          proveedor_id,
          unidad: fila.unidad?.trim() || "pza",
          stock_minimo: Number(fila.stock_minimo) || 0,
          costo_unitario: Number(fila.costo_unitario) || 0,
          stock_actual: 0,
        })
        .select("id")
        .single();

      if (error) {
        errores.push(`Fila ${nLinea} (${fila.nombre}): ${mensajeSupabase(error)}`);
        continue;
      }

      const inicial = Number(fila.stock_inicial) || 0;
      if (inicial > 0 && material) {
        const { error: movError } = await supabase.from("movimientos").insert({
          material_id: material.id,
          tipo: "entrada",
          cantidad: inicial,
          nota: "Carga inicial (import Excel)",
        });
        if (movError)
          errores.push(`Fila ${nLinea}: stock inicial no aplicado: ${mensajeSupabase(movError)}`);
      }

      creados++;
    } catch (err) {
      errores.push(
        `Fila ${nLinea}: ${err instanceof Error ? err.message : "error"}`
      );
    }
  }

  revalidatePath("/inventario");
  return { ok: true, creados, errores };
}

/** Import en modo demo (store en memoria). */
function importarDemo(filas: FilaImport[]): ImportResult {
  const errores: string[] = [];
  let creados = 0;

  filas.forEach((fila, i) => {
    const nLinea = i + 2;
    try {
      if (!fila.nombre || !fila.nombre.trim()) {
        errores.push(`Fila ${nLinea}: nombre vacío, omitida`);
        return;
      }
      store.crearMaterial(
        {
          sku: fila.sku?.trim() || null,
          nombre: fila.nombre.trim(),
          descripcion: fila.descripcion?.trim() || null,
          categoria_id: store.resolverCatalogo("categorias", fila.categoria),
          ubicacion_id: store.resolverCatalogo("ubicaciones", fila.ubicacion),
          proveedor_id: store.resolverCatalogo("proveedores", fila.proveedor),
          unidad: fila.unidad?.trim() || "pza",
          stock_minimo: Number(fila.stock_minimo) || 0,
          aviso_valor: 20,
          aviso_modo: "porcentaje",
          costo_unitario: Number(fila.costo_unitario) || 0,
          // El Excel importado no trae esta bandera — se activa después,
          // a mano, desde el material si aplica.
          requiere_inspeccion_calidad: false,
        },
        Number(fila.stock_inicial) || 0
      );
      creados++;
    } catch (err) {
      errores.push(
        `Fila ${nLinea}: ${err instanceof Error ? err.message : "error"}`
      );
    }
  });

  revalidatePath("/inventario");
  return { ok: true, creados, errores };
}
