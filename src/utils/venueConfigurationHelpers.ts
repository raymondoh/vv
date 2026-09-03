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
 * Returns null if the layout type does not cleanly map to a known video category.
 */
export function mapLayoutTypeToCategory(layoutType?: SpaceLayoutType | string): LayoutCategory | null {
  if (!layoutType) return null;
  const norm = layoutType.toLowerCase().trim();
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
  if (norm.includes('banquet') || norm.includes('gala') || norm.includes('dining') || norm.includes('dinner') || norm.includes('private dining')) {
    return 'banquet';
  }
  return null;
}

/**
 * Finds the associated WalkthroughClip for a layout.
 *
 * Rules:
 * 1. Exact match on clip.layoutId === layout.id (highest priority).
 * 2. Clips with an explicit layoutId that does NOT match layout.id belong exclusively
 *    to their respective layouts and are NEVER reused as fallback.
 * 3. Legacy compatibility fallback applies ONLY to unassigned clips (!clip.layoutId):
 *    - Must have a unambiguous category match (exactly 1 matching clip).
 *    - If spaceId is provided and matching clip has spaceId, must match space.
 *    - If ambiguity exists or no exact match is found, returns undefined (no walkthrough).
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

  // 1. Direct layoutId match (highest priority)
  if (layoutId) {
    const directMatch = venue.walkthroughClips.find((c) => c.layoutId === layoutId);
    if (directMatch) return directMatch;
  }

  // Clips with an explicit layoutId belong exclusively to that layout.
  // Only unassigned clips (legacy/seeded data with no layoutId) are eligible for fallback.
  const unassignedClips = venue.walkthroughClips.filter((c) => !c.layoutId);
  if (unassignedClips.length === 0) {
    return undefined;
  }

  if (!layoutType) {
    return undefined;
  }

  const targetCat = mapLayoutTypeToCategory(layoutType);
  if (!targetCat) {
    return undefined;
  }

  // 2. Space + category match if unassigned clip has matching spaceId
  if (spaceId) {
    const spaceMatches = unassignedClips.filter(
      (c) => c.spaceId === spaceId && (c.layoutCategory === targetCat || c.layoutCategory.toLowerCase() === layoutType.toLowerCase())
    );
    if (spaceMatches.length === 1) {
      return spaceMatches[0];
    }
    if (spaceMatches.length > 1) {
      // Ambiguous: multiple matching clips in the same space
      return undefined;
    }
  }

  // 3. Unassigned legacy clip match across the venue
  // Only consider clips that do NOT belong to a different space
  const candidateClips = unassignedClips.filter((c) => {
    if (c.spaceId && spaceId && c.spaceId !== spaceId) return false;
    return c.layoutCategory === targetCat || c.layoutCategory.toLowerCase() === layoutType.toLowerCase();
  });

  // Genuinely unique match only
  if (candidateClips.length === 1) {
    return candidateClips[0];
  }

  // If ambiguity exists or 0 matches: return no walkthrough
  return undefined;
}

export interface CapacityWarning {
  spaceId: string;
  spaceName: string;
  layoutId: string;
  layoutTitle: string;
  layoutCapacity: number;
  relevantLimit: number;
  limitLabel: string;
  message: string;
}

/**
 * Checks if a layout's capacity exceeds the physical room's relevant capacity.
 * Relevant mapping:
 * - Banquet -> seatedCapacity (or maxCapacity)
 * - Theatre -> theatreCapacity (or maxCapacity)
 * - Cocktail -> standingCapacity (or maxCapacity)
 * - Boardroom/Classroom/Ceremony/Custom -> maxCapacity (or seatedCapacity for meeting/dining)
 */
export function getLayoutCapacityWarning(space: VenueSpace, layout: SpaceLayout): string | null {
  if (!layout.capacity || layout.capacity <= 0) return null;

  const layoutTitle = layout.title || `${layout.layoutType} Setup`;
  const type = layout.layoutType;

  if (type === 'Banquet') {
    const limit = space.seatedCapacity || space.maxCapacity;
    if (limit && limit > 0 && layout.capacity > limit) {
      return `${layoutTitle} capacity (${layout.capacity}) exceeds the room's Seated capacity (${limit}). Please review.`;
    }
  } else if (type === 'Theatre') {
    const limit = space.theatreCapacity || space.maxCapacity;
    if (limit && limit > 0 && layout.capacity > limit) {
      return `${layoutTitle} capacity (${layout.capacity}) exceeds the room's Theatre capacity (${limit}). Please review.`;
    }
  } else if (type === 'Cocktail') {
    const limit = space.standingCapacity || space.maxCapacity;
    if (limit && limit > 0 && layout.capacity > limit) {
      return `${layoutTitle} capacity (${layout.capacity}) exceeds the room's Standing capacity (${limit}). Please review.`;
    }
  } else {
    // Boardroom, Classroom, Ceremony, Exhibition, Private Dining, Custom
    let limit = space.maxCapacity;
    let label = 'maximum';
    if ((type === 'Private Dining' || type === 'Boardroom' || type === 'Classroom') && space.seatedCapacity && space.seatedCapacity > 0) {
      limit = space.seatedCapacity;
      label = 'Seated';
    }
    if (limit && limit > 0 && layout.capacity > limit) {
      return `${layoutTitle} capacity (${layout.capacity}) exceeds the room's ${label} capacity (${limit}). Please review.`;
    }
  }

  return null;
}

/**
 * Gathers all capacity inconsistency warnings across all configured spaces and layouts.
 */
export function getAllCapacityWarnings(spaces: VenueSpace[]): CapacityWarning[] {
  const warnings: CapacityWarning[] = [];
  if (!Array.isArray(spaces)) return warnings;

  for (const space of spaces) {
    if (Array.isArray(space.layouts)) {
      for (const layout of space.layouts) {
        const warning = getLayoutCapacityWarning(space, layout);
        if (warning) {
          warnings.push({
            spaceId: space.id,
            spaceName: space.name || 'Room',
            layoutId: layout.id,
            layoutTitle: layout.title || `${layout.layoutType} Setup`,
            layoutCapacity: layout.capacity,
            relevantLimit: 0,
            limitLabel: '',
            message: warning,
          });
        }
      }
    }
  }

  return warnings;
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
