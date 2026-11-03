/**
 * Multicliente, fase 5 · personas (`Person.clientId` propio): el cliente A no ve ni toca las personas de B.
 *
 * Organización COMPANY con dos clientes: el administrador elige con X-Client-Id. La persona nace en el cliente
 * del alcance (o en el de la propiedad cuando se da de alta en un hogar), sin cliente no se puede crear, las
 * referencias cruzadas en un alta son 400 y los duplicados se avisan solo dentro del mismo cliente.
 */
import request from "supertest";
import { app } from "@src/app";
import { resetDatabase, disconnectDatabase, prisma } from "../setup/db";
import { buildOrganization, buildUser, tokenFor } from "../factories";

const V1 = "/api/v1";

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await disconnectDatabase();
});

const bearer = (user: Parameters<typeof tokenFor>[0]) => ({ Authorization: `Bearer ${tokenFor(user)}` });

/** Catálogos que exige el alta de propiedades creadas directo con Prisma. */
const propertyCatalogs = async () => {
  const kind = await prisma.propertyKind.findUniqueOrThrow({ where: { code: "HOUSE" } });
  const vacant = await prisma.occupancyStatus.findUniqueOrThrow({ where: { code: "VACANT" } });
  const type = await prisma.propertyType.findUniqueOrThrow({ where: { name: "CASA" } });
  const status = await prisma.propertyStatus.findUniqueOrThrow({ where: { name: "VACNT" } });
  return { kind, vacant, type, status };
};

const setup = async () => {
  const { organization, clients } = await buildOrganization("COMPANY", 2);
  const [a, b] = clients;
  // Organización con dos clientes: el ADMIN sin X-Client-Id no tiene cliente (403 en datos de cliente).
  const admin = await buildUser("ADMIN", { scope: { organizationId: organization.id, clientId: null } });
  // Administrador del cliente A (rol CLIENT): alcance fijo a su cliente, sin selector.
  const clientAdminA = await buildUser("CLIENT", { scope: { organizationId: organization.id, clientId: a.id } });

  const { kind, vacant, type, status } = await propertyCatalogs();
  const makeProperty = (clientId: number, identifier: string) =>
    prisma.property.create({
      data: { clientId, identifier, name: identifier, mainStreet: "Calle", typeId: type.id, statusId: status.id, kindId: kind.id, occupancyStatusId: vacant.id },
    });
  const propertyA = await makeProperty(a.id, "PER-A");
  const propertyA2 = await makeProperty(a.id, "PER-A2");
  const propertyB = await makeProperty(b.id, "PER-B");

  const asAdmin = (clientId: number) => ({ ...bearer(admin), "X-Client-Id": String(clientId) });
  const personsOf = (clientId: number, q = "") =>
    request(app).get(`${V1}/persons`).query(q ? { q } : {}).set(asAdmin(clientId));

  return { organization, a, b, admin, clientAdminA, propertyA, propertyA2, propertyB, asAdmin, personsOf };
};

describe("personas · aislamiento por cliente", () => {
  it("una persona creada en A no se ve ni se consulta desde B; el administrador CLIENT solo ve su cliente", async () => {
    const { a, b, asAdmin, personsOf, clientAdminA } = await setup();

    const created = await request(app).post(`${V1}/persons`).set(asAdmin(a.id)).send({ firstName: "Secreta", lastName: "DeA", phone: "555-0101" });
    expect(created.status).toBe(201);
    expect(created.body.data.clientId).toBe(a.id);

    const ofA = await personsOf(a.id, "Secreta");
    expect(ofA.status).toBe(200);
    expect(ofA.body.data.map((p: any) => p.id)).toEqual([created.body.data.id]);

    // Desde B la persona no existe: el listado sale vacío y los recursos derivados dan 404 (no se revela).
    const ofB = await personsOf(b.id, "Secreta");
    expect(ofB.status).toBe(200);
    expect(ofB.body.data).toEqual([]);
    expect((await request(app).get(`${V1}/persons/${created.body.data.id}/contacts`).set(asAdmin(b.id))).status).toBe(404);
    expect((await request(app).post(`${V1}/persons/${created.body.data.id}/contacts`).set(asAdmin(b.id)).send({ name: "Contacto" })).status).toBe(404);
    expect((await request(app).get(`${V1}/persons/${created.body.data.id}/documents`).set(asAdmin(b.id))).status).toBe(404);

    // El administrador del cliente A (rol CLIENT) tiene alcance fijo a A: ve a la persona y crea en A.
    const clientView = await request(app).get(`${V1}/persons`).query({ q: "Secreta" }).set(bearer(clientAdminA));
    expect(clientView.status).toBe(200);
    expect(clientView.body.data.map((p: any) => p.id)).toEqual([created.body.data.id]);
    const clientCreated = await request(app).post(`${V1}/persons`).set(bearer(clientAdminA)).send({ firstName: "DelClienteA", phone: "555-0199" });
    expect(clientCreated.status).toBe(201);
    expect(clientCreated.body.data.clientId).toBe(a.id);

    // Desde la contracción de fase 5 no existen personas sin cliente: la columna es NOT NULL.
    const orphanClient = await prisma.client.findFirst({ where: { id: { notIn: [a.id, b.id] } } });
    expect(orphanClient).toBeNull();
  });

  it("sin cliente en el alcance no se puede crear ni listar personas (403)", async () => {
    const { admin } = await setup();
    const auth = bearer(admin);

    const before = await prisma.person.count();
    const created = await request(app).post(`${V1}/persons`).set(auth).send({ firstName: "SinCliente" });
    expect(created.status).toBe(403);
    expect(created.body.code).toBe("CLIENT_SCOPE_REQUIRED");
    expect(await prisma.person.count()).toBe(before);

    const listed = await request(app).get(`${V1}/persons`).set(auth);
    expect(listed.status).toBe(403);
    expect(listed.body.code).toBe("CLIENT_SCOPE_REQUIRED");
  });

  it("los duplicados se avisan solo dentro del cliente; no cruzan clientes", async () => {
    const { a, b, asAdmin } = await setup();
    const body = { firstName: "Ana", lastName: "Duplicada", phone: "6640000000" };

    const inA = await request(app).post(`${V1}/persons`).set(asAdmin(a.id)).send(body);
    expect(inA.status).toBe(201);

    // El mismo teléfono/nombre en B no es duplicado: son personas de clientes distintos.
    const inB = await request(app).post(`${V1}/persons`).set(asAdmin(b.id)).send(body);
    expect(inB.status).toBe(201);
    expect(inB.body.data.clientId).toBe(b.id);

    // En A sí avisa (409) y se puede confirmar la creación de otra persona parecida.
    const twice = await request(app).post(`${V1}/persons`).set(asAdmin(a.id)).send(body);
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe("DUPLICATE_PERSON");
    const confirmed = await request(app).post(`${V1}/persons`).set(asAdmin(a.id)).send({ ...body, confirmNewPerson: true });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.data.clientId).toBe(a.id);
  });

  it("el alta persona → hogar nace en el cliente de la propiedad y la referencia ajena es 400", async () => {
    const { a, b, asAdmin, personsOf, propertyA, propertyA2, propertyB } = await setup();

    // Alta de una persona nueva en el hogar de A: nace en el cliente de la propiedad.
    const inHomeA = await request(app)
      .post(`${V1}/properties/${propertyA.id}/residents`)
      .set(asAdmin(a.id))
      .send({ firstName: "Hija", lastName: "DeA", kindCode: "FAMILY" });
    expect(inHomeA.status).toBe(201);
    const personA = inHomeA.body.data.person as { id: number; clientId: number | null };
    expect(personA.clientId).toBe(a.id);
    expect((await personsOf(a.id, "Hija")).body.data.map((p: any) => p.id)).toEqual([personA.id]);
    expect((await personsOf(b.id, "Hija")).body.data).toEqual([]);

    // Vincular desde B una persona de A: referencia ajena en un alta = 400 (y no se crea el vínculo).
    const cross = await request(app)
      .post(`${V1}/properties/${propertyB.id}/residents`)
      .set(asAdmin(b.id))
      .send({ personId: personA.id, kindCode: "FAMILY" });
    expect(cross.status).toBe(400);
    expect(cross.body.code).toBe("PERSON_OUT_OF_SCOPE");
    expect(await prisma.resident.count({ where: { personId: personA.id, propertyId: propertyB.id } })).toBe(0);

    // La misma referencia desde A sí se acepta (en otra propiedad del mismo cliente).
    const linked = await request(app)
      .post(`${V1}/properties/${propertyA2.id}/residents`)
      .set(asAdmin(a.id))
      .send({ personId: personA.id, kindCode: "FAMILY" });
    expect(linked.status).toBe(201);
    expect(await prisma.resident.count({ where: { personId: personA.id, propertyId: propertyA2.id } })).toBe(1);

    // Una persona de A tampoco se puede usar para crear una autorización en B.
    const authorization = await request(app)
      .post(`${V1}/properties/${propertyB.id}/authorizations`)
      .set(asAdmin(b.id))
      .send({ personId: personA.id, scope: "PEDESTRIAN", days: [0, 1, 2, 3, 4, 5, 6], startTime: "00:00", endTime: "23:59", validFrom: "2026-01-01" });
    expect(authorization.status).toBe(400);
    expect(authorization.body.code).toBe("PERSON_OUT_OF_CLIENT");
  });
});
