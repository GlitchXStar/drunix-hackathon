import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER, KEY_PROVIDER } from './storage.interface';
import { LocalFsProvider } from './local-fs.provider';
import { NextcloudProvider } from './nextcloud.provider';
import { EnvKeyProvider } from './key.provider';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    LocalFsProvider,
    NextcloudProvider,
    EnvKeyProvider,
    {
      provide: STORAGE_PROVIDER,
      useFactory: (config: ConfigService, localFs: LocalFsProvider, nextcloud: NextcloudProvider) => {
        const type = config.get<string>('STORAGE_PROVIDER', 'local');
        if (type === 'nextcloud') {
          return nextcloud;
        }
        return localFs;
      },
      inject: [ConfigService, LocalFsProvider, NextcloudProvider],
    },
    {
      provide: KEY_PROVIDER,
      useClass: EnvKeyProvider,
    },
  ],
  exports: [STORAGE_PROVIDER, KEY_PROVIDER, LocalFsProvider, NextcloudProvider, EnvKeyProvider],
})
export class StorageModule {}
