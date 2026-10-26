/**
 * Configuración de FCM: prioriza JSON, acepta archivo local y campos individuales.
 * No inicializa Firebase ni envía nada.
 */
const ORIGINAL_ENV = { ...process.env };

const fakeAccount = {
  type: "service_account",
  project_id: "test-project",
  client_email: "test@test-project.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n",
};

const loadFresh = () => {
  jest.resetModules();
  return require("@src/core/config/fcm") as typeof import("@src/core/config/fcm");
};

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.resetModules();
});

describe("configuración FCM", () => {
  it("carga la cuenta de servicio desde FIREBASE_SERVICE_ACCOUNT_JSON", () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(fakeAccount);
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = "";
    process.env.FIREBASE_PROJECT_ID = "";
    const config = loadFresh();
    expect(config.loadFcmServiceAccount()).toMatchObject({
      project_id: "test-project",
      client_email: fakeAccount.client_email,
    });
  });

  it("usa los campos individuales cuando no hay JSON ni archivo", () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "";
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = "";
    process.env.FIREBASE_PROJECT_ID = "individual-project";
    process.env.FIREBASE_CLIENT_EMAIL = "individual@example.test";
    process.env.FIREBASE_PRIVATE_KEY = "linea1\\nlinea2";
    const config = loadFresh();
    expect(config.loadFcmServiceAccount()).toMatchObject({
      project_id: "individual-project",
      client_email: "individual@example.test",
      private_key: "linea1\nlinea2",
    });
  });

  it("devuelve null sin configuración válida", () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "{}";
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = "";
    process.env.FIREBASE_PROJECT_ID = "";
    process.env.FIREBASE_CLIENT_EMAIL = "";
    process.env.FIREBASE_PRIVATE_KEY = "";
    const config = loadFresh();
    expect(config.loadFcmServiceAccount()).toBeNull();
    expect(config.isFcmConfigured()).toBe(false);
  });
});
