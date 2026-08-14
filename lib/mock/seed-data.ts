import type {
  CasoCompra,
  CasoVenta,
  CasoVentaItem,
  Auditoria,
  BomItem,
  Categoria,
  Cliente,
  ConfiguracionAutorizacion,
  Conteo,
  ConteoItem,
  Convenio,
  ConvenioCliente,
  DevolucionVenta,
  CasoCompraEvento,
  CasoVentaEvento,
  HistorialPrecio,
  InspeccionCalidad,
  Material,
  Movimiento,
  Notificacion,
  Profile,
  Proveedor,
  SalidaPendiente,
  SolicitudCompra,
  Traslado,
  Ubicacion,
  VistaGuardada,
} from "@/lib/types";

// Datos de ejemplo para el modo demo (sin Supabase).
// El stock_actual ya viene calculado para coincidir con los movimientos.

function diasAtras(d: number): string {
  return new Date(Date.now() - d * 86400000).toISOString();
}

export const PERFIL_DEMO: Profile = {
  id: "demo-user",
  nombre: "Usuario Demo",
  rol: "admin",
  estado_cuenta: "aprobada",
  created_at: diasAtras(60),
};

// Perfiles adicionales solo para poder probar el selector de "responsable"
// en modo demo (en producción esto viene de la tabla profiles real). Todos
// aprobados -- el modo demo no necesita simular el filtro de aceptación.
export const PERFILES_DEMO: Profile[] = [
  PERFIL_DEMO,
  { id: "user-planta-1", nombre: "Jorge Medina (Planta)", rol: "operario", estado_cuenta: "aprobada", created_at: diasAtras(55) },
  { id: "user-planta-2", nombre: "Sofía Ramírez (Planta)", rol: "gerente", estado_cuenta: "aprobada", created_at: diasAtras(55) },
  { id: "user-ventas-1", nombre: "Carlos Peña (Ventas)", rol: "operario", estado_cuenta: "aprobada", created_at: diasAtras(50) },
  { id: "user-ventas-2", nombre: "Ana Torres (Ventas)", rol: "operario", estado_cuenta: "aprobada", created_at: diasAtras(50) },
];

export function makeSeed(): {
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
  emails_procesados: string[];
  historial_precios: HistorialPrecio[];
  auditoria: Auditoria[];
  material_stock_ubicacion: {
    material_id: string;
    ubicacion_id: string | null;
    stock: number;
    updated_at: string;
  }[];
  bom_items: BomItem[];
  convenios: Convenio[];
  convenios_cliente: ConvenioCliente[];
  devoluciones_venta: DevolucionVenta[];
  solicitudes_compra: SolicitudCompra[];
  casos_compra_eventos: CasoCompraEvento[];
  casos_venta_eventos: CasoVentaEvento[];
  conteos: Conteo[];
  conteo_items: ConteoItem[];
  configuracion_autorizacion: ConfiguracionAutorizacion;
  traslados: Traslado[];
  inspecciones_calidad: InspeccionCalidad[];
  vistas_guardadas: VistaGuardada[];
} {
  const categorias: Categoria[] = [
    { id: "cat-perfiles", nombre: "Perfiles de aluminio", created_at: diasAtras(60) },
    { id: "cat-laminas", nombre: "Láminas", created_at: diasAtras(60) },
    { id: "cat-herrajes", nombre: "Herrajes", created_at: diasAtras(60) },
    { id: "cat-tornilleria", nombre: "Tornillería", created_at: diasAtras(60) },
    { id: "cat-consumibles", nombre: "Consumibles", created_at: diasAtras(60) },
  ];

  const ubicaciones: Ubicacion[] = [
    { id: "ubi-a", nombre: "Almacén A", created_at: diasAtras(60) },
    { id: "ubi-b", nombre: "Almacén B", created_at: diasAtras(60) },
    { id: "ubi-patio", nombre: "Patio", created_at: diasAtras(60) },
    { id: "ubi-e1", nombre: "Estante 1", created_at: diasAtras(60) },
  ];

  const proveedores: Proveedor[] = [
    { id: "prov-norte", nombre: "Aluminios del Norte", contacto: "ventas@aluminorte.mx", dias_entrega_declarado: 10, created_at: diasAtras(60) },
    { id: "prov-mty", nombre: "Herrajes MTY", contacto: "pedidos@herrajesmty.mx", dias_entrega_declarado: 5, created_at: diasAtras(60) },
    { id: "prov-tor", nombre: "Tornillos SA", contacto: "contacto@tornillossa.mx", dias_entrega_declarado: 3, created_at: diasAtras(60) },
  ];

  const mat = (
    id: string,
    sku: string,
    nombre: string,
    descripcion: string,
    categoria_id: string,
    ubicacion_id: string,
    proveedor_id: string,
    unidad: string,
    stock_actual: number,
    stock_minimo: number,
    costo_unitario: number,
    requiereInspeccionCalidad = false
  ): Material => ({
    id,
    sku,
    nombre,
    descripcion,
    categoria_id,
    ubicacion_id,
    proveedor_id,
    unidad,
    stock_actual,
    stock_minimo,
    aviso_valor: 20,
    aviso_modo: "porcentaje",
    costo_unitario,
    // Precio de venta de ejemplo: ~40% de margen sobre el costo.
    precio_venta: Math.round(costo_unitario * 1.4 * 100) / 100,
    activo: true,
    requiere_inspeccion_calidad: requiereInspeccionCalidad,
    created_at: diasAtras(45),
    updated_at: diasAtras(2),
  });

  const materiales: Material[] = [
    mat("mat-perf001", "PERF-001", 'Perfil aluminio 1" natural', "Perfil estructural 1 pulgada", "cat-perfiles", "ubi-a", "prov-norte", "m", 150, 200, 85.5),
    mat("mat-perf002", "PERF-002", 'Perfil aluminio 2" blanco', "Perfil ventana 2 pulgadas", "cat-perfiles", "ubi-a", "prov-norte", "m", 120, 150, 132.0),
    // Único material demo con inspección de calidad activada — para poder
    // probar el flujo completo (recibir -> pendiente -> liberar/rechazar).
    mat("mat-lam001", "LAM-001", "Lámina aluminio 1mm", "Lámina lisa calibre 1mm", "cat-laminas", "ubi-b", "prov-norte", "pza", 40, 50, 410.0, true),
    mat("mat-her001", "HER-001", "Bisagra reforzada", "Bisagra para puerta de aluminio", "cat-herrajes", "ubi-e1", "prov-mty", "pza", 80, 100, 28.9),
    mat("mat-her002", "HER-002", "Cerradura corrediza", "Cerradura para ventana corrediza", "cat-herrajes", "ubi-e1", "prov-mty", "pza", 200, 40, 64.0),
    mat("mat-tor001", "TOR-001", "Tornillo autorroscante #8", "Caja de 1000 piezas", "cat-tornilleria", "ubi-e1", "prov-tor", "caja", 7, 10, 220.0),
    mat("mat-con001", "CON-001", "Silicón estructural", "Cartucho 300ml", "cat-consumibles", "ubi-b", "prov-mty", "pza", 150, 60, 95.0),
    mat("mat-perf003", "PERF-003", 'Perfil aluminio 3" anodizado', "Perfil cancelería 3 pulgadas — LOTE PARADO", "cat-perfiles", "ubi-patio", "prov-norte", "m", 600, 80, 175.0),
  ];

  let n = 0;
  const mov = (
    material_id: string,
    tipo: Movimiento["tipo"],
    cantidad: number,
    nota: string,
    referencia: string,
    dias: number
  ): Movimiento => {
    const m = materiales.find((x) => x.id === material_id);
    return {
      id: `mov-seed-${++n}`,
      material_id,
      tipo,
      cantidad,
      usuario_id: PERFIL_DEMO.id,
      nota,
      referencia,
      material_nombre: m ? m.nombre : null,
      material_sku: m ? m.sku : null,
      costo_unitario: m ? m.costo_unitario : null,
      ubicacion_id: null,
      created_at: diasAtras(dias),
    };
  };

  const movimientos: Movimiento[] = [
    // Entradas
    mov("mat-perf001", "entrada", 500, "Compra inicial", "OC-1001", 40),
    mov("mat-perf002", "entrada", 300, "Compra inicial", "OC-1001", 40),
    mov("mat-lam001", "entrada", 120, "Compra inicial", "OC-1002", 35),
    mov("mat-her001", "entrada", 800, "Compra inicial", "OC-1003", 30),
    mov("mat-her002", "entrada", 200, "Compra inicial", "OC-1003", 30),
    mov("mat-tor001", "entrada", 25, "Compra inicial", "OC-1004", 20),
    mov("mat-con001", "entrada", 150, "Compra inicial", "OC-1005", 15),
    // Material parado: compra grande hace 6 meses, sin consumo
    mov("mat-perf003", "entrada", 600, "Compra grande — nunca se usó", "OC-0500", 180),
    // Salidas (consumo)
    mov("mat-perf001", "salida", 350, "Producción ventanas", "OP-2001", 10),
    mov("mat-perf002", "salida", 180, "Producción ventanas", "OP-2001", 8),
    mov("mat-lam001", "salida", 80, "Producción puertas", "OP-2002", 5),
    mov("mat-her001", "salida", 720, "Producción puertas", "OP-2002", 3),
    mov("mat-tor001", "salida", 18, "Consumo general", "OP-2003", 2),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  /* ---------------- Portales ---------------- */

  const clientes: Cliente[] = [
    { id: "cli-vidrios", nombre: "Vidrios y Cancelería GDL", contacto: "compras@vidrioscgdl.mx", created_at: diasAtras(50) },
    { id: "cli-constru", nombre: "Constructora Mira", contacto: "obras@constructoramira.mx", created_at: diasAtras(50) },
    { id: "cli-arq", nombre: "Arq. Laura Domínguez", contacto: "laura.dominguez@estudio.mx", created_at: diasAtras(50) },
    { id: "cli-bajio", nombre: "Fachadas del Bajío", contacto: "proyectos@fachadasbajio.mx", created_at: diasAtras(50) },
  ];

  // Lámina y tornillo ya tienen caso abierto → la sincronización de
  // notificaciones NO debe alertar por ellos (solo perf001, perf002, her001).
  const casos_compra: CasoCompra[] = [
    {
      id: "cc-1",
      proveedor_id: "prov-norte",
      material_id: "mat-lam001",
      titulo: "Reabasto lámina 1mm",
      descripcion: "Cotizar 60 piezas para cubrir el mínimo + colchón.",
      monto_estimado: 24600,
      monto_confirmado: true,
      cantidad_estimada: 60,
      referencia: "OC-1006",
      estado: "pendiente",
      origen: "stock_bajo",
      movimiento_id: null,
      inspeccion_calidad_id: null,
      proveedor_nombre: "Aluminios del Norte",
      responsable_id: null,
      responsable_nombre: null,
      nivel_riesgo: null,
      dias_cobertura_restante: null,
      lead_time_dias_usado: null,
      correo_enviado_at: null,
      solicitud_id: null,
      creado_por_id: null,
      creado_por_nombre: null,
      motivo_rechazo: null,
      created_at: diasAtras(4),
      updated_at: diasAtras(4),
    },
    {
      id: "cc-2",
      proveedor_id: "prov-tor",
      material_id: "mat-tor001",
      titulo: "Tornillería autorroscante #8",
      descripcion: "20 cajas; pedido ya colocado con el proveedor.",
      monto_estimado: 4400,
      monto_confirmado: true,
      cantidad_estimada: 20,
      referencia: "OC-1007",
      estado: "ordenado",
      origen: "correo",
      movimiento_id: null,
      inspeccion_calidad_id: null,
      proveedor_nombre: "Tornillos SA",
      responsable_id: "user-planta-1",
      responsable_nombre: "Jorge Medina (Planta)",
      nivel_riesgo: null,
      dias_cobertura_restante: null,
      lead_time_dias_usado: null,
      correo_enviado_at: null,
      solicitud_id: null,
      creado_por_id: null,
      creado_por_nombre: null,
      motivo_rechazo: null,
      created_at: diasAtras(2),
      updated_at: diasAtras(2),
    },
    {
      id: "cc-3",
      proveedor_id: "prov-mty",
      material_id: null,
      titulo: "Herrajes mixtos Q3",
      descripcion: "Paquete trimestral de herrajes variados.",
      monto_estimado: 18000,
      monto_confirmado: true,
      cantidad_estimada: null,
      referencia: "OC-1008",
      estado: "pendiente",
      origen: "manual",
      movimiento_id: null,
      inspeccion_calidad_id: null,
      proveedor_nombre: "Herrajes MTY",
      responsable_id: null,
      responsable_nombre: null,
      nivel_riesgo: null,
      dias_cobertura_restante: null,
      lead_time_dias_usado: null,
      correo_enviado_at: null,
      solicitud_id: null,
      creado_por_id: null,
      creado_por_nombre: null,
      motivo_rechazo: null,
      created_at: diasAtras(1),
      updated_at: diasAtras(1),
    },
    // Solicitud comparativa de ejemplo: dos proveedores cotizando el mismo
    // material, para que el modal de comparación tenga datos desde el
    // arranque (ver solicitudes_compra más abajo).
    {
      id: "cc-4",
      proveedor_id: "prov-mty",
      material_id: "mat-con001",
      titulo: 'Reabasto silicón estructural — comparar proveedores',
      descripcion: "Cotización del proveedor habitual.",
      monto_estimado: 14250,
      monto_confirmado: true,
      cantidad_estimada: 150,
      referencia: "OC-847221-0",
      estado: "pendiente",
      origen: "manual",
      movimiento_id: null,
      inspeccion_calidad_id: null,
      proveedor_nombre: "Herrajes MTY",
      responsable_id: null,
      responsable_nombre: null,
      nivel_riesgo: null,
      dias_cobertura_restante: null,
      lead_time_dias_usado: null,
      correo_enviado_at: null,
      solicitud_id: "sol-1",
      creado_por_id: null,
      creado_por_nombre: null,
      motivo_rechazo: null,
      created_at: diasAtras(3),
      updated_at: diasAtras(2),
    },
    {
      id: "cc-5",
      proveedor_id: "prov-norte",
      material_id: "mat-con001",
      titulo: 'Reabasto silicón estructural — comparar proveedores',
      descripcion: "Cotización alterna para comparar precio.",
      monto_estimado: 13800,
      monto_confirmado: true,
      cantidad_estimada: 150,
      referencia: "OC-847221-1",
      estado: "pendiente",
      origen: "manual",
      movimiento_id: null,
      inspeccion_calidad_id: null,
      proveedor_nombre: "Aluminios del Norte",
      responsable_id: null,
      responsable_nombre: null,
      nivel_riesgo: null,
      dias_cobertura_restante: null,
      lead_time_dias_usado: null,
      correo_enviado_at: null,
      solicitud_id: "sol-1",
      creado_por_id: null,
      creado_por_nombre: null,
      motivo_rechazo: null,
      created_at: diasAtras(3),
      updated_at: diasAtras(3),
    },
  ];

  const solicitudes_compra: SolicitudCompra[] = [
    {
      id: "sol-1",
      codigo: "SOL-847221",
      material_id: "mat-con001",
      material_nombre: "Silicón estructural",
      titulo: 'Reabasto silicón estructural — comparar proveedores',
      estado: "abierta",
      responsable_id: null,
      responsable_nombre: null,
      cotizacion_ganadora_id: null,
      created_at: diasAtras(3),
      updated_at: diasAtras(3),
    },
  ];

  const casos_compra_eventos: CasoCompraEvento[] = [
    {
      id: "evt-1",
      caso_compra_id: "cc-4",
      tipo: "creado",
      detalle: "Cotización comparativa de la solicitud SOL-847221.",
      usuario_id: null,
      usuario_nombre: null,
      remitente_externo: null,
      remitente_verificado: null,
      created_at: diasAtras(3),
    },
    {
      id: "evt-2",
      caso_compra_id: "cc-4",
      tipo: "correo_enviado",
      detalle: null,
      usuario_id: PERFIL_DEMO.id,
      usuario_nombre: PERFIL_DEMO.nombre,
      remitente_externo: null,
      remitente_verificado: null,
      created_at: diasAtras(3),
    },
    {
      id: "evt-3",
      caso_compra_id: "cc-4",
      tipo: "correo_recibido",
      detalle: "Buen día, cotizamos $14,250.00 MXN, entrega 4 días hábiles.",
      usuario_id: null,
      usuario_nombre: null,
      remitente_externo: true,
      remitente_verificado: true,
      created_at: diasAtras(2),
    },
    {
      id: "evt-4",
      caso_compra_id: "cc-5",
      tipo: "creado",
      detalle: "Cotización comparativa de la solicitud SOL-847221.",
      usuario_id: null,
      usuario_nombre: null,
      remitente_externo: null,
      remitente_verificado: null,
      created_at: diasAtras(3),
    },
    {
      id: "evt-5",
      caso_compra_id: "cc-5",
      tipo: "correo_enviado",
      detalle: null,
      usuario_id: PERFIL_DEMO.id,
      usuario_nombre: PERFIL_DEMO.nombre,
      remitente_externo: null,
      remitente_verificado: null,
      created_at: diasAtras(3),
    },
    {
      id: "evt-6",
      caso_compra_id: "cc-1",
      tipo: "creado",
      detalle: null,
      usuario_id: null,
      usuario_nombre: null,
      remitente_externo: null,
      remitente_verificado: null,
      created_at: diasAtras(4),
    },
    {
      id: "evt-7",
      caso_compra_id: "cc-1",
      tipo: "nota",
      detalle: "Llamé al proveedor, confirma entrega la próxima semana.",
      usuario_id: PERFIL_DEMO.id,
      usuario_nombre: PERFIL_DEMO.nombre,
      remitente_externo: null,
      remitente_verificado: null,
      created_at: diasAtras(1),
    },
  ];

  // monto de cada caso = Σ(precio_unitario × cantidad) de sus items (ver
  // casos_venta_items más abajo) — igual que el trigger recalcular_monto_
  // caso_venta en Supabase real (migración 0045_precio_linea_venta.sql).
  const casos_venta: CasoVenta[] = [
    {
      id: "cv-1",
      cliente_id: "cli-vidrios",
      cliente_nombre: "Vidrios y Cancelería GDL",
      titulo: "Ventanas residencial Lomas",
      descripcion: "12 ventanas corredizas para fraccionamiento.",
      monto: 6760,
      referencia: "OV-3001",
      estado: "entregado",
      responsable_id: null,
      responsable_nombre: null,
      creado_por_id: null,
      creado_por_nombre: null,
      motivo_rechazo: null,
      created_at: diasAtras(12),
      updated_at: diasAtras(1),
    },
    {
      id: "cv-2",
      cliente_id: "cli-constru",
      cliente_nombre: "Constructora Mira",
      titulo: "Cancelería oficina PB",
      descripcion: "Cancelería completa de planta baja, torre Mira.",
      monto: 18400,
      referencia: "OV-3002",
      estado: "en_produccion",
      responsable_id: "user-ventas-2",
      responsable_nombre: "Ana Torres (Ventas)",
      creado_por_id: null,
      creado_por_nombre: null,
      motivo_rechazo: null,
      created_at: diasAtras(8),
      updated_at: diasAtras(2),
    },
    {
      id: "cv-3",
      cliente_id: "cli-arq",
      cliente_nombre: "Arq. Laura Domínguez",
      titulo: "Puerta corrediza",
      descripcion: "Puerta corrediza a medida para residencia.",
      monto: 260,
      referencia: "OV-3003",
      estado: "cotizacion",
      responsable_id: null,
      responsable_nombre: null,
      creado_por_id: null,
      creado_por_nombre: null,
      motivo_rechazo: null,
      created_at: diasAtras(3),
      updated_at: diasAtras(3),
    },
    {
      id: "cv-4",
      cliente_id: "cli-bajio",
      cliente_nombre: "Fachadas del Bajío",
      titulo: "Fachada local comercial",
      descripcion: "El cliente pospuso el proyecto.",
      monto: 25000,
      referencia: "OV-3004",
      estado: "cancelado",
      responsable_id: null,
      responsable_nombre: null,
      creado_por_id: null,
      creado_por_nombre: null,
      motivo_rechazo: null,
      created_at: diasAtras(15),
      updated_at: diasAtras(10),
    },
  ];

  const casos_venta_items: CasoVentaItem[] = [
    { id: "cvi-1", caso_venta_id: "cv-1", material_id: "mat-perf001", cantidad: 40, precio_unitario: 130 },
    { id: "cvi-2", caso_venta_id: "cv-1", material_id: "mat-her002", cantidad: 24, precio_unitario: 65 },
    { id: "cvi-3", caso_venta_id: "cv-2", material_id: "mat-perf002", cantidad: 60, precio_unitario: 210 },
    { id: "cvi-4", caso_venta_id: "cv-2", material_id: "mat-lam001", cantidad: 10, precio_unitario: 580 },
    { id: "cvi-5", caso_venta_id: "cv-3", material_id: "mat-her002", cantidad: 4, precio_unitario: 65 },
    { id: "cvi-6", caso_venta_id: "cv-4", material_id: "mat-perf003", cantidad: 100, precio_unitario: 250 },
  ];

  // cv-1 está entregado → sus salidas esperan confirmación manual.
  const salidas_pendientes: SalidaPendiente[] = [
    {
      id: "sp-1",
      caso_venta_id: "cv-1",
      material_id: "mat-perf001",
      cantidad: 40,
      estado: "pendiente",
      movimiento_id: null,
      responsable_id: "user-ventas-1",
      responsable_nombre: "Carlos Peña (Ventas)",
      created_at: diasAtras(1),
      resuelta_at: null,
    },
    {
      id: "sp-2",
      caso_venta_id: "cv-1",
      material_id: "mat-her002",
      cantidad: 24,
      estado: "pendiente",
      movimiento_id: null,
      responsable_id: null,
      responsable_nombre: null,
      created_at: diasAtras(1),
      resuelta_at: null,
    },
  ];

  // Vacío a propósito: la sincronización en lectura las genera al abrir
  // el portal de proveedores.
  const notificaciones: Notificacion[] = [];

  // Historial de costos y precios: punto de partida + un par de cambios para
  // que las gráficas tengan curva desde el inicio en modo demo.
  let hp = 0;
  const hist = (
    material_id: string,
    tipo: HistorialPrecio["tipo"],
    valor: number,
    fuente: HistorialPrecio["fuente"],
    dias: number
  ): HistorialPrecio => {
    const m = materiales.find((x) => x.id === material_id);
    return {
      id: `hp-seed-${++hp}`,
      material_id,
      material_nombre: m ? m.nombre : null,
      material_sku: m ? m.sku : null,
      tipo,
      valor,
      fuente,
      proveedor_id: m ? m.proveedor_id : null,
      cantidad: null,
      created_at: diasAtras(dias),
    };
  };

  const historial_precios: HistorialPrecio[] = materiales.flatMap((m) => [
    // Costo: punto inicial (hace 45 d) y el costo actual (WAC) hoy.
    hist(m.id, "costo", Math.round(m.costo_unitario * 0.92 * 100) / 100, "inicial", 45),
    hist(m.id, "costo", m.costo_unitario, "compra", 10),
    // Venta: precio actual.
    hist(m.id, "venta", m.precio_venta, "manual", 40),
  ]);

  // Convenios de ejemplo: precio pactado por debajo del WAC (el negocio de
  // negociar uno) y condiciones más específicas que el proveedor en general.
  const convenios: Convenio[] = [
    {
      id: "conv-perf001",
      proveedor_id: "prov-norte",
      material_id: "mat-perf001",
      precio_pactado: 80.0,
      cantidad_minima: 100,
      dias_entrega_pactado: 7, // más rápido que el declarado del proveedor (10)
      condiciones_pago: "30 días fecha factura",
      vigencia_hasta: null, // sin vencimiento
      notas: "Convenio anual, revisar en enero.",
      activo: true,
      auto_enviar: true,
      created_at: diasAtras(30),
      updated_at: diasAtras(30),
    },
    {
      id: "conv-her001",
      proveedor_id: "prov-mty",
      material_id: "mat-her001",
      precio_pactado: 26.5,
      cantidad_minima: 200,
      dias_entrega_pactado: 4, // más rápido que el declarado del proveedor (5)
      condiciones_pago: "Anticipo 50%, saldo contra entrega",
      vigencia_hasta: diasAtras(-180).slice(0, 10), // vence en ~6 meses
      notas: null,
      activo: true,
      auto_enviar: false,
      created_at: diasAtras(15),
      updated_at: diasAtras(15),
    },
  ];

  return {
    profiles: [...PERFILES_DEMO],
    categorias,
    ubicaciones,
    proveedores,
    materiales,
    movimientos,
    clientes,
    notificaciones,
    casos_compra,
    casos_venta,
    casos_venta_items,
    salidas_pendientes,
    emails_procesados: [],
    historial_precios,
    auditoria: [],
    material_stock_ubicacion: [],
    bom_items: [],
    convenios,
    convenios_cliente: [],
    devoluciones_venta: [],
    solicitudes_compra,
    casos_compra_eventos,
    casos_venta_eventos: [],
    conteos: [],
    conteo_items: [],
    configuracion_autorizacion: {
      monto_umbral_admin: 50000,
      updated_at: diasAtras(60),
      updated_por_nombre: null,
    },
    traslados: [],
    inspecciones_calidad: [],
    vistas_guardadas: [],
  };
}
