import 'server-only';

import type { createClient } from '../supabase/server';
import { selectHeroAsset, toPublicImage, type PublicImage, type HeroAttachment, type HeroAsset } from './media';

type RequestClient = Awaited<ReturnType<typeof createClient>>;
const SIGNED_URL_SECONDS = 600;

/** Request-scoped only: never persist or share signed URLs across callers. */
export async function getVenueHeroes(supabase: RequestClient, publicVenueIds: string[]): Promise<Map<string, PublicImage>> {
  const heroes = new Map<string, PublicImage>();
  const ids = [...new Set(publicVenueIds)];
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100);
    // The schema permits one explicit hero per venue, so these batches fit the API row limit.
    let attachments: HeroAttachment[];
    let assets: HeroAsset[];
    try {
      const attachmentResult = await supabase.from('venue_media_assets')
        .select('venue_id, media_asset_id, purpose').in('venue_id', batch).eq('purpose', 'hero');
      if (attachmentResult.error || !attachmentResult.data) throw new Error('Attachment query failed');
      attachments = attachmentResult.data;
      if (!attachments.length) continue;
      const assetIds = [...new Set(attachments.map((attachment) => attachment.media_asset_id))];
      const assetResult = await supabase.from('media_assets')
        .select('id, status, media_kind, storage_bucket, storage_path, alt_text, width_px, height_px')
        .in('id', assetIds).eq('status', 'ready').eq('media_kind', 'image').eq('storage_bucket', 'venue-media');
      if (assetResult.error || !assetResult.data) throw new Error('Asset query failed');
      assets = assetResult.data;
    } catch {
      throw new Error('Public hero media query failed');
    }
    for (const venueId of batch) {
      const asset = selectHeroAsset(venueId, attachments, assets);
      if (!asset) continue;
      try {
        const { data, error } = await supabase.storage.from('venue-media')
          .createSignedUrl(asset.storage_path, SIGNED_URL_SECONDS);
        if (!error && data?.signedUrl) heroes.set(venueId, toPublicImage(asset, data.signedUrl));
      } catch {
        // A single unavailable object keeps its placeholder; never log signed URLs or paths.
      }
    }
  }
  return heroes;
}
