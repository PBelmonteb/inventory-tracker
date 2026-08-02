// Tipos del dominio (espejo del esquema de la base de datos).

export type Rol = "admin" | "gerente" | "operario";
export type TipoMovimiento = "entrada" | "salida" | "ajuste";

export interface Profile {
  id: string;
  nombre: string;
  rol: Rol;
  created_at: string;
}

export interface Categoria {
  id: string;
  nombre: string;
  created_at: string;
}

export interface Ubicacion {
  id: string;
  nombre: string;
  created_at: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  contacto: string | null;
  // Tiempo de entrega declarado por el proveedor (días). Respaldo cuando
  // aún no hay historial suficiente para inferirlo (ver lib/stock-sugerido.ts);
  // si ambos existen, el inferido del historial real gana por ser más preciso.
  dias_entrega_declarado: number | null;
  created_at: string;
}

export interface Material {
  id: string;
  sku: string | null;
  nombre: string;
  descripcion: string | null;
  categoria_id: string | null;
  ubicacion_id: string | null;
  proveedor_id: string | null;
  unidad: string;
  stock_actual: number;
  stock_minimo: number;
  // Umbral de aviso ("por agotarse"): avisa antes de llegar al mínimo.
  // modo "unidad"     -> punto de aviso = stock_minimo + aviso_valor
  // modo "porcentaje" -> punto de aviso = stock_minimo * (1 + aviso_valor/100)
  aviso_valor: number;
  aviso_modo: AvisoModo;
  // costo_unitario = costo promedio ponderado (WAC) vigente de compra.
  costo_unitario: number;
  // precio_venta = precio de venta actual (para margen).
  precio_venta: number;
  activo: boolean;
  // Si es true, recibir una compra de este material NO suma stock al
  // instante — queda como InspeccionCalidad pendiente hasta que un gestor
  // libere (todo o en parte) o rechace. Ver lib/inspeccion-calidad.ts.
  requiere_inspeccion_calidad: boolean;
  created_at: string;
  updated_at: string;
}

export type AvisoModo = "unidad" | "porcentaje";

// Receta de producción de un material ("1 ventana = X perfil + Y herrajes").
// Un solo nivel a propósito: el componente no explota su propia receta.
export interface BomItem {
  id: string;
  producto_id: string;
  componente_id: string;
  cantidad_por_unidad: number;
  created_at: string;
}

export interface BomItemConMaterial extends BomItem {
  componente: Pick<Material, "id" | "nombre" | "sku" | "unidad" | "stock_actual">;
}

// Un material "producible" es cualquiera con al menos un bom_item propio.
export interface ProducibleConReceta {
  producto: MaterialConRelaciones;
  receta: BomItemConMaterial[];
}

// Lookup inverso de BOM: qué producibles usan este material como componente
// (para material-detail.tsx — "Se usa en"). Solo lo esencial para linkear a
// /produccion, no la receta completa (eso ya lo trae getBom del lado del producto).
export interface ProductoQueUsa {
  id: string;
  nombre: string;
  sku: string | null;
}

// Nivel de severidad de una alerta de stock.
export type NivelStock = "ok" | "aviso" | "bajo";

// Material con sus relaciones resueltas (join).
export interface MaterialConRelaciones extends Material {
  categorias: Pick<Categoria, "id" | "nombre"> | null;
  ubicaciones: Pick<Ubicacion, "id" | "nombre"> | null;
  proveedores: Pick<Proveedor, "id" | "nombre"> | null;
}

export interface Movimiento {
  id: string;
  // Puede quedar null si el material se elimina; el snapshot conserva la info.
  material_id: string | null;
  tipo: TipoMovimiento;
  cantidad: number;
  usuario_id: string | null;
  nota: string | null;
  referencia: string | null;
  // Snapshot del material al momento del movimiento (historial autónomo).
  material_nombre: string | null;
  material_sku: string | null;
  // Snapshot del costo unitario (WAC) al momento del movimiento.
  costo_unitario: number | null;
  // Ubicación donde ocurrió (null = la ubicación por defecto del material).
  ubicacion_id: string | null;
  created_at: string;
}

/* ---------------- Bitácora de auditoría ---------------- */

export type AccionAuditoria = "crear" | "editar" | "eliminar";
export type EntidadAuditoria =
  | "material"
  | "categoria"
  | "ubicacion"
  | "proveedor"
  | "cliente";

export interface Auditoria {
  id: string;
  usuario_id: string | null;
  usuario_nombre: string | null;
  accion: AccionAuditoria;
  entidad: EntidadAuditoria;
  entidad_id: string | null;
  entidad_nombre: string | null;
  created_at: string;
}

/* ---------------- Historial de costos y precios ---------------- */

export type TipoPrecio = "costo" | "venta";
export type FuentePrecio =
  | "compra"
  | "manual"
  | "cotizacion"
  | "inicial"
  | "convenio";

export interface HistorialPrecio {
  id: string;
  material_id: string | null;
  material_nombre: string | null;
  material_sku: string | null;
  tipo: TipoPrecio;
  valor: number;
  fuente: FuentePrecio;
  proveedor_id: string | null;
  cantidad: number | null;
  created_at: string;
}

/* ---------------- Convenios con proveedores ---------------- */

// Precio pactado + condiciones negociadas para un par proveedor+material
// puntual. Solo un convenio puede estar `activo` a la vez por ese par (ver
// migración 0018) — para cambiar el precio se desactiva el viejo y se crea
// uno nuevo, conservando el historial.
export interface Convenio {
  id: string;
  proveedor_id: string;
  material_id: string;
  precio_pactado: number;
  cantidad_minima: number | null;
  // Tiempo de entrega comprometido específicamente en este convenio — más
  // preciso que proveedores.dias_entrega_declarado (general) cuando existe.
  dias_entrega_pactado: number | null;
  condiciones_pago: string | null;
  // null = sin vencimiento.
  vigencia_hasta: string | null;
  notas: string | null;
  activo: boolean;
  // Opt-in: si está en true, la reposición automática manda sola el
  // correo de confirmación de orden (lib/email.ts) en vez de dejar el
  // caso en "pendiente" esperando revisión humana.
  auto_enviar: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConvenioConRelaciones extends Convenio {
  proveedores: Pick<Proveedor, "id" | "nombre"> | null;
  materiales: Pick<Material, "id" | "nombre" | "sku" | "unidad"> | null;
}

export interface MovimientoConRelaciones extends Movimiento {
  materiales: Pick<Material, "id" | "nombre" | "sku" | "unidad"> | null;
  profiles: Pick<Profile, "id" | "nombre"> | null;
  ubicaciones: Pick<Ubicacion, "id" | "nombre"> | null;
}

/* ---------------- Multi-ubicación ---------------- */

// Desglose de stock de un material por ubicación (con fallback implícito:
// si un material nunca tuvo un movimiento con ubicación explícita, se
// muestra una sola fila con su ubicación por defecto y el stock total).
export interface StockPorUbicacion {
  ubicacion_id: string | null;
  ubicacion_nombre: string;
  stock: number;
}

export const UNIDADES = ["pza", "m", "kg", "caja", "litro", "rollo"] as const;

/* ---------------- Portal de proveedores ---------------- */

// abierta = alerta activa; descartada = silenciada mientras siga bajo;
// atendida = resuelta (se creó caso o el stock se recuperó).
export type EstadoNotificacion = "abierta" | "atendida" | "descartada";

// "aviso" = amarillo (por agotarse); "bajo" = rojo (en o bajo el mínimo).
export type NivelNotificacion = "aviso" | "bajo";

// "stock" = alerta global de stock bajo (como hoy); "asignacion" = te
// asignaron un caso/salida pendiente (personal, solo la ve el destinatario);
// "autorizacion" = tu caso de compra fue autorizado o rechazado.
export type TipoNotificacion = "stock" | "asignacion" | "autorizacion";

export interface Notificacion {
  id: string;
  // null en notificaciones de tipo "asignacion".
  material_id: string | null;
  proveedor_id: string | null;
  mensaje: string;
  estado: EstadoNotificacion;
  // null en notificaciones de tipo "asignacion".
  nivel: NivelNotificacion | null;
  tipo: TipoNotificacion;
  // Destinatario: null = alerta global (visible para todos, como antes).
  usuario_id: string | null;
  caso_compra_id: string | null;
  caso_venta_id: string | null;
  salida_pendiente_id: string | null;
  created_at: string;
  resuelta_at: string | null;
}

export interface NotificacionConRelaciones extends Notificacion {
  materiales: Pick<
    Material,
    "id" | "nombre" | "sku" | "unidad" | "stock_actual" | "stock_minimo"
  > | null;
  proveedores: Pick<Proveedor, "id" | "nombre" | "contacto"> | null;
}

// "cotizando" ya no se escribe desde la app (ver lib/actions/compras.ts)
// pero se conserva en el tipo: Postgres no permite quitar valores de un
// enum sin recrearlo, y algunos casos viejos/de prueba todavía lo usan.
// La UI los trata igual que "pendiente".
export type EstadoCasoCompra =
  | "pendiente"
  | "cotizando"
  | "por_autorizar"
  | "ordenado"
  | "rechazado"
  | "recibido"
  | "cancelado";

export const ESTADOS_CASO_COMPRA: EstadoCasoCompra[] = [
  "pendiente",
  "cotizando",
  "por_autorizar",
  "ordenado",
  "rechazado",
  "recibido",
  "cancelado",
];

// manual = creado desde el formulario; stock_bajo = desde una notificación
// (a mano o por la automatización de reposición); correo = creado
// automáticamente por el webhook de email entrante.
export type OrigenCasoCompra = "manual" | "stock_bajo" | "correo";

// Qué tan urgente es un caso creado por la automatización de reposición:
// "critico" = el stock se agotaría antes de que llegue un pedido nuevo;
// "alto" = margen corto; "medio" = cruzó el punto de reorden pero con
// holgura (o no se pudo medir el riesgo de desabasto). Null en casos
// manuales/por correo — solo lo calcula lib/riesgo-stock.ts.
export type NivelRiesgoStock = "medio" | "alto" | "critico";

export interface CasoCompra {
  id: string;
  // null si el proveedor fue eliminado; el snapshot conserva el nombre.
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  material_id: string | null;
  titulo: string;
  descripcion: string | null;
  monto_estimado: number;
  // false = el monto lo puso el sistema solo (regex sobre un correo) y
  // nadie lo ha revisado todavía — ver lib/email-caso.ts extraerMonto().
  // true = lo escribió una persona, o viene de un convenio pactado.
  monto_confirmado: boolean;
  // Cantidad esperada de esta orden (en la unidad del material) — null si no
  // se capturó (ver "stock por llegar" en Inventario, lib/data.ts).
  cantidad_estimada: number | null;
  referencia: string | null; // OC-xxxx
  estado: EstadoCasoCompra;
  origen: OrigenCasoCompra;
  // Al marcar "recibido" se crea la entrada de stock y se enlaza aquí —
  // salvo que el material requiera inspección de calidad, en cuyo caso
  // este queda null y se enlaza inspeccion_calidad_id en su lugar (el
  // stock sube después, si se libera).
  movimiento_id: string | null;
  inspeccion_calidad_id: string | null;
  // Persona encargada de darle seguimiento (null = sin asignar).
  responsable_id: string | null;
  responsable_nombre: string | null;
  // Snapshot del riesgo al momento de la creación automática (null si el
  // caso no vino de la automatización de reposición).
  nivel_riesgo: NivelRiesgoStock | null;
  dias_cobertura_restante: number | null;
  lead_time_dias_usado: number | null;
  // Solo se llena si el envío automático de orden por convenio tuvo éxito
  // de verdad (lib/email.ts) — nunca se finge un envío que no ocurrió.
  correo_enviado_at: string | null;
  // Si no es null, este caso es una de varias cotizaciones (una por
  // proveedor) de la misma necesidad — ver SolicitudCompra.
  solicitud_id: string | null;
  // Quién lo creó (null en automáticos/correo — solo se llena en casos
  // manuales). Determina el ruteo a "por_autorizar" si es un operario.
  creado_por_id: string | null;
  creado_por_nombre: string | null;
  // Solo si estado === "rechazado".
  motivo_rechazo: string | null;
  created_at: string;
  updated_at: string;
}

export interface CasoCompraConRelaciones extends CasoCompra {
  proveedores: Pick<Proveedor, "id" | "nombre"> | null;
  materiales: Pick<Material, "id" | "nombre" | "sku" | "unidad"> | null;
  // Solo si solicitud_id no es null — el código para mostrar junto al de
  // este caso y agrupar visualmente las cotizaciones hermanas en la lista.
  solicitudes_compra: { codigo: string } | null;
}

/* ---------------- Bloqueo de calidad ---------------- */

// Material recibido de un material "requiere_inspeccion_calidad" — no
// suma stock hasta que un gestor lo resuelve (lib/inspeccion-calidad.ts
// valida las cantidades; la RPC resolver_inspeccion_calidad aplica).
export type EstadoInspeccionCalidad = "pendiente" | "resuelta";

export interface InspeccionCalidad {
  id: string;
  caso_compra_id: string | null;
  material_id: string | null;
  material_nombre: string;
  material_sku: string | null;
  proveedor_nombre: string | null;
  ubicacion_id: string | null;
  ubicacion_nombre: string | null;
  referencia: string | null;
  cantidad_recibida: number;
  costo_unitario: number;
  estado: EstadoInspeccionCalidad;
  cantidad_liberada: number | null;
  cantidad_rechazada: number | null;
  motivo_rechazo: string | null;
  movimiento_id: string | null;
  creado_por_id: string | null;
  creado_por_nombre: string | null;
  resuelto_por_id: string | null;
  resuelto_por_nombre: string | null;
  resuelto_at: string | null;
  created_at: string;
}

/* ---------------- Solicitudes de compra (comparar proveedores) ---------------- */

// Agrupa varias cotizaciones (casos_compra, una por proveedor) de la
// misma necesidad para poder compararlas y elegir una ganadora — las
// demás se cancelan solas (lib/actions/solicitudes.ts).
export type EstadoSolicitudCompra = "abierta" | "resuelta" | "cancelada";

export const ESTADOS_SOLICITUD_COMPRA: EstadoSolicitudCompra[] = [
  "abierta",
  "resuelta",
  "cancelada",
];

export interface SolicitudCompra {
  id: string;
  codigo: string; // SOL-xxxxxx
  material_id: string | null;
  material_nombre: string | null;
  titulo: string;
  estado: EstadoSolicitudCompra;
  responsable_id: string | null;
  responsable_nombre: string | null;
  cotizacion_ganadora_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SolicitudCompraConRelaciones extends SolicitudCompra {
  casos: CasoCompraConRelaciones[];
}

// Timeline de un caso (estilo Salesforce): qué ha pasado, en orden.
// "nota" es la única que puede escribir un humano libremente; el resto
// las genera el sistema en cada acción relevante.
export type TipoEventoCaso =
  | "creado"
  | "correo_enviado"
  | "correo_recibido"
  | "estado_cambiado"
  | "responsable_asignado"
  | "nota";

// Quién hizo una acción que se registra en el timeline — null/null cuando
// la generó el sistema (cron, webhook), no una persona.
export interface UsuarioActor {
  id: string | null;
  nombre: string | null;
}

export interface CasoCompraEvento {
  id: string;
  caso_compra_id: string;
  tipo: TipoEventoCaso;
  detalle: string | null;
  usuario_id: string | null;
  usuario_nombre: string | null;
  created_at: string;
  // Solo se llenan en eventos de correo (correo_enviado/correo_recibido) —
  // null en el resto. El remitente de un correo (`From:`) no se autentica
  // de ninguna forma (sin SPF/DKIM todavía); estas banderas no evitan un
  // correo falsificado, solo evitan que el staff lo pase por alto sin
  // darse cuenta de que viene de fuera o de que no coincide con el
  // proveedor esperado. Ver app/api/email-caso/route.ts.
  remitente_externo: boolean | null;
  remitente_verificado: boolean | null;
}

// Timeline de un caso de venta — mismo idioma que CasoCompraEvento (ver
// components/caso-timeline.tsx), tabla propia (casos_venta_eventos) porque
// la FK es a casos_venta, no a casos_compra.
export interface CasoVentaEvento {
  id: string;
  caso_venta_id: string;
  tipo: TipoEventoCaso;
  detalle: string | null;
  usuario_id: string | null;
  usuario_nombre: string | null;
  created_at: string;
}

/* ---------------- Portal de clientes ---------------- */

export interface Cliente {
  id: string;
  nombre: string;
  contacto: string | null;
  created_at: string;
}

export type EstadoCasoVenta =
  | "cotizacion"
  | "confirmado"
  | "en_produccion"
  | "entregado"
  | "cancelado";

export const ESTADOS_CASO_VENTA: EstadoCasoVenta[] = [
  "cotizacion",
  "confirmado",
  "en_produccion",
  "entregado",
  "cancelado",
];

export interface CasoVenta {
  id: string;
  // null si el cliente fue eliminado; el snapshot conserva el nombre.
  cliente_id: string | null;
  cliente_nombre: string | null;
  titulo: string;
  descripcion: string | null;
  monto: number;
  referencia: string | null; // OV-xxxx
  estado: EstadoCasoVenta;
  // Persona encargada de darle seguimiento (null = sin asignar).
  responsable_id: string | null;
  responsable_nombre: string | null;
  created_at: string;
  updated_at: string;
}

export interface CasoVentaItem {
  id: string;
  caso_venta_id: string;
  material_id: string;
  cantidad: number;
}

export interface CasoVentaConRelaciones extends CasoVenta {
  clientes: Pick<Cliente, "id" | "nombre"> | null;
  items: (CasoVentaItem & {
    materiales: Pick<
      Material,
      "id" | "nombre" | "sku" | "unidad" | "stock_actual"
    > | null;
  })[];
}

// Al entregar un caso de venta se generan salidas pendientes; la salida real
// (movimiento) solo existe cuando alguien la confirma explícitamente.
export type EstadoSalidaPendiente = "pendiente" | "registrada" | "cancelada";

export interface SalidaPendiente {
  id: string;
  caso_venta_id: string;
  material_id: string;
  cantidad: number;
  estado: EstadoSalidaPendiente;
  movimiento_id: string | null;
  // Persona encargada de completar esta salida (null = sin asignar).
  responsable_id: string | null;
  responsable_nombre: string | null;
  created_at: string;
  resuelta_at: string | null;
}

export interface SalidaPendienteConRelaciones extends SalidaPendiente {
  materiales: Pick<
    Material,
    "id" | "nombre" | "sku" | "unidad" | "stock_actual"
  > | null;
  casos_venta:
    | (Pick<CasoVenta, "id" | "titulo" | "referencia"> & {
        cliente_nombre: string | null;
      })
    | null;
}

/* ---------------- Conteo cíclico (physical inventory a ciegas) ---------------- */

export type EstadoConteo = "abierto" | "contado" | "aplicado" | "cancelado";

export const ESTADOS_CONTEO: EstadoConteo[] = [
  "abierto",
  "contado",
  "aplicado",
  "cancelado",
];

export interface Conteo {
  id: string;
  codigo: string; // CONT-xxxxxx
  titulo: string;
  estado: EstadoConteo;
  creado_por_id: string | null;
  creado_por_nombre: string | null;
  aplicado_por_id: string | null;
  aplicado_por_nombre: string | null;
  created_at: string;
  updated_at: string;
  aplicado_at: string | null;
}

export interface ConteoItem {
  id: string;
  conteo_id: string;
  material_id: string | null;
  material_nombre: string;
  material_sku: string | null;
  ubicacion_id: string | null;
  ubicacion_nombre: string | null;
  // Snapshot al crear el conteo. NUNCA se manda al cliente mientras el
  // conteo siga "abierto"/"contado" (el conteo es a ciegas) — ver
  // lib/actions/conteos.ts. Solo se expone en la revisión (gestor) o una
  // vez "aplicado".
  stock_esperado: number;
  cantidad_contada: number | null;
  contado_por_id: string | null;
  contado_por_nombre: string | null;
  contado_at: string | null;
  movimiento_id: string | null;
  created_at: string;
}

export interface ConteoConItems extends Conteo {
  items: ConteoItem[];
}

// Vista para la UI: stock_esperado solo viene presente si el rol/estado
// del que mira lo permiten (conteo ya "aplicado"/"cancelado", o "contado"
// visto por un gestor) — ver lib/actions/conteos.ts -> obtenerConteoDetalle.
// Mientras el conteo sigue abierto, nunca llega al cliente (conteo a ciegas).
export interface ConteoItemVista extends Omit<ConteoItem, "stock_esperado"> {
  stock_esperado?: number;
}

export interface ConteoDetalle extends Conteo {
  items: ConteoItemVista[];
}

/* ---------------- Umbral de autorización por monto ---------------- */

export interface ConfiguracionAutorizacion {
  monto_umbral_admin: number;
  updated_at: string;
  updated_por_nombre: string | null;
}

/* ---------------- Stock en tránsito ---------------- */

// Traslado entre ubicaciones que TOMA TIEMPO (ej. entre plantas lejanas):
// a diferencia de transferirStock (instantáneo, salida+entrada en el mismo
// momento), aquí la salida se registra ya pero la entrada queda pendiente
// hasta que alguien confirma la llegada — mientras tanto el material no
// cuenta en NINGUNA ubicación, está "en tránsito" (ver getEnTransito en
// lib/data.ts).
export type EstadoTraslado = "en_transito" | "recibido" | "cancelado";

export const ESTADOS_TRASLADO: EstadoTraslado[] = [
  "en_transito",
  "recibido",
  "cancelado",
];

export interface Traslado {
  id: string;
  codigo: string; // TRAS-xxxxxx
  // Snapshot (historial autónomo): sobrevive a que el material se elimine.
  material_id: string | null;
  material_nombre: string;
  material_sku: string | null;
  unidad: string;
  cantidad: number;
  origen_id: string | null;
  origen_nombre: string | null;
  destino_id: string | null;
  destino_nombre: string | null;
  estado: EstadoTraslado;
  nota: string | null;
  creado_por_id: string | null;
  creado_por_nombre: string | null;
  recibido_por_id: string | null;
  recibido_por_nombre: string | null;
  // Los movimientos reales que este traslado generó (salida al iniciar,
  // entrada al recibir) — para poder ligarlos desde el historial.
  movimiento_salida_id: string | null;
  movimiento_entrada_id: string | null;
  created_at: string;
  updated_at: string;
  recibido_at: string | null;
}

// Vista/filtro guardado ("variant" estilo SAP Fiori): el querystring de
// filtros de una página, guardado tal cual bajo un nombre, por usuario.
export interface VistaGuardada {
  id: string;
  usuario_id: string;
  pagina: string;
  nombre: string;
  query: string;
  created_at: string;
}
