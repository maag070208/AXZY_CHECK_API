/**
 * Multicliente, fase 1: el cliente sale de `req.scope` (sesión), nunca de lo que manda el usuario.
 * Ningún archivo de src/ puede leer `clientId` de `body`, `query` ni `params`.
 */
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../../src");

const FORBIDDEN: RegExp[] = [
  // req.body.clientId, req.query?.clientId, body["clientId"], params.clientId...
  /\b(body|query|params)\s*\??\.\s*clientId\b/,
  /\b(body|query|params)\s*\??\.?\s*\[\s*["'`]clientId["'`]\s*\]/,
  // const { clientId } = req.body / req.query / req.params
  /\{[^}]*\bclientId\b[^}]*\}\s*(:[^=]+)?=\s*req\s*\.\s*(body|query|params)\b/,
];

/**
 * Única excepción: la administración de la organización (fase 3) manda el cliente DESTINO de una asignación de
 * guardia o filtra la lista por cliente. No es el alcance de la petición (el alcance sigue saliendo del token) y
 * estos endpoints exigen `guard.assign`. Cualquier otro archivo que lea clientId de la petición es un error.
 */
const ALLOWED_TARGET_CLIENT_FILES = new Set(["modules/guard-assignments/guard-assignments.controller.ts"]);

const walk = (dir: string, out: string[]): void => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
};

describe("el cliente no viene de la petición", () => {
  const files: string[] = [];
  walk(SRC, files);

  it("hay archivos que revisar", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("ningún archivo lee clientId de body, query o params", () => {
    const offenders = files
      .filter((file) => !ALLOWED_TARGET_CLIENT_FILES.has(path.relative(SRC, file).replace(/\\/g, "/")))
      .flatMap((file) =>
      fs
        .readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => FORBIDDEN.some((re) => re.test(line)))
        .map(({ line, i }) => `${path.relative(SRC, file)}:${i + 1}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });

  it("la excepción de administración no construye el alcance desde la petición", () => {
    const file = path.join(SRC, "modules/guard-assignments/guard-assignments.controller.ts");
    const content = fs.readFileSync(file, "utf8");
    expect(content).not.toMatch(/req\.scope\s*=/);
    expect(content).toContain("req.scope");
  });

  it("las reglas detectan los casos prohibidos", () => {
    const samples = [
      "const id = req.body.clientId;",
      "where: { clientId: req.query?.clientId }",
      "const c = body['clientId'];",
      "const { clientId, name } = req.body;",
      "const { clientId }: Dto = req.query;",
    ];
    for (const sample of samples) expect(FORBIDDEN.some((re) => re.test(sample))).toBe(true);
    expect(FORBIDDEN.some((re) => re.test("where: { ...scopeByClient(req.scope) }"))).toBe(false);
    expect(FORBIDDEN.some((re) => re.test("const { clientRef } = req.body;"))).toBe(false);
  });
});
