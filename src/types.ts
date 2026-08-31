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
  eventTypes: EventType[];
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

export type VenueBookingStatus =
  | 'requested'
  | 'venue_confirmed'
  | 'confirmed_by_venue' // alias for deposit_due
  | 'deposit_due'
  | 'deposit_paid' // alias for confirmed
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
