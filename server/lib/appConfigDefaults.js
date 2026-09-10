/**
 * Default App Configuration catalogs — seeded from the Flutter field lists
 * (PWA Build/lib/sighting_species.dart) plus initial SVG icons in /public.
 */

const DEFAULT_ACTIVITIES = [
  'Feeding',
  'Hunting',
  'Sleeping',
  'Mating',
  'Foraging',
  'Walking',
  'Other',
];

const DEFAULT_AGES = ['Baby', 'Juvenile', 'Adult', 'Mixed ages'];
const HYENA_AGES = ['Cub', 'Juvenile', 'Sub-Adult', 'Adult'];
const CAT_AGES = ['Pup', 'Juvenile', 'Sub-adult', 'Adult'];
const ELEPHANT_BUFFALO_AGES = [
  'Calves (0-4 years)',
  'Juvenile (5-9 years)',
  'Sub adult (10-15 years)',
  'Adult (15+ years)',
];
const RHINO_AGES = [
  'Class A (<5 months)',
  'Class B (5-12 months)',
  'Class C (1-2 years)',
  'Class D (2-4 years)',
  'Class E (4+ years)',
];
const BIRD_AGES = ['Pullus', 'Fledgling', 'Juvenile', 'Immature', 'Sub-adult', 'Adult'];

const HIGH_PROFILE = new Set(['Pangolin', 'Vulture', 'Leopard', 'Rhino']);

const ICON_BY_NAME = {
  Lion: '/data/icons/species/lion.svg',
  Leopard: '/data/icons/species/leopard.svg',
  Elephant: '/data/icons/species/elephant.svg',
  Rhino: '/data/icons/species/rhino.svg',
  Giraffe: '/data/icons/species/giraffe.svg',
  Buffalo: '/data/icons/species/buffalo.svg',
  Vulture: '/data/icons/species/vulture.svg',
};

function agesFor(name) {
  if (name === 'Brown Hyena') return [...HYENA_AGES];
  if (['Lion', 'Leopard', 'Cheetah', 'African Wild Cat'].includes(name)) return [...CAT_AGES];
  if (['Elephant', 'Buffalo'].includes(name)) return [...ELEPHANT_BUFFALO_AGES];
  if (name === 'Rhino') return [...RHINO_AGES];
  if (name === 'Vulture' || name === "Pel's Fishing Owl") return [...BIRD_AGES];
  return [...DEFAULT_AGES];
}

function knownNamesFor(name) {
  if (name === 'Lion') {
    return [
      'Sable Pride',
      'Tuludi Pride',
      'Golden Boys',
      'Sekoti Pride',
      'Thogotona',
      'Moremi Pride',
      'Other',
    ];
  }
  if (name === 'Leopard') {
    return ['Acacia', 'Bella', 'Khuhle', 'Mma Boi', 'Nicky', 'Rra Dijo', 'Rra Tsebe', 'Other'];
  }
  if (name === 'Vulture') {
    return [
      'White-backed vulture',
      'Hooded vulture',
      'Lappet-faced vulture',
      'Egyptian vulture',
      'Palm-nut vulture',
    ];
  }
  return [];
}

function speciesEntry(name, taxa, sortOrder) {
  return {
    name,
    scientificName: '',
    taxa,
    profile: HIGH_PROFILE.has(name) ? 'high' : 'general',
    ageCategories: agesFor(name),
    activities: [...DEFAULT_ACTIVITIES],
    knownNames: knownNamesFor(name),
    iconUrl: ICON_BY_NAME[name] || null,
    iconPath: null,
    sortOrder,
    active: true,
  };
}

const AVES = ["Pel's Fishing Owl", 'Vulture', 'Other'];
const MAMMALS = [
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
  'Puku',
  'Red Lechwe',
  'Rhino',
  'Sitatunga',
  'Small Spotted Genet',
  'Spotted-necked Otter',
  'Tessebe',
  'Warthog',
  'Waterbuck',
  'Wild Dog',
  'Wildebeest',
  'Zebra',
  'Other',
];
const REPTILES = [
  'African Rock Python',
  'Nile Crocodile',
  'Puff Adder',
  'Serrated Hinged Terrapin',
  'Water Monitor',
  'Other',
];

function buildDefaultSpecies() {
  const rows = [];
  let order = 0;
  for (const name of AVES) rows.push(speciesEntry(name, 'Aves', order++));
  for (const name of MAMMALS) rows.push(speciesEntry(name, 'Mammals', order++));
  for (const name of REPTILES) rows.push(speciesEntry(name, 'Reptiles', order++));
  return rows;
}

function buildDefaultIncidents() {
  return [
    {
      name: 'Poaching',
      subtypes: ['Carcass', 'Snare', 'Poacher', 'Fishing net/equipment'],
      iconUrl: '/data/icons/incidents/poaching.svg',
      iconPath: null,
      sortOrder: 0,
      active: true,
    },
    {
      name: 'Litter',
      subtypes: [],
      iconUrl: '/data/icons/incidents/litter.svg',
      iconPath: null,
      sortOrder: 1,
      active: true,
    },
  ];
}

module.exports = {
  DEFAULT_ACTIVITIES,
  buildDefaultSpecies,
  buildDefaultIncidents,
  SPECIES_COLLECTION: 'app_config_species',
  INCIDENTS_COLLECTION: 'app_config_incidents',
};
