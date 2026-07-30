/** Submission types and sub-items used by Configure Notifications (mirrors the field PWA). */

export const NOTIFICATION_CATEGORIES = [
  { value: 'sighting', label: 'Sightings' },
  { value: 'incident', label: 'Incidents' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'fire', label: 'Fire' },
];

export const ALL_ITEMS_VALUE = '*';

export const NOTIFICATION_ITEMS = {
  sighting: [
    'Aardvark',
    'Aardwolf',
    'African Clawless Otter',
    'African Wild Cat',
    'Black-Backed Jackal',
    'Brown Hyena',
    'Buffalo',
    'Cheetah',
    'Civet',
    'Elephant',
    'Giraffe',
    'Grey Duiker',
    'Hippo',
    'Impala',
    'Kudu',
    'Leopard',
    'Lion',
    'Pangolin',
    "Pel's Fishing Owl",
    'Puku',
    'Red Lechwe',
    'Rhino',
    'Sitatunga',
    'Small Spotted Genet',
    'Spotted-necked Otter',
    'Tessebe',
    'Vulture',
    'Warthog',
    'Waterbuck',
    'Wild Dog',
    'Wildebeest',
    'Zebra',
    'Other',
  ],
  incident: ['Poaching', 'Litter'],
  maintenance: [
    'Pothole/Road issue',
    'Overgrown branches/pruning',
    'Road closure',
    'Other',
  ],
  fire: ['Any fire in Okavango Delta / KPR'],
};

export function labelForCategory(category) {
  return NOTIFICATION_CATEGORIES.find((c) => c.value === category)?.label || category;
}
