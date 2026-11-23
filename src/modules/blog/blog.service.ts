import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { GeminiService } from '../../integrations/ai/gemini.service.js';
import { nowAsDbDateTime } from '../../common/utils/db-time.js';

export interface CreatePostInput {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  author: string;
  date: Date;
  readTime: string;
  category: string;
  featured?: boolean;
  views?: number;
  image: string;
  tags?: string[];
}

export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 180);
}

@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  createPost({ tags = [], ...data }: CreatePostInput) {
    return this.prisma.blogPost.create({
      data: {
        ...data,
        featured: data.featured ?? false,
        views: data.views ?? 0,
        blog_tag_id: {
          connectOrCreate: tags.map((name) => ({
            where: { name },
            create: { name },
          })),
        },
      },
    });
  }

  async list(page: number, limit: number) {
    const [posts, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { date: 'desc' },
        include: { blog_tag_id: true },
      }),
      this.prisma.blogPost.count(),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
      posts,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  findBySlug(slug: string) {
    return this.prisma.blogPost.findUnique({
      where: { slug },
      include: { blog_tag_id: true },
    });
  }

  postsForSitemap() {
    return this.prisma.blogPost.findMany({
      select: {
        slug: true,
        date: true,
        featured: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: { date: 'desc' },
    });
  }

  // Gera um post com o Gemini e publica (usado pela rota /gemini e pelo job agendado)
  async generateWithAi() {
    const post = await this.gemini.generateBlogPost();
    const frontend = this.config.get('FRONTEND_DOMAIN', { infer: true });
    return this.createPost({
      title: post.title,
      slug: slugify(post.slug || post.title),
      excerpt: post.excerpt,
      content: post.content,
      author: post.author,
      date: nowAsDbDateTime(),
      readTime: `${post.readingTime} min`,
      category: post.category,
      featured: Math.random() < 0.5,
      views: Math.floor(Math.random() * 1000),
      image: `${frontend}/logo.png`,
      tags: post.tags,
    });
  }
}
