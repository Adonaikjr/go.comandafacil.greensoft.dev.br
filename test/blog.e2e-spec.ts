import type { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { GeminiService } from '../src/integrations/ai/gemini.service.js';
import { createTenant, createTestApp } from './support/app.js';

describe('Blog, sitemap e Gemini (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e-blog-admin-${Date.now()}@example.com`;
  const slug = `e2e-post-${Date.now()}`;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await prisma.superadmins.create({
      data: { email, password: await bcrypt.hash('x', 4), name: 'Blog' },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/superadmin/signin')
      .send({ username: email, password: 'x' });
    token = login.body.accessToken;
    // Sem chamar a API real do Gemini
    app.get(GeminiService).generateBlogPost = async () => ({
      title: 'Post Gerado por IA',
      slug: `${slug}-ia`,
      excerpt: 'Resumo',
      content: '# Conteúdo',
      author: 'Equipe',
      category: 'PDV',
      tags: ['e2e-ia'],
      readingTime: 3,
    });
  });

  afterAll(async () => {
    await prisma.blogPost.deleteMany({ where: { slug: { startsWith: slug } } });
    await prisma.blogTags.deleteMany({
      where: { name: { startsWith: 'e2e-' } },
    });
    await prisma.refresh_tokens.deleteMany({ where: { username: email } });
    await prisma.superadmins.delete({ where: { email } });
    await app.close();
  });

  it('publica, lista, busca por slug, gera com IA e monta o sitemap', async () => {
    const http = () => request(app.getHttpServer());
    const post = {
      title: 'Post E2E',
      slug,
      excerpt: 'Resumo',
      content: 'Texto',
      author: 'Autor',
      date: '2026-11-01',
      readTime: '5 min',
      category: 'Gestão',
      image: '/logo.png',
      tags: ['e2e-tag'],
    };

    const tenant = await createTenant(app, 'e2e-blog');
    await tenant.post('/api/v1/blog/create').send(post).expect(401);
    await tenant.cleanup();

    await http()
      .post('/api/v1/blog/create')
      .set('Authorization', `Bearer ${token}`)
      .send(post)
      .expect(201);
    const one = await http().get(`/api/v1/blog/${slug}`).expect(200);
    expect(one.body.data).toMatchObject({
      title: 'Post E2E',
      blog_tag_id: [{ name: 'e2e-tag' }],
    });
    await http().get('/api/v1/blog/nao-existe').expect(404);

    const list = await http().get('/api/v1/blog?limit=100').expect(200);
    expect(list.body.data.some((p: { slug: string }) => p.slug === slug)).toBe(
      true,
    );

    await http().get('/api/v1/gemini').expect(401);
    await http()
      .get('/api/v1/gemini')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(
      (await http().get(`/api/v1/blog/${slug}-ia`).expect(200)).body.data
        .readTime,
    ).toBe('3 min');

    const site = await http()
      .get('/sitemap.xml')
      .expect(200)
      .expect('content-type', /xml/);
    expect(site.text).toContain(`/blog/${slug}</loc>`);
    const blog = await http().get('/api/v1/blog/sitemap.xml').expect(200);
    expect(blog.text).toContain('<urlset');
  });
});
