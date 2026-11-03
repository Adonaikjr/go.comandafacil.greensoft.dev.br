import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { Env } from '../../config/env.schema.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ZodBody, ZodQuery } from '../../common/decorators/zod.decorator.js';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard.js';
import { BlogService } from './blog.service.js';
import { blogSitemap, siteSitemap } from './sitemap.js';

const createPostSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(191),
  excerpt: z.string().min(1),
  content: z.string().min(1),
  author: z.string().min(1).max(255),
  date: z.coerce.date(),
  readTime: z.string().max(50),
  category: z.string().max(100),
  featured: z.boolean().optional(),
  views: z.number().int().optional(),
  image: z.string().max(500),
  tags: z.array(z.string()).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).catch(9),
});

// Blog público do site (backend-legado/src/routes/blog.routes.js)
@ApiTags('blog')
@Controller()
export class BlogController {
  constructor(
    private readonly blog: BlogService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get baseUrl() {
    return (
      this.config.get('FRONTEND_DOMAIN', { infer: true }) ||
      'https://pdv-comanda-facil.greensoft.dev.br'
    );
  }

  @Public()
  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml')
  async siteSitemap() {
    return siteSitemap(this.baseUrl, await this.blog.postsForSitemap());
  }

  @Public()
  @Get('blog/sitemap.xml')
  @Header('Content-Type', 'application/xml')
  @Header('Cache-Control', 'public, max-age=3600')
  async blogSitemap() {
    return blogSitemap(this.baseUrl, await this.blog.postsForSitemap());
  }

  @Public()
  @Get('blog')
  @ZodQuery(listQuerySchema)
  async list(@Query() { page, limit }: z.infer<typeof listQuerySchema>) {
    const { posts, pagination } = await this.blog.list(page, limit);
    return {
      success: true,
      message: 'Posts recuperados com sucesso',
      data: posts,
      pagination,
    };
  }

  @Public()
  @Get('blog/:slug')
  async findOne(@Param('slug') slug: string) {
    const post = await this.blog.findBySlug(slug);
    if (!post) throw new NotFoundException('Post não encontrado');
    return { success: true, message: 'Post encontrado', data: post };
  }

  // No legado qualquer usuário logado de restaurante podia publicar no blog
  // do site; aqui é restrito ao superadmin.
  @Post('blog/create')
  @UseGuards(SuperAdminGuard)
  @ZodBody(createPostSchema)
  async create(@Body() dto: z.infer<typeof createPostSchema>) {
    const post = await this.blog.createPost(dto);
    return { success: true, message: 'Post criado com sucesso', data: post };
  }

  // Antes era um GET público (qualquer um disparava geração no Gemini).
  // Agora exige superadmin; a geração periódica roda como job (ver queues).
  @Get('gemini')
  @HttpCode(201)
  @UseGuards(SuperAdminGuard)
  async generate() {
    await this.blog.generateWithAi();
    return { success: true, message: 'Post criado com sucesso', data: true };
  }
}
