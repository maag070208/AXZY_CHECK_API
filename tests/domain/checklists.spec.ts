/**
 * [T-F0-14] Checklists → ítems. Las columnas booleanas siguen siendo la escritura
 * vigente; el trigger deja los ítems alineados en cada INSERT/UPDATE. Los conteos
 * de backfill se verifican en la migración.
 */
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildUser } from "../factories";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const checkedItems = async (uniformCheckId: number) =>
  (await prisma.uniformCheckItem.findMany({
    where: { uniformCheckId, checked: true },
    include: { uniformItem: true },
  })).map((r) => r.uniformItem.name).sort();

describe("uniforme", () => {
  it("cada revisión tiene una fila por ítem y las marcas siguen a las columnas", async () => {
    const guard = await buildUser("GUARD");
    const evaluator = await buildUser("SHIFT");
    const check = await prisma.uniformCheck.create({
      data: { guardId: guard.id, evaluatedById: evaluator.id, pantalon: true, botas: true },
    });

    expect(await prisma.uniformCheckItem.count({ where: { uniformCheckId: check.id } })).toBe(11);
    expect(await checkedItems(check.id)).toEqual(["BOTAS", "PANTALON"]);

    await prisma.uniformCheck.update({ where: { id: check.id }, data: { botas: false, gorra: true } });
    expect(await checkedItems(check.id)).toEqual(["GORRA", "PANTALON"]);
  });
});

describe("entrega de turno", () => {
  it("cada entrega tiene una fila por ítem y las marcas siguen a las columnas", async () => {
    const creator = await buildUser("SHIFT");
    const handover = await prisma.shiftHandover.create({
      data: { shiftType: "MATUTINO", handoverDate: new Date("2026-10-20"), createdById: creator.id, checklistKeys: true },
    });

    const items = await prisma.shiftHandoverCheck.findMany({
      where: { shiftHandoverId: handover.id },
      include: { handoverChecklistItem: true },
    });
    expect(items).toHaveLength(7);
    expect(items.filter((i) => i.checked).map((i) => i.handoverChecklistItem.name)).toEqual(["KEYS"]);

    await prisma.shiftHandover.update({ where: { id: handover.id }, data: { checklistKeys: false, reportedToAdmin: true } });
    const after = await prisma.shiftHandoverCheck.findMany({
      where: { shiftHandoverId: handover.id, checked: true },
      include: { handoverChecklistItem: true },
    });
    expect(after.map((i) => i.handoverChecklistItem.name)).toEqual(["REPORTED_TO_ADMIN"]);
  });
});
