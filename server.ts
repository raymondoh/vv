import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { VENUES } from './src/data/venues.ts';
import { WalkthroughBooking, AiMatchResponse, VenueBooking, MarketplaceConfig } from './src/types.ts';
import { DEFAULT_MARKETPLACE_CONFIG } from './src/config/marketplaceConfig.ts';

const app = express();
const PORT = 3000;

app.use(express.json());

// Marketplace centralized configuration (managed via admin prototype settings)
let marketplaceConfig: MarketplaceConfig = {
  ...DEFAULT_MARKETPLACE_CONFIG,
};

// In-memory store for booked live walkthroughs
const bookingsStore: WalkthroughBooking[] = [
  {
    id: 'tour-sample-8812',
    venueId: 'the-glasshouse-luminary',
    venueName: 'The Glasshouse Luminary',
    venueLocation: 'Chicago, IL',
    venueImage: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=600&q=80',
    clientName: 'Alex Morgan',
    clientEmail: 'alex.morgan@example.com',
    clientPhone: '+1 (312) 555-0199',
    eventType: 'wedding',
    estimatedGuests: 150,
    targetEventDate: '2027-06-18',
    scheduledDate: '2026-09-02',
    scheduledTime: '6:30 PM (Golden Hour Tour)',
    walkthroughType: 'private-director',
    specialRequests: 'Would love to inspect the outdoor courtyard lighting and bridal suite makeup lighting setup during sunset.',
    meetingUrl: 'https://meet.venuestream.live/room/vtour-ghl-8812',
    meetingCode: 'VTR-8812',
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    hostName: 'Elena Rostova',
  },
  {
    id: 'tour-sample-8813',
    venueId: 'chateau-de-mirabelle',
    venueName: 'Château de Mirabelle',
    venueLocation: 'Napa Valley, CA',
    venueImage: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=600&q=80',
    clientName: 'David & Sophia',
    clientEmail: 'david.chen@example.com',
    clientPhone: '+1 (415) 555-8392',
    eventType: 'wedding',
    estimatedGuests: 180,
    targetEventDate: '2027-09-12',
    scheduledDate: '2026-09-04',
    scheduledTime: '4:00 PM',
    walkthroughType: 'private-director',
    specialRequests: 'Inspect wine cellar barrel room acoustics and terrace cocktail layout.',
    meetingUrl: 'https://meet.venuestream.live/room/vtour-cdm-8813',
    meetingCode: 'VTR-8813',
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    hostName: 'Jean-Luc Laurent',
  },
];

// In-memory store for marketplace venue bookings
const venueBookingsStore: VenueBooking[] = [
  {
    id: 'vb-801',
    bookingNumber: 'VSB-2026-0801',
    venueId: 'the-glasshouse-luminary',
    venueName: 'The Glasshouse Luminary',
    venueLocation: 'Chicago, IL',
    venueImage: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=600&q=80',
    clientName: 'Sarah Jenkins',
    clientEmail: 's.jenkins@apexlead.io',
    clientPhone: '+1 (312) 555-0144',
    clientCompany: 'Apex Leadership Group',
    eventType: 'meetings-conferences',
    guestCount: 130,
    eventDate: '2026-10-15',
    startTime: '08:30 AM',
    endTime: '05:30 PM',
    selectedLayout: 'Theater & Keynote Stage Setup',
    specialRequirements: 'High-speed 1Gbps dedicated fiber for live stream broadcast, breakout area in mezzanine, catering load-in at 7:00 AM.',
    status: 'deposit_paid',
    grossAmount: 7200,
    depositPercentage: 25,
    depositAmount: 1800,
    depositPaidAt: '2026-08-25T14:32:00Z',
    finalBalance: 5400,
    finalBalanceDueDate: '2026-10-01',
    createdAt: '2026-08-22T09:15:00Z',
    hostName: 'Elena Rostova',
    checklist: [
      { id: 'chk-1', text: 'Inspect 4K walkthrough and ceiling rigging points', completed: true, category: 'Inspection' },
      { id: 'chk-2', text: 'Venue booking request submitted and approved', completed: true, category: 'Contract & Payment' },
      { id: 'chk-3', text: 'Initial deposit paid (25%) to lock date', completed: true, category: 'Contract & Payment' },
      { id: 'chk-4', text: 'Confirm audiovisual equipment and staging layout', completed: true, category: 'Catering & AV' },
      { id: 'chk-5', text: 'Select breakfast & lunch executive catering menu', completed: false, category: 'Catering & AV' },
      { id: 'chk-6', text: 'Submit speaker technical riders to venue team', completed: false, category: 'Logistics' },
      { id: 'chk-7', text: 'Pay final balance (due 14 days prior)', completed: false, category: 'Contract & Payment' },
    ],
    personalNotes: 'Coordination contact: Elena Rostova. Keynote starting at 9:15 AM sharp. Need 4 wireless lapel mics.',
  },
  {
    id: 'vb-802',
    bookingNumber: 'VSB-2026-0802',
    venueId: 'the-glasshouse-luminary',
    venueName: 'The Glasshouse Luminary',
    venueLocation: 'Chicago, IL',
    venueImage: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=600&q=80',
    clientName: 'Marcus Sterling',
    clientEmail: 'marcus.sterling@meridiancorp.com',
    clientPhone: '+1 (312) 555-8911',
    clientCompany: 'Meridian Capital Partners',
    eventType: 'private-dining',
    guestCount: 45,
    eventDate: '2026-09-28',
    startTime: '06:00 PM',
    endTime: '10:30 PM',
    selectedLayout: 'Executive Dining & Lounge',
    specialRequirements: 'Sommelier-led pairing and string trio in the courtyard garden. Require valet parking attendants.',
    status: 'confirmed_by_venue', // Deposit Due
    grossAmount: 5400,
    depositPercentage: 25,
    depositAmount: 1350,
    finalBalance: 4050,
    finalBalanceDueDate: '2026-09-14',
    createdAt: '2026-08-28T16:20:00Z',
    hostName: 'Elena Rostova',
    checklist: [
      { id: 'chk-10', text: 'Inspect high-resolution courtyard gallery and walkthrough', completed: true, category: 'Inspection' },
      { id: 'chk-11', text: 'Venue manager confirmed space availability', completed: true, category: 'Contract & Payment' },
      { id: 'chk-12', text: 'Pay deposit to finalize reservation', completed: false, category: 'Contract & Payment' },
      { id: 'chk-13', text: 'Confirm wine pairing selection with sommelier', completed: false, category: 'Catering & AV' },
    ],
    personalNotes: 'VIP guests arriving by private transportation.',
  },
  {
    id: 'vb-803',
    bookingNumber: 'VSB-2026-0803',
    venueId: 'the-foundry-machine-shop',
    venueName: 'The Foundry Machine Shop',
    venueLocation: 'Seattle, WA',
    venueImage: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=600&q=80',
    clientName: 'Liam Vance',
    clientEmail: 'lvance@vancerobotics.com',
    clientPhone: '+1 (206) 555-7721',
    clientCompany: 'Vance Robotics & AI',
    eventType: 'exhibitions-events',
    guestCount: 220,
    eventDate: '2026-11-12',
    startTime: '09:00 AM',
    endTime: '08:00 PM',
    selectedLayout: 'Exhibition & Product Showcase',
    specialRequirements: 'Heavy machinery load-in via ground-level freight doors. Requires 3-phase 400A dedicated power drops.',
    status: 'requested', // Awaiting venue confirmation
    grossAmount: 6800,
    depositPercentage: 25,
    depositAmount: 1700,
    finalBalance: 5100,
    finalBalanceDueDate: '2026-10-29',
    createdAt: '2026-08-30T11:45:00Z',
    hostName: 'Marcus Vance',
    checklist: [
      { id: 'chk-20', text: 'Review 360 degree loading dock and power distribution', completed: true, category: 'Inspection' },
      { id: 'chk-21', text: 'Awaiting venue host review of power specs', completed: false, category: 'Contract & Payment' },
    ],
    personalNotes: 'Ground floor freight access needed starting 6:00 AM.',
  },
  {
    id: 'vb-804',
    bookingNumber: 'VSB-2026-0804',
    venueId: 'chateau-de-mirabelle',
    venueName: 'Château de Mirabelle',
    venueLocation: 'Napa Valley, CA',
    venueImage: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=600&q=80',
    clientName: 'Evelyn Taylor & Mark Henderson',
    clientEmail: 'evelyn.taylor@designworks.com',
    clientPhone: '+1 (415) 555-9082',
    eventType: 'weddings',
    guestCount: 160,
    eventDate: '2027-05-22',
    startTime: '03:00 PM',
    endTime: '11:00 PM',
    selectedLayout: 'Vineyard Lawn & Barrel Cellar',
    specialRequirements: 'Lawn ceremony followed by cocktail hour on sunset terrace and barrel room seated dinner.',
    status: 'requested', // Awaiting venue confirmation
    grossAmount: 9500,
    depositPercentage: 25,
    depositAmount: 2375,
    finalBalance: 7125,
    finalBalanceDueDate: '2027-05-01',
    createdAt: '2026-08-31T08:10:00Z',
    hostName: 'Jean-Luc Laurent',
    checklist: [
      { id: 'chk-30', text: 'Explore sunset terrace virtual tour and weather backup', completed: true, category: 'Inspection' },
      { id: 'chk-31', text: 'Venue review of guest capacity and wedding party schedule', completed: false, category: 'Contract & Payment' },
    ],
    personalNotes: 'Need sound curfew details for outdoor band.',
  },
];

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'VenueStream API', timestamp: new Date().toISOString() });
});

// 2. Venues list endpoint
app.get('/api/venues', (req, res) => {
  const { eventType, location, minCapacity, maxBudget, search } = req.query;

  let results = [...VENUES];

  if (eventType && eventType !== 'all') {
    results = results.filter((v) =>
      v.eventTypes.includes(eventType as 'wedding' | 'corporate' | 'party' | 'gala')
    );
  }

  if (location && location !== 'all') {
    const locLower = (location as string).toLowerCase();
    results = results.filter(
      (v) =>
        v.location.city.toLowerCase().includes(locLower) ||
        v.location.state.toLowerCase().includes(locLower)
    );
  }

  if (minCapacity) {
    const capNum = Number(minCapacity);
    if (!isNaN(capNum)) {
      results = results.filter((v) => v.capacity.cocktail >= capNum || v.capacity.seatedBanquet >= capNum);
    }
  }

  if (maxBudget) {
    const budgetNum = Number(maxBudget);
    if (!isNaN(budgetNum)) {
      results = results.filter((v) => v.pricing.startingPrice <= budgetNum);
    }
  }

  if (search) {
    const s = (search as string).toLowerCase();
    results = results.filter(
      (v) =>
        v.name.toLowerCase().includes(s) ||
        v.description.toLowerCase().includes(s) ||
        v.location.city.toLowerCase().includes(s) ||
        v.aesthetic.toLowerCase().includes(s)
    );
  }

  res.json({ success: true, count: results.length, venues: results });
});

// 3. Single venue endpoint
app.get('/api/venues/:id', (req, res) => {
  const venue = VENUES.find((v) => v.id === req.params.id);
  if (!venue) {
    return res.status(404).json({ success: false, error: 'Venue not found' });
  }
  res.json({ success: true, venue });
});

// 4. Gemini AI Venue Matcher endpoint
app.post('/api/gemini/match', async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ success: false, error: 'Query string is required' });
  }

  // Fallback intelligent matching heuristic
  const fallbackMatch = (): AiMatchResponse => {
    const q = query.toLowerCase();
    let scores = VENUES.map((v) => {
      let score = 0;
      const reasons: string[] = [];

      // Location match
      if (q.includes(v.location.city.toLowerCase()) || q.includes(v.location.state.toLowerCase())) {
        score += 35;
        reasons.push(`Located directly in ${v.location.city}, ${v.location.state}`);
      }

      // Aesthetic match
      const aestheticWords = v.aesthetic.toLowerCase().split(/\s+/);
      aestheticWords.forEach((word) => {
        if (word.length > 3 && q.includes(word)) {
          score += 15;
          reasons.push(`Matches your requested "${word}" aesthetic`);
        }
      });

      // Capacity extraction
      const numMatch = q.match(/(\d+)\s*(people|guests|pax|person|attendees)?/);
      if (numMatch) {
        const guests = parseInt(numMatch[1], 10);
        if (guests <= v.capacity.seatedBanquet) {
          score += 25;
          reasons.push(`Comfortably accommodates ${guests} guests (max seated: ${v.capacity.seatedBanquet})`);
        } else if (guests <= v.capacity.cocktail) {
          score += 18;
          reasons.push(`Accommodates ${guests} guests in cocktail/mingling format`);
        }
      }

      // Budget extraction
      const budgetMatch = q.match(/\$?(\d+[\d,]*)\s*(budget|max|under|\$|k)?/);
      if (budgetMatch) {
        let budget = parseInt(budgetMatch[1].replace(/,/g, ''), 10);
        if (budget < 100 && q.includes('k')) budget *= 1000;
        if (v.pricing.startingPrice <= budget) {
          score += 20;
          reasons.push(`Starting rate ($${v.pricing.startingPrice.toLocaleString()}) fits within your budget`);
        }
      }

      // Event type match
      if (q.includes('wedding') && v.eventTypes.includes('wedding')) {
        score += 15;
        reasons.push('Curated specifically for luxury wedding ceremonies and receptions');
      }
      if (q.includes('corporate') || q.includes('keynote') || q.includes('summit')) {
        if (v.eventTypes.includes('corporate')) {
          score += 15;
          reasons.push('Equipped with presentation AV, high-speed fiber, and breakout suites');
        }
      }
      if (q.includes('party') || q.includes('birthday') || q.includes('cocktail')) {
        if (v.eventTypes.includes('party')) {
          score += 12;
          reasons.push('Features high-energy lounge vignettes and custom bar islands');
        }
      }

      return { venue: v, score, reasons };
    });

    scores.sort((a, b) => b.score - a.score);
    const top = scores[0]?.venue || VENUES[0];
    const topReasons = scores[0]?.reasons.length ? scores[0].reasons : ['Exceptional match for space, ambiance, and production quality'];

    const matchedIds = scores.filter((s) => s.score > 20).map((s) => s.venue.id);
    const finalIds = matchedIds.length > 0 ? matchedIds : [top.id, VENUES[1]?.id || VENUES[0].id];

    return {
      query,
      matchedVenueIds: finalIds,
      topPickVenueId: top.id,
      confidenceScore: Math.min(98, Math.max(82, scores[0]?.score ? 70 + scores[0].score : 88)),
      recommendedLayout: top.walkthroughClips[0]?.title || 'Banquet & Gala Grand Setup',
      aiExplanation: `Based on your request "${query}", ${top.name} in ${top.location.city} is the premier selection. It delivers ${top.aesthetic.toLowerCase()} styling, state-of-the-art production capabilities, and ideal capacity proportions for your guests.`,
      keyMatchFactors: topReasons,
      estimatedBudgetNote: `Starting at $${top.pricing.startingPrice.toLocaleString()} ${top.pricing.priceUnit} with optional custom walkthrough appointments available this week.`,
    };
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    // Return heuristic response directly if API key is not configured
    return res.json({ success: true, match: fallbackMatch() });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const venueCatalogSummary = VENUES.map((v) => ({
      id: v.id,
      name: v.name,
      city: v.location.city,
      state: v.location.state,
      aesthetic: v.aesthetic,
      eventTypes: v.eventTypes,
      seatedCapacity: v.capacity.seatedBanquet,
      cocktailCapacity: v.capacity.cocktail,
      startingPrice: v.pricing.startingPrice,
      amenityHighlights: v.amenities.slice(0, 4).map((a) => a.name),
      layouts: v.walkthroughClips.map((c) => c.title),
    }));

    const prompt = `You are the AI Venue Matcher for VenueStream, a luxury event venue virtual tour platform.
Catalog of available venues:
${JSON.stringify(venueCatalogSummary, null, 2)}

User request: "${query}"

Analyze the user's requirements (desired location, aesthetic style, guest count, event type, budget if specified, and key features).
Return a structured JSON object selecting the best matches from the catalog.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        systemInstruction: 'You are an elite luxury event concierge and spatial planner. Match user requirements against the venue catalog precisely and return valid JSON with matched venue IDs, top pick, confidence score, recommended layout, explanation, key match factors, and budget guidance.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            matchedVenueIds: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'List of matching venue IDs ordered from best to least matched',
            },
            topPickVenueId: {
              type: Type.STRING,
              description: 'The single best venue ID for this user request',
            },
            confidenceScore: {
              type: Type.INTEGER,
              description: 'Confidence percentage (e.g. 95)',
            },
            recommendedLayout: {
              type: Type.STRING,
              description: 'Recommended layout setup title for their event style',
            },
            aiExplanation: {
              type: Type.STRING,
              description: 'Clear, elegant explanation of why this venue fits their exact vision',
            },
            keyMatchFactors: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3-4 bullet points highlighting specific matches (capacity, aesthetic, budget, city)',
            },
            estimatedBudgetNote: {
              type: Type.STRING,
              description: 'Pricing summary and recommendation',
            },
          },
          required: [
            'matchedVenueIds',
            'topPickVenueId',
            'confidenceScore',
            'recommendedLayout',
            'aiExplanation',
            'keyMatchFactors',
            'estimatedBudgetNote',
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const finalResponse: AiMatchResponse = {
      query,
      matchedVenueIds: Array.isArray(parsed.matchedVenueIds) && parsed.matchedVenueIds.length > 0 ? parsed.matchedVenueIds : [VENUES[0].id],
      topPickVenueId: parsed.topPickVenueId || VENUES[0].id,
      confidenceScore: parsed.confidenceScore || 94,
      recommendedLayout: parsed.recommendedLayout || 'Banquet & Gala Grand Setup',
      aiExplanation: parsed.aiExplanation || `Based on your request "${query}", our top recommendation is ${VENUES[0].name}.`,
      keyMatchFactors: parsed.keyMatchFactors || ['Capacity match', 'Aesthetic alignment', 'Prime location'],
      estimatedBudgetNote: parsed.estimatedBudgetNote || 'Pricing accommodates custom walkthrough arrangements.',
    };

    res.json({ success: true, match: finalResponse });
  } catch (error) {
    console.error('Gemini API match error, using fallback:', error);
    res.json({ success: true, match: fallbackMatch() });
  }
});

// 5. Book a Live Walkthrough endpoint
app.post('/api/walkthroughs/book', (req, res) => {
  const {
    venueId,
    clientName,
    clientEmail,
    clientPhone,
    eventType,
    estimatedGuests,
    targetEventDate,
    scheduledDate,
    scheduledTime,
    walkthroughType,
    specialRequests,
  } = req.body;

  if (!venueId || !clientName || !clientEmail || !scheduledDate || !scheduledTime) {
    return res.status(400).json({
      success: false,
      error: 'Missing required booking fields (venueId, clientName, clientEmail, scheduledDate, scheduledTime)',
    });
  }

  const venue = VENUES.find((v) => v.id === venueId);
  if (!venue) {
    return res.status(404).json({ success: false, error: 'Venue not found' });
  }

  const bookingId = `vtour-${Date.now().toString().slice(-6)}`;
  const meetingCode = `VTR-${Math.floor(1000 + Math.random() * 9000)}`;
  const meetingUrl = `https://meet.venuestream.live/room/${bookingId}`;

  const newBooking: WalkthroughBooking = {
    id: bookingId,
    venueId: venue.id,
    venueName: venue.name,
    venueLocation: `${venue.location.city}, ${venue.location.state}`,
    venueImage: venue.heroImage,
    clientName,
    clientEmail,
    clientPhone: clientPhone || '',
    eventType: eventType || 'wedding',
    estimatedGuests: Number(estimatedGuests) || 100,
    targetEventDate: targetEventDate || '',
    scheduledDate,
    scheduledTime,
    walkthroughType: walkthroughType || 'private-director',
    specialRequests: specialRequests || '',
    meetingUrl,
    meetingCode,
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    hostName: venue.host.name,
  };

  bookingsStore.unshift(newBooking);

  res.status(201).json({
    success: true,
    booking: newBooking,
    message: `Live walkthrough confirmed with ${venue.host.name} on ${scheduledDate} at ${scheduledTime}`,
  });
});

// 6. Get all user bookings
app.get('/api/walkthroughs', (req, res) => {
  res.json({ success: true, count: bookingsStore.length, bookings: bookingsStore });
});

// 7. Get marketplace config
app.get('/api/marketplace/config', (req, res) => {
  res.json({ success: true, config: marketplaceConfig });
});

// 8. Update marketplace config (internal platform admin prototype settings)
app.patch('/api/marketplace/config', (req, res) => {
  const {
    commissionPercentage,
    depositPercentage,
    balanceDueDaysBeforeEvent,
    freeCancellationHours,
  } = req.body;

  if (typeof commissionPercentage === 'number') {
    marketplaceConfig.commissionPercentage = Math.max(1, Math.min(50, commissionPercentage));
  }
  if (typeof depositPercentage === 'number') {
    marketplaceConfig.depositPercentage = Math.max(5, Math.min(100, depositPercentage));
  }
  if (typeof balanceDueDaysBeforeEvent === 'number') {
    marketplaceConfig.balanceDueDaysBeforeEvent = Math.max(1, Math.min(90, balanceDueDaysBeforeEvent));
  }
  if (typeof freeCancellationHours === 'number') {
    marketplaceConfig.freeCancellationHours = Math.max(0, Math.min(240, freeCancellationHours));
  }

  res.json({ success: true, config: marketplaceConfig });
});

// 9. Get venue marketplace bookings
app.get('/api/venue-bookings', (req, res) => {
  const { venueId, clientEmail } = req.query;
  let results = [...venueBookingsStore];

  if (venueId && venueId !== 'all') {
    results = results.filter((b) => b.venueId === venueId);
  }

  if (clientEmail) {
    results = results.filter((b) => b.clientEmail.toLowerCase() === (clientEmail as string).toLowerCase());
  }

  res.json({
    success: true,
    count: results.length,
    bookings: results,
    config: marketplaceConfig,
  });
});

// 10. Create new venue booking request
app.post('/api/venue-bookings', (req, res) => {
  const {
    venueId,
    clientName,
    clientEmail,
    clientPhone,
    clientCompany,
    eventType,
    guestCount,
    eventDate,
    startTime,
    endTime,
    selectedLayout,
    specialRequirements,
    grossAmount,
  } = req.body;

  if (!venueId || !clientName || !clientEmail || !eventDate) {
    return res.status(400).json({
      success: false,
      error: 'Missing required booking fields (venueId, clientName, clientEmail, eventDate)',
    });
  }

  const venue = VENUES.find((v) => v.id === venueId);
  if (!venue) {
    return res.status(404).json({ success: false, error: 'Venue not found' });
  }

  const calculatedGross = Number(grossAmount) || venue.pricing.startingPrice;
  const depositPercent = marketplaceConfig.depositPercentage || 25;
  const depositAmount = Math.round((calculatedGross * depositPercent) / 100);
  const finalBalance = calculatedGross - depositAmount;

  const newId = `vb-${Date.now().toString().slice(-6)}`;
  const bookingNumber = `VSB-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const newVenueBooking: VenueBooking = {
    id: newId,
    bookingNumber,
    venueId: venue.id,
    venueName: venue.name,
    venueLocation: `${venue.location.city}, ${venue.location.state}`,
    venueImage: venue.heroImage,
    clientName,
    clientEmail,
    clientPhone: clientPhone || '',
    clientCompany: clientCompany || '',
    eventType: eventType || 'meetings-conferences',
    guestCount: Number(guestCount) || venue.capacity.seatedBanquet,
    eventDate,
    startTime: startTime || '09:00 AM',
    endTime: endTime || '06:00 PM',
    selectedLayout: selectedLayout || venue.walkthroughClips[0]?.title || 'Standard Setup',
    specialRequirements: specialRequirements || '',
    status: 'requested', // starts as requested -> awaiting venue review
    grossAmount: calculatedGross,
    depositPercentage: depositPercent,
    depositAmount,
    finalBalance,
    createdAt: new Date().toISOString(),
    hostName: venue.host.name,
    checklist: [
      { id: `chk-${Date.now()}-1`, text: 'Explore venue walkthrough & architectural floor plan', completed: true, category: 'Inspection' },
      { id: `chk-${Date.now()}-2`, text: 'Venue booking request submitted to coordinator', completed: true, category: 'Contract & Payment' },
      { id: `chk-${Date.now()}-3`, text: 'Awaiting venue host review & date confirmation', completed: false, category: 'Contract & Payment' },
      { id: `chk-${Date.now()}-4`, text: 'Pay initial deposit (25%) once venue accepts', completed: false, category: 'Contract & Payment' },
      { id: `chk-${Date.now()}-5`, text: 'Finalize catering, AV setup & run-of-show', completed: false, category: 'Catering & AV' },
      { id: `chk-${Date.now()}-6`, text: 'Submit vendor COI (Certificate of Insurance)', completed: false, category: 'Logistics' },
      { id: `chk-${Date.now()}-7`, text: 'Pay remaining venue balance (due 14 days prior)', completed: false, category: 'Contract & Payment' },
    ],
    personalNotes: '',
  };

  venueBookingsStore.unshift(newVenueBooking);

  res.status(201).json({
    success: true,
    booking: newVenueBooking,
    message: `Booking request ${bookingNumber} submitted to ${venue.name}. Coordinator ${venue.host.name} has been notified.`,
  });
});

// 11. Update venue booking status / notes / simulated deposit payment
app.patch('/api/venue-bookings/:id', (req, res) => {
  const { id } = req.params;
  const bookingIndex = venueBookingsStore.findIndex((b) => b.id === id);

  if (bookingIndex === -1) {
    return res.status(404).json({ success: false, error: 'Booking not found' });
  }

  const current = venueBookingsStore[bookingIndex];
  const {
    status,
    personalNotes,
    checklist,
    guestCount,
    selectedLayout,
    isSimulatedDepositPayment,
    isSimulatedFinalPayment,
  } = req.body;

  const updated: VenueBooking = { ...current };

  if (status) {
    updated.status = status;
  }

  if (isSimulatedDepositPayment) {
    updated.status = 'deposit_paid';
    updated.depositPaidAt = new Date().toISOString();
    // Update checklist item for deposit
    if (updated.checklist) {
      updated.checklist = updated.checklist.map((item) =>
        item.text.toLowerCase().includes('deposit') || item.text.toLowerCase().includes('awaiting')
          ? { ...item, completed: true }
          : item
      );
    }
  }

  if (isSimulatedFinalPayment) {
    updated.status = 'fully_paid';
    updated.finalPaidAt = new Date().toISOString();
  }

  if (personalNotes !== undefined) {
    updated.personalNotes = personalNotes;
  }

  if (Array.isArray(checklist)) {
    updated.checklist = checklist;
  }

  if (guestCount) {
    updated.guestCount = Number(guestCount);
  }

  if (selectedLayout) {
    updated.selectedLayout = selectedLayout;
  }

  venueBookingsStore[bookingIndex] = updated;

  res.json({
    success: true,
    booking: updated,
    message: `Booking ${updated.bookingNumber} updated successfully.`,
  });
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VenueStream Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
