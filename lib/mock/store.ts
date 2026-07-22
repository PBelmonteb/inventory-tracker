// Store en memoria para el modo demo (sin Supabase).
// El estado vive en el proceso del servidor (se reinicia al reiniciar `npm run dev`).
// Se guarda en globalThis para sobrevivir recargas en caliente (HMR) en dev.

import type {
  AccionAuditoria,
  Auditoria,
  BomItem,
  BomItemConMaterial,
  CasoCompra,
  CasoCompraConRelaciones,
  CasoCompraEvento,
  CasoVenta,
  CasoVentaConRelaciones,
  CasoVentaItem,
  Categoria,
  Cliente,
  Convenio,
  ConvenioConRelaciones,
  EstadoCasoCompra,
  EstadoCasoVenta,
  HistorialPrecio,
  Material,
  MaterialConRelaciones,
  Movimiento,
  MovimientoConRelaciones,
  NivelNotificacion,
  Notificacion,
  NotificacionConRelaciones,
  OrigenCasoCompra,
  Profile,
  Proveedor,
  ProducibleConReceta,
  SalidaPendiente,
  SalidaPendienteConRelaciones,
  SolicitudCompra,
  SolicitudCompraConRelaciones,
  UsuarioActor,
  StockPorUbicacion,
  TipoEventoCaso,
  TipoMovimiento,
  Ubicacion,
} from "@/lib/types";
import { makeSeed, PERFIL_DEMO } from "@/lib/mock/seed-data";
import { esGestor } from "@/lib/auth";
import { puntoAviso } from "@/lib/utils";
import { calcularStockSugerido } from "@/lib/stock-sugerido";
import { calcularEOQ } from "@/lib/eoq";
import { evaluarRiesgoStock } from "@/lib/riesgo-stock";
import { esConvenioVigente } from "@/lib/convenios";
import type { ResumenReposicionAutomatica } from "@/lib/casos-automaticos";

interface DB {
  profiles: Profile[];
  categorias: Categoria[];
  ubicaciones: Ubicacion[];
  proveedores: Proveedor[];
  materiales: Material[];
  movimientos: Movimiento[];
  clientes: Cliente[];
  notificaciones: Notificacion[];
  casos_compra: CasoCompra[];
  casos_venta: CasoVenta[];
  casos_venta_items: CasoVentaItem[];
  salidas_pendientes: SalidaPendiente[];
  // Message-IDs de correos ya convertidos en caso (idempotencia del webhook).
  emails_procesados: string[];
  historial_precios: HistorialPrecio[];
  auditoria: Auditoria[];
  // Desglose de stock por ubicación (espejo de material_stock_ubicacion).
  material_stock_ubicacion: {
    material_id: string;
    ubicacion_id: string | null;
    stock: number;
    updated_at: string;
  }[];
  // Receta de producción ("1 ventana = X perfil + Y herrajes").
  bom_items: BomItem[];
  // Precio pactado + condiciones por par proveedor+material.
  convenios: Convenio[];
  // Agrupa varias cotizaciones (una por proveedor) de la misma necesidad.
  solicitudes_compra: SolicitudCompra[];
  // Timeline por caso (estilo Salesforce).
  casos_compra_eventos: CasoCompraEvento[];
}

const g = globalThis as unknown as { __inventarioDemoDB?: DB };
if (!g.__inventarioDemoDB) {
  g.__inventarioDemoDB = makeSeed();
} else {
  // Migración HMR: una BD demo creada antes de estos cambios no tiene las
  // llaves nuevas; se completan sin perder el estado existente.
  const viejo = g.__inventarioDemoDB;
  if (!viejo.casos_venta) {
    const seed = makeSeed();
    Object.assign(viejo, {
      clientes: seed.clientes,
      notificaciones: [],
      casos_compra: seed.casos_compra,
      casos_venta: seed.casos_venta,
      casos_venta_items: seed.casos_venta_items,
      salidas_pendientes: seed.salidas_pendientes,
    });
  }
  if (!viejo.emails_procesados) viejo.emails_procesados = [];
  for (const c of viejo.casos_compra) {
    if (!c.origen) c.origen = "manual";
    if (c.movimiento_id === undefined) c.movimiento_id = null;
    if (c.proveedor_nombre === undefined) {
      const p = viejo.proveedores.find((x) => x.id === c.proveedor_id);
      c.proveedor_nombre = p ? p.nombre : null;
    }
  }
  for (const c of viejo.casos_venta) {
    if (c.cliente_nombre === undefined) {
      const cl = viejo.clientes.find((x) => x.id === c.cliente_id);
      c.cliente_nombre = cl ? cl.nombre : null;
    }
  }
  // Campos de aviso por material (feature posterior).
  for (const m of viejo.materiales) {
    if (m.aviso_valor === undefined) m.aviso_valor = 20;
    if (m.aviso_modo === undefined) m.aviso_modo = "porcentaje";
  }
  // Nivel de severidad en notificaciones previas.
  for (const nn of viejo.notificaciones) {
    if (nn.nivel === undefined) nn.nivel = "bajo";
  }
  // Snapshot del material en movimientos previos (historial autónomo).
  for (const mv of viejo.movimientos) {
    if (mv.material_nombre === undefined) {
      const m = viejo.materiales.find((x) => x.id === mv.material_id);
      mv.material_nombre = m ? m.nombre : null;
      mv.material_sku = m ? m.sku : null;
    }
  }
  // Costos/precios (feature posterior).
  if (!viejo.historial_precios) viejo.historial_precios = [];
  if (!viejo.auditoria) viejo.auditoria = [];
  for (const m of viejo.materiales) {
    if (m.precio_venta === undefined) m.precio_venta = 0;
  }
  for (const mv of viejo.movimientos) {
    if (mv.costo_unitario === undefined) {
      const m = viejo.materiales.find((x) => x.id === mv.material_id);
      mv.costo_unitario = m ? m.costo_unitario : null;
    }
  }
  // Multi-ubicación (feature posterior).
  if (!viejo.material_stock_ubicacion) viejo.material_stock_ubicacion = [];
  // BOM/producción (feature posterior).
  if (!viejo.bom_items) viejo.bom_items = [];
  for (const mv of viejo.movimientos) {
    if (mv.ubicacion_id === undefined) mv.ubicacion_id = null;
  }
  // Responsable asignado (feature posterior).
  if (!viejo.profiles) viejo.profiles = makeSeed().profiles;
  for (const c of viejo.casos_compra) {
    if (c.responsable_id === undefined) c.responsable_id = null;
    if (c.responsable_nombre === undefined) c.responsable_nombre = null;
  }
  for (const c of viejo.casos_venta) {
    if (c.responsable_id === undefined) c.responsable_id = null;
    if (c.responsable_nombre === undefined) c.responsable_nombre = null;
  }
  for (const sp of viejo.salidas_pendientes) {
    if (sp.responsable_id === undefined) sp.responsable_id = null;
    if (sp.responsable_nombre === undefined) sp.responsable_nombre = null;
  }
  for (const nn of viejo.notificaciones) {
    if (nn.tipo === undefined) nn.tipo = "stock";
    if (nn.usuario_id === undefined) nn.usuario_id = null;
    if ((nn as { caso_venta_id?: unknown }).caso_venta_id === undefined)
      (nn as unknown as { caso_venta_id: string | null }).caso_venta_id = null;
    if ((nn as { salida_pendiente_id?: unknown }).salida_pendiente_id === undefined)
      (nn as unknown as { salida_pendiente_id: string | null }).salida_pendiente_id = null;
  }
  // Reposición automática (feature posterior).
  for (const p of viejo.proveedores) {
    if (p.dias_entrega_declarado === undefined) p.dias_entrega_declarado = null;
  }
  for (const c of viejo.casos_compra) {
    if (c.nivel_riesgo === undefined) c.nivel_riesgo = null;
    if (c.dias_cobertura_restante === undefined) c.dias_cobertura_restante = null;
    if (c.lead_time_dias_usado === undefined) c.lead_time_dias_usado = null;
  }
  // Convenios con proveedores (feature posterior).
  if (!viejo.convenios) viejo.convenios = [];
  // Solicitudes de compra + timeline (feature posterior).
  if (!viejo.solicitudes_compra) viejo.solicitudes_compra = [];
  if (!viejo.casos_compra_eventos) viejo.casos_compra_eventos = [];
  for (const c of viejo.casos_compra) {
    if (c.solicitud_id === undefined) c.solicitud_id = null;
  }
}
const db: DB = g.__inventarioDemoDB;

// Estados de caso de compra que cuentan como "abierto" (suprimen alertas
// nuevas del mismo material y entran al pipeline).
const CASO_COMPRA_ABIERTO: EstadoCasoCompra[] = [
  "pendiente",
  "cotizando",
  "ordenado",
];

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Bitácora de auditoría (espejo de los triggers de la BD real).
const ENTIDAD_DE: Record<string, Auditoria["entidad"]> = {
  categorias: "categoria",
  ubicaciones: "ubicacion",
  proveedores: "proveedor",
  clientes: "cliente",
};
function logAudit(
  accion: AccionAuditoria,
  entidad: Auditoria["entidad"],
  entidad_id: string,
  entidad_nombre: string
) {
  db.auditoria.unshift({
    id: uid(),
    usuario_id: PERFIL_DEMO.id,
    usuario_nombre: PERFIL_DEMO.nombre,
    accion,
    entidad,
    entidad_id,
    entidad_nombre,
    created_at: new Date().toISOString(),
  });
}

// Notificación de asignación (in-app): la usan casos de compra/venta y
// salidas pendientes al ponerles un responsable. Espejo de las RPCs
// `asignar_responsable_*` de la BD real (0012_responsables.sql).
function notificarAsignacion(
  usuario_id: string,
  mensaje: string,
  refs: {
    caso_compra_id?: string | null;
    caso_venta_id?: string | null;
    salida_pendiente_id?: string | null;
  }
): void {
  db.notificaciones.push({
    id: uid(),
    material_id: null,
    proveedor_id: null,
    mensaje,
    estado: "abierta",
    nivel: null,
    tipo: "asignacion",
    usuario_id,
    caso_compra_id: refs.caso_compra_id ?? null,
    caso_venta_id: refs.caso_venta_id ?? null,
    salida_pendiente_id: refs.salida_pendiente_id ?? null,
    created_at: new Date().toISOString(),
    resuelta_at: null,
  });
}

/* ---------------- Joins ---------------- */
function conRelaciones(m: Material): MaterialConRelaciones {
  const cat = db.categorias.find((c) => c.id === m.categoria_id);
  const ubi = db.ubicaciones.find((u) => u.id === m.ubicacion_id);
  const prov = db.proveedores.find((p) => p.id === m.proveedor_id);
  return {
    ...m,
    categorias: cat ? { id: cat.id, nombre: cat.nombre } : null,
    ubicaciones: ubi ? { id: ubi.id, nombre: ubi.nombre } : null,
    proveedores: prov ? { id: prov.id, nombre: prov.nombre } : null,
  };
}

/* ---------------- Lecturas ---------------- */
export const store = {
  getMateriales(): MaterialConRelaciones[] {
    return db.materiales
      .filter((m) => m.activo)
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map(conRelaciones);
  },

  getMaterial(id: string): MaterialConRelaciones | null {
    const m = db.materiales.find((x) => x.id === id);
    return m ? conRelaciones(m) : null;
  },

  getHistorialPrecios(materialId: string): HistorialPrecio[] {
    return db.historial_precios
      .filter((h) => h.material_id === materialId)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  },

  getHistorialPreciosTodos(): HistorialPrecio[] {
    return [...db.historial_precios].sort((a, b) =>
      a.created_at < b.created_at ? -1 : 1
    );
  },

  // Stock comprometido por material: items de casos de venta confirmados o en
  // producción, más las salidas pendientes por confirmar. (Disponible = físico
  // − comprometido.)
  getComprometidoPorMaterial(): Record<string, number> {
    const map: Record<string, number> = {};
    const add = (id: string, qty: number) => {
      map[id] = (map[id] ?? 0) + qty;
    };
    const casosComprometidos = new Set(
      db.casos_venta
        .filter((c) => c.estado === "confirmado" || c.estado === "en_produccion")
        .map((c) => c.id)
    );
    for (const it of db.casos_venta_items) {
      if (casosComprometidos.has(it.caso_venta_id)) add(it.material_id, it.cantidad);
    }
    for (const sp of db.salidas_pendientes) {
      if (sp.estado === "pendiente") add(sp.material_id, sp.cantidad);
    }
    return map;
  },

  getAuditoria(limite = 200): Auditoria[] {
    return [...db.auditoria]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, limite);
  },

  getMovimientosDeMaterial(materialId: string): MovimientoConRelaciones[] {
    return db.movimientos
      .filter((mv) => mv.material_id === materialId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((mv) => {
        const u = mv.ubicacion_id
          ? db.ubicaciones.find((x) => x.id === mv.ubicacion_id)
          : undefined;
        return {
          ...mv,
          materiales: null,
          profiles: { id: PERFIL_DEMO.id, nombre: PERFIL_DEMO.nombre },
          ubicaciones: u ? { id: u.id, nombre: u.nombre } : null,
        };
      });
  },

  getMovimientosRecientes(limite = 50): MovimientoConRelaciones[] {
    return [...db.movimientos]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, limite)
      .map((mv) => {
        const m = db.materiales.find((x) => x.id === mv.material_id);
        const u = mv.ubicacion_id
          ? db.ubicaciones.find((x) => x.id === mv.ubicacion_id)
          : undefined;
        return {
          ...mv,
          materiales: m
            ? { id: m.id, nombre: m.nombre, sku: m.sku, unidad: m.unidad }
            : null,
          profiles: { id: PERFIL_DEMO.id, nombre: PERFIL_DEMO.nombre },
          ubicaciones: u ? { id: u.id, nombre: u.nombre } : null,
        };
      });
  },

  getSalidas(): { material_id: string; created_at: string }[] {
    return db.movimientos
      .filter((mv) => mv.tipo === "salida" && mv.material_id !== null)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((mv) => ({
        material_id: mv.material_id as string,
        created_at: mv.created_at,
      }));
  },

  getCategorias: () =>
    [...db.categorias].sort((a, b) => a.nombre.localeCompare(b.nombre)),
  getUbicaciones: () =>
    [...db.ubicaciones].sort((a, b) => a.nombre.localeCompare(b.nombre)),
  getProveedores: () =>
    [...db.proveedores].sort((a, b) => a.nombre.localeCompare(b.nombre)),
  getUsuarios: () =>
    [...db.profiles].sort((a, b) => a.nombre.localeCompare(b.nombre)),

  /* ---------------- Movimientos ---------------- */
  aplicarMovimiento(
    material_id: string,
    tipo: TipoMovimiento,
    cantidad: number,
    extra?: {
      nota?: string | null;
      referencia?: string | null;
      costo?: number | null;
      ubicacion_id?: string | null;
    }
  ): Movimiento {
    const m = db.materiales.find((x) => x.id === material_id);
    if (!m) throw new Error("Material no encontrado");
    if (tipo !== "ajuste" && cantidad <= 0)
      throw new Error("La cantidad debe ser mayor a cero");

    const home = m.ubicacion_id;
    const loc = extra?.ubicacion_id ?? home;
    const buscarFila = (u: string | null) =>
      db.material_stock_ubicacion.find(
        (r) => r.material_id === material_id && r.ubicacion_id === u
      );

    // Valida ANTES de mutar nada: stock disponible en ESA ubicación, no el
    // total del material (consistente con el bloqueo de sobreventa).
    if (tipo === "salida") {
      const filaSalida = buscarFila(loc);
      const disponible = filaSalida
        ? filaSalida.stock
        : loc === home
          ? m.stock_actual
          : 0;
      if (disponible < cantidad)
        throw new Error(
          `Stock insuficiente en esa ubicación: disponible ${disponible}, solicitado ${cantidad}`
        );
    }

    const now = new Date().toISOString();
    // Costo del movimiento: en entrada con costo dado, recalcula el WAC con
    // la existencia ANTES de sumar; si no, snapshot al WAC vigente.
    // (El WAC es a nivel material, no por ubicación.)
    const costoEntrada = extra?.costo ?? null;
    let costoSnapshot = m.costo_unitario;
    if (tipo === "entrada" && costoEntrada && costoEntrada > 0) {
      const total = m.stock_actual + cantidad;
      const wac =
        total > 0
          ? (m.stock_actual * m.costo_unitario + cantidad * costoEntrada) / total
          : costoEntrada;
      m.costo_unitario = Math.round(wac * 100) / 100;
      costoSnapshot = costoEntrada;
      db.historial_precios.push({
        id: uid(),
        material_id,
        material_nombre: m.nombre,
        material_sku: m.sku,
        tipo: "costo",
        valor: costoEntrada,
        fuente: "compra",
        proveedor_id: m.proveedor_id,
        cantidad,
        created_at: now,
      });
    }

    // Si este movimiento toca una ubicación distinta a la de por defecto y
    // esa ubicación por defecto aún no tiene fila explícita, la
    // materializamos (para no perder ese stock al sumar por ubicación).
    if (loc !== home && !buscarFila(home)) {
      db.material_stock_ubicacion.push({
        material_id,
        ubicacion_id: home,
        stock: m.stock_actual,
        updated_at: now,
      });
    }

    let fila = buscarFila(loc);
    if (!fila) {
      fila = {
        material_id,
        ubicacion_id: loc,
        stock: loc === home ? m.stock_actual : 0,
        updated_at: now,
      };
      db.material_stock_ubicacion.push(fila);
    }
    if (tipo === "entrada") fila.stock += cantidad;
    else if (tipo === "salida") fila.stock -= cantidad;
    else fila.stock = cantidad; // ajuste: valor absoluto para ESA ubicación
    fila.updated_at = now;

    // El total del material es la suma de todas sus ubicaciones conocidas.
    m.stock_actual = db.material_stock_ubicacion
      .filter((r) => r.material_id === material_id)
      .reduce((s, r) => s + r.stock, 0);
    m.updated_at = now;

    const mov: Movimiento = {
      id: uid(),
      material_id,
      tipo,
      cantidad,
      usuario_id: PERFIL_DEMO.id,
      nota: extra?.nota ?? null,
      referencia: extra?.referencia ?? null,
      // Snapshot: el historial conserva el material aunque luego se elimine.
      material_nombre: m.nombre,
      material_sku: m.sku,
      costo_unitario: costoSnapshot,
      ubicacion_id: loc,
      created_at: now,
    };
    db.movimientos.push(mov);
    return mov;
  },

  getStockPorUbicacion(materialId: string): StockPorUbicacion[] {
    const m = db.materiales.find((x) => x.id === materialId);
    if (!m) return [];
    const filas = db.material_stock_ubicacion.filter(
      (r) => r.material_id === materialId
    );
    const nombreDe = (u: string | null) =>
      db.ubicaciones.find((x) => x.id === u)?.nombre ?? "Sin ubicación";
    if (filas.length === 0) {
      return [
        {
          ubicacion_id: m.ubicacion_id,
          ubicacion_nombre: nombreDe(m.ubicacion_id),
          stock: m.stock_actual,
        },
      ];
    }
    return filas
      .map((f) => ({
        ubicacion_id: f.ubicacion_id,
        ubicacion_nombre: nombreDe(f.ubicacion_id),
        stock: f.stock,
      }))
      .sort((a, b) => b.stock - a.stock);
  },

  // Desglose por ubicación de TODOS los materiales activos, en un solo
  // recorrido (para reportes agregados, sin N llamadas por material).
  getStockPorUbicacionTodos(): Record<string, StockPorUbicacion[]> {
    const nombreDe = (u: string | null) =>
      db.ubicaciones.find((x) => x.id === u)?.nombre ?? "Sin ubicación";
    const porMaterial: Record<string, StockPorUbicacion[]> = {};
    const conFilas = new Set<string>();
    for (const f of db.material_stock_ubicacion) {
      (porMaterial[f.material_id] ??= []).push({
        ubicacion_id: f.ubicacion_id,
        ubicacion_nombre: nombreDe(f.ubicacion_id),
        stock: f.stock,
      });
      conFilas.add(f.material_id);
    }
    for (const m of db.materiales) {
      if (m.activo && !conFilas.has(m.id)) {
        porMaterial[m.id] = [
          {
            ubicacion_id: m.ubicacion_id,
            ubicacion_nombre: nombreDe(m.ubicacion_id),
            stock: m.stock_actual,
          },
        ];
      }
    }
    return porMaterial;
  },

  transferirStock(
    material_id: string,
    origen_id: string,
    destino_id: string,
    cantidad: number,
    nota?: string | null
  ): void {
    if (origen_id === destino_id)
      throw new Error("El origen y destino deben ser distintos");
    if (!(cantidad > 0)) throw new Error("La cantidad debe ser mayor a cero");
    const origen = db.ubicaciones.find((u) => u.id === origen_id);
    const destino = db.ubicaciones.find((u) => u.id === destino_id);
    const ref = `TRASLADO-${uid().slice(0, 8)}`;
    store.aplicarMovimiento(material_id, "salida", cantidad, {
      nota: nota ?? `Traslado a ${destino?.nombre ?? "otra ubicación"}`,
      referencia: ref,
      ubicacion_id: origen_id,
    });
    store.aplicarMovimiento(material_id, "entrada", cantidad, {
      nota: nota ?? `Traslado desde ${origen?.nombre ?? "otra ubicación"}`,
      referencia: ref,
      ubicacion_id: destino_id,
    });
  },

  /* ---------------- BOM / producción ---------------- */
  getBom(producto_id: string): BomItemConMaterial[] {
    return db.bom_items
      .filter((b) => b.producto_id === producto_id)
      .map((b) => {
        const c = db.materiales.find((m) => m.id === b.componente_id);
        return {
          ...b,
          componente: c
            ? {
                id: c.id,
                nombre: c.nombre,
                sku: c.sku,
                unidad: c.unidad,
                stock_actual: c.stock_actual,
              }
            : { id: b.componente_id, nombre: "(eliminado)", sku: null, unidad: "", stock_actual: 0 },
        };
      });
  },

  // Reemplaza toda la receta del producto (guardar = la lista completa).
  guardarBom(
    producto_id: string,
    items: { componente_id: string; cantidad_por_unidad: number }[]
  ): void {
    for (const it of items) {
      if (it.componente_id === producto_id)
        throw new Error("Un material no puede consumirse a sí mismo en su propia receta");
      if (!(it.cantidad_por_unidad > 0))
        throw new Error("La cantidad por unidad debe ser mayor a cero");
    }
    const ids = items.map((i) => i.componente_id);
    if (new Set(ids).size !== ids.length)
      throw new Error("Hay un componente repetido en la receta");

    db.bom_items = db.bom_items.filter((b) => b.producto_id !== producto_id);
    const now = new Date().toISOString();
    for (const it of items) {
      db.bom_items.push({
        id: uid(),
        producto_id,
        componente_id: it.componente_id,
        cantidad_por_unidad: it.cantidad_por_unidad,
        created_at: now,
      });
    }
  },

  // Materiales que tienen al menos una receta configurada.
  getProducibles(): ProducibleConReceta[] {
    const productoIds = [...new Set(db.bom_items.map((b) => b.producto_id))];
    return productoIds
      .map((id) => db.materiales.find((m) => m.id === id))
      .filter((m): m is Material => !!m && m.activo)
      .map((m) => ({
        producto: conRelaciones(m),
        receta: store.getBom(m.id),
      }));
  },

  // Consume los componentes de la receta y genera el producto terminado.
  // Sin transacciones reales en el store en memoria: se valida disponible de
  // TODOS los componentes antes de mover cualquier stock (a diferencia de la
  // RPC en Postgres, que aborta y deshace todo solo con la excepción del
  // trigger — aquí hay que adelantarse para no dejar un estado a medias).
  producir(
    producto_id: string,
    cantidad: number,
    ubicacion_id?: string | null
  ): Movimiento {
    if (!(cantidad > 0))
      throw new Error("La cantidad a producir debe ser mayor a cero");
    const producto = db.materiales.find((m) => m.id === producto_id);
    if (!producto) throw new Error("Producto no encontrado");

    const receta = db.bom_items.filter((b) => b.producto_id === producto_id);
    if (receta.length === 0)
      throw new Error("Este material no tiene una receta de producción configurada");

    for (const item of receta) {
      const componente = db.materiales.find((m) => m.id === item.componente_id);
      if (!componente) throw new Error("Un componente de la receta ya no existe");
      const requerido = item.cantidad_por_unidad * cantidad;
      const loc = ubicacion_id ?? componente.ubicacion_id;
      const fila = db.material_stock_ubicacion.find(
        (r) => r.material_id === item.componente_id && r.ubicacion_id === loc
      );
      const disponible = fila
        ? fila.stock
        : loc === componente.ubicacion_id
          ? componente.stock_actual
          : 0;
      if (disponible < requerido)
        throw new Error(
          `Sin disponible de "${componente.nombre}": requeridos ${requerido}, disponibles ${disponible}`
        );
    }

    const ref = `PROD-${uid().slice(0, 8)}`;
    let costoTotal = 0;
    for (const item of receta) {
      const componente = db.materiales.find((m) => m.id === item.componente_id)!;
      const requerido = item.cantidad_por_unidad * cantidad;
      costoTotal += requerido * componente.costo_unitario;
      store.aplicarMovimiento(item.componente_id, "salida", requerido, {
        nota: `Producción: ${producto.nombre}`,
        referencia: ref,
        ubicacion_id: ubicacion_id ?? null,
      });
    }

    const costoUnitarioProducto = Math.round((costoTotal / cantidad) * 100) / 100;
    return store.aplicarMovimiento(producto_id, "entrada", cantidad, {
      nota: "Producción",
      referencia: ref,
      costo: costoUnitarioProducto,
      ubicacion_id: ubicacion_id ?? null,
    });
  },

  /* ---------------- Materiales ---------------- */
  crearMaterial(
    data: Omit<
      Material,
      | "id"
      | "stock_actual"
      | "activo"
      | "created_at"
      | "updated_at"
      | "precio_venta"
    > & { precio_venta?: number },
    stockInicial = 0
  ): Material {
    const now = new Date().toISOString();
    const material: Material = {
      ...data,
      precio_venta: data.precio_venta ?? 0,
      id: uid(),
      stock_actual: 0,
      activo: true,
      created_at: now,
      updated_at: now,
    };
    db.materiales.push(material);
    logAudit("crear", "material", material.id, material.nombre);
    const ahora = new Date().toISOString();
    if (material.costo_unitario > 0) {
      db.historial_precios.push({
        id: uid(),
        material_id: material.id,
        material_nombre: material.nombre,
        material_sku: material.sku,
        tipo: "costo",
        valor: material.costo_unitario,
        fuente: "inicial",
        proveedor_id: material.proveedor_id,
        cantidad: null,
        created_at: ahora,
      });
    }
    if (material.precio_venta > 0) {
      db.historial_precios.push({
        id: uid(),
        material_id: material.id,
        material_nombre: material.nombre,
        material_sku: material.sku,
        tipo: "venta",
        valor: material.precio_venta,
        fuente: "manual",
        proveedor_id: null,
        cantidad: null,
        created_at: ahora,
      });
    }
    if (stockInicial > 0) {
      store.aplicarMovimiento(material.id, "entrada", stockInicial, {
        nota: "Stock inicial",
      });
    }
    return material;
  },

  actualizarMaterial(
    id: string,
    data: Partial<Omit<Material, "id" | "stock_actual">>
  ): void {
    const m = db.materiales.find((x) => x.id === id);
    if (!m) throw new Error("Material no encontrado");
    const precioAnterior = m.precio_venta;
    Object.assign(m, data, { updated_at: new Date().toISOString() });
    logAudit("editar", "material", m.id, m.nombre);
    // Registra el cambio de precio de venta en el historial.
    if (
      data.precio_venta !== undefined &&
      data.precio_venta !== precioAnterior &&
      data.precio_venta > 0
    ) {
      db.historial_precios.push({
        id: uid(),
        material_id: m.id,
        material_nombre: m.nombre,
        material_sku: m.sku,
        tipo: "venta",
        valor: m.precio_venta,
        fuente: "manual",
        proveedor_id: null,
        cantidad: null,
        created_at: new Date().toISOString(),
      });
    }
  },

  eliminarMaterial(id: string): void {
    // Baja lógica: el material desaparece del inventario pero NO se borra,
    // y sus movimientos quedan intactos (historial autónomo).
    const m = db.materiales.find((x) => x.id === id);
    if (!m) throw new Error("Material no encontrado");
    m.activo = false;
    m.updated_at = new Date().toISOString();
    logAudit("eliminar", "material", m.id, m.nombre);
  },

  /* ---------------- Catálogos ---------------- */
  crearCatalogo(
    tabla: "categorias" | "ubicaciones" | "proveedores" | "clientes",
    nombre: string,
    contacto?: string | null,
    diasEntregaDeclarado?: number | null
  ): { id: string } {
    const limpio = nombre.trim();
    if (!limpio) throw new Error("El nombre es obligatorio");
    const lista = db[tabla];
    if (lista.some((x) => x.nombre.toLowerCase() === limpio.toLowerCase()))
      throw new Error("Ya existe un elemento con ese nombre");
    const item = {
      id: uid(),
      nombre: limpio,
      created_at: new Date().toISOString(),
      ...(tabla === "proveedores" || tabla === "clientes"
        ? { contacto: contacto?.trim() || null }
        : {}),
      ...(tabla === "proveedores"
        ? { dias_entrega_declarado: diasEntregaDeclarado ?? null }
        : {}),
    };
    // @ts-expect-error: unión de tipos de catálogo
    lista.push(item);
    logAudit("crear", ENTIDAD_DE[tabla], item.id, item.nombre);
    return { id: item.id };
  },

  // Edita el contacto/tiempo de entrega de un proveedor existente (no hay
  // formulario de edición para categorías/ubicaciones/clientes todavía).
  actualizarProveedor(
    id: string,
    data: { contacto: string | null; dias_entrega_declarado: number | null }
  ): void {
    const p = db.proveedores.find((x) => x.id === id);
    if (!p) throw new Error("Proveedor no encontrado");
    p.contacto = data.contacto;
    p.dias_entrega_declarado = data.dias_entrega_declarado;
    logAudit("editar", "proveedor", p.id, p.nombre);
  },

  eliminarCatalogo(
    tabla: "categorias" | "ubicaciones" | "proveedores" | "clientes",
    id: string
  ): void {
    const lista = db[tabla];
    const i = lista.findIndex((x) => x.id === id);
    if (i >= 0) {
      const nombre = lista[i].nombre;
      lista.splice(i, 1);
      // Espejo del ON DELETE SET NULL: preserva los casos (con su snapshot).
      if (tabla === "proveedores") {
        for (const c of db.casos_compra)
          if (c.proveedor_id === id) c.proveedor_id = null;
      } else if (tabla === "clientes") {
        for (const c of db.casos_venta)
          if (c.cliente_id === id) c.cliente_id = null;
      }
      logAudit("eliminar", ENTIDAD_DE[tabla], id, nombre);
    }
  },

  resolverCatalogo(
    tabla: "categorias" | "ubicaciones" | "proveedores",
    nombre: string | null | undefined
  ): string | null {
    const limpio = (nombre ?? "").trim();
    if (!limpio) return null;
    const lista = db[tabla];
    const existente = lista.find(
      (x) => x.nombre.toLowerCase() === limpio.toLowerCase()
    );
    if (existente) return existente.id;
    return store.crearCatalogo(tabla, limpio).id;
  },

  /* ---------------- Notificaciones (portal de proveedores) ---------------- */

  // Idempotente: reconcilia las notificaciones contra el stock actual.
  // En producción esto será el rpc `sincronizar_notificaciones`.
  sincronizarNotificaciones(): void {
    const now = new Date().toISOString();
    const mensajeDe = (m: Material, nivel: NivelNotificacion) =>
      nivel === "bajo"
        ? `Stock bajo: ${m.nombre} (${m.stock_actual}/${m.stock_minimo} ${m.unidad}). Solicita cotización.`
        : `Por agotarse: ${m.nombre} (${m.stock_actual} ${m.unidad}, mínimo ${m.stock_minimo}). Conviene cotizar.`;

    // 1. Auto-resolución: el stock subió por encima del punto de aviso
    //    (o el material ya no existe / está inactivo).
    // Solo aplica a alertas de stock — las de asignación no tienen
    // material_id y las resuelve el usuario (descartar), no este sync.
    for (const n of db.notificaciones) {
      if (n.estado === "atendida" || n.tipo !== "stock") continue;
      const m = db.materiales.find((x) => x.id === n.material_id);
      if (
        !m ||
        !m.activo ||
        m.stock_minimo <= 0 || // sin mínimo configurado: ya no aplica avisar
        m.stock_actual > puntoAviso(m)
      ) {
        n.estado = "atendida";
        n.resuelta_at = now;
      }
    }

    // 2. Ajuste de nivel: una alerta viva que cambió de aviso<->bajo.
    for (const n of db.notificaciones) {
      if (n.estado !== "abierta") continue;
      const m = db.materiales.find((x) => x.id === n.material_id);
      if (!m) continue;
      const nivel: NivelNotificacion =
        m.stock_actual <= m.stock_minimo ? "bajo" : "aviso";
      if (n.nivel !== nivel) {
        n.nivel = nivel;
        n.mensaje = mensajeDe(m, nivel);
      }
    }

    // 3. Generación: material en zona de aviso o bajo, sin alerta viva
    //    ni caso de compra abierto. Se ignoran los materiales sin mínimo
    //    configurado (stock_minimo = 0 = "sin definir", no "el mínimo es 0").
    for (const m of db.materiales) {
      if (!m.activo || m.stock_minimo <= 0 || m.stock_actual > puntoAviso(m))
        continue;
      const bloqueado =
        db.notificaciones.some(
          (n) => n.material_id === m.id && n.estado !== "atendida"
        ) ||
        db.casos_compra.some(
          (c) =>
            c.material_id === m.id && CASO_COMPRA_ABIERTO.includes(c.estado)
        );
      if (bloqueado) continue;
      const nivel: NivelNotificacion =
        m.stock_actual <= m.stock_minimo ? "bajo" : "aviso";
      db.notificaciones.push({
        id: uid(),
        material_id: m.id,
        proveedor_id: m.proveedor_id,
        mensaje: mensajeDe(m, nivel),
        estado: "abierta",
        nivel,
        tipo: "stock",
        usuario_id: null,
        caso_compra_id: null,
        caso_venta_id: null,
        salida_pendiente_id: null,
        created_at: now,
        resuelta_at: null,
      });
    }
  },

  getNotificaciones(): NotificacionConRelaciones[] {
    return db.notificaciones
      .filter(
        (n) =>
          n.estado !== "atendida" &&
          // Espeja la RLS real: alertas globales para todos, de asignación
          // solo para su destinatario o un gestor (visibilidad de equipo).
          (n.tipo === "stock" ||
            n.usuario_id === PERFIL_DEMO.id ||
            esGestor(PERFIL_DEMO))
      )
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((n) => {
        const m = db.materiales.find((x) => x.id === n.material_id);
        const p = db.proveedores.find((x) => x.id === n.proveedor_id);
        return {
          ...n,
          materiales: m
            ? {
                id: m.id,
                nombre: m.nombre,
                sku: m.sku,
                unidad: m.unidad,
                stock_actual: m.stock_actual,
                stock_minimo: m.stock_minimo,
              }
            : null,
          proveedores: p
            ? { id: p.id, nombre: p.nombre, contacto: p.contacto }
            : null,
        };
      });
  },

  descartarNotificacion(id: string): void {
    const n = db.notificaciones.find((x) => x.id === id);
    if (!n) throw new Error("Notificación no encontrada");
    n.estado = "descartada";
    n.resuelta_at = new Date().toISOString();
  },

  /* ---------------- Casos de compra ---------------- */

  getCasosCompra(): CasoCompraConRelaciones[] {
    return [...db.casos_compra]
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
      .map((c) => {
        const p = db.proveedores.find((x) => x.id === c.proveedor_id);
        const m = db.materiales.find((x) => x.id === c.material_id);
        const s = c.solicitud_id
          ? db.solicitudes_compra.find((x) => x.id === c.solicitud_id)
          : undefined;
        return {
          ...c,
          proveedores: p ? { id: p.id, nombre: p.nombre } : null,
          materiales: m ? { id: m.id, nombre: m.nombre, sku: m.sku } : null,
          solicitudes_compra: s ? { codigo: s.codigo } : null,
        };
      });
  },

  crearCasoCompra(
    data: {
      proveedor_id: string;
      material_id: string | null;
      titulo: string;
      descripcion: string | null;
      monto_estimado: number;
      referencia: string | null;
      origen?: OrigenCasoCompra;
      estado?: EstadoCasoCompra;
      responsable_id?: string | null;
      solicitud_id?: string | null;
    },
    notificacion_id?: string
  ): CasoCompra {
    const prov = db.proveedores.find((p) => p.id === data.proveedor_id);
    if (!prov) throw new Error("Proveedor no encontrado");
    if (!data.titulo.trim()) throw new Error("El título es obligatorio");
    const now = new Date().toISOString();
    const caso: CasoCompra = {
      ...data,
      titulo: data.titulo.trim(),
      origen: data.origen ?? "manual",
      id: uid(),
      estado: data.estado ?? "pendiente",
      movimiento_id: null,
      proveedor_nombre: prov.nombre,
      responsable_id: null,
      responsable_nombre: null,
      nivel_riesgo: null,
      dias_cobertura_restante: null,
      lead_time_dias_usado: null,
      correo_enviado_at: null,
      solicitud_id: data.solicitud_id ?? null,
      created_at: now,
      updated_at: now,
    };
    db.casos_compra.push(caso);
    if (notificacion_id) {
      const n = db.notificaciones.find((x) => x.id === notificacion_id);
      if (n) {
        n.estado = "atendida";
        n.caso_compra_id = caso.id;
        n.resuelta_at = now;
      }
    }
    if (data.responsable_id) {
      store.asignarResponsableCasoCompra(caso.id, data.responsable_id);
    }
    return caso;
  },

  cambiarEstadoCasoCompra(
    id: string,
    estado: EstadoCasoCompra,
    actor: { id: string | null; nombre: string | null } = { id: null, nombre: null }
  ): void {
    const c = db.casos_compra.find((x) => x.id === id);
    if (!c) throw new Error("Caso de compra no encontrado");
    const anterior = c.estado;
    c.estado = estado;
    c.updated_at = new Date().toISOString();
    store.registrarEventoCaso(c.id, "estado_cambiado", `${anterior} → ${estado}`, actor);
  },

  // Asigna (o quita, si usuarioId es null) el responsable de un caso de
  // compra; si asigna a alguien, le genera la notificación in-app.
  asignarResponsableCasoCompra(
    casoId: string,
    usuarioId: string | null,
    asignadoPor?: string | null
  ): void {
    const c = db.casos_compra.find((x) => x.id === casoId);
    if (!c) throw new Error("Caso de compra no encontrado");
    let usuario: Profile | undefined;
    if (usuarioId) {
      usuario = db.profiles.find((p) => p.id === usuarioId);
      if (!usuario) throw new Error("Usuario no encontrado");
    }
    c.responsable_id = usuarioId;
    c.responsable_nombre = usuario ? usuario.nombre : null;
    c.updated_at = new Date().toISOString();
    if (usuarioId) {
      const msg = asignadoPor
        ? `${asignadoPor} te asignó el caso de compra "${c.titulo}".`
        : `Se te asignó el caso de compra "${c.titulo}".`;
      notificarAsignacion(usuarioId, msg, { caso_compra_id: c.id });
    }
  },

  // Recibe un caso: crea la entrada de stock (con costo → WAC) y lo enlaza.
  recibirCasoCompra(
    id: string,
    cantidad: number,
    costo: number,
    ubicacion_id?: string | null,
    actor: { id: string | null; nombre: string | null } = { id: null, nombre: null }
  ): void {
    const c = db.casos_compra.find((x) => x.id === id);
    if (!c) throw new Error("Caso de compra no encontrado");
    if (c.movimiento_id) throw new Error("Este caso ya fue recibido");
    if (!c.material_id)
      throw new Error("El caso no tiene un material asignado");
    if (!(cantidad > 0)) throw new Error("La cantidad debe ser mayor a cero");

    const mov = store.aplicarMovimiento(c.material_id, "entrada", cantidad, {
      nota: `Recepción: ${c.titulo}`,
      referencia: c.referencia,
      costo: costo > 0 ? costo : null,
      ubicacion_id: ubicacion_id ?? null,
    });
    c.estado = "recibido";
    c.movimiento_id = mov.id;
    c.updated_at = new Date().toISOString();
    store.registrarEventoCaso(c.id, "estado_cambiado", "recibido", actor);
    if (c.solicitud_id) store.resolverSolicitud(c.solicitud_id, c.id);
  },

  // Envía cotización para un caso YA EXISTENTE (link del título en
  // /proveedores): actualiza título/descripción y solo avanza
  // pendiente -> cotizando, sin crear un caso nuevo ni retroceder uno que
  // ya esté más adelante.
  enviarCotizacionCasoExistente(
    casoId: string,
    titulo: string,
    descripcion: string | null,
    montoEstimado: number | null = null
  ): void {
    const c = db.casos_compra.find((x) => x.id === casoId);
    if (!c) throw new Error("Caso de compra no encontrado");
    c.titulo = titulo;
    c.descripcion = descripcion;
    if (montoEstimado !== null) c.monto_estimado = montoEstimado;
    if (c.estado === "pendiente") c.estado = "cotizando";
    c.updated_at = new Date().toISOString();
    if (c.material_id) store.atenderNotificacionesDeMaterial(c.material_id, c.id);
  },

  // Marca como atendidas las alertas abiertas de un material (al actuar
  // sobre él, p. ej. al solicitar cotización desde su detalle).
  atenderNotificacionesDeMaterial(material_id: string, caso_id?: string): void {
    const now = new Date().toISOString();
    for (const n of db.notificaciones) {
      if (n.material_id === material_id && n.estado === "abierta") {
        n.estado = "atendida";
        if (caso_id) n.caso_compra_id = caso_id;
        n.resuelta_at = now;
      }
    }
  },

  // Espejo en memoria de generarCasosAutomaticosPorStockBajo (lib/casos-
  // automaticos.ts): mismo cálculo (calcularStockSugerido + calcularEOQ +
  // evaluarRiesgoStock), pero contra los arrays del store. En producción
  // esto lo dispara el cron; en demo se engancha a cada carga de
  // getNotificaciones() para poder probar/demostrar la feature sin cron.
  generarCasosAutomaticosPorStockBajo(): ResumenReposicionAutomatica {
    const candidatos = db.materiales.filter((m) => m.activo && m.proveedor_id);
    let casosCreados = 0;

    for (const m of candidatos) {
      const proveedorId = m.proveedor_id;
      if (!proveedorId) continue;

      const yaAbierto = db.casos_compra.some(
        (c) => c.material_id === m.id && CASO_COMPRA_ABIERTO.includes(c.estado)
      );
      if (yaAbierto) continue;

      const salidas = db.movimientos
        .filter((mv) => mv.material_id === m.id && mv.tipo === "salida")
        .map((mv) => ({ cantidad: mv.cantidad, created_at: mv.created_at }));
      const comprasRecibidas = db.casos_compra
        .filter((c) => c.material_id === m.id && c.estado === "recibido")
        .map((c) => ({ created_at: c.created_at, updated_at: c.updated_at }));

      const stockSugerido = calcularStockSugerido({ salidas, comprasRecibidas });
      const eoq =
        m.costo_unitario > 0
          ? calcularEOQ({ salidas, costoUnitario: m.costo_unitario })
          : null;
      const proveedor = db.proveedores.find((p) => p.id === proveedorId);
      const convenio = db.convenios.find(
        (c) => c.proveedor_id === proveedorId && c.material_id === m.id && esConvenioVigente(c)
      );

      const riesgo = evaluarRiesgoStock({
        stockActual: m.stock_actual,
        stockMinimo: m.stock_minimo,
        proveedorDiasEntrega:
          convenio?.dias_entrega_pactado ?? proveedor?.dias_entrega_declarado ?? null,
        stockSugerido,
        eoq,
      });
      if (!riesgo.debeCrearCaso) continue;

      const referencia = `OC-${Date.now().toString().slice(-6)}`;
      const cantidad = Math.max(riesgo.cantidadSugerida, convenio?.cantidad_minima ?? 0);
      const precioUnitario = convenio?.precio_pactado ?? m.costo_unitario;
      const notaConvenio = convenio
        ? ` Precio según convenio vigente: $${convenio.precio_pactado.toFixed(2)}/unidad.`
        : "";
      const caso = store.crearCasoCompra({
        proveedor_id: proveedorId,
        material_id: m.id,
        titulo: `Reposición automática: ${m.nombre}`,
        descripcion: `${riesgo.motivo} Cantidad sugerida: ${cantidad} ${m.unidad}.${notaConvenio}`,
        monto_estimado: precioUnitario > 0 ? precioUnitario * cantidad : 0,
        referencia,
        origen: "stock_bajo",
      });
      caso.nivel_riesgo = riesgo.nivelRiesgo;
      caso.dias_cobertura_restante = riesgo.diasCobertura;
      caso.lead_time_dias_usado = riesgo.leadTimeUsado;

      // Opt-in por convenio: en DEMO no hay Resend real que llamar, así
      // que se simula el envío siempre con éxito (mismo criterio que
      // "Simular correo" para el webhook entrante) — deja probar el flujo
      // completo sin depender de credenciales reales.
      if (convenio?.auto_enviar) {
        if (!proveedor?.contacto) {
          caso.descripcion = `${caso.descripcion} Envío automático configurado pero el proveedor no tiene correo registrado.`;
        } else {
          caso.estado = "ordenado";
          caso.correo_enviado_at = new Date().toISOString();
          caso.descripcion = `${caso.descripcion} Orden confirmada y enviada automáticamente por convenio (simulado en modo demo).`;
        }
      }

      store.atenderNotificacionesDeMaterial(m.id, caso.id);
      db.notificaciones.push({
        id: uid(),
        material_id: m.id,
        proveedor_id: proveedorId,
        mensaje: `Se generó automáticamente el caso ${referencia} para reponer ${m.nombre} (riesgo ${riesgo.nivelRiesgo}). Revisa y asigna un responsable.`,
        estado: "abierta",
        nivel: riesgo.nivelRiesgo === "medio" ? "aviso" : "bajo",
        tipo: "stock",
        usuario_id: null,
        caso_compra_id: caso.id,
        caso_venta_id: null,
        salida_pendiente_id: null,
        created_at: new Date().toISOString(),
        resuelta_at: null,
      });
      casosCreados++;
    }

    return { materialesRevisados: candidatos.length, casosCreados };
  },

  /* ---------------- Convenios con proveedores ---------------- */

  getConvenios(): ConvenioConRelaciones[] {
    return [...db.convenios]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((c) => {
        const p = db.proveedores.find((x) => x.id === c.proveedor_id);
        const m = db.materiales.find((x) => x.id === c.material_id);
        return {
          ...c,
          proveedores: p ? { id: p.id, nombre: p.nombre } : null,
          materiales: m
            ? { id: m.id, nombre: m.nombre, sku: m.sku, unidad: m.unidad }
            : null,
        };
      });
  },

  obtenerConvenioVigente(materialId: string, proveedorId: string): Convenio | null {
    const c = db.convenios.find(
      (x) =>
        x.material_id === materialId &&
        x.proveedor_id === proveedorId &&
        esConvenioVigente(x)
    );
    return c ?? null;
  },

  crearConvenio(
    datos: Omit<Convenio, "id" | "activo" | "created_at" | "updated_at">
  ): Convenio {
    const yaExiste = db.convenios.some(
      (c) =>
        c.proveedor_id === datos.proveedor_id &&
        c.material_id === datos.material_id &&
        c.activo
    );
    if (yaExiste)
      throw new Error(
        "Ya existe un convenio activo para este proveedor y material. Desactívalo primero para crear uno nuevo."
      );

    const now = new Date().toISOString();
    const convenio: Convenio = {
      ...datos,
      id: uid(),
      activo: true,
      created_at: now,
      updated_at: now,
    };
    db.convenios.push(convenio);

    const m = db.materiales.find((x) => x.id === datos.material_id);
    db.historial_precios.push({
      id: uid(),
      material_id: datos.material_id,
      material_nombre: m?.nombre ?? null,
      material_sku: m?.sku ?? null,
      tipo: "costo",
      valor: datos.precio_pactado,
      fuente: "convenio",
      proveedor_id: datos.proveedor_id,
      cantidad: datos.cantidad_minima,
      created_at: now,
    });
    return convenio;
  },

  actualizarConvenio(
    id: string,
    datos: Omit<Convenio, "id" | "activo" | "created_at" | "updated_at">
  ): void {
    const c = db.convenios.find((x) => x.id === id);
    if (!c) throw new Error("Convenio no encontrado");
    const yaExiste = db.convenios.some(
      (x) =>
        x.id !== id &&
        x.proveedor_id === datos.proveedor_id &&
        x.material_id === datos.material_id &&
        x.activo
    );
    if (yaExiste)
      throw new Error(
        "Ya existe otro convenio activo para este proveedor y material."
      );

    const precioAnterior = c.precio_pactado;
    Object.assign(c, datos, { updated_at: new Date().toISOString() });

    if (datos.precio_pactado !== precioAnterior) {
      const m = db.materiales.find((x) => x.id === datos.material_id);
      db.historial_precios.push({
        id: uid(),
        material_id: datos.material_id,
        material_nombre: m?.nombre ?? null,
        material_sku: m?.sku ?? null,
        tipo: "costo",
        valor: datos.precio_pactado,
        fuente: "convenio",
        proveedor_id: datos.proveedor_id,
        cantidad: datos.cantidad_minima,
        created_at: new Date().toISOString(),
      });
    }
  },

  desactivarConvenio(id: string): void {
    const c = db.convenios.find((x) => x.id === id);
    if (!c) throw new Error("Convenio no encontrado");
    c.activo = false;
    c.updated_at = new Date().toISOString();
  },

  /* ---------------- Timeline de casos (estilo Salesforce) ---------------- */

  // Un solo punto de inserción reusado desde cualquier acción que toque
  // un caso — mismo rol que lib/eventos-caso.ts en el camino Supabase.
  registrarEventoCaso(
    casoId: string,
    tipo: TipoEventoCaso,
    detalle: string | null = null,
    usuario: { id: string | null; nombre: string | null } = { id: null, nombre: null }
  ): void {
    db.casos_compra_eventos.push({
      id: uid(),
      caso_compra_id: casoId,
      tipo,
      detalle,
      usuario_id: usuario.id,
      usuario_nombre: usuario.nombre,
      created_at: new Date().toISOString(),
    });
  },

  getEventosCaso(casoId: string): CasoCompraEvento[] {
    return db.casos_compra_eventos
      .filter((e) => e.caso_compra_id === casoId)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  },

  /* ---------------- Solicitudes de compra (comparar proveedores) ---------------- */

  getSolicitudConCasos(solicitudId: string): SolicitudCompraConRelaciones | null {
    const s = db.solicitudes_compra.find((x) => x.id === solicitudId);
    if (!s) return null;
    const casos = db.casos_compra
      .filter((c) => c.solicitud_id === solicitudId)
      .map((c) => {
        const p = db.proveedores.find((x) => x.id === c.proveedor_id);
        const m = db.materiales.find((x) => x.id === c.material_id);
        return {
          ...c,
          proveedores: p ? { id: p.id, nombre: p.nombre } : null,
          materiales: m ? { id: m.id, nombre: m.nombre, sku: m.sku } : null,
          solicitudes_compra: { codigo: s.codigo },
        };
      });
    return { ...s, casos };
  },

  // Si viene un solo proveedor, se comporta exactamente igual que hoy (un
  // caso suelto, sin solicitud). Con más de uno, agrupa una cotización por
  // proveedor bajo una solicitud nueva con su propio código.
  crearSolicitudCompra(
    datos: {
      proveedor_ids: string[];
      material_id: string | null;
      titulo: string;
      descripcion: string | null;
      responsable_id?: string | null;
      notificacion_id?: string | null;
    },
    actor: UsuarioActor = { id: null, nombre: null }
  ): { solicitud: SolicitudCompra | null; casos: CasoCompra[] } {
    if (datos.proveedor_ids.length === 0)
      throw new Error("Selecciona al menos un proveedor");

    if (datos.proveedor_ids.length === 1) {
      const caso = store.crearCasoCompra(
        {
          proveedor_id: datos.proveedor_ids[0],
          material_id: datos.material_id,
          titulo: datos.titulo,
          descripcion: datos.descripcion,
          monto_estimado: 0,
          referencia: `OC-${Date.now().toString().slice(-6)}`,
          responsable_id: datos.responsable_id,
          origen: datos.notificacion_id ? "stock_bajo" : "manual",
        },
        datos.notificacion_id ?? undefined
      );
      store.registrarEventoCaso(caso.id, "creado", null, actor);
      if (datos.responsable_id)
        store.asignarResponsableCasoCompra(caso.id, datos.responsable_id, actor.nombre);
      return { solicitud: null, casos: [caso] };
    }

    const now = new Date().toISOString();
    const material = datos.material_id
      ? db.materiales.find((x) => x.id === datos.material_id)
      : undefined;
    const responsable = datos.responsable_id
      ? db.profiles.find((p) => p.id === datos.responsable_id)
      : undefined;

    const solicitud: SolicitudCompra = {
      id: uid(),
      codigo: `SOL-${Date.now().toString().slice(-6)}`,
      material_id: datos.material_id,
      material_nombre: material?.nombre ?? null,
      titulo: datos.titulo,
      estado: "abierta",
      responsable_id: datos.responsable_id ?? null,
      responsable_nombre: responsable?.nombre ?? null,
      cotizacion_ganadora_id: null,
      created_at: now,
      updated_at: now,
    };
    db.solicitudes_compra.push(solicitud);

    const casos: CasoCompra[] = [];
    for (const proveedorId of datos.proveedor_ids) {
      const convenio = db.convenios.find(
        (c) =>
          c.proveedor_id === proveedorId &&
          c.material_id === datos.material_id &&
          esConvenioVigente(c)
      );
      const caso = store.crearCasoCompra({
        proveedor_id: proveedorId,
        material_id: datos.material_id,
        titulo: datos.titulo,
        descripcion: datos.descripcion,
        monto_estimado: convenio?.precio_pactado ?? 0,
        referencia: `OC-${Date.now().toString().slice(-6)}-${casos.length}`,
        responsable_id: datos.responsable_id,
      });
      caso.solicitud_id = solicitud.id;
      store.registrarEventoCaso(
        caso.id,
        "creado",
        `Cotización comparativa de la solicitud ${solicitud.codigo}.`,
        actor
      );
      if (datos.responsable_id)
        store.asignarResponsableCasoCompra(caso.id, datos.responsable_id, actor.nombre);
      casos.push(caso);
    }

    return { solicitud, casos };
  },

  // Compartida con recibirCasoCompra: recibir físicamente de un proveedor
  // también confirma que ese fue el elegido.
  resolverSolicitud(
    solicitudId: string,
    casoGanadorId: string,
    actor: UsuarioActor = { id: null, nombre: null }
  ): void {
    const s = db.solicitudes_compra.find((x) => x.id === solicitudId);
    if (!s || s.estado !== "abierta") return;
    s.estado = "resuelta";
    s.cotizacion_ganadora_id = casoGanadorId;
    s.updated_at = new Date().toISOString();
    store.registrarEventoCaso(
      casoGanadorId,
      "estado_cambiado",
      "Elegida como cotización ganadora.",
      actor
    );

    const hermanas = db.casos_compra.filter(
      (c) =>
        c.solicitud_id === solicitudId &&
        c.id !== casoGanadorId &&
        CASO_COMPRA_ABIERTO.includes(c.estado)
    );
    for (const h of hermanas) {
      h.estado = "cancelado";
      h.updated_at = new Date().toISOString();
      store.registrarEventoCaso(
        h.id,
        "estado_cambiado",
        "Cancelado automáticamente: se eligió otra cotización de la misma solicitud.",
        actor
      );
    }
  },

  elegirGanadora(
    solicitudId: string,
    casoGanadorId: string,
    actor: UsuarioActor = { id: null, nombre: null }
  ): void {
    const s = db.solicitudes_compra.find((x) => x.id === solicitudId);
    if (!s) throw new Error("Solicitud no encontrada");
    if (s.estado !== "abierta") throw new Error("Esta solicitud ya fue resuelta");
    const caso = db.casos_compra.find(
      (c) => c.id === casoGanadorId && c.solicitud_id === solicitudId
    );
    if (!caso) throw new Error("Esa cotización no pertenece a esta solicitud");
    store.resolverSolicitud(solicitudId, casoGanadorId, actor);
  },

  agregarNotaCaso(
    casoId: string,
    texto: string,
    actor: UsuarioActor = { id: null, nombre: null }
  ): void {
    if (!texto.trim()) throw new Error("La nota no puede estar vacía");
    const c = db.casos_compra.find((x) => x.id === casoId);
    if (!c) throw new Error("Caso no encontrado");
    store.registrarEventoCaso(casoId, "nota", texto.trim(), actor);
  },

  /* ---------------- Email entrante (webhook) ---------------- */

  emailYaProcesado(mensajeId: string): boolean {
    return db.emails_procesados.includes(mensajeId);
  },

  registrarEmailProcesado(mensajeId: string): void {
    db.emails_procesados.push(mensajeId);
  },

  /* ---------------- Clientes ---------------- */

  getClientes: () =>
    [...db.clientes].sort((a, b) => a.nombre.localeCompare(b.nombre)),

  /* ---------------- Casos de venta ---------------- */

  getCasosVenta(): CasoVentaConRelaciones[] {
    return [...db.casos_venta]
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
      .map((c) => {
        const cli = db.clientes.find((x) => x.id === c.cliente_id);
        return {
          ...c,
          clientes: cli ? { id: cli.id, nombre: cli.nombre } : null,
          items: db.casos_venta_items
            .filter((i) => i.caso_venta_id === c.id)
            .map((i) => {
              const m = db.materiales.find((x) => x.id === i.material_id);
              return {
                ...i,
                materiales: m
                  ? {
                      id: m.id,
                      nombre: m.nombre,
                      sku: m.sku,
                      unidad: m.unidad,
                      stock_actual: m.stock_actual,
                    }
                  : null,
              };
            }),
        };
      });
  },

  crearCasoVenta(
    data: {
      cliente_id: string;
      titulo: string;
      descripcion: string | null;
      monto: number;
      referencia: string | null;
      responsable_id?: string | null;
    },
    items: { material_id: string; cantidad: number }[]
  ): CasoVenta {
    const cliente = db.clientes.find((c) => c.id === data.cliente_id);
    if (!cliente) throw new Error("Cliente no encontrado");
    if (!data.titulo.trim()) throw new Error("El título es obligatorio");
    if (items.length === 0)
      throw new Error("Agrega al menos un material al caso");
    for (const it of items) {
      if (!db.materiales.some((m) => m.id === it.material_id))
        throw new Error("Material no encontrado");
      if (!Number.isFinite(it.cantidad) || it.cantidad <= 0)
        throw new Error("Las cantidades deben ser mayores a cero");
    }
    const now = new Date().toISOString();
    const caso: CasoVenta = {
      ...data,
      titulo: data.titulo.trim(),
      id: uid(),
      estado: "cotizacion",
      cliente_nombre: cliente.nombre,
      responsable_id: null,
      responsable_nombre: null,
      created_at: now,
      updated_at: now,
    };
    db.casos_venta.push(caso);
    for (const it of items) {
      db.casos_venta_items.push({
        id: uid(),
        caso_venta_id: caso.id,
        material_id: it.material_id,
        cantidad: it.cantidad,
      });
    }
    if (data.responsable_id) {
      store.asignarResponsableCasoVenta(caso.id, data.responsable_id);
    }
    return caso;
  },

  // Asigna (o quita) el responsable de un caso de venta; notifica si asigna.
  asignarResponsableCasoVenta(
    casoId: string,
    usuarioId: string | null,
    asignadoPor?: string | null
  ): void {
    const c = db.casos_venta.find((x) => x.id === casoId);
    if (!c) throw new Error("Caso de venta no encontrado");
    let usuario: Profile | undefined;
    if (usuarioId) {
      usuario = db.profiles.find((p) => p.id === usuarioId);
      if (!usuario) throw new Error("Usuario no encontrado");
    }
    c.responsable_id = usuarioId;
    c.responsable_nombre = usuario ? usuario.nombre : null;
    c.updated_at = new Date().toISOString();
    if (usuarioId) {
      const msg = asignadoPor
        ? `${asignadoPor} te asignó el caso de venta "${c.titulo}".`
        : `Se te asignó el caso de venta "${c.titulo}".`;
      notificarAsignacion(usuarioId, msg, { caso_venta_id: c.id });
    }
  },

  cambiarEstadoCasoVenta(id: string, estado: EstadoCasoVenta): void {
    const c = db.casos_venta.find((x) => x.id === id);
    if (!c) throw new Error("Caso de venta no encontrado");
    const now = new Date().toISOString();

    // Anti-sobreventa: al comprometer, valida disponible por material.
    if (
      estado === "confirmado" ||
      estado === "en_produccion" ||
      estado === "entregado"
    ) {
      const comprometidoOtros = store.getComprometidoPorMaterial();
      // Descuenta lo que este caso ya aportaba (si estaba comprometido).
      if (c.estado === "confirmado" || c.estado === "en_produccion") {
        for (const it of db.casos_venta_items.filter(
          (i) => i.caso_venta_id === c.id
        )) {
          comprometidoOtros[it.material_id] =
            (comprometidoOtros[it.material_id] ?? 0) - it.cantidad;
        }
      }
      // Requerido de este caso por material.
      const req: Record<string, number> = {};
      for (const it of db.casos_venta_items.filter(
        (i) => i.caso_venta_id === c.id
      )) {
        req[it.material_id] = (req[it.material_id] ?? 0) + it.cantidad;
      }
      for (const [mid, requerido] of Object.entries(req)) {
        const m = db.materiales.find((x) => x.id === mid);
        const disponible =
          (m?.stock_actual ?? 0) - (comprometidoOtros[mid] ?? 0);
        if (requerido > disponible) {
          throw new Error(
            `Sin disponible de "${m?.nombre ?? "material"}": requeridos ${requerido}, disponibles ${disponible} (el resto está comprometido).`
          );
        }
      }
    }

    c.estado = estado;
    c.updated_at = now;

    if (estado === "entregado") {
      // Solo si el caso nunca generó pendientes: re-entregar tras cancelar
      // no las regenera (evita duplicados).
      const yaTiene = db.salidas_pendientes.some(
        (sp) => sp.caso_venta_id === c.id
      );
      if (!yaTiene) {
        for (const it of db.casos_venta_items.filter(
          (i) => i.caso_venta_id === c.id
        )) {
          db.salidas_pendientes.push({
            id: uid(),
            caso_venta_id: c.id,
            material_id: it.material_id,
            cantidad: it.cantidad,
            estado: "pendiente",
            movimiento_id: null,
            responsable_id: null,
            responsable_nombre: null,
            created_at: now,
            resuelta_at: null,
          });
        }
      }
    } else if (estado === "cancelado") {
      // Las registradas quedan: su movimiento ya es historia real.
      for (const sp of db.salidas_pendientes) {
        if (sp.caso_venta_id === c.id && sp.estado === "pendiente") {
          sp.estado = "cancelada";
          sp.resuelta_at = now;
        }
      }
    }
  },

  /* ---------------- Salidas pendientes ---------------- */

  getSalidasPendientes(): SalidaPendienteConRelaciones[] {
    return [...db.salidas_pendientes]
      .sort((a, b) => {
        // Pendientes primero, luego por fecha desc.
        if (a.estado !== b.estado) return a.estado === "pendiente" ? -1 : 1;
        return a.created_at < b.created_at ? 1 : -1;
      })
      .map((sp) => {
        const m = db.materiales.find((x) => x.id === sp.material_id);
        const cv = db.casos_venta.find((x) => x.id === sp.caso_venta_id);
        const cli = cv
          ? db.clientes.find((x) => x.id === cv.cliente_id)
          : undefined;
        return {
          ...sp,
          materiales: m
            ? {
                id: m.id,
                nombre: m.nombre,
                sku: m.sku,
                unidad: m.unidad,
                stock_actual: m.stock_actual,
              }
            : null,
          casos_venta: cv
            ? {
                id: cv.id,
                titulo: cv.titulo,
                referencia: cv.referencia,
                cliente_nombre: cli?.nombre ?? cv.cliente_nombre ?? null,
              }
            : null,
        };
      });
  },

  // cantidad opcional: si se omite (o es igual a lo pendiente) confirma todo,
  // como antes. Si es menor, confirma solo esa parte y la salida sigue
  // "pendiente" con el restante — permite entregas parciales en vez de
  // forzar todo-o-nada.
  confirmarSalidaPendiente(id: string, cantidad?: number): void {
    const sp = db.salidas_pendientes.find((x) => x.id === id);
    if (!sp) throw new Error("Salida pendiente no encontrada");
    if (sp.estado !== "pendiente")
      throw new Error("Esta salida ya fue resuelta");
    const aConfirmar = cantidad ?? sp.cantidad;
    if (!(aConfirmar > 0))
      throw new Error("La cantidad debe ser mayor a cero");
    if (aConfirmar > sp.cantidad)
      throw new Error(`No puede confirmar más de lo pendiente (${sp.cantidad})`);
    const caso = db.casos_venta.find((x) => x.id === sp.caso_venta_id);
    // aplicarMovimiento valida stock insuficiente y lanza el error hacia la UI.
    const mov = store.aplicarMovimiento(sp.material_id, "salida", aConfirmar, {
      nota: `Entrega: ${caso?.titulo ?? "caso de venta"}`,
      referencia: caso?.referencia ?? null,
    });
    const restante = sp.cantidad - aConfirmar;
    if (restante > 0) {
      sp.cantidad = restante;
    } else {
      sp.estado = "registrada";
      sp.movimiento_id = mov.id;
      sp.resuelta_at = new Date().toISOString();
    }
  },

  cancelarSalidaPendiente(id: string): void {
    const sp = db.salidas_pendientes.find((x) => x.id === id);
    if (!sp) throw new Error("Salida pendiente no encontrada");
    if (sp.estado !== "pendiente")
      throw new Error("Esta salida ya fue resuelta");
    sp.estado = "cancelada";
    sp.resuelta_at = new Date().toISOString();
  },

  // Asigna (o quita) el responsable de completar una salida pendiente;
  // no bloquea confirmar/cancelar — es solo informativo + notificación.
  asignarResponsableSalidaPendiente(
    id: string,
    usuarioId: string | null,
    asignadoPor?: string | null
  ): void {
    const sp = db.salidas_pendientes.find((x) => x.id === id);
    if (!sp) throw new Error("Salida pendiente no encontrada");
    let usuario: Profile | undefined;
    if (usuarioId) {
      usuario = db.profiles.find((p) => p.id === usuarioId);
      if (!usuario) throw new Error("Usuario no encontrado");
    }
    sp.responsable_id = usuarioId;
    sp.responsable_nombre = usuario ? usuario.nombre : null;
    if (usuarioId) {
      const m = db.materiales.find((x) => x.id === sp.material_id);
      const cv = db.casos_venta.find((x) => x.id === sp.caso_venta_id);
      const detalle = `${m?.nombre ?? "material"}" (${cv?.titulo ?? "caso de venta"})`;
      const msg = asignadoPor
        ? `${asignadoPor} te asignó la salida pendiente de "${detalle}.`
        : `Se te asignó la salida pendiente de "${detalle}.`;
      notificarAsignacion(usuarioId, msg, { salida_pendiente_id: sp.id });
    }
  },
};
