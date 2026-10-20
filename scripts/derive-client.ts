/**
 * [T-E6-04] Deriva un repositorio de cliente desde esta plantilla.
 *
 *   npx ts-node scripts/derive-client.ts --name cliente-ejemplo --target ../CLIENTE_API
 *
 * Copia el código sin dependencias, sin historial y sin .env. Después hay que
 * editar src/client/branding.ts, las semillas de cliente y crear el .env.
 */
import * as fs from "fs";
import * as path from "path";

const EXCLUDED = new Set(["node_modules", ".git", "dist", "coverage", ".env"]);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const readArg = (flag: string): string | undefined => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
};

const main = () => {
  const name = readArg("--name");
  const target = readArg("--target");
  if (!name || !SLUG.test(name)) {
    throw new Error("Indica --name con minúsculas, números y guiones (ej. cliente-ejemplo)");
  }
  if (!target) throw new Error("Indica --target con la carpeta destino");

  const source = path.resolve(__dirname, "..");
  const destination = path.resolve(target);
  if (fs.existsSync(destination) && fs.readdirSync(destination).length > 0) {
    throw new Error(`La carpeta destino no está vacía: ${destination}`);
  }

  fs.cpSync(source, destination, {
    recursive: true,
    filter: (src) => !EXCLUDED.has(path.basename(src)),
  });

  const packagePath = path.join(destination, "package.json");
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
  pkg.name = name;
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");

  console.log(`Plantilla copiada a ${destination}`);
  console.log("Siguientes pasos:");
  console.log("  1. Editar src/client/branding.ts y prisma/seeds/client/*.ts");
  console.log("  2. Copiar .env.example a .env y completar");
  console.log("  3. pnpm install && pnpm exec prisma migrate deploy && pnpm prisma:seed");
};

main();
