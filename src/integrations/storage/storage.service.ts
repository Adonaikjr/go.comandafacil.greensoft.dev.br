import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
  fit?: 'inside' | 'cover';
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  // Redimensiona, converte para WebP e devolve a URL pública
  async saveImage(
    input: Buffer | string,
    relativePath: string,
    options: ImageOptions,
  ) {
    const target = join(PUBLIC_DIR, relativePath);
    await mkdir(dirname(target), { recursive: true });
    try {
      await sharp(input)
        // Fotos de celular vêm rotacionadas pelo EXIF
        .rotate()
        .resize({
          width: options.width,
          height: options.height,
          fit: options.fit ?? 'inside',
          withoutEnlargement: options.fit !== 'cover',
        })
        .webp({ quality: options.quality ?? 82 })
        .toFile(target);
    } catch (error) {
      // Arquivo corrompido ou formato que o sharp não lê (ex.: HEIC do iPhone)
      this.logger.warn(
        `Imagem rejeitada (${relativePath}): ${(error as Error).message}`,
      );
      throw new BadRequestException(
        'Não foi possível ler a imagem. Envie uma foto em JPG, PNG ou WEBP.',
      );
    }
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
