/**
 * S-24: las URLs públicas del bucket salen firmadas y de vida corta; las demás cadenas no se tocan.
 */
process.env.AWS_BUCKET_NAME = "bucket-de-prueba";
process.env.AWS_REGION = "us-east-2";
process.env.AWS_ACCESS_KEY_ID = "AKIAEXAMPLEEXAMPLE";
process.env.AWS_SECRET_ACCESS_KEY = "secreto-de-prueba-secreto-de-prueba";

import { signMediaUrls } from "@src/core/middlewares/sign-media-urls.middleware";

const PUBLIC = "https://bucket-de-prueba.s3.us-east-2.amazonaws.com/complaints/foto.jpg";

describe("firma de URLs de archivos", () => {
  it("firma una URL del bucket y conserva la ruta del archivo", async () => {
    const signed = await signMediaUrls(PUBLIC);
    expect(signed).toContain("/complaints/foto.jpg");
    expect(signed).toContain("X-Amz-Signature=");
    expect(signed).toContain("X-Amz-Expires=3600");
  });

  it("recorre objetos y arreglos anidados (evidencias de una queja)", async () => {
    const body = { data: { media: [{ type: "IMAGE", url: PUBLIC, key: "complaints/foto.jpg" }], title: "Ruido" } };
    const signed = await signMediaUrls(body);
    expect(signed.data.media[0].url).toContain("X-Amz-Signature=");
    expect(signed.data.media[0].key).toBe("complaints/foto.jpg");
    expect(signed.data.title).toBe("Ruido");
  });

  it("vuelve a firmar una URL guardada con una firma vencida", async () => {
    const stale = `${PUBLIC}?X-Amz-Signature=vieja&X-Amz-Expires=60`;
    const signed = await signMediaUrls(stale);
    expect(signed).not.toContain("X-Amz-Signature=vieja");
    expect(signed).toContain("X-Amz-Signature=");
  });

  it("no toca URLs de otros sitios ni texto normal", async () => {
    const body = { a: "https://ejemplo.com/foto.jpg", b: "hola", c: 5, d: null };
    expect(await signMediaUrls(body)).toEqual(body);
  });

  it("no toca el bucket de otro dueño", async () => {
    const other = "https://otro-bucket.s3.us-east-2.amazonaws.com/x.jpg";
    expect(await signMediaUrls(other)).toBe(other);
  });
});
