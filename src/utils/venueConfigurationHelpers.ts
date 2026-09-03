import { Venue, VenueSpace, SpaceLayout, WalkthroughClip, LayoutCategory, SpaceLayoutType } from '../types';

export interface FlattenedLayout {
  space: VenueSpace;
  layout: SpaceLayout;
}

/**
 * Returns all configured spaces for a venue.
 */
export function getVenueSpaces(venue: Venue): VenueSpace[] {
  return Array.isArray(venue.spaces) ? venue.spaces : [];
}

/**
 * Returns all configured layouts across all spaces for a venue.
 * Canonical configuration source: venue.spaces[].layouts
 */
export function getVenueLayouts(venue: Venue): FlattenedLayout[] {
  const spaces = getVenueSpaces(venue);
  const flattened: FlattenedLayout[] = [];

  for (const space of spaces) {
    if (Array.isArray(space.layouts)) {
      for (const layout of space.layouts) {
        flattened.push({ space, layout });
      }
    }
  }

  return flattened;
}

/**
 * Total number of configured layouts across all spaces.
 */
export function getTotalConfiguredLayouts(venue: Venue): number {
  return getVenueLayouts(venue).length;
}

/**
 * Total count of recorded walkthrough clips.
 */
export function getRecordedWalkthroughCount(venue: Venue): number {
  return Array.isArray(venue.walkthroughClips) ? venue.walkthroughClips.length : 0;
}

/**
 * Maps SpaceLayoutType to LayoutCategory for legacy compatibility.
 */
export function mapLayoutTypeToCategory(layoutType: SpaceLayoutType | string): LayoutCategory {
  const norm = layoutType.toLowerCase();
  if (norm.includes('theatre') || norm.includes('theater') || norm.includes('conference') || norm.includes('keynote')) {
    return 'theater';
  }
  if (norm.includes('cocktail') || norm.includes('reception') || norm.includes('standing') || norm.includes('drinks')) {
    return 'cocktail';
  }
  if (norm.includes('classroom') || norm.includes('workshop') || norm.includes('boardroom')) {
    return 'classroom';
  }
  if (norm.includes('ceremony') || norm.includes('wedding')) {
    return 'ceremony';
  }
  if (norm.includes('outdoor') || norm.includes('garden') || norm.includes('terrace')) {
    return 'outdoor';
  }
  return 'banquet';
}

/**
 * Finds the associated WalkthroughClip for a layout.
 *
 * Rules:
 * 1. Exact match on clip.layoutId === layout.id
 * 2. If no clip has layoutId (legacy/seeded data only):
 *    - If clip.layoutCategory matches layoutType category AND is unambiguous
 * 3. Otherwise returns undefined (no walkthrough). Does not invent fake links.
 */
export function getWalkthroughForLayout(
  venue: Venue,
  layoutId?: string,
  spaceId?: string,
  layoutType?: SpaceLayoutType | string
): WalkthroughClip | undefined {
  if (!Array.isArray(venue.walkthroughClips) || venue.walkthroughClips.length === 0) {
    return undefined;
  }

  // 1. Direct layoutId match
  if (layoutId) {
    const directMatch = venue.walkthroughClips.find((c) => c.layoutId === layoutId);
    if (directMatch) return directMatch;
  }

  // 2. Space + category match if clip has spaceId
  if (spaceId && layoutType) {
    const targetCat = mapLayoutTypeToCategory(layoutType);
    const spaceMatch = venue.walkthroughClips.find(
      (c) => c.spaceId === spaceId && (c.layoutCategory === targetCat || c.layoutCategory.toLowerCase() === layoutType.toLowerCase())
    );
    if (spaceMatch) return spaceMatch;
  }

  // 3. Legacy compatibility fallback:
  // Only apply if NONE of the clips have layoutId assigned
  const hasAnyExplicitLayoutId = venue.walkthroughClips.some((c) => Boolean(c.layoutId));
  if (!hasAnyExplicitLayoutId && layoutType) {
    const targetCat = mapLayoutTypeToCategory(layoutType);
    // Find clips matching this category
    const categoryMatches = venue.walkthroughClips.filter(
      (c) => c.layoutCategory === targetCat || c.layoutCategory.toLowerCase() === layoutType.toLowerCase()
    );

    // If exactly one clip matches this category, treat as safe legacy match
    if (categoryMatches.length === 1) {
      return categoryMatches[0];
    }
  }

  return undefined;
}

/**
 * Checks if a specific layout genuinely has floor plan media.
 */
export function hasGenuineFloorPlan(venue: Venue, layout?: SpaceLayout, spaceId?: string): boolean {
  if (!layout) return false;
  if (layout.floorPlanUrl && layout.floorPlanUrl.trim().length > 0) return true;

  if (Array.isArray(venue.mediaAssets)) {
    const asset = venue.mediaAssets.find(
      (a) => a.type === 'floor_plan' && ((layout.id && a.layoutId === layout.id) || (spaceId && a.spaceId === spaceId))
    );
    if (asset && asset.url) return true;
  }

  return false;
}

/**
 * Checks if a specific layout genuinely has 360 panorama media.
 */
export function hasGenuine360Media(venue: Venue, layout?: SpaceLayout, spaceId?: string): boolean {
  if (!layout) return false;

  if (Array.isArray(venue.mediaAssets)) {
    const asset = venue.mediaAssets.find(
      (a) => a.type === '360_tour' && ((layout.id && a.layoutId === layout.id) || (spaceId && a.spaceId === spaceId))
    );
    if (asset && asset.url) return true;
  }

  return false;
}

/**
 * Returns clean setup chips for VenueCard from real configured layouts.
 * Never derives them from walkthrough clips.
 */
export function getVenueLayoutChips(venue: Venue, max = 3): string[] {
  const layouts = getVenueLayouts(venue);
  if (layouts.length > 0) {
    const seen = new Set<string>();
    const chips: string[] = [];

    for (const { layout } of layouts) {
      // Prefer layout title (clean and descriptive), or layoutType
      const label = layout.title || `${layout.layoutType} Setup`;
      const clean = label.trim();
      if (!seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        chips.push(clean);
        if (chips.length >= max) break;
      }
    }
    return chips;
  }

  // Fallback if spaces have no sub-layouts yet: show space names
  const spaces = getVenueSpaces(venue);
  if (spaces.length > 0) {
    return spaces.slice(0, max).map((s) => s.name);
  }

  return [];
}
