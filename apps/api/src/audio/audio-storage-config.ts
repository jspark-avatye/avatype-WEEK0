import { Injectable } from '@nestjs/common';
@Injectable()
export class AudioStorageConfig {
  readonly bucket = process.env.MINIO_BUCKET ?? 'audio';
  readonly minioEndpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
  readonly minioPort = Number(process.env.MINIO_PORT ?? 9000);
  readonly minioSsl = process.env.MINIO_USE_SSL === 'true';
  readonly minioAccessKey = process.env.MINIO_ACCESS_KEY ?? 'root';
  readonly minioSecretKey = process.env.MINIO_SECRET_KEY ?? 'root-password-change-me';
  readonly maximumAnswerBytes = 10 * 1024 * 1024;
  readonly maximumAudioBytes = 1024 * 1024;
  constructor() { if (!Number.isInteger(this.minioPort) || this.minioPort < 1 || this.minioPort > 65535) throw new Error('Invalid MINIO_PORT'); }
}
