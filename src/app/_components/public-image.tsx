import type { PublicImage } from '@/lib/catalog/media';

export function PublicCatalogImage({ image, className }: { image: PublicImage; className: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Load short-lived private Storage URLs directly without the Next image cache.
    <img src={image.url} alt={image.altText ?? ''} width={image.width ?? undefined} height={image.height ?? undefined}
      className={`w-full object-cover ${className}`} />
  );
}
