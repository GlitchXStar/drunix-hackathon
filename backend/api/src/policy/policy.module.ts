import { Module, Global } from '@nestjs/common';
import { PolicyService } from './policy.service';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  providers: [PolicyService, RolesGuard],
  exports: [PolicyService, RolesGuard],
})
export class PolicyModule {}
