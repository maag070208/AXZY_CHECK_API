/**
 * [T-E6-T1] Ninguna cadena de un cliente concreto fuera de src/client/ y de las
 * semillas de cliente. Al derivar un repo para otro cliente, el código base no
 * debe arrastrar nombres, zonas horarias ni correos de este.
 */
import * as fs from "fs";
import * as path from "path";

const API_ROOT = path.resolve(__dirname, "../..");

/** Dónde se permite la configuración de cliente. */
const ALLOWED = [path.join(API_ROOT, "src", "client"), path.join(API_ROOT, "prisma", "seeds", "client"), path.join(API_ROOT, "prisma", "seeds", "demo")];
/** Historial de migraciones: es registro, no código vivo. */
const SKIP_DIRS = new Set(["node_modules", "dist", "migrations", "coverage"]);

/** Cadenas que delatan a un cliente o a credenciales. */
const FORBIDDEN = [
  "Tijuana",
  "Barcelona",
  "BARCELONA",
  "axzy",
  "railway.app",
  "@gmail.com",
  "Mantenimientos del Sitio",
  "maag070208",
  "asael070208",
  "aamaro",
  "martin@",
  "EAAW",
];

const walk = (dir: string, out: string[]): void => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (/\.(ts|js|json|md|html|py)$/.test(entry.name)) {
      out.push(full);
    }
  }
};

describe("sin cadenas de cliente fuera de la configuración de cliente", () => {
  const files: string[] = [];
  walk(path.join(API_ROOT, "src"), files);
  walk(path.join(API_ROOT, "prisma"), files);
  walk(path.join(API_ROOT, "scripts"), files);
  // Archivos sueltos de la raíz (scripts de una sola vez, etc.).
  for (const entry of fs.readdirSync(API_ROOT, { withFileTypes: true })) {
    if (entry.isFile() && /\.(ts|js|json|md|html|py)$/.test(entry.name)) files.push(path.join(API_ROOT, entry.name));
  }

  it("revisa archivos", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(FORBIDDEN)("no aparece %s", (token) => {
    const hits = files
      .filter((file) => !ALLOWED.some((dir) => file.startsWith(dir + path.sep)))
      .filter((file) => fs.readFileSync(file, "utf-8").includes(token))
      .map((file) => path.relative(API_ROOT, file));
    expect(hits).toEqual([]);
  });
});
