import { S3Client, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, NotFound } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import "multer";

export class StorageService {
  private client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: process.env.AWS_REGION || "us-east-2",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
  }

  /**
   * UPLOAD FILE
   * Uses @aws-sdk/lib-storage for efficient multipart uploads
   */
  async uploadFile(
    file: Express.Multer.File,
    bucketName: string,
    customKey?: string
  ): Promise<{ bucket: string; key: string }> {
    const key = customKey || `${Date.now()}_${file.originalname}`;

    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        // ACL: 'public-read' // Note: This depends on bucket policy and block public access settings
      },
    });

    await upload.done();

    return {
      bucket: bucketName,
      key,
    };
  }

  /**
   * SIGNED URL (READ)
   * Generates a temporary link to access a private file
   */
  async getSignedReadUrl(
    bucketName: string,
    key: string,
    expiresInSeconds = 900 // 15 min
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * DELETE FILE
   */
  async deleteFile(bucketName: string, key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    await this.client.send(command);
  }

  /**
   * PRESIGNED UPLOAD (T-F0-09)
   * URL para que el cliente suba el objeto directo a S3 con PUT. Caduca en `expiresInSeconds`.
   */
  async presignUpload(
    bucketName: string,
    key: string,
    contentType: string,
    contentLength: number,
    expiresInSeconds: number
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  /** Tamaño y tipo reales del objeto en S3, o null si no existe. Sólo NotFound cuenta como "no existe". */
  async getObjectMeta(bucketName: string, key: string): Promise<{ size: number; contentType?: string } | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
      return { size: Number(head.ContentLength ?? 0), contentType: head.ContentType };
    } catch (error) {
      if (error instanceof NotFound) return null;
      throw error;
    }
  }

  /** ¿Existe el objeto en S3? Sólo NotFound cuenta como "no existe"; otros errores se propagan. */
  async objectExists(bucketName: string, key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
      return true;
    } catch (error) {
      if (error instanceof NotFound) return false;
      throw error;
    }
  }
}
