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

export interface ResolvedBookingConfiguration {
  space?: VenueSpace;
  layout?: SpaceLayout;
  walkthroughClip?: WalkthroughClip;
  hasWalkthrough: boolean;
  hasFloorPlan: boolean;
}

/**
 * Resolves the genuine space, layout, walkthrough, and floor plan for a booking.
 * Backward compatible with legacy bookings that only have selectedLayout (human-readable string).
 *
 * Rules:
 * 1. If selectedLayoutId is provided, matches layout.id directly.
 * 2. If legacy selectedLayout string is provided:
 *    - Matches `${space.name} — ${layout.title}`
 *    - Matches layout.title or layoutType setup
 *    - Only resolves if unambiguous (1 unique match).
 * 3. Walkthrough is resolved ONLY for THAT layout via getWalkthroughForLayout.
 * 4. Floor plan is resolved ONLY for THAT layout via hasGenuineFloorPlan.
 */
export function resolveBookingConfiguration(
  venue: Venue,
  selectedSpaceId?: string,
  selectedLayoutId?: string,
  selectedLayoutString?: string
): ResolvedBookingConfiguration {
  const flattened = getVenueLayouts(venue);
  let matchedSpace: VenueSpace | undefined;
  let matchedLayout: SpaceLayout | undefined;

  // 1. Direct layoutId match (highest priority)
  if (selectedLayoutId) {
    const match = flattened.find((f) => f.layout.id === selectedLayoutId);
    if (match) {
      matchedSpace = match.space;
      matchedLayout = match.layout;
    }
  }

  // 2. If no direct layoutId match, attempt resolution from selectedLayoutString
  if (!matchedLayout && selectedLayoutString && selectedLayoutString.trim()) {
    const cleanTarget = selectedLayoutString.trim().toLowerCase();

    // 2a. If selectedSpaceId is specified, check layouts within that space first
    if (selectedSpaceId) {
      const spaceCandidates = flattened.filter((f) => f.space.id === selectedSpaceId);
      const spaceExact = spaceCandidates.filter((f) => {
        const fullTitle = `${f.space.name} — ${f.layout.title || `${f.layout.layoutType} Setup`}`.toLowerCase();
        const layoutTitle = (f.layout.title || `${f.layout.layoutType} Setup`).toLowerCase();
        return fullTitle === cleanTarget || layoutTitle === cleanTarget;
      });
      if (spaceExact.length === 1) {
        matchedSpace = spaceExact[0].space;
        matchedLayout = spaceExact[0].layout;
      }
    }

    // 2b. Full label match: `${space.name} — ${layout.title}` across all venue layouts
    if (!matchedLayout) {
      const fullMatches = flattened.filter((f) => {
        const fullTitle = `${f.space.name} — ${f.layout.title || `${f.layout.layoutType} Setup`}`.toLowerCase();
        return fullTitle === cleanTarget;
      });
      if (fullMatches.length === 1) {
        matchedSpace = fullMatches[0].space;
        matchedLayout = fullMatches[0].layout;
      }
    }

    // 2c. Exact layout title match: `layout.title`
    if (!matchedLayout) {
      const titleMatches = flattened.filter((f) => {
        const layoutTitle = (f.layout.title || `${f.layout.layoutType} Setup`).toLowerCase();
        return layoutTitle === cleanTarget || (f.layout.title && f.layout.title.toLowerCase() === cleanTarget);
      });
      if (titleMatches.length === 1) {
        matchedSpace = titleMatches[0].space;
        matchedLayout = titleMatches[0].layout;
      }
    }

    // 2d. Substring matching if completely unambiguous across the venue
    if (!matchedLayout) {
      const subMatches = flattened.filter((f) => {
        const layoutTitle = (f.layout.title || `${f.layout.layoutType} Setup`).toLowerCase();
        return cleanTarget.includes(layoutTitle) || (f.layout.title && cleanTarget.includes(f.layout.title.toLowerCase()));
      });
      if (subMatches.length === 1) {
        matchedSpace = subMatches[0].space;
        matchedLayout = subMatches[0].layout;
      }
    }
  }

  // 3. If spaceId is specified or resolved without a layout
  if (!matchedSpace && selectedSpaceId) {
    const spaces = getVenueSpaces(venue);
    matchedSpace = spaces.find((s) => s.id === selectedSpaceId);
  }

  // 4. Resolve walkthrough ONLY for this specific layout
  const walkthroughClip = matchedLayout
    ? getWalkthroughForLayout(venue, matchedLayout.id, matchedSpace?.id, matchedLayout.layoutType)
    : (selectedLayoutId
        ? getWalkthroughForLayout(venue, selectedLayoutId, selectedSpaceId)
        : undefined);

  // 5. Resolve floor plan ONLY for this specific layout
  const hasFloorPlan = matchedLayout
    ? hasGenuineFloorPlan(venue, matchedLayout, matchedSpace?.id)
    : false;

  return {
    space: matchedSpace,
    layout: matchedLayout,
    walkthroughClip,
    hasWalkthrough: Boolean(walkthroughClip),
    hasFloorPlan,
  };
}

