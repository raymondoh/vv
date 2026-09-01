import { Venue, VenueSpace } from '../types';

export interface CompletenessResult {
  score: number; // 0 to 100
  tier: 'basic' | 'enhanced' | 'advanced';
  tierLabel: string;
  recommendations: {
    id: string;
    label: string;
    points: number;
    completed: boolean;
  }[];
}

/**
 * Calculates progressive listing completeness and next best actions
 * without blocking basic listings from publication.
 */
export function calculateListingCompleteness(
  venue: Partial<Venue>,
  spaces: VenueSpace[] = []
): CompletenessResult {
  const checks = [
    {
      id: 'core_info',
      label: 'Core venue details (Name, tagline, description)',
      points: 15,
      completed: Boolean(
        venue.name &&
        venue.tagline &&
        venue.description &&
        venue.description.length > 20
      ),
    },
    {
      id: 'location',
      label: 'Complete location and postal address',
      points: 10,
      completed: Boolean(
        venue.location?.city &&
        (venue.location?.address || venue.location?.addressLine1)
      ),
    },
    {
      id: 'pricing',
      label: 'Starting hire rate and commercial terms',
      points: 10,
      completed: Boolean(venue.pricing?.startingPrice && venue.pricing.startingPrice > 0),
    },
    {
      id: 'photos',
      label: 'Hero banner and gallery photos (3+ images)',
      points: 15,
      completed: Boolean(
        venue.heroImage &&
        (venue.galleryImages?.length || 0) >= 2
      ),
    },
    {
      id: 'spaces',
      label: 'At least one bookable space with capacities',
      points: 15,
      completed: spaces.length > 0 && spaces.some((s) => s.name && s.maxCapacity > 0),
    },
    {
      id: 'layouts',
      label: 'Multiple room configurations/layouts defined',
      points: 15,
      completed: spaces.some((s) => (s.layouts?.length || 0) >= 2),
    },
    {
      id: 'floor_plan',
      label: 'Floor plan / spatial blueprints',
      points: 10,
      completed: Boolean(
        spaces.some((s) => s.layouts?.some((l) => Boolean(l.floorPlanUrl))) ||
        venue.mediaAssets?.some((m) => m.type === 'floor_plan')
      ),
    },
    {
      id: 'walkthrough',
      label: 'Virtual walkthrough clip / video tour',
      points: 10,
      completed: Boolean(
        (venue.walkthroughClips?.length || 0) > 0 ||
        spaces.some((s) => s.layouts?.some((l) => Boolean(l.walkthroughMediaUrl))) ||
        venue.mediaAssets?.some((m) => m.type === 'walkthrough_video' || m.type === '360_tour')
      ),
    },
  ];

  const score = checks.reduce((sum, c) => (c.completed ? sum + c.points : sum), 0);

  let tier: 'basic' | 'enhanced' | 'advanced' = 'basic';
  let tierLabel = 'Basic Listing';

  if (score >= 85) {
    tier = 'advanced';
    tierLabel = 'Advanced Virtual Viewing';
  } else if (score >= 60) {
    tier = 'enhanced';
    tierLabel = 'Enhanced Listing';
  }

  return {
    score,
    tier,
    tierLabel,
    recommendations: checks,
  };
}

/**
 * Alias for calculateListingCompleteness taking venue and spaces directly or from venue.spaces
 */
export function calculateCompleteness(
  venue: Partial<Venue>,
  spaces?: VenueSpace[]
): CompletenessResult {
  const spacesList = spaces || venue.spaces || [];
  return calculateListingCompleteness(venue, spacesList);
}

/**
 * Helper to get styling badges for quality tier
 */
export function getQualityTierBadge(tier: 'basic' | 'enhanced' | 'advanced') {
  switch (tier) {
    case 'advanced':
      return {
        label: 'Advanced Virtual Viewing',
        bg: 'bg-indigo-50',
        color: 'text-indigo-800',
        border: 'border-indigo-200',
      };
    case 'enhanced':
      return {
        label: 'Enhanced Listing',
        bg: 'bg-emerald-50',
        color: 'text-emerald-800',
        border: 'border-emerald-200',
      };
    case 'basic':
    default:
      return {
        label: 'Basic Listing',
        bg: 'bg-amber-50',
        color: 'text-amber-800',
        border: 'border-amber-200',
      };
  }
}
