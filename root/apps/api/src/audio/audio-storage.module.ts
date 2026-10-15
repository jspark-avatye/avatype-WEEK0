import { Module } from '@nestjs/common';
import { AudioStorageConfig } from './audio-storage-config';
import { MinioAudioStorage } from './minio-audio-storage';
@Module({ providers: [AudioStorageConfig, MinioAudioStorage], exports: [MinioAudioStorage] })
export class AudioStorageModule {}
