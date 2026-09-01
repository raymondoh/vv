import { BusinessOrganisation } from '../types';

export const INITIAL_ORGANISATIONS: BusinessOrganisation[] = [
  {
    id: 'org-mayfair-hospitality',
    name: 'Mayfair Heritage Hospitality Ltd',
    contactName: 'Charlotte Sterling',
    email: 'charlotte.sterling@mayfairheritage.co.uk',
    phone: '+44 20 7946 0912',
    website: 'https://mayfairheritage.co.uk',
    description: 'Boutique hospitality group managing historic glasshouses, Georgian townhouses, and riverfront event spaces across Greater London and Surrey.',
    createdAt: '2026-01-15T09:00:00Z',
  },
  {
    id: 'org-apex-venues',
    name: 'Apex Venues & Heritage Group',
    contactName: 'Marcus Vance',
    email: 'marcus@apexvenues.co.uk',
    phone: '+44 161 718 9022',
    website: 'https://apexvenues.co.uk',
    description: 'Curators of converted industrial foundry halls, skyline lofts, and contemporary exhibition spaces in Manchester and London.',
    createdAt: '2026-02-10T14:30:00Z',
  },
  {
    id: 'org-acme-properties',
    name: 'Acme Event Estates',
    contactName: 'Julian Montgomery',
    email: 'julian@acmeestates.com',
    phone: '+1 (415) 555-8392',
    website: 'https://acmeestates.com',
    description: 'International portfolio of vineyard estates, botanical conservatories, and architectural landmarks.',
    createdAt: '2026-01-20T11:15:00Z',
  },
];
