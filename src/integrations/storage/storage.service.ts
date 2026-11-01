import { Injectable } from '@nestjs/common';
import { mkdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

// Arquivos públicos ficam em <raiz do projeto>/public e são servidos em /public
// (mesma estrutura do legado: /public/<tenantId>/<arquivo>.webp).
export const PUBLIC_DIR = join(process.cwd(), 'public');

export interface ImageOptions {
  width: number;
  height: number;
  quality?: number;
}

@Injectable()
export class StorageService {
  // Redimensiona, converte para WebP e devolve a URL pública
  async saveImage(
    input: Buffer | string,
    relativePath: string,
    options: ImageOptions,
  ) {
    const target = join(PUBLIC_DIR, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await sharp(input)
      .resize({
        width: options.width,
        height: options.height,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: options.quality ?? 82 })
      .toFile(target);
    return `/public/${relativePath}`;
  }

  async remove(relativePath: string) {
    try {
      await unlink(join(PUBLIC_DIR, relativePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
