import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type { Env } from '../../config/env.schema.js';

export const generatedPostSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  excerpt: z
    .string()
    .min(1)
    .transform((v) => (v.length > 200 ? `${v.slice(0, 197)}...` : v)),
  content: z.string().min(1),
  author: z.string().min(1),
  category: z.string().min(1),
  tags: z.array(z.string()).default([]),
  readingTime: z.number().int().positive(),
});
export type GeneratedPost = z.infer<typeof generatedPostSchema>;

const TEMAS = [
  'Como otimizar vendas',
  'Tendências do mercado',
  'Tecnologias emergentes',
  'Casos de sucesso',
  'Guia completo sobre',
  'Dicas práticas para',
  'O futuro de',
  'Erros comuns em',
  'Estratégias avançadas de',
  'Transformação digital em',
];

const ANGULOS = [
  'para pequenos negócios',
  'para restaurantes modernos',
  'na era digital',
  'para aumentar lucros',
  'com inteligência artificial',
  'durante alta demanda',
  'em food trucks',
  'em delivery',
  'em estabelecimentos locais',
];

const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];

// Geração de posts do blog (substitui backend-legado/src/agents/gemini.content.js,
// agora com o SDK novo @google/genai e saída validada por Zod)
@Injectable()
export class GeminiService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private client() {
    const apiKey = this.config.get('GEMINI_API_KEY', { infer: true });
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');
    return new GoogleGenAI({ apiKey });
  }

  async generateBlogPost(
    categoria = 'PDV',
    autor = 'Equipe GreenFood',
  ): Promise<GeneratedPost> {
    const tema = pick(TEMAS);
    const angulo = pick(ANGULOS);
    const timestamp = Date.now();

    const prompt = `Você é um especialista em criação de conteúdo para blogs sobre tecnologia e sistemas de gestão para restaurantes.

Crie um artigo ÚNICO e ORIGINAL sobre "${tema} ${categoria} ${angulo}" (referência ${timestamp}).

- Título envolvente, otimizado para SEO, até 60 caracteres, formato variado (pergunta, lista, desafio).
- Slug em minúsculas com hífens, terminado em "-${String(timestamp).slice(-6)}", até 80 caracteres.
- Excerpt com até 200 caracteres, com benefício concreto e curiosidade.
- Conteúdo em Markdown com no mínimo 1200 palavras, escolhendo uma estrutura (problema/solução,
  passo a passo, ranking ou caso de sucesso), com pelo menos 2 listas, 1 tabela comparativa,
  estatísticas, exemplos práticos para ${categoria}, call-to-action e FAQ com 4 a 6 perguntas.
- 6 a 10 tags, incluindo termos long-tail.
- readingTime em minutos (200 palavras/min, arredondado para cima).
- Autor: ${autor}. Categoria: ${categoria}.`;

    const response = await this.client().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: z.toJSONSchema(generatedPostSchema, {
          io: 'input',
        }),
      },
    });

    return generatedPostSchema.parse(JSON.parse(response.text ?? '{}'));
  }
}
