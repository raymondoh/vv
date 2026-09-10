import type { Database } from '../supabase/database.types';

export type PublicImage = {
  id: string;
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
};
export type HeroAttachment = Pick<Database['public']['Tables']['venue_media_assets']['Row'],
  'venue_id' | 'media_asset_id' | 'purpose'>;
export type HeroAsset = Pick<Database['public']['Tables']['media_assets']['Row'],
  'id' | 'status' | 'media_kind' | 'storage_bucket' | 'storage_path' | 'alt_text' | 'width_px' | 'height_px'>;

/** Input venue IDs must already have been read from catalog_venues. */
export function selectHeroAsset(venueId: string, attachments: HeroAttachment[], assets: HeroAsset[]): HeroAsset | null {
  const heroes = attachments.filter((attachment) => attachment.venue_id === venueId && attachment.purpose === 'hero');
  if (heroes.length !== 1) return null;
  return assets.find((asset) => asset.id === heroes[0].media_asset_id
    && asset.status === 'ready' && asset.media_kind === 'image'
    && asset.storage_bucket === 'venue-media') ?? null;
}

export function toPublicImage(asset: HeroAsset, signedUrl: string): PublicImage {
  return { id: asset.id, url: signedUrl, altText: asset.alt_text, width: asset.width_px, height: asset.height_px };
}
