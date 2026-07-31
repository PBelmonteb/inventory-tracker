"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { Button, Card, Label, Select } from "@/components/ui";
import {
  importarMateriales,
  type FilaImport,
  type ImportResult,
} from "@/lib/actions/importar";
import { Download, FileUp, CheckCircle2 } from "lucide-react";

// Campos destino -> etiqueta y si es numérico.
const CAMPOS = [
  { key: "nombre", label: "Nombre *", obligatorio: true },
  { key: "sku", label: "SKU / Código" },
  { key: "descripcion", label: "Descripción" },
  { key: "categoria", label: "Categoría" },
  { key: "ubicacion", label: "Ubicación" },
  { key: "proveedor", label: "Proveedor" },
  { key: "unidad", label: "Unidad" },
  { key: "stock_minimo", label: "Stock mínimo", num: true },
  { key: "costo_unitario", label: "Costo unitario", num: true },
  { key: "stock_inicial", label: "Stock inicial", num: true },
] as const;

const SIN = "__sin__";
const MAX_MB = 5;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

const ALIAS: Record<string, string[]> = {
  nombre: ["nombre", "material", "descripcion corta", "producto", "articulo"],
  sku: ["sku", "codigo", "clave", "code", "no parte", "numero de parte"],
  descripcion: ["descripcion", "detalle"],
  categoria: ["categoria", "tipo", "familia", "linea"],
  ubicacion: ["ubicacion", "almacen", "estante", "zona", "rack"],
  proveedor: ["proveedor", "supplier", "fabricante"],
  unidad: ["unidad", "um", "medida", "u m"],
  stock_minimo: ["stock minimo", "minimo", "min", "punto de reorden"],
  costo_unitario: ["costo", "precio", "costo unitario", "precio unitario", "valor"],
  stock_inicial: ["stock", "existencia", "cantidad", "inicial", "stock inicial", "existencias"],
};

function adivinar(campo: string, columnas: string[]): string {
  const candidatos = ALIAS[campo] ?? [norm(campo)];
  const exacto = columnas.find((c) => candidatos.some((a) => norm(c) === a));
  if (exacto) return exacto;
  const parcial = columnas.find((c) =>
    candidatos.some((a) => norm(c).includes(a))
  );
  return parcial ?? SIN;
}

/** Parseo robusto de números: quita $, %, unidades y maneja , o . como decimal. */
function parseNumero(v: unknown): number {
  if (typeof v === "number") return v;
  let s = String(v ?? "").trim();
  if (!s) return 0;
  s = s.replace(/[^0-9.,-]/g, ""); // quita moneda, letras, espacios, %
  if (!s) return 0;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // El separador decimal es el que aparece más a la derecha.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // Solo coma: "1,234" (miles) vs "85,5" (decimal).
    s = /,\d{3}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  }
  s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

type Crudas = unknown[][];

/** A partir de la fila de encabezado, arma columnas (únicas) y filas-objeto. */
function construir(crudas: Crudas, headerIdx: number) {
  const rawHeaders = (crudas[headerIdx] ?? []).map((c, i) => {
    const s = String(c ?? "").trim();
    return s || `Columna ${i + 1}`;
  });
  const vistos = new Map<string, number>();
  const columnas = rawHeaders.map((h) => {
    const n = vistos.get(h) ?? 0;
    vistos.set(h, n + 1);
    return n === 0 ? h : `${h} (${n + 1})`;
  });
  const filas: Record<string, unknown>[] = [];
  for (let r = headerIdx + 1; r < crudas.length; r++) {
    const row = crudas[r] ?? [];
    if (row.every((c) => String(c ?? "").trim() === "")) continue;
    const obj: Record<string, unknown> = {};
    columnas.forEach((h, i) => (obj[h] = row[i] ?? ""));
    filas.push(obj);
  }
  return { columnas, filas };
}

/** Detecta la fila de encabezado: la que más parece (alias + celdas llenas). */
function detectarEncabezado(crudas: Crudas): number {
  const tope = Math.min(crudas.length, 12);
  let mejor = 0;
  let mejorPunt = -1;
  for (let i = 0; i < tope; i++) {
    const celdas = (crudas[i] ?? [])
      .map((c) => String(c ?? "").trim())
      .filter(Boolean);
    if (celdas.length === 0) continue;
    let punt = celdas.length; // más columnas llenas = más probable encabezado
    for (const c of celdas) {
      const hit = Object.values(ALIAS).some((al) =>
        al.some((a) => norm(c) === a || norm(c).includes(a))
      );
      if (hit) punt += 3;
    }
    if (punt > mejorPunt) {
      mejorPunt = punt;
      mejor = i;
    }
  }
  return mejor;
}

export function ImportarView() {
  const router = useRouter();
  const [wb, setWb] = useState<XLSX.WorkBook | null>(null);
  const [hojas, setHojas] = useState<string[]>([]);
  const [hoja, setHoja] = useState("");
  const [crudas, setCrudas] = useState<Crudas>([]);
  const [filaEncabezado, setFilaEncabezado] = useState(0);
  const [mapeo, setMapeo] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<ImportResult | null>(null);
  const [cargando, setCargando] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState("");

  const { columnas, filas } = useMemo(
    () => construir(crudas, filaEncabezado),
    [crudas, filaEncabezado]
  );

  function cargarHoja(libro: XLSX.WorkBook, nombreHoja: string) {
    const ws = libro.Sheets[nombreHoja];
    const arr = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: "",
      blankrows: false,
      raw: true,
    });
    const head = detectarEncabezado(arr);
    setCrudas(arr);
    setFilaEncabezado(head);
    const { columnas: cols } = construir(arr, head);
    const auto: Record<string, string> = {};
    for (const c of CAMPOS) auto[c.key] = adivinar(c.key, cols);
    setMapeo(auto);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      alert(`El archivo supera ${MAX_MB} MB. Divídelo o quita columnas extra.`);
      return;
    }
    setNombreArchivo(file.name);
    setResultado(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        // raw:true evita que SheetJS adivine números en CSV (p.ej. "410,00"
        // → 41000); preferimos parsear los decimales nosotros (parseNumero).
        const libro = XLSX.read(data, { type: "array", raw: true });
        if (libro.SheetNames.length === 0) {
          alert("El archivo no tiene hojas.");
          return;
        }
        setWb(libro);
        setHojas(libro.SheetNames);
        const primera = libro.SheetNames[0];
        setHoja(primera);
        cargarHoja(libro, primera);
      } catch {
        alert("No se pudo leer el archivo. ¿Es un Excel o CSV válido?");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function cambiarHoja(nombreHoja: string) {
    if (!wb) return;
    setHoja(nombreHoja);
    setResultado(null);
    cargarHoja(wb, nombreHoja);
  }

  function reAdivinar(cols: string[]) {
    const auto: Record<string, string> = {};
    for (const c of CAMPOS) auto[c.key] = adivinar(c.key, cols);
    setMapeo(auto);
  }

  function cambiarFilaEncabezado(idx: number) {
    setFilaEncabezado(idx);
    const { columnas: cols } = construir(crudas, idx);
    reAdivinar(cols);
  }

  // Convierte una fila cruda a su versión mapeada (para vista previa e import).
  const mapearFila = (row: Record<string, unknown>): FilaImport => {
    const obj: Record<string, unknown> = {};
    for (const campo of CAMPOS) {
      const col = mapeo[campo.key];
      if (!col || col === SIN) continue;
      const valor = row[col];
      obj[campo.key] =
        "num" in campo && campo.num
          ? parseNumero(valor)
          : String(valor ?? "").trim();
    }
    return obj as unknown as FilaImport;
  };

  const preview = useMemo(
    () => filas.slice(0, 5).map(mapearFila),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, mapeo]
  );

  const camposMapeados = CAMPOS.filter(
    (c) => mapeo[c.key] && mapeo[c.key] !== SIN
  );

  function descargarPlantilla() {
    const ws = XLSX.utils.json_to_sheet([
      {
        nombre: 'Perfil aluminio 1"',
        sku: "PERF-001",
        descripcion: "Perfil estructural",
        categoria: "Perfiles de aluminio",
        ubicacion: "Almacén A",
        proveedor: "Aluminios del Norte",
        unidad: "m",
        stock_minimo: 200,
        costo_unitario: 85.5,
        stock_inicial: 500,
      },
    ]);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, ws, "Materiales");
    XLSX.writeFile(libro, "plantilla-inventario.xlsx");
  }

  async function importar() {
    setCargando(true);
    setResultado(null);
    const payload = filas.map(mapearFila);
    const res = await importarMateriales(payload);
    setResultado(res);
    setCargando(false);
    if (res.ok) router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Sin h1 propio: vive como tab dentro de Administración. */}
      <div className="mb-6 flex justify-end">
        <Button variant="secondary" onClick={descargarPlantilla}>
          <Download className="h-4 w-4" /> Descargar plantilla
        </Button>
      </div>

      <Card className="mb-4 p-5">
        <Label htmlFor="archivo">Archivo Excel (.xlsx) o CSV</Label>
        <input
          id="archivo"
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={onFile}
          className="block w-full cursor-pointer text-sm text-muted file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent-fg hover:file:opacity-90"
        />
        {nombreArchivo && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
            <FileUp className="h-4 w-4" /> {nombreArchivo} · {filas.length} filas
          </p>
        )}

        {hojas.length > 1 && (
          <div className="mt-4 max-w-xs">
            <Label>Hoja</Label>
            <Select value={hoja} onChange={(e) => cambiarHoja(e.target.value)}>
              {hojas.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </Select>
          </div>
        )}

        {crudas.length > 0 && (
          <div className="mt-4 max-w-xs">
            <Label>Fila de encabezados</Label>
            <Select
              value={String(filaEncabezado)}
              onChange={(e) => cambiarFilaEncabezado(Number(e.target.value))}
            >
              {crudas.slice(0, 12).map((row, i) => {
                const muestra = (row ?? [])
                  .map((c) => String(c ?? "").trim())
                  .filter(Boolean)
                  .slice(0, 4)
                  .join(" · ");
                return (
                  <option key={i} value={i}>
                    Fila {i + 1}: {muestra || "(vacía)"}
                  </option>
                );
              })}
            </Select>
            <p className="mt-1 text-xs text-faint">
              Si tu Excel tiene títulos arriba, elige la fila que tiene los
              nombres de columna.
            </p>
          </div>
        )}
      </Card>

      {columnas.length > 0 && (
        <Card className="mb-4 p-5">
          <h2 className="mb-3 font-semibold text-fg">Asignar columnas</h2>
          <p className="mb-4 text-sm text-muted">
            La app ya asignó lo que reconoció. Ajusta lo que falte.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {CAMPOS.map((campo) => (
              <div key={campo.key}>
                <Label>{campo.label}</Label>
                <Select
                  value={mapeo[campo.key] ?? SIN}
                  onChange={(e) =>
                    setMapeo({ ...mapeo, [campo.key]: e.target.value })
                  }
                >
                  <option value={SIN}>— No importar —</option>
                  {columnas.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
        </Card>
      )}

      {camposMapeados.length > 0 && preview.length > 0 && (
        <Card className="mb-4 p-5">
          <h2 className="mb-1 font-semibold text-fg">Vista previa</h2>
          <p className="mb-3 text-sm text-muted">
            Así se importarán las primeras filas. Revisa que los números y
            nombres queden bien.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-faint">
                  {camposMapeados.map((c) => (
                    <th key={c.key} className="px-2 py-2 font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.map((fila, i) => (
                  <tr key={i}>
                    {camposMapeados.map((c) => (
                      <td key={c.key} className="px-2 py-2 text-fg">
                        {String(
                          (fila as unknown as Record<string, unknown>)[c.key] ??
                            ""
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex justify-end">
            <Button
              onClick={importar}
              disabled={cargando || !mapeo.nombre || mapeo.nombre === SIN}
            >
              {cargando
                ? "Importando..."
                : `Importar ${filas.length} materiales`}
            </Button>
          </div>
          {(!mapeo.nombre || mapeo.nombre === SIN) && (
            <p className="mt-2 text-right text-xs text-amber-600 dark:text-amber-400">
              Asigna la columna de “Nombre” para poder importar.
            </p>
          )}
        </Card>
      )}

      {resultado && resultado.ok && (
        <Card className="p-5">
          <p className="flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            {resultado.creados} materiales importados.
          </p>
          {resultado.errores.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                {resultado.errores.length} avisos:
              </p>
              <ul className="mt-1 max-h-48 overflow-y-auto text-xs text-muted">
                {resultado.errores.map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {resultado && !resultado.ok && (
        <Card className="p-5">
          <p className="text-sm text-red-600 dark:text-red-400">
            {resultado.error}
          </p>
        </Card>
      )}
    </div>
  );
}
