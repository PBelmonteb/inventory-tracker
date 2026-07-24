export type TipoNovedad = "nuevo" | "mejora" | "correccion";

export interface Novedad {
  titulo: string;
  descripcion: string;
  tipo: TipoNovedad;
}

export interface NovedadesMes {
  mes: string;
  items: Novedad[];
}

/**
 * Registro de novedades en lenguaje llano (para el cliente, no para el equipo
 * técnico). Se agrega una entrada nueva arriba del todo cada vez que se
 * termina una función o se corrige algo que vale la pena avisar — más
 * reciente primero, agrupado por mes.
 */
export const NOVEDADES: NovedadesMes[] = [
  {
    mes: "Julio 2026",
    items: [
      {
        titulo: "Aviso de correos sospechosos",
        descripcion:
          "El sistema avisa cuando un correo de un caso no viene realmente del proveedor esperado, para que no se te cuele una respuesta equivocada o falsa.",
        tipo: "nuevo",
      },
      {
        titulo: "Comparar cotizaciones de varios proveedores",
        descripcion:
          "Cuando un material se puede comprar con más de un proveedor, el sistema pide cotización a todos a la vez y te deja comparar antes de elegir con quién comprar.",
        tipo: "nuevo",
      },
      {
        titulo: "Correo completo en el historial de cada caso",
        descripcion:
          "El correo enviado o recibido de cada compra queda guardado tal cual, no solo un resumen — se puede leer completo desde el propio caso.",
        tipo: "mejora",
      },
      {
        titulo: "Reabasto automático",
        descripcion:
          "Cuando el precio y las condiciones ya están pactados con el proveedor, la orden de compra se genera y se envía sola en cuanto el stock baja del punto de reabasto.",
        tipo: "nuevo",
      },
      {
        titulo: "Convenios con proveedores",
        descripcion:
          "Guarda el precio y las condiciones ya negociadas con cada proveedor; se usan solas al armar cualquier compra nueva, sin volver a escribirlas.",
        tipo: "nuevo",
      },
      {
        titulo: "Punto de reabasto calculado solo",
        descripcion:
          "El sistema calcula cuándo conviene comprar cada material con tu historial real de ventas y tiempos de entrega, en vez de un número puesto a ojo.",
        tipo: "nuevo",
      },
      {
        titulo: "Producción con receta",
        descripcion:
          "Define una receta (\"1 producto terminado = X + Y + Z insumos\") y produce con un clic: el sistema descuenta todos los insumos y da de alta el producto ya con su costo calculado.",
        tipo: "nuevo",
      },
      {
        titulo: "Control por bodega",
        descripcion:
          "Ahora se sabe cuánto hay en cada ubicación, no solo el total, y los traslados entre bodegas quedan registrados sin perder el rastro.",
        tipo: "mejora",
      },
      {
        titulo: "Responsable por caso",
        descripcion:
          "Cada caso de compra o de venta puede tener un encargado asignado, con aviso automático para esa persona.",
        tipo: "mejora",
      },
      {
        titulo: "Confirmar entregas parciales",
        descripcion:
          "Ya no hace falta confirmar una entrega completa de un solo golpe — se puede confirmar solo la parte que ya llegó.",
        tipo: "mejora",
      },
      {
        titulo: "Bitácora de auditoría",
        descripcion:
          "Queda registro de quién dio de alta, editó o eliminó cada material o catálogo.",
        tipo: "mejora",
      },
      {
        titulo: "Gestión de usuarios desde la app",
        descripcion:
          "Dar de alta empleados y cambiar su rol ya no requiere tocar la base de datos — se hace desde la app.",
        tipo: "mejora",
      },
      {
        titulo: "Revisión general de estabilidad",
        descripcion:
          "Ajustes de seguridad y de comportamiento encontrados en una revisión completa de la app antes de mostrarla a clientes reales.",
        tipo: "correccion",
      },
    ],
  },
  {
    mes: "Junio 2026",
    items: [
      {
        titulo: "Primera versión",
        descripcion:
          "Registro de inventario en tiempo real, con historial de movimientos y de costos.",
        tipo: "nuevo",
      },
      {
        titulo: "Portal de proveedores y de clientes",
        descripcion:
          "Seguimiento de cada compra (pendiente → cotizando → ordenado → recibido) y de cada pedido de venta, con confirmación de entrega.",
        tipo: "nuevo",
      },
      {
        titulo: "Correo que se convierte en caso de compra",
        descripcion:
          "Un correo de un proveedor puede convertirse solo en un caso de compra, sin capturarlo a mano.",
        tipo: "nuevo",
      },
      {
        titulo: "Avisos de stock bajo",
        descripcion:
          "Campana de notificaciones con un umbral de aviso configurable para cada material.",
        tipo: "nuevo",
      },
      {
        titulo: "Escaneo QR y etiquetas",
        descripcion:
          "Escanea el código de un material con la cámara del celular para registrar un movimiento al instante.",
        tipo: "nuevo",
      },
      {
        titulo: "Importador de Excel",
        descripcion:
          "Sube tu inventario tal como lo tienes hoy, sin reacomodar columnas ni encabezados.",
        tipo: "nuevo",
      },
    ],
  },
];
