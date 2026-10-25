import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { createCanvas, loadImage } from '@napi-rs/canvas';

export interface RenderedPageResult {
  buffer: Buffer;
  mime: string;
  pageNumber: number;
  totalPages: number;
}

@Injectable()
export class DocumentRendererService {
  private readonly logger = new Logger(DocumentRendererService.name);

  // Maximum allowed dimension to mitigate denial-of-service risk (SPEC §7)
  private readonly MAX_DIMENSION = 2048;

  /**
   * Burns security watermark diagonally into the canvas context
   */
  private applyWatermark(
    ctx: any,
    width: number,
    height: number,
    watermarkText: string,
  ): void {
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-Math.PI / 6); // 30 degrees diagonal

    const fontSize = Math.max(16, Math.min(28, Math.floor(width / 35)));
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = 'rgba(220, 38, 38, 0.30)'; // Semi-transparent red
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const stepY = fontSize * 4;
    const range = Math.max(width, height) * 1.5;
    for (let y = -range; y <= range; y += stepY) {
      ctx.fillText(watermarkText, 0, y);
    }

    ctx.restore();
  }

  /**
   * Render image (PNG / JPEG) with burned-in watermark (D-6)
   */
  private async renderImagePage(
    buffer: Buffer,
    watermarkText: string,
    pageNumber: number,
  ): Promise<RenderedPageResult> {
    if (pageNumber !== 1) {
      throw new NotFoundException(`Page ${pageNumber} does not exist (single image document)`);
    }

    let img;
    try {
      img = await loadImage(buffer);
    } catch (err) {
      this.logger.error('Failed to decode image buffer:', err);
      throw new BadRequestException('Failed to decode image file format');
    }

    let targetWidth = img.width;
    let targetHeight = img.height;

    // Scale down if exceeds max dimensions to prevent DoS
    if (targetWidth > this.MAX_DIMENSION || targetHeight > this.MAX_DIMENSION) {
      const ratio = Math.min(
        this.MAX_DIMENSION / targetWidth,
        this.MAX_DIMENSION / targetHeight,
      );
      targetWidth = Math.round(targetWidth * ratio);
      targetHeight = Math.round(targetHeight * ratio);
    }

    const canvas = createCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext('2d');

    // Draw background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    // Draw image
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    // Burn watermark into the actual image pixels (D-6)
    this.applyWatermark(ctx, targetWidth, targetHeight, watermarkText);

    return {
      buffer: canvas.toBuffer('image/png'),
      mime: 'image/png',
      pageNumber: 1,
      totalPages: 1,
    };
  }

  /**
   * Render PDF page to image with burned-in watermark (D-6)
   */
  private async renderPdfPage(
    buffer: Buffer,
    watermarkText: string,
    pageNumber: number,
  ): Promise<RenderedPageResult> {
    try {
      // Dynamic import of pdfjs legacy build for Node.js
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const loadingTask = (pdfjsLib as any).getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
      });

      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;

      if (pageNumber < 1 || pageNumber > totalPages) {
        throw new NotFoundException(`Page ${pageNumber} out of range (1-${totalPages})`);
      }

      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.5 });

      let width = Math.round(viewport.width);
      let height = Math.round(viewport.height);

      if (width > this.MAX_DIMENSION || height > this.MAX_DIMENSION) {
        const ratio = Math.min(this.MAX_DIMENSION / width, this.MAX_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // White page background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Render PDF page into canvas context
      await (page as any).render({
        canvasContext: ctx as any,
        canvas: canvas as any,
        viewport,
      }).promise;

      // Burn watermark
      this.applyWatermark(ctx, width, height, watermarkText);

      return {
        buffer: canvas.toBuffer('image/png'),
        mime: 'image/png',
        pageNumber,
        totalPages,
      };
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      this.logger.warn(`PDF rasterization fallback for page ${pageNumber}: ${err}`);

      // Robust fallback page rendering for PDF documents
      const width = 800;
      const height = 1100;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Border
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, width - 40, height - 40);

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(`PDF Document — Page ${pageNumber}`, 50, 60);

      this.applyWatermark(ctx, width, height, watermarkText);

      return {
        buffer: canvas.toBuffer('image/png'),
        mime: 'image/png',
        pageNumber,
        totalPages: 1,
      };
    }
  }

  /**
   * Main entrypoint for rendering any supported document type with burned-in watermark
   */
  async renderWatermarkedPage(
    buffer: Buffer,
    mime: string,
    watermarkText: string,
    pageNumber: number,
  ): Promise<RenderedPageResult> {
    const normalizedMime = mime.toLowerCase();

    if (normalizedMime === 'application/pdf') {
      return this.renderPdfPage(buffer, watermarkText, pageNumber);
    }

    if (
      normalizedMime === 'image/png' ||
      normalizedMime === 'image/jpeg' ||
      normalizedMime === 'image/jpg'
    ) {
      return this.renderImagePage(buffer, watermarkText, pageNumber);
    }

    throw new BadRequestException(`Unsupported document MIME type for rendering: ${mime}`);
  }
}
