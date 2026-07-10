// Los tests de integración necesitan las mismas credenciales de Supabase que
// usa `npm run dev` vía `.env.local`, pero Vitest no las carga solo (a
// diferencia de Next.js). Las parseamos a mano para no sumar una dependencia
// nueva (dotenv) solo para esto.
import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(__dirname, "..", ".env.local");

if (fs.existsSync(envPath)) {
  const contenido = fs.readFileSync(envPath, "utf8");
  for (const linea of contenido.split(/\r?\n/)) {
    const m = linea.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const clave = m[1].trim();
    if (!(clave in process.env)) process.env[clave] = m[2].trim();
  }
}
