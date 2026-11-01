import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { BlogService } from '../blog/blog.service.js';
import { QUEUE } from './queue-names.js';

@Processor(QUEUE.AI)
export class AiContentProcessor extends WorkerHost {
  constructor(private readonly blog: BlogService) {
    super();
  }

  async process(_job: Job) {
    const post = await this.blog.generateWithAi();
    return { slug: post.slug };
  }
}
