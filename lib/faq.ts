/** Quién puede ver esta pregunta: "todos", o solo un rol específico. */
export type RolFAQ = "operario" | "gestor" | "todos";

export interface FAQItem {
  pregunta: string;
  pasos: string[];
  nota?: string;
  rol: RolFAQ;
}

export interface FAQCategoria {
  categoria: string;
  items: FAQItem[];
}

/**
 * Preguntas frecuentes precargadas a mano (sin IA, sin costo por
 * pregunta). Se actualiza junto con cada función nueva — igual que
 * lib/novedades.ts, pero explicando "cómo se hace" en vez de "qué cambió".
 */
export const FAQ: FAQCategoria[] = [
  {
    categoria: "Para empezar",
    items: [
      {
        pregunta: "¿Qué puedo hacer según mi rol?",
        pasos: [
          "Operario: registra movimientos de material, escanea, hace conteos y traslados, y pide compras — pero no captura ni ve montos en dinero.",
          "Gerente y administrador: además de todo lo anterior, autorizan compras (capturan el monto), reciben mercancía, ven reportes y configuran catálogos.",
          "Solo administrador: da de alta usuarios, cambia roles y define el umbral de autorización por monto.",
        ],
        rol: "todos",
      },
      {
        pregunta: "¿Cómo instalo la app en mi celular?",
        pasos: [
          "Abre la app desde el navegador del celular (Chrome o Safari).",
          "Toca el menú del navegador y busca la opción \"Agregar a pantalla de inicio\" o \"Instalar app\".",
          "Se crea un ícono como el de cualquier app — desde ahí abre directo, sin pasar por el navegador.",
        ],
        nota: "La cámara para escanear solo funciona si la app se abre por HTTPS (así está configurada en producción).",
        rol: "todos",
      },
    ],
  },
  {
    categoria: "Movimientos de inventario",
    items: [
      {
        pregunta: "¿Cómo registro una entrada o salida de material?",
        pasos: [
          "Ve a Inventario y busca el material.",
          "Ábrelo y elige \"Registrar movimiento\".",
          "Indica si es entrada o salida, la cantidad y, si aplica, la ubicación.",
          "Guarda — el stock se actualiza al instante.",
        ],
        rol: "todos",
      },
      {
        pregunta: "¿Cómo escaneo un material con la cámara?",
        pasos: [
          "Ve a Escanear en el menú principal.",
          "Apunta la cámara al código QR del material (impreso desde Etiquetas).",
          "En cuanto lo reconoce, te lleva directo a registrar el movimiento de ese material.",
        ],
        rol: "todos",
      },
      {
        pregunta: "¿Cómo busco un movimiento anterior?",
        pasos: [
          "Ve a Movimientos.",
          "Usa los filtros de arriba: material o SKU, fecha, cantidad, usuario, ubicación o el identificador del caso ligado.",
          "La lista se actualiza sola conforme escribes.",
        ],
        rol: "todos",
      },
    ],
  },
  {
    categoria: "Compras",
    items: [
      {
        pregunta: "¿Cómo pido un material que se está agotando?",
        pasos: [
          "Desde el material en Inventario, o desde Proveedores, elige \"Nuevo caso de compra\".",
          "Indica el proveedor y la cantidad que necesitas.",
          "Guarda — el caso se manda automáticamente a un gerente o administrador para que capture el monto y lo autorice.",
        ],
        nota: "El operario no ve ni escribe el monto en ningún momento — eso le toca al gestor al autorizar.",
        rol: "operario",
      },
      {
        pregunta: "¿Qué pasa después de que mando un pedido a aprobar?",
        pasos: [
          "El caso aparece como \"Pendiente de autorizar\" — lo puedes ver de solo lectura en Proveedores o en Inicio.",
          "Un gerente o administrador captura el monto y lo autoriza (o lo rechaza con un motivo).",
          "Si lo rechazan, puedes editarlo y volver a mandarlo.",
          "Te llega una notificación en la campana en cuanto cambia de estado.",
        ],
        rol: "operario",
      },
      {
        pregunta: "¿Cómo autorizo un caso de compra?",
        pasos: [
          "Ve a Aprobaciones (o a Proveedores, pestaña \"Pendientes de autorizar\").",
          "Abre el caso y captura el monto del pedido.",
          "Autoriza o rechaza (con un motivo si rechazas).",
          "Si el monto supera el umbral configurado, se pide autorización de un administrador en vez de un gerente.",
        ],
        rol: "gestor",
      },
      {
        pregunta: "¿Cómo comparo cotizaciones de varios proveedores?",
        pasos: [
          "Cuando un material tiene más de un proveedor posible, al pedir cotización se manda a todos a la vez bajo un mismo código (SOL-xxxxxx).",
          "Conforme responden por correo, las cotizaciones se van ligando solas al caso.",
          "Desde el detalle del caso, compara precio y condiciones y elige la ganadora — las demás se cancelan solas.",
        ],
        rol: "gestor",
      },
      {
        pregunta: "¿Cómo recibo una compra que ya llegó?",
        pasos: [
          "Ve al caso de compra ya autorizado (estado \"ordenado\").",
          "Elige \"Recibir\" y captura el costo real de la factura.",
          "Puedes confirmar una entrega parcial si no llegó todo de un golpe.",
          "Al recibir, el stock entra solo y el costo promedio (WAC) del material se recalcula.",
        ],
        rol: "gestor",
      },
      {
        pregunta: "¿Qué significa cada estado de un caso de compra?",
        pasos: [
          "Pendiente: recién creado, esperando cotización o autorización.",
          "Cotizando: se mandó a uno o varios proveedores, esperando respuesta.",
          "Pendiente de autorizar: ya tiene proveedor y monto, esperando que un gestor lo apruebe.",
          "Ordenado: autorizado y enviado al proveedor, esperando que llegue.",
          "Recibido: la mercancía ya entró al inventario.",
          "Rechazado: un gestor lo regresó con un motivo — se puede editar y volver a mandar.",
        ],
        rol: "todos",
      },
    ],
  },
  {
    categoria: "Conteos y traslados",
    items: [
      {
        pregunta: "¿Cómo hago un conteo cíclico?",
        pasos: [
          "Ve a Conteos y elige \"Nuevo conteo\".",
          "Cuenta físicamente el material sin ver el stock que dice el sistema (conteo a ciegas).",
          "Captura la cantidad que contaste — el sistema muestra la diferencia y genera el ajuste correspondiente.",
        ],
        rol: "todos",
      },
      {
        pregunta: "¿Cómo traslado material entre bodegas?",
        pasos: [
          "Ve a Traslados y elige \"Nuevo traslado\".",
          "Indica material, cantidad, ubicación de origen y de destino.",
          "El traslado queda en tránsito hasta que se confirma la llegada al destino.",
        ],
        rol: "todos",
      },
      {
        pregunta: "¿Cómo veo qué stock está en tránsito?",
        pasos: [
          "Ve a Traslados — ahí se listan los que van en camino entre bodegas.",
          "En Inventario, cada material también muestra por separado lo comprometido y lo proyectado a llegar.",
        ],
        rol: "todos",
      },
    ],
  },
  {
    categoria: "Producción",
    items: [
      {
        pregunta: "¿Cómo registro una producción?",
        pasos: [
          "El producto terminado debe tener una receta cargada (qué insumos y cuánto de cada uno lleva).",
          "Desde el material del producto terminado, elige \"Producir\" e indica la cantidad.",
          "El sistema descuenta solo los insumos de la receta y da de alta el producto terminado con su costo ya calculado.",
        ],
        rol: "todos",
      },
    ],
  },
  {
    categoria: "Aprobaciones y notificaciones",
    items: [
      {
        pregunta: "¿Qué son las notificaciones y la campana?",
        pasos: [
          "Avisan de stock bajo o por agotarse, y de casos asignados a ti o que cambiaron de estado.",
          "Aparecen al instante (no hace falta refrescar la página) y también como un mensaje flotante.",
          "Se pueden cerrar una por una desde la campana.",
        ],
        rol: "todos",
      },
      {
        pregunta: "¿Cómo uso la bandeja de aprobaciones?",
        pasos: [
          "Ve a Aprobaciones — ahí se juntan en un solo lugar los casos de compra pendientes y los conteos con diferencia por revisar.",
          "Ábrelos desde ahí mismo para autorizar, rechazar o revisar, sin ir pestaña por pestaña.",
        ],
        rol: "gestor",
      },
    ],
  },
  {
    categoria: "Reportes y análisis",
    items: [
      {
        pregunta: "¿Para qué sirve Clasificación (ABC/XYZ)?",
        pasos: [
          "Agrupa los materiales por qué tanto valen (A/B/C) y qué tan parejo se vende cada uno (X/Y/Z).",
          "Ayuda a decidir a qué materiales ponerles más atención y control.",
        ],
        rol: "gestor",
      },
      {
        pregunta: "¿Para qué sirve el Scorecard de proveedores?",
        pasos: [
          "Muestra, con el historial real de compras, qué tan cumplidos son los proveedores en tiempo de entrega y en precio.",
        ],
        rol: "gestor",
      },
      {
        pregunta: "¿Para qué sirve el MRP?",
        pasos: [
          "Junta la demanda de ventas y de producción, explota las recetas (BOM) y calcula qué y cuánto habría que comprar o producir.",
        ],
        rol: "gestor",
      },
    ],
  },
  {
    categoria: "Administración",
    items: [
      {
        pregunta: "¿Cómo doy de alta un usuario o cambio su rol?",
        pasos: [
          "Ve a Usuarios (solo visible para administrador).",
          "Da de alta el correo y elige el rol: operario, gerente o administrador.",
          "El registro público está cerrado — solo así entran usuarios nuevos.",
        ],
        rol: "gestor",
      },
      {
        pregunta: "¿Dónde configuro el umbral de autorización?",
        pasos: [
          "Ve a Usuarios (solo administrador) y busca la tarjeta \"Umbral de autorización\".",
          "Los casos por debajo del monto los puede autorizar un gerente; por arriba, solo un administrador.",
        ],
        rol: "gestor",
      },
      {
        pregunta: "¿Cómo configuro convenios con proveedores?",
        pasos: [
          "Ve a Convenios y elige el proveedor y el material.",
          "Captura el precio pactado y las condiciones (mínimo, entrega, forma de pago).",
          "Ese precio se pre-llena solo la próxima vez que compres ese material a ese proveedor.",
        ],
        rol: "gestor",
      },
      {
        pregunta: "¿Cómo importo mi inventario desde Excel?",
        pasos: [
          "Ve a Importar y sube tu archivo tal como lo tienes hoy.",
          "Elige la hoja y confirma cómo se relacionan tus columnas con los campos de la app (el sistema propone un mapeo automático).",
          "Revisa la vista previa antes de confirmar la carga.",
        ],
        rol: "gestor",
      },
      {
        pregunta: "¿Cómo genero etiquetas QR para imprimir?",
        pasos: [
          "Ve a Etiquetas.",
          "Elige el o los materiales y genera las etiquetas.",
          "Imprímelas y pégalas en el material — luego se escanean desde Escanear.",
        ],
        rol: "gestor",
      },
    ],
  },
];

/** Filtra las preguntas visibles para el rol del usuario actual. */
export function faqParaRol(esGestorUsuario: boolean): FAQCategoria[] {
  return FAQ.map((cat) => ({
    categoria: cat.categoria,
    items: cat.items.filter(
      (item) => item.rol === "todos" || (item.rol === "gestor") === esGestorUsuario
    ),
  })).filter((cat) => cat.items.length > 0);
}
