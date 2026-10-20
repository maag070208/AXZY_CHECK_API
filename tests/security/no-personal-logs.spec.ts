/**
 * [S-07 / F9] Regresión: los archivos del login, de asignaciones y del catálogo
 * no vuelven a imprimir datos personales ni consultas en consola.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..", "..", "src");
const FILES = [
  "modules/users/user.controller.ts",
  "modules/assignments/assignment.controller.ts",
  "modules/catalog/catalog.service.ts",
];

describe("sin logs de datos personales", () => {
  it.each(FILES)("%s no imprime con console.log", (file) => {
    const src = fs.readFileSync(path.join(ROOT, file), "utf-8");
    expect(src.match(/console\.log\(/g) ?? []).toHaveLength(0);
  });
});
