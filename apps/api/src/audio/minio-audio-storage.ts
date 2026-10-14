import { Injectable } from '@nestjs/common';
import { Client } from 'minio';
import { ProcessingError } from '../shared/processing-error';
import { AudioStorageConfig } from './audio-storage-config';

@Injectable()
export class MinioAudioStorage  {
  private readonly client: Client;
  constructor(private readonly config: AudioStorageConfig) {
    this.client = new Client({ endPoint: config.minioEndpoint, port: config.minioPort, useSSL: config.minioSsl, accessKey: config.minioAccessKey, secretKey: config.minioSecretKey });
  }
  async save(objectKey: string, bytes: Uint8Array, mimeType: string): Promise<void> {
    try { await this.client.putObject(this.config.bucket, objectKey, Buffer.from(bytes), bytes.byteLength, { 'Content-Type': mimeType }); }
    catch { throw new ProcessingError('STORAGE_UNAVAILABLE', true); }
  }
  async read(objectKey: string): Promise<Uint8Array> {
    try {
      const stream = await this.client.getObject(this.config.bucket, objectKey);
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const raw of stream) {
        const chunk: unknown = raw;
        if (!(chunk instanceof Uint8Array)) throw new ProcessingError('STORAGE_UNAVAILABLE', true);
        size += chunk.byteLength;
        if (size > (objectKey.startsWith('answers/') ? this.config.maximumAnswerBytes : this.config.maximumAudioBytes)) { stream.destroy(); throw new ProcessingError('AI_INVALID_AUDIO', false); }
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error) { if (error instanceof ProcessingError) throw error; throw new ProcessingError('STORAGE_UNAVAILABLE', true); }
  }
  async remove(objectKey: string): Promise<void> {
    try { await this.client.removeObject(this.config.bucket, objectKey); }
    catch { throw new ProcessingError('STORAGE_UNAVAILABLE', true); }
  }
}
