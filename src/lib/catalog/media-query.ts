import 'server-only';

import type { createClient } from '../supabase/server';
import { isPublicImageAsset, toVenueMedia, type PublicImage, type PublicVenueMedia, type VenueMediaAttachment, type HeroAsset } from './media';

type RequestClient = Awaited<ReturnType<typeof createClient>>;
type MediaPurpose = 'hero' | 'gallery';
const SIGNED_URL_SECONDS = 600;

async function mediaRows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ;) {
    const { data, error } = await query(from, from + 499);
    if (error || !data) throw new Error('Public venue media query failed');
    if (!data.length) return rows;
    rows.push(...data);
    from += data.length;
  }
}

/** Caller supplies IDs already visible in catalog_venues. No signed URLs are cached across requests. */
export async function getVenueMedia(supabase: RequestClient, publicVenueIds: string[], purposes: MediaPurpose[]): Promise<Map<string, PublicVenueMedia>> {
  const result = new Map<string, PublicVenueMedia>();
  const ids = [...new Set(publicVenueIds)];
  if (!purposes.length) return result;
  const signedUrls = new Map<string, string>();
  const attempted = new Set<string>();
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100);
    let attachments: VenueMediaAttachment[];
    const assets: HeroAsset[] = [];
    try {
      attachments = await mediaRows<VenueMediaAttachment>((from, to) => supabase.from('venue_media_assets')
        .select('venue_id, media_asset_id, purpose, sort_order, caption').in('venue_id', batch).in('purpose', purposes)
        .order('sort_order').order('media_asset_id').order('venue_id').range(from, to));
      const assetIds = [...new Set(attachments.map((attachment) => attachment.media_asset_id))];
      for (let offset = 0; offset < assetIds.length; offset += 100) {
        assets.push(...await mediaRows<HeroAsset>((from, to) => supabase.from('media_assets')
          .select('id, status, media_kind, storage_bucket, storage_path, alt_text, width_px, height_px')
          .in('id', assetIds.slice(offset, offset + 100)).eq('status', 'ready').eq('media_kind', 'image').eq('storage_bucket', 'venue-media')
          .order('id').range(from, to)));
      }
    } catch {
      throw new Error('Public venue media query failed');
    }
    for (const asset of assets) {
      if (!isPublicImageAsset(asset) || attempted.has(asset.id)) continue;
      attempted.add(asset.id);
      try {
        const { data, error } = await supabase.storage.from('venue-media')
          .createSignedUrl(asset.storage_path, SIGNED_URL_SECONDS);
        if (!error && data?.signedUrl) signedUrls.set(asset.id, data.signedUrl);
      } catch {
        // Omit only this object. Never log storage paths or signed URLs.
      }
    }
    for (const venueId of batch) result.set(venueId, toVenueMedia(venueId, attachments, assets, signedUrls));
  }
  return result;
}

/** Discovery remains hero-only while sharing the same authorization and signing path. */
export async function getVenueHeroes(supabase: RequestClient, publicVenueIds: string[]): Promise<Map<string, PublicImage>> {
  const media = await getVenueMedia(supabase, publicVenueIds, ['hero']);
  const heroes = new Map<string, PublicImage>();
  for (const [venueId, item] of media) if (item.heroImage) heroes.set(venueId, item.heroImage);
  return heroes;
}
