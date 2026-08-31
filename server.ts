import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { VENUES } from './src/data/venues.ts';
import { WalkthroughBooking, AiMatchResponse } from './src/types.ts';

const app = express();
const PORT = 3000;

app.use(express.json());

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
