import { Venue, VenueSpace, SpaceLayout, WalkthroughClip, LayoutCategory, SpaceLayoutType } from '../types';
import { hasBookableLiveTourSlots } from './walkthroughAvailabilityHelpers';

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

/**
 * Returns the maximum guest capacity supported by any configured space or layout in the venue.
 * Priority: Canonical spaces/layouts first -> legacy top-level capacity second.
 */
export function getVenueMaximumCapacity(venue: Venue): number {
  const spaces = getVenueSpaces(venue);
  if (spaces.length > 0) {
    let maxCap = 0;
    for (const space of spaces) {
      if (space.maxCapacity) maxCap = Math.max(maxCap, space.maxCapacity);
      if (space.standingCapacity) maxCap = Math.max(maxCap, space.standingCapacity);
      if (space.seatedCapacity) maxCap = Math.max(maxCap, space.seatedCapacity);
      if (space.theatreCapacity) maxCap = Math.max(maxCap, space.theatreCapacity);
      if (Array.isArray(space.layouts)) {
        for (const layout of space.layouts) {
          if (layout.capacity) maxCap = Math.max(maxCap, layout.capacity);
        }
      }
    }
    if (maxCap > 0) return maxCap;
  }

  // Fallback to legacy top-level capacity
  return Math.max(
    venue.capacity?.cocktail || 0,
    venue.capacity?.seatedBanquet || 0,
    venue.capacity?.theater || 0
  );
}

/**
 * Returns the maximum seated banquet/dining capacity supported by any configured space or layout.
 */
export function getVenueMaximumSeatedCapacity(venue: Venue): number {
  const spaces = getVenueSpaces(venue);
  if (spaces.length > 0) {
    let maxSeated = 0;
    for (const space of spaces) {
      if (space.seatedCapacity) maxSeated = Math.max(maxSeated, space.seatedCapacity);
      if (Array.isArray(space.layouts)) {
        for (const layout of space.layouts) {
          const t = layout.layoutType;
          if (t === 'Banquet' || t === 'Boardroom' || t === 'Classroom' || t === 'Private Dining') {
            if (layout.capacity) maxSeated = Math.max(maxSeated, layout.capacity);
          }
        }
      }
    }
    if (maxSeated > 0) return maxSeated;
  }

  return venue.capacity?.seatedBanquet || 0;
}

/**
 * Returns the maximum standing cocktail capacity supported by any configured space or layout.
 */
export function getVenueMaximumStandingCapacity(venue: Venue): number {
  const spaces = getVenueSpaces(venue);
  if (spaces.length > 0) {
    let maxStanding = 0;
    for (const space of spaces) {
      if (space.standingCapacity) maxStanding = Math.max(maxStanding, space.standingCapacity);
      if (Array.isArray(space.layouts)) {
        for (const layout of space.layouts) {
          if (layout.layoutType === 'Cocktail' && layout.capacity) {
            maxStanding = Math.max(maxStanding, layout.capacity);
          }
        }
      }
    }
    if (maxStanding > 0) return maxStanding;
  }

  return venue.capacity?.cocktail || 0;
}

/**
 * Returns the maximum theatre capacity supported by any configured space or layout.
 */
export function getVenueMaximumTheatreCapacity(venue: Venue): number {
  const spaces = getVenueSpaces(venue);
  if (spaces.length > 0) {
    let maxTheatre = 0;
    for (const space of spaces) {
      if (space.theatreCapacity) maxTheatre = Math.max(maxTheatre, space.theatreCapacity);
      if (Array.isArray(space.layouts)) {
        for (const layout of space.layouts) {
          if (layout.layoutType === 'Theatre' && layout.capacity) {
            maxTheatre = Math.max(maxTheatre, layout.capacity);
          }
        }
      }
    }
    if (maxTheatre > 0) return maxTheatre;
  }

  return venue.capacity?.theater || 0;
}

/**
 * Verifies if at least one genuine space or configured layout can accommodate the requested guest count.
 * Do not reject newly onboarded venues if legacy capacity is missing.
 * Do not claim a venue supports a capacity that no actual configured space/layout supports.
 */
export function venueCanAccommodateGuests(
  venue: Venue,
  guestCount: number,
  format: 'seated' | 'standing' | 'theatre' | 'any' = 'any'
): boolean {
  if (guestCount <= 0) return true;

  const spaces = getVenueSpaces(venue);
  if (spaces.length > 0) {
    return spaces.some((space) => {
      if (format === 'seated') {
        if (space.seatedCapacity && space.seatedCapacity >= guestCount) return true;
        return (space.layouts || []).some(
          (l) =>
            (l.layoutType === 'Banquet' ||
              l.layoutType === 'Boardroom' ||
              l.layoutType === 'Classroom' ||
              l.layoutType === 'Private Dining') &&
            l.capacity >= guestCount
        );
      }
      if (format === 'standing') {
        if (space.standingCapacity && space.standingCapacity >= guestCount) return true;
        return (space.layouts || []).some(
          (l) => l.layoutType === 'Cocktail' && l.capacity >= guestCount
        );
      }
      if (format === 'theatre') {
        if (space.theatreCapacity && space.theatreCapacity >= guestCount) return true;
        return (space.layouts || []).some(
          (l) => l.layoutType === 'Theatre' && l.capacity >= guestCount
        );
      }

      // 'any' format: check if any space capacity or layout capacity accommodates the count
      if (space.maxCapacity && space.maxCapacity >= guestCount) return true;
      if (space.standingCapacity && space.standingCapacity >= guestCount) return true;
      if (space.seatedCapacity && space.seatedCapacity >= guestCount) return true;
      if (space.theatreCapacity && space.theatreCapacity >= guestCount) return true;
      if (Array.isArray(space.layouts) && space.layouts.some((l) => l.capacity && l.capacity >= guestCount)) {
        return true;
      }
      return false;
    });
  }

  // Fallback to legacy top-level capacity if no spaces configured
  if (format === 'seated') {
    return (venue.capacity?.seatedBanquet || 0) >= guestCount;
  }
  if (format === 'standing') {
    return (venue.capacity?.cocktail || 0) >= guestCount;
  }
  if (format === 'theatre') {
    return (venue.capacity?.theater || 0) >= guestCount;
  }

  return (
    (venue.capacity?.cocktail || 0) >= guestCount ||
    (venue.capacity?.seatedBanquet || 0) >= guestCount ||
    (venue.capacity?.theater || 0) >= guestCount
  );
}

/**
 * Verifies if at least one genuine space or configured layout can accommodate the requested guest count
 * according to the specific event category semantics.
 * Uses canonical spaces/layouts first, with legacy fallback only when no canonical spaces exist.
 */
export function venueCanAccommodateEventGuests(
  venue: Venue,
  eventCategory: string,
  guestCount: number
): boolean {
  if (guestCount <= 0) return true;

  const cat = (eventCategory || '').toLowerCase().trim();
  if (!cat || cat === 'all') {
    return venueCanAccommodateGuests(venue, guestCount, 'any');
  }

  const isMeetingsConferences =
    cat === 'meetings-conferences' ||
    cat === 'conference' ||
    cat === 'meetings' ||
    cat === 'corporate' ||
    cat === 'meetings & conferences';

  const isTrainingWorkshops =
    cat === 'training-workshops' ||
    cat === 'workshop' ||
    cat === 'training' ||
    cat === 'training & workshops';

  const isPrivateDining =
    cat === 'private-dining' ||
    cat === 'dining' ||
    cat === 'private dining';

  const isPartiesCelebrations =
    cat === 'parties-celebrations' ||
    cat === 'party' ||
    cat === 'gala' ||
    cat === 'celebration' ||
    cat === 'parties & celebrations';

  const isWeddings =
    cat === 'weddings' ||
    cat === 'wedding';

  const isExhibitionsEvents =
    cat === 'exhibitions-events' ||
    cat === 'exhibition' ||
    cat === 'exhibitions & events' ||
    cat === 'exhibitions';

  const spaces = getVenueSpaces(venue);
  if (spaces.length > 0) {
    return spaces.some((space) => {
      const layouts = Array.isArray(space.layouts) ? space.layouts : [];

      if (isMeetingsConferences) {
        if (space.theatreCapacity && space.theatreCapacity >= guestCount) return true;
        if (space.seatedCapacity && space.seatedCapacity >= guestCount) return true;
        return layouts.some((l) => {
          const lt = (l.layoutType || '').toLowerCase().trim();
          return (
            (lt === 'theatre' || lt === 'classroom' || lt === 'boardroom' || lt === 'custom') &&
            l.capacity >= guestCount
          );
        });
      }

      if (isTrainingWorkshops) {
        if (space.seatedCapacity && space.seatedCapacity >= guestCount) return true;
        if (space.theatreCapacity && space.theatreCapacity >= guestCount) return true;
        return layouts.some((l) => {
          const lt = (l.layoutType || '').toLowerCase().trim();
          return (
            (lt === 'classroom' || lt === 'boardroom' || lt === 'theatre' || lt === 'custom') &&
            l.capacity >= guestCount
          );
        });
      }

      if (isPrivateDining) {
        if (space.seatedCapacity && space.seatedCapacity >= guestCount) return true;
        return layouts.some((l) => {
          const lt = (l.layoutType || '').toLowerCase().trim();
          return (
            (lt === 'private dining' || lt === 'banquet' || lt === 'custom') &&
            l.capacity >= guestCount
          );
        });
      }

      if (isPartiesCelebrations) {
        if (space.standingCapacity && space.standingCapacity >= guestCount) return true;
        if (space.seatedCapacity && space.seatedCapacity >= guestCount) return true;
        return layouts.some((l) => {
          const lt = (l.layoutType || '').toLowerCase().trim();
          return (
            (lt === 'cocktail' || lt === 'banquet' || lt === 'custom') &&
            l.capacity >= guestCount
          );
        });
      }

      if (isWeddings) {
        if (space.seatedCapacity && space.seatedCapacity >= guestCount) return true;
        if (space.standingCapacity && space.standingCapacity >= guestCount) return true;
        return layouts.some((l) => {
          const lt = (l.layoutType || '').toLowerCase().trim();
          return (
            (lt === 'ceremony' || lt === 'banquet' || lt === 'cocktail' || lt === 'custom') &&
            l.capacity >= guestCount
          );
        });
      }

      if (isExhibitionsEvents) {
        if (space.maxCapacity && space.maxCapacity >= guestCount) return true;
        if (space.standingCapacity && space.standingCapacity >= guestCount) return true;
        return layouts.some((l) => {
          const lt = (l.layoutType || '').toLowerCase().trim();
          return (
            (lt === 'exhibition' || lt === 'custom') &&
            l.capacity >= guestCount
          );
        });
      }

      // Default fallback for any other category: check all space and layout capacities
      if (space.maxCapacity && space.maxCapacity >= guestCount) return true;
      if (space.standingCapacity && space.standingCapacity >= guestCount) return true;
      if (space.seatedCapacity && space.seatedCapacity >= guestCount) return true;
      if (space.theatreCapacity && space.theatreCapacity >= guestCount) return true;
      return layouts.some((l) => l.capacity && l.capacity >= guestCount);
    });
  }

  // Legacy fallback when no canonical spaces exist
  if (isMeetingsConferences || isTrainingWorkshops) {
    return (
      (venue.capacity?.theater || 0) >= guestCount ||
      (venue.capacity?.seatedBanquet || 0) >= guestCount
    );
  }

  if (isPrivateDining) {
    return (venue.capacity?.seatedBanquet || 0) >= guestCount;
  }

  if (isPartiesCelebrations || isWeddings) {
    return (
      (venue.capacity?.cocktail || 0) >= guestCount ||
      (venue.capacity?.seatedBanquet || 0) >= guestCount
    );
  }

  if (isExhibitionsEvents) {
    return (
      (venue.capacity?.cocktail || 0) >= guestCount ||
      (venue.capacity?.theater || 0) >= guestCount ||
      (venue.capacity?.seatedBanquet || 0) >= guestCount
    );
  }

  return venueCanAccommodateGuests(venue, guestCount, 'any');
}

/**
 * Returns a truthful, concise customer-facing capacity display string.
 * Example: '120 seated · 220 standing' or 'Up to 220 guests'
 */
export function getVenueCapacityDisplay(venue: Venue): string {
  const seated = getVenueMaximumSeatedCapacity(venue);
  const standing = getVenueMaximumStandingCapacity(venue);
  const theatre = getVenueMaximumTheatreCapacity(venue);
  const max = getVenueMaximumCapacity(venue);

  if (seated > 0 && standing > 0) {
    return `${seated} seated · ${standing} standing`;
  }
  if (standing > 0) {
    return `Up to ${standing} standing`;
  }
  if (seated > 0) {
    return `Up to ${seated} seated`;
  }
  if (theatre > 0) {
    return `Up to ${theatre} theatre`;
  }
  if (max > 0) {
    return `Up to ${max} guests`;
  }
  return 'Capacity on request';
}

export interface VenueAiLayoutSummary {
  id: string;
  title: string;
  layoutType: SpaceLayoutType;
  capacity: number;
  hasRecordedWalkthrough: boolean;
  walkthroughTitle?: string;
}

export interface VenueAiSpaceSummary {
  id: string;
  name: string;
  maxCapacity: number;
  seatedCapacity?: number;
  standingCapacity?: number;
  theatreCapacity?: number;
  layouts: VenueAiLayoutSummary[];
}

export interface VenueAiCatalogSummary {
  id: string;
  name: string;
  location: {
    city: string;
    region?: string;
    state?: string;
    country?: string;
    neighborhood?: string;
    postalCode?: string;
  };
  eventTypes: string[];
  aesthetic: string;
  startingPrice: number;
  currency: string;
  priceUnit: string;
  hourlyRate?: number;
  minimumSpend?: number;
  overallCapacity: {
    max: number;
    seated: number;
    standing: number;
    theatre: number;
  };
  liveTourAvailable: boolean;
  spaces: VenueAiSpaceSummary[];
  allConfiguredLayouts: {
    spaceId: string;
    spaceName: string;
    layoutId: string;
    layoutTitle: string;
    layoutType: SpaceLayoutType;
    capacity: number;
    hasRecordedWalkthrough: boolean;
  }[];
}

/**
 * Builds a canonical, truthful summary of a venue for AI matcher consumption.
 * Built directly from spaces and layouts, treating recorded walkthroughs as layout attributes.
 */
export function getVenueAiCatalogSummary(venue: Venue): VenueAiCatalogSummary {
  const spaces = getVenueSpaces(venue);
  const maxCap = getVenueMaximumCapacity(venue);
  const seatedCap = getVenueMaximumSeatedCapacity(venue);
  const standingCap = getVenueMaximumStandingCapacity(venue);
  const theatreCap = getVenueMaximumTheatreCapacity(venue);
  const liveTourAvailable = hasBookableLiveTourSlots(venue);

  const spacesSummary: VenueAiSpaceSummary[] = spaces.map((space) => {
    const layoutsSummary: VenueAiLayoutSummary[] = (space.layouts || []).map((layout) => {
      const clip = getWalkthroughForLayout(venue, layout.id, space.id, layout.layoutType);
      return {
        id: layout.id,
        title: layout.title || `${layout.layoutType} Setup`,
        layoutType: layout.layoutType,
        capacity: layout.capacity,
        hasRecordedWalkthrough: Boolean(clip),
        walkthroughTitle: clip?.title,
      };
    });

    return {
      id: space.id,
      name: space.name,
      maxCapacity: space.maxCapacity || Math.max(0, ...(space.layouts || []).map((l) => l.capacity || 0)),
      seatedCapacity: space.seatedCapacity,
      standingCapacity: space.standingCapacity,
      theatreCapacity: space.theatreCapacity,
      layouts: layoutsSummary,
    };
  });

  const allConfiguredLayouts = spacesSummary.flatMap((s) =>
    s.layouts.map((l) => ({
      spaceId: s.id,
      spaceName: s.name,
      layoutId: l.id,
      layoutTitle: l.title,
      layoutType: l.layoutType,
      capacity: l.capacity,
      hasRecordedWalkthrough: l.hasRecordedWalkthrough,
    }))
  );

  return {
    id: venue.id,
    name: venue.name,
    location: {
      city: venue.location?.city || '',
      region: venue.location?.region || venue.location?.state || '',
      state: venue.location?.state || '',
      country: venue.location?.country || '',
      neighborhood: venue.location?.neighborhood || '',
      postalCode: venue.location?.postalCode || venue.location?.zipCode || '',
    },
    eventTypes: venue.eventTypes || [],
    aesthetic: venue.aesthetic || '',
    startingPrice: venue.pricing?.startingPrice || 0,
    currency: venue.pricing?.currency || 'GBP',
    priceUnit: venue.pricing?.priceUnit || 'per day',
    hourlyRate: venue.pricing?.hourlyRate,
    minimumSpend: venue.pricing?.minimumSpend,
    overallCapacity: {
      max: maxCap,
      seated: seatedCap,
      standing: standingCap,
      theatre: theatreCap,
    },
    liveTourAvailable,
    spaces: spacesSummary,
    allConfiguredLayouts,
  };
}


