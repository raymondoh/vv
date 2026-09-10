import type { Database } from '../supabase/database.types';

export type PublicImage = {
  id: string;
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
};
export type PublicGalleryImage = PublicImage & { caption: string | null };
export type PublicCatalogMedia = { heroImage: PublicImage | null; galleryImages: PublicGalleryImage[] };
export type PublicVenueMedia = PublicCatalogMedia;
export type SpaceMediaAttachment = Pick<Database['public']['Tables']['space_media_assets']['Row'],
  'space_id' | 'media_asset_id' | 'purpose' | 'sort_order' | 'caption'>;
export type CatalogMediaAttachment = { entity_id: string; media_asset_id: string; purpose: string; sort_order: number; caption: string | null };
export type HeroAttachment = Pick<Database['public']['Tables']['venue_media_assets']['Row'],
  'venue_id' | 'media_asset_id' | 'purpose'>;
export type VenueMediaAttachment = HeroAttachment & Pick<Database['public']['Tables']['venue_media_assets']['Row'], 'sort_order' | 'caption'>;
export type HeroAsset = Pick<Database['public']['Tables']['media_assets']['Row'],
  'id' | 'status' | 'media_kind' | 'storage_bucket' | 'storage_path' | 'alt_text' | 'width_px' | 'height_px'>;

export function isPublicImageAsset(asset: HeroAsset): boolean {
  return asset.status === 'ready' && asset.media_kind === 'image' && asset.storage_bucket === 'venue-media';
}

function selectEntityHero(entityId: string, attachments: Pick<CatalogMediaAttachment, 'entity_id' | 'media_asset_id' | 'purpose'>[], assets: HeroAsset[]): HeroAsset | null {
  const heroes = attachments.filter((attachment) => attachment.entity_id === entityId && attachment.purpose === 'hero');
  if (heroes.length !== 1) return null;
  return assets.find((asset) => asset.id === heroes[0].media_asset_id && isPublicImageAsset(asset)) ?? null;
}

function selectEntityGallery(entityId: string, attachments: CatalogMediaAttachment[], assets: HeroAsset[]) {
  return attachments.filter((attachment) => attachment.entity_id === entityId && attachment.purpose === 'gallery')
    .sort((a, b) => a.sort_order - b.sort_order || (a.media_asset_id < b.media_asset_id ? -1 : a.media_asset_id > b.media_asset_id ? 1 : 0))
    .flatMap((attachment) => {
      const asset = assets.find((candidate) => candidate.id === attachment.media_asset_id && isPublicImageAsset(candidate));
      return asset ? [{ asset, caption: attachment.caption }] : [];
    });
}

/** Input venue IDs must already have been read from catalog_venues. */
export function selectHeroAsset(venueId: string, attachments: HeroAttachment[], assets: HeroAsset[]): HeroAsset | null {
  return selectEntityHero(venueId, attachments.map((item) => ({ ...item, entity_id: item.venue_id })), assets);
}

export function selectGalleryAssets(venueId: string, attachments: VenueMediaAttachment[], assets: HeroAsset[]) {
  return selectEntityGallery(venueId, attachments.map((item) => ({ ...item, entity_id: item.venue_id })), assets);
}

export function toPublicImage(asset: HeroAsset, signedUrl: string): PublicImage {
  return { id: asset.id, url: signedUrl, altText: asset.alt_text, width: asset.width_px, height: asset.height_px };
}

/** Missing signed URLs omit only their image; storage identity never enters the output model. */
export function toCatalogMedia(entityId: string, attachments: CatalogMediaAttachment[], assets: HeroAsset[], signedUrls: Map<string, string>): PublicCatalogMedia {
  const hero = selectEntityHero(entityId, attachments, assets);
  const heroUrl = hero ? signedUrls.get(hero.id) : undefined;
  return {
    heroImage: hero && heroUrl ? toPublicImage(hero, heroUrl) : null,
    galleryImages: selectEntityGallery(entityId, attachments, assets).flatMap(({ asset, caption }) => {
      const url = signedUrls.get(asset.id);
      return url ? [{ ...toPublicImage(asset, url), caption }] : [];
    }),
  };
}

export function toVenueMedia(venueId: string, attachments: VenueMediaAttachment[], assets: HeroAsset[], signedUrls: Map<string, string>): PublicVenueMedia {
  return toCatalogMedia(venueId, attachments.map((item) => ({ ...item, entity_id: item.venue_id })), assets, signedUrls);
}

export function toSpaceMedia(spaceId: string, attachments: SpaceMediaAttachment[], assets: HeroAsset[], signedUrls: Map<string, string>): PublicCatalogMedia {
  return toCatalogMedia(spaceId, attachments.map((item) => ({ ...item, entity_id: item.space_id })), assets, signedUrls);
}
