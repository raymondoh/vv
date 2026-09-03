export type EventCategory =
  | 'all'
  | 'meetings-conferences'
  | 'weddings'
  | 'parties-celebrations'
  | 'training-workshops'
  | 'private-dining'
  | 'exhibitions-events';

export type EventType =
  | EventCategory
  | 'wedding'
  | 'corporate'
  | 'party'
  | 'gala'
  | 'workshop'
  | 'conference'
  | 'dining'
  | 'exhibition';

export type LayoutCategory = 'banquet' | 'cocktail' | 'theater' | 'classroom' | 'outdoor' | 'ceremony';

export interface Milestone {
  timeSec: number;
  label: string;
  description: string;
}

export interface WalkthroughClip {
  id: string;
  spaceId?: string;
  layoutId?: string;
  layoutCategory: LayoutCategory;
  title: string;
  description: string;
  durationSec: number;
  videoUrl: string;
  thumbnail: string;
  cameraAngles: string[];
  setupHighlights: string[];
  milestones: Milestone[];
  maxCapacityForLayout: number;
}

export interface Amenity {
  name: string;
  category: 'Audio/Visual' | 'Hospitality' | 'Access & Logistics' | 'Policies';
  icon: string;
}

export interface VenueSpecs {
  curfew: string;
  parking: string;
  cateringPolicy: string;
  alcoholPolicy: string;
  squareFootage: number;
  ceilingHeightFt: number;
  restroomCount: number;
  bridalSuite: boolean;
  greenRoom: boolean;
  adaCompliant: boolean;
  loadingDock: boolean;
  powerSupply: string;
}

export interface HostInfo {
  name: string;
  title: string;
  avatar: string;
  responseTime: string;
  languages: string[];
  rating: number;
  totalToursConducted: number;
  bio: string;
  phone?: string;
  email?: string;
}

export interface AvailableDaySlot {
  date: string; // YYYY-MM-DD
  times: { time: string; period: 'morning' | 'afternoon' | 'sunset'; available: boolean }[];
}

export type SpaceLayoutType =
  | 'Banquet'
  | 'Theatre'
  | 'Boardroom'
  | 'Classroom'
  | 'Cocktail'
  | 'Ceremony'
  | 'Exhibition'
  | 'Private Dining'
  | 'Custom';

export interface SpaceLayout {
  id: string;
  spaceId?: string;
  title: string;
  layoutType: SpaceLayoutType;
  capacity: number;
  description: string;
  setupHighlights?: string[];
  images?: string[];
  floorPlanUrl?: string;
  threeSixtyUrl?: string;
  walkthroughMediaUrl?: string;
  walkthroughDurationSec?: number;
}

export interface VenueSpace {
  id: string;
  venueId?: string;
  name: string;
  description: string;
  floorLocation: string; // e.g., 'Ground Floor', 'Mezzanine', 'Level 2'
  maxCapacity: number;
  seatedCapacity?: number;
  standingCapacity?: number;
  theatreCapacity?: number;
  squareMeters?: number;
  squareFeet?: number;
  ceilingHeightMeters?: number;
  ceilingHeightFt?: number;
  accessibilityDetails?: string;
  amenities?: string[];
  floorPlanUrl?: string;
  threeSixtyUrl?: string;
  layouts: SpaceLayout[];
}

export interface MediaAsset {
  id: string;
  type: 'photo' | 'floor_plan' | 'walkthrough_video' | '360_tour';
  url: string;
  title: string;
  description?: string;
  spaceId?: string;
  layoutId?: string;
  isPrimary?: boolean;
}

export interface BusinessOrganisation {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  website?: string;
  description?: string;
  createdAt: string;
}

export interface VenueLocation {
  city: string;
  state?: string;
  address: string;
  neighborhood?: string;
  zipCode?: string;
  // International structured fields
  country?: string; // default "United Kingdom"
  countryCode?: string; // default "GB"
  region?: string; // e.g. "Greater London", "West Midlands"
  postalCode?: string; // e.g. "EC1A 1BB"
  addressLine1?: string;
  addressLine2?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string; // IANA e.g. "Europe/London"
}

export interface VenuePricing {
  startingPrice: number;
  priceUnit: string;
  hourlyRate?: number;
  minimumSpend?: number;
  cleaningFee: number;
  securityDeposit: number;
  peakSeasonMultiplier?: number;
  currency?: string; // e.g. "GBP", "USD", "EUR"
  currencySymbol?: string; // e.g. "£", "$", "€"
}

export interface Venue {
  id: string;
  organisationId?: string;
  businessName?: string;
  status?: 'draft' | 'published';
  listingCompleteness?: number; // 0 - 100%
  qualityTier?: 'basic' | 'enhanced' | 'advanced';
  name: string;
  tagline: string;
  description: string;
  location: VenueLocation;
  eventTypes: EventType[];
  aesthetic: string;
  capacity: {
    cocktail: number;
    seatedBanquet: number;
    theater: number;
  };
  pricing: VenuePricing;
  rating: number;
  reviewCount: number;
  featured: boolean;
  heroImage: string;
  galleryImages: string[];
  instantTourBadge: boolean;
  walkthroughClips: WalkthroughClip[];
  spaces?: VenueSpace[];
  mediaAssets?: MediaAsset[];
  amenities: Amenity[];
  specs: VenueSpecs;
  host: HostInfo;
  availableSlots: AvailableDaySlot[];
}

export interface WalkthroughBooking {
  id: string;
  venueId: string;
  venueName: string;
  venueLocation: string;
  venueImage: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  eventType: string;
  estimatedGuests: number;
  targetEventDate: string;
  scheduledDate: string;
  scheduledTime: string;
  walkthroughType: 'private-director' | 'group-preview' | 'technical-av';
  specialRequests?: string;
  meetingUrl: string;
  meetingCode: string;
  status: 'confirmed' | 'completed' | 'cancelled';
  createdAt: string;
  hostName: string;
}

export type UserRole = 'customer' | 'venue_owner' | 'platform_admin';

export type VenueBookingStatus =
  | 'requested'
  | 'deposit_due'
  | 'confirmed'
  | 'final_payment_due'
  | 'fully_paid'
  | 'completed'
  | 'cancelled'
  | 'declined';

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  dueDate?: string;
  category?: 'Inspection' | 'Contract & Payment' | 'Catering & AV' | 'Logistics';
}

export interface VenueBooking {
  id: string;
  bookingNumber: string;
  venueId: string;
  venueName: string;
  venueLocation: string;
  venueImage: string;
  currency?: string; // Canonical currency of venue at booking time (e.g., 'GBP', 'USD')
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientCompany?: string;
  eventType: string;
  guestCount: number;
  eventDate: string;
  startTime?: string;
  endTime?: string;
  selectedLayout?: string;
  selectedSpaceId?: string;
  selectedLayoutId?: string;
  specialRequirements?: string;
  status: VenueBookingStatus;
  grossAmount: number;
  depositPercentage: number;
  depositAmount: number;
  depositPaidAt?: string;
  finalBalance: number;
  finalBalanceDueDate?: string;
  finalPaidAt?: string;
  createdAt: string;
  hostName: string;
  checklist?: ChecklistItem[];
  personalNotes?: string;
  associatedWalkthroughId?: string;
}

export interface MarketplaceConfig {
  commissionPercentage: number;
  depositPercentage: number;
  balanceDueDaysBeforeEvent?: number;
  freeCancellationHours?: number;
  payoutScheduleNote?: string;
}

export interface AiMatchRequest {
  query: string;
}

export interface AiMatchResponse {
  query: string;
  matchedVenueIds: string[];
  topPickVenueId: string;
  confidenceScore: number;
  recommendedLayout: string;
  aiExplanation: string;
  keyMatchFactors: string[];
  estimatedBudgetNote: string;
}

export interface FilterState {
  eventType: EventType;
  location: string;
  minCapacity: number;
  maxBudget: number;
  searchQuery: string;
  selectedLayout: string;
  sortBy: 'recommended' | 'price-asc' | 'price-desc' | 'capacity-desc' | 'rating-desc';
}
