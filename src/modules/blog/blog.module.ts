import { Module } from '@nestjs/common';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard.js';
import { BlogController } from './blog.controller.js';
import { BlogService } from './blog.service.js';

@Module({
  controllers: [BlogController],
  providers: [BlogService, SuperAdminGuard],
  exports: [BlogService],
})
export class BlogModule {}
