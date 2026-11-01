const today = () => new Date().toISOString().split('T')[0];
const day = (date: Date) => date.toISOString().split('T')[0];

function url(
  loc: string,
  lastmod: string,
  changefreq: string,
  priority: string,
) {
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
}

function wrap(urls: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}</urlset>`;
}

type SitemapPost = {
  slug: string;
  date: Date;
  featured: boolean;
  updated_at: Date;
};

// /sitemap.xml do site (home, blog, posts e páginas de login/cadastro)
export function siteSitemap(baseUrl: string, posts: SitemapPost[]) {
  return wrap(
    url(baseUrl, today(), 'weekly', '1.0') +
      url(`${baseUrl}/blog`, today(), 'daily', '0.9') +
      posts
        .map((p) =>
          url(
            `${baseUrl}/blog/${encodeURIComponent(p.slug)}`,
            day(p.date),
            'monthly',
            p.featured ? '0.8' : '0.7',
          ),
        )
        .join('') +
      url(`${baseUrl}/login`, today(), 'monthly', '0.6') +
      url(`${baseUrl}/register`, today(), 'monthly', '0.6'),
  );
}

// /api/v1/blog/sitemap.xml (apenas o blog)
export function blogSitemap(baseUrl: string, posts: SitemapPost[]) {
  return wrap(
    url(`${baseUrl}/blog`, today(), 'daily', '0.9') +
      posts
        .map((p) =>
          url(
            `${baseUrl}/blog/${encodeURIComponent(p.slug)}`,
            day(p.updated_at),
            'weekly',
            '0.8',
          ),
        )
        .join(''),
  );
}
