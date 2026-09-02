import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, ChevronLeft, ChevronRight, Check, Building2, MapPin, Layers, Grid, Coins, Image as ImageIcon, CheckCircle2, Save } from 'lucide-react';
import { Venue, BusinessOrganisation, VenueSpace, VenuePricing, Amenity, WalkthroughClip } from '../../types';
import { BusinessDetailsStep } from './steps/BusinessDetailsStep';
import { VenueDetailsStep } from './steps/VenueDetailsStep';
import { SpacesCapacitiesStep } from './steps/SpacesCapacitiesStep';
import { LayoutsConfigurationsStep } from './steps/LayoutsConfigurationsStep';
import { PricingAmenitiesStep } from './steps/PricingAmenitiesStep';
import { MediaWalkthroughStep } from './steps/MediaWalkthroughStep';
import { ReviewPublishStep } from './steps/ReviewPublishStep';
import { calculateCompleteness, getQualityTierBadge } from '../../utils/completeness';

interface VenueOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVenueCreatedOrUpdated: (venue: Venue, org: BusinessOrganisation) => void;
  existingOrganisations: BusinessOrganisation[];
  initialVenue?: Venue | null;
  initialOrganisationId?: string;
}

const STEPS = [
  { id: 1, label: 'Business Profile', icon: Building2 },
  { id: 2, label: 'Venue Details', icon: MapPin },
  { id: 3, label: 'Spaces & Rooms', icon: Layers },
  { id: 4, label: 'Layouts', icon: Grid },
  { id: 5, label: 'Pricing & Terms', icon: Coins },
  { id: 6, label: 'Media & Viewing', icon: ImageIcon },
  { id: 7, label: 'Review & Publish', icon: CheckCircle2 },
];

export const createBlankVenueDraft = (): Partial<Venue> => ({
  name: '',
  tagline: '',
  description: '',
  organisationId: '',
  businessName: '',
  status: 'draft',
  aesthetic: '',
  eventTypes: [],
  location: {
    address: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    region: '',
    state: '',
    country: 'United Kingdom',
    countryCode: 'GB',
    postalCode: '',
    zipCode: '',
    neighborhood: '',
    timezone: 'Europe/London',
  },
  capacity: {
    cocktail: 0,
    seatedBanquet: 0,
    theater: 0,
  },
  pricing: {
    startingPrice: 0,
    priceUnit: 'per day',
    hourlyRate: 0,
    cleaningFee: 0,
    securityDeposit: 0,
    currency: 'GBP',
    currencySymbol: '£',
  },
  spaces: [],
  walkthroughClips: [],
  mediaAssets: [],
  amenities: [],
  specs: {
    curfew: '',
    parking: '',
    cateringPolicy: '',
    alcoholPolicy: '',
    powerSupply: '',
    squareFootage: 0,
    ceilingHeightFt: 0,
    restroomCount: 0,
    bridalSuite: false,
    greenRoom: false,
    adaCompliant: false,
    loadingDock: false,
  },
  heroImage: '',
  galleryImages: [],
});

export const createBlankOrganisation = (): Partial<BusinessOrganisation> => ({
  name: '',
  contactName: '',
  email: '',
  phone: '',
  website: '',
  description: '',
});

export const VenueOnboardingModal: React.FC<VenueOnboardingModalProps> = ({
  isOpen,
  onClose,
  onVenueCreatedOrUpdated,
  existingOrganisations = [],
  initialVenue,
  initialOrganisationId,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Business mode: 'existing' | 'new' | null
  const [businessMode, setBusinessMode] = useState<'existing' | 'new' | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  // Business organisation state
  const [organisation, setOrganisation] = useState<Partial<BusinessOrganisation>>(createBlankOrganisation());

  // Venue state
  const [venue, setVenue] = useState<Partial<Venue>>(createBlankVenueDraft());

  // Re-sync and cleanly reset whenever the modal opens or props change
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setErrorMessage(null);

      if (initialVenue) {
        // EDIT MODE: populate saved venue data
        setVenue({ ...initialVenue });
        const found = existingOrganisations.find((o) => o.id === initialVenue.organisationId);
        if (found) {
          setOrganisation({ ...found });
          setSelectedOrgId(found.id);
          setBusinessMode('existing');
        } else {
          setOrganisation({
            id: initialVenue.organisationId,
            name: initialVenue.businessName || '',
            contactName: '',
            email: '',
            phone: '',
            website: '',
            description: '',
          });
          setSelectedOrgId(initialVenue.organisationId || null);
          setBusinessMode('existing');
        }
      } else {
        // CREATE MODE: always start from clean truthful blank state
        setVenue(createBlankVenueDraft());

        if (initialOrganisationId) {
          const found = existingOrganisations.find((o) => o.id === initialOrganisationId);
          if (found) {
            setOrganisation({ ...found });
            setSelectedOrgId(found.id);
            setBusinessMode('existing');
            setVenue((v) => ({ ...v, organisationId: found.id, businessName: found.name }));
          } else {
            setOrganisation(createBlankOrganisation());
            setSelectedOrgId(null);
            setBusinessMode(existingOrganisations.length > 0 ? null : 'new');
          }
        } else {
          setOrganisation(createBlankOrganisation());
          setSelectedOrgId(null);
          setBusinessMode(existingOrganisations.length > 0 ? null : 'new');
        }
      }
    }
  }, [isOpen, initialVenue, initialOrganisationId, existingOrganisations]);

  if (!isOpen) return null;

  const completeness = calculateCompleteness(venue as Venue);
  const tierBadge = getQualityTierBadge(completeness.tier);

  const handleSelectMode = (mode: 'existing' | 'new') => {
    setBusinessMode(mode);
    setErrorMessage(null);
    if (mode === 'new') {
      setSelectedOrgId(null);
      setOrganisation(createBlankOrganisation());
      setVenue((prev) => ({ ...prev, organisationId: '', businessName: '' }));
    } else if (mode === 'existing') {
      if (!selectedOrgId && existingOrganisations.length > 0) {
        setOrganisation(createBlankOrganisation());
        setVenue((prev) => ({ ...prev, organisationId: '', businessName: '' }));
      }
    }
  };

  const handleSelectExistingOrg = (org: BusinessOrganisation) => {
    setSelectedOrgId(org.id);
    setOrganisation({ ...org });
    setVenue((prev) => ({
      ...prev,
      organisationId: org.id,
      businessName: org.name,
    }));
  };

  const handleNext = () => {
    setErrorMessage(null);
    if (currentStep === 1) {
      if (existingOrganisations.length > 0 && businessMode === null) {
        setErrorMessage('Please select whether to add this venue to an existing business or create a new business.');
        return;
      }
      if (businessMode === 'existing' && !selectedOrgId) {
        setErrorMessage('Please select an existing business account from the list above.');
        return;
      }
      if (!organisation.name?.trim() || !organisation.contactName?.trim() || !organisation.email?.trim()) {
        setErrorMessage('Please fill in business name, primary contact name, and business email.');
        return;
      }
    } else if (currentStep === 2) {
      if (!venue.name?.trim() || !venue.location?.city?.trim()) {
        setErrorMessage('Please provide a venue name and city.');
        return;
      }
    }
    setCurrentStep((prev) => Math.min(STEPS.length, prev + 1));
  };

  const handleBack = () => {
    setErrorMessage(null);
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const handleOrgFieldChange = (field: keyof BusinessOrganisation, value: string) => {
    const updated = { ...organisation, [field]: value };
    setOrganisation(updated);
    if (field === 'name') {
      setVenue((prev) => ({ ...prev, businessName: value }));
    }
  };

  const handleVenueFieldChange = (field: string, value: any) => {
    setVenue((prev) => ({ ...prev, [field]: value }));
  };

  const handleLocationFieldChange = (field: string, value: any) => {
    setVenue((prev) => ({
      ...prev,
      location: {
        ...(prev.location as any),
        [field]: value,
      },
    }));
  };

  const handleSpecsFieldChange = (field: string, value: any) => {
    setVenue((prev) => ({
      ...prev,
      specs: {
        ...(prev.specs as any),
        [field]: value,
      },
    }));
  };

  const handleSpacesChange = (spaces: VenueSpace[]) => {
    // Calculate total capacity truthfully from configured spaces without invented fallback values
    const maxStanding = spaces.reduce((acc, s) => Math.max(acc, s.maxCapacity || s.standingCapacity || 0), 0);
    const maxSeated = spaces.reduce((acc, s) => Math.max(acc, s.seatedCapacity || 0), 0);
    const maxTheater = spaces.reduce((acc, s) => Math.max(acc, s.theatreCapacity || 0), 0);

    setVenue((prev) => ({
      ...prev,
      spaces,
      capacity: {
        cocktail: maxStanding,
        seatedBanquet: maxSeated,
        theater: maxTheater,
      },
    }));
  };

  const handlePricingChange = (field: keyof VenuePricing, value: any) => {
    setVenue((prev) => ({
      ...prev,
      pricing: {
        ...(prev.pricing as any),
        [field]: value,
      },
    }));
  };

  const handleAmenitiesChange = (amenities: Amenity[]) => {
    setVenue((prev) => ({ ...prev, amenities }));
  };

  const handleHeroImageChange = (heroImage: string) => {
    setVenue((prev) => ({ ...prev, heroImage }));
  };

  const handleGalleryImagesChange = (galleryImages: string[]) => {
    setVenue((prev) => ({ ...prev, galleryImages }));
  };

  const handleWalkthroughClipsChange = (walkthroughClips: WalkthroughClip[]) => {
    setVenue((prev) => ({ ...prev, walkthroughClips }));
  };

  const validateForPublish = (): string | null => {
    if (!organisation.name?.trim() || !organisation.contactName?.trim() || !organisation.email?.trim()) {
      return 'Please complete required business details (name, contact person, and email) before publishing.';
    }
    if (!venue.name?.trim()) {
      return 'Please provide a venue name before publishing.';
    }
    if (!venue.location?.city?.trim()) {
      return 'Please provide a venue city before publishing.';
    }
    if (!venue.pricing?.startingPrice || venue.pricing.startingPrice <= 0) {
      return 'Please specify a starting price greater than 0 before publishing.';
    }
    return null;
  };

  const handleSave = async (publishStatus: 'draft' | 'published') => {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      if (publishStatus === 'published') {
        const validationError = validateForPublish();
        if (validationError) {
          throw new Error(validationError);
        }
      } else {
        if (!organisation.name?.trim() && !venue.name?.trim()) {
          throw new Error('Please provide a business name or venue name to save this draft.');
        }
      }

      // 1. Save or ensure Organisation exists on server
      let savedOrg: BusinessOrganisation;
      if (organisation.name?.trim() && organisation.contactName?.trim() && organisation.email?.trim()) {
        const orgPayload: Partial<BusinessOrganisation> = {
          name: organisation.name.trim(),
          contactName: organisation.contactName.trim(),
          email: organisation.email.trim(),
          phone: organisation.phone?.trim() || '',
          website: organisation.website?.trim() || '',
          description: organisation.description?.trim() || '',
        };
        if (selectedOrgId && businessMode === 'existing') {
          orgPayload.id = selectedOrgId;
        }

        const orgRes = await fetch('/api/organisations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orgPayload),
        });
        const orgData = await orgRes.json();
        if (!orgRes.ok) {
          throw new Error(orgData.error || 'Failed to save business account');
        }
        savedOrg = orgData.organisation;
      } else {
        savedOrg = {
          id: organisation.id || `org-${Date.now().toString().slice(-6)}`,
          name: organisation.name?.trim() || '',
          contactName: organisation.contactName?.trim() || '',
          email: organisation.email?.trim() || '',
          phone: organisation.phone?.trim() || '',
          website: organisation.website?.trim() || '',
          description: organisation.description?.trim() || '',
          createdAt: new Date().toISOString(),
        };
      }

      // 2. Prepare Venue Payload
      const score = calculateCompleteness(venue as Venue);
      const venuePayload: Partial<Venue> = {
        ...venue,
        name: venue.name?.trim() || '',
        organisationId: savedOrg.id,
        businessName: savedOrg.name,
        status: publishStatus,
        listingCompleteness: score.score,
        qualityTier: score.tier,
      };

      let venueRes;
      if (venue.id) {
        // update existing
        venueRes = await fetch(`/api/venues/${venue.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(venuePayload),
        });
      } else {
        // create new
        venueRes = await fetch('/api/venues', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(venuePayload),
        });
      }

      const venueData = await venueRes.json();
      if (!venueRes.ok) {
        throw new Error(venueData.error || 'Failed to save venue listing');
      }

      onVenueCreatedOrUpdated(venueData.venue, savedOrg);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-3xl border border-[#DDD8CF] shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#DDD8CF] bg-[#FDFCF7] flex items-center justify-between shrink-0">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#A86445] bg-[#F3E7DF] px-2 py-0.5 rounded-md">
                Supply Side Onboarding
              </span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${tierBadge.bg} ${tierBadge.color} ${tierBadge.border}`}>
                Quality: {completeness.score}% · {tierBadge.label}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-[#26343D]">
              {initialVenue ? 'Edit Venue & Space Configuration' : 'List a New Venue & Spaces'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[#66737A] hover:text-[#26343D] hover:bg-[#F4F1EA] transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Navigation Pill Bar */}
        <div className="px-6 py-3 border-b border-[#DDD8CF] bg-white overflow-x-auto shrink-0 flex items-center gap-1.5 scrollbar-none">
          {STEPS.map((step) => {
            const isCurrent = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            const Icon = step.icon;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setCurrentStep(step.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-all ${
                  isCurrent
                    ? 'bg-[#26343D] text-white shadow-xs'
                    : isCompleted
                    ? 'bg-[#F4F1EA] text-[#26343D] hover:bg-[#EAE4D8]'
                    : 'text-[#66737A] hover:bg-[#F4F1EA]'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isCurrent
                      ? 'bg-white text-[#26343D]'
                      : isCompleted
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#DDD8CF] text-[#66737A]'
                  }`}
                >
                  {isCompleted ? <Check className="w-2.5 h-2.5" /> : step.id}
                </span>
                <span className="hidden sm:inline">{step.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-[#FDFCF7]">
          {errorMessage && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold flex items-center justify-between">
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-red-500 hover:text-red-800 text-xs"
              >
                Dismiss
              </button>
            </div>
          )}

          {currentStep === 1 && (
            <BusinessDetailsStep
              businessMode={businessMode}
              selectedOrgId={selectedOrgId}
              organisation={organisation}
              existingOrganisations={existingOrganisations}
              onSelectMode={handleSelectMode}
              onSelectExistingOrg={handleSelectExistingOrg}
              onChange={handleOrgFieldChange}
            />
          )}

          {currentStep === 2 && (
            <VenueDetailsStep
              venue={venue}
              onChange={handleVenueFieldChange}
              onLocationChange={handleLocationFieldChange}
              onSpecsChange={handleSpecsFieldChange}
            />
          )}

          {currentStep === 3 && (
            <SpacesCapacitiesStep
              spaces={venue.spaces || []}
              onSpacesChange={handleSpacesChange}
            />
          )}

          {currentStep === 4 && (
            <LayoutsConfigurationsStep
              spaces={venue.spaces || []}
              onSpacesChange={handleSpacesChange}
            />
          )}

          {currentStep === 5 && (
            <PricingAmenitiesStep
              pricing={venue.pricing || {}}
              amenities={venue.amenities || []}
              onPricingChange={handlePricingChange}
              onAmenitiesChange={handleAmenitiesChange}
            />
          )}

          {currentStep === 6 && (
            <MediaWalkthroughStep
              venue={venue}
              onHeroImageChange={handleHeroImageChange}
              onGalleryImagesChange={handleGalleryImagesChange}
              onWalkthroughClipsChange={handleWalkthroughClipsChange}
            />
          )}

          {currentStep === 7 && (
            <ReviewPublishStep
              organisation={organisation}
              venue={venue}
              onJumpToStep={(s) => setCurrentStep(s)}
              onSaveDraft={() => handleSave('draft')}
              onPublish={() => handleSave('published')}
              isSaving={isSaving}
            />
          )}
        </div>

        {/* Footer Controls */}
        <div className="px-6 py-4 border-t border-[#DDD8CF] bg-white flex items-center justify-between shrink-0">
          <div>
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2 bg-[#F4F1EA] hover:bg-[#EAE4D8] text-[#26343D] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous Step</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-semibold text-[#66737A] hover:text-[#26343D] px-2 py-1"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentStep < 7 && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSave('draft')}
                className="hidden sm:flex px-3.5 py-2 text-xs font-bold text-[#66737A] hover:text-[#26343D] bg-white hover:bg-[#F4F1EA] border border-[#DDD8CF] rounded-xl items-center gap-1.5 transition-all shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Draft</span>
              </button>
            )}

            {currentStep < 7 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-5 py-2 bg-[#26343D] hover:bg-[#1E2930] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
              >
                <span>Continue</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSave('published')}
                className="px-6 py-2 bg-[#A86445] hover:bg-[#8F5236] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSaving ? 'Publishing...' : 'Publish Venue'}</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
