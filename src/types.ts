export type EventType = 'all' | 'wedding' | 'corporate' | 'party' | 'gala';

export type LayoutCategory = 'banquet' | 'cocktail' | 'theater' | 'outdoor' | 'ceremony';

export interface Milestone {
  timeSec: number;
  label: string;
  description: string;
}

export interface WalkthroughClip {
  id: string;
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
}

export interface AvailableDaySlot {
  date: string; // YYYY-MM-DD
  times: { time: string; period: 'morning' | 'afternoon' | 'sunset'; available: boolean }[];
}

export interface Venue {
  id: string;
  name: string;
  tagline: string;
  description: string;
  location: {
    city: string;
    state: string;
    address: string;
    neighborhood: string;
    zipCode: string;
  };
  eventTypes: ('wedding' | 'corporate' | 'party' | 'gala')[];
  aesthetic: string;
  capacity: {
    cocktail: number;
    seatedBanquet: number;
    theater: number;
  };
  pricing: {
    startingPrice: number;
    priceUnit: string;
    hourlyRate?: number;
    cleaningFee: number;
    securityDeposit: number;
    peakSeasonMultiplier?: number;
  };
  rating: number;
  reviewCount: number;
  featured: boolean;
  heroImage: string;
  galleryImages: string[];
  instantTourBadge: boolean;
  walkthroughClips: WalkthroughClip[];
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
