import type { Database } from '../supabase/database.types';

export type PublicImage = {
  id: string;
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
};
export type PublicGalleryImage = PublicImage & { caption: string | null };
export type PublicVenueMedia = { heroImage: PublicImage | null; galleryImages: PublicGalleryImage[] };
export type HeroAttachment = Pick<Database['public']['Tables']['venue_media_assets']['Row'],
  'venue_id' | 'media_asset_id' | 'purpose'>;
export type VenueMediaAttachment = HeroAttachment & Pick<Database['public']['Tables']['venue_media_assets']['Row'], 'sort_order' | 'caption'>;
export type HeroAsset = Pick<Database['public']['Tables']['media_assets']['Row'],
  'id' | 'status' | 'media_kind' | 'storage_bucket' | 'storage_path' | 'alt_text' | 'width_px' | 'height_px'>;

export function isPublicImageAsset(asset: HeroAsset): boolean {
  return asset.status === 'ready' && asset.media_kind === 'image' && asset.storage_bucket === 'venue-media';
}

/** Input venue IDs must already have been read from catalog_venues. */
export function selectHeroAsset(venueId: string, attachments: HeroAttachment[], assets: HeroAsset[]): HeroAsset | null {
  const heroes = attachments.filter((attachment) => attachment.venue_id === venueId && attachment.purpose === 'hero');
  if (heroes.length !== 1) return null;
  return assets.find((asset) => asset.id === heroes[0].media_asset_id && isPublicImageAsset(asset)) ?? null;
}

export function selectGalleryAssets(venueId: string, attachments: VenueMediaAttachment[], assets: HeroAsset[]) {
  return attachments.filter((attachment) => attachment.venue_id === venueId && attachment.purpose === 'gallery')
    .sort((a, b) => a.sort_order - b.sort_order || (a.media_asset_id < b.media_asset_id ? -1 : a.media_asset_id > b.media_asset_id ? 1 : 0))
    .flatMap((attachment) => {
      const asset = assets.find((candidate) => candidate.id === attachment.media_asset_id && isPublicImageAsset(candidate));
      return asset ? [{ asset, caption: attachment.caption }] : [];
    });
}

export function toPublicImage(asset: HeroAsset, signedUrl: string): PublicImage {
  return { id: asset.id, url: signedUrl, altText: asset.alt_text, width: asset.width_px, height: asset.height_px };
}

/** Missing signed URLs omit only their image; storage identity never enters the output model. */
export function toVenueMedia(venueId: string, attachments: VenueMediaAttachment[], assets: HeroAsset[], signedUrls: Map<string, string>): PublicVenueMedia {
  const hero = selectHeroAsset(venueId, attachments, assets);
  const heroUrl = hero ? signedUrls.get(hero.id) : undefined;
  return {
    heroImage: hero && heroUrl ? toPublicImage(hero, heroUrl) : null,
    galleryImages: selectGalleryAssets(venueId, attachments, assets).flatMap(({ asset, caption }) => {
      const url = signedUrls.get(asset.id);
      return url ? [{ ...toPublicImage(asset, url), caption }] : [];
    }),
  };
}
