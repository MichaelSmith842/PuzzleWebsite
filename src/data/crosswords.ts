// Mini crosswords. Grids were filled by scripts/gen_crosswords.py and clued by hand.
// '#' is a black square. Clues are keyed by answer; numbering is computed.

export type CrosswordData = {
  id: string
  title: string
  grid: string[]
  clues: Record<string, string>
}

export const CROSSWORDS: CrosswordData[] = [
  {
    id: 'spa-day',
    title: 'Spa Day',
    grid: ['##SPA', 'ACTOR', 'GLOOM', 'EARLY', 'DYE##'],
    clues: {
      SPA: "Place for a couples' massage",
      ACTOR: 'Oscar nominee, perhaps',
      GLOOM: "Eeyore's general mood",
      EARLY: 'Like the bird that gets the worm',
      DYE: 'Box of hair color',
      AGED: 'Like fine cheese or wine',
      CLAY: 'Pottery class material',
      STORE: 'Shop',
      POOL: 'Place for a cannonball',
      ARMY: 'Huge group of ants, or soldiers',
    },
  },
  {
    id: 'cupids-aim',
    title: "Cupid's Aim",
    grid: ['#PAW#', 'ARROW', 'ROGUE', 'MOUNT', '#FED#'],
    clues: {
      PAW: "Puppy's foot",
      ARROW: "Cupid's projectile",
      ROGUE: 'Charming scoundrel',
      MOUNT: 'Climb onto, as a horse',
      FED: 'Gave dinner to',
      ARM: 'Something to link on a stroll',
      PROOF: 'The ___ is in the pudding',
      ARGUE: 'Bicker',
      WOUND: 'Wrapped around, like yarn',
      WET: 'Like a dog after bath time',
    },
  },
  {
    id: 'quick-draw',
    title: 'Quick Draw',
    grid: ['#FAST', 'DONOR', 'ARGUE', 'SCENE', 'HERD#'],
    clues: {
      FAST: 'Speedy',
      DONOR: 'Blood bank visitor',
      ARGUE: 'Debate who does the dishes, say',
      SCENE: 'Movie segment',
      HERD: 'Group of cattle',
      DASH: 'Morse code bit',
      FORCE: 'It may be with you, in Star Wars',
      ANGER: 'Ire',
      SOUND: 'Noise',
      TREE: 'Family ___',
    },
  },
  {
    id: 'taken',
    title: 'Taken',
    grid: ['#STAR', 'STAGE', 'TOKEN', 'EVENT', 'WENT#'],
    clues: {
      STAR: 'Twinkle, twinkle, little ___',
      STAGE: 'Where actors tread the boards',
      TOKEN: '___ of affection',
      EVENT: 'Special occasion',
      WENT: 'Left',
      STEW: 'Simmer with worry, or a hearty dish',
      STOVE: 'Kitchen appliance with burners',
      TAKEN: 'No longer single',
      AGENT: '007, for one',
      RENT: 'Monthly housing payment',
    },
  },
  {
    id: 'slow-dance',
    title: 'Slow Dance',
    grid: ['#AID#', 'OWNER', 'DANCE', 'DREAD', '#DRY#'],
    clues: {
      AID: 'Help',
      OWNER: "Pet's person",
      DANCE: 'Slow ___ (prom staple)',
      DREAD: "Fear of what's coming",
      DRY: 'Like a good martini, or the desert',
      ODD: 'Strange',
      AWARD: 'Trophy',
      INNER: '___ child',
      DECAY: 'Rot',
      RED: 'Color of a valentine',
    },
  },
  {
    id: 'love-note',
    title: 'Love Note',
    grid: ['SOD##', 'EVENT', 'LABOR', 'FLUTE', '##TEE'],
    clues: {
      SOD: 'Instant lawn',
      EVENT: 'Olympic competition',
      LABOR: 'Hard work',
      FLUTE: 'Champagne glass shape',
      TEE: "Golfer's peg",
      SELF: 'Ego',
      OVAL: 'Racetrack shape',
      DEBUT: 'First appearance',
      NOTE: 'Love ___ (lunchbox surprise)',
      TREE: 'Climbable backyard feature',
    },
  },
  {
    id: 'date-night',
    title: 'Date Night',
    grid: ['##MOB', 'ABOVE', 'LEVEL', 'SAINT', 'ONE##'],
    clues: {
      MOB: 'Unruly crowd',
      ABOVE: 'Overhead',
      LEVEL: 'Video game stage',
      SAINT: 'Valentine, for one',
      ONE: 'The ___ (your soulmate)',
      ALSO: 'Too',
      BEAN: 'Coffee ___',
      MOVIE: 'Date night option',
      OVEN: 'Place for a bun to bake',
      BELT: 'Waist cincher',
    },
  },
  {
    id: 'gift-wrap',
    title: 'Gift Wrap',
    grid: ['##LID', 'WHOSE', 'RIFLE', 'ALTER', 'PLY##'],
    clues: {
      LID: 'Jar topper',
      WHOSE: '"___ Line Is It Anyway?"',
      RIFLE: 'Search hastily (through)',
      ALTER: 'Take in, as a dress',
      PLY: 'Toilet paper layer',
      WRAP: 'Gift ___',
      HILL: "Jack and Jill's climb",
      LOFTY: 'High-minded',
      ISLE: 'Small island',
      DEER: 'Bambi, for one',
    },
  },
  {
    id: 'ever-after',
    title: 'Ever After',
    grid: ['##SET', 'GRAVE', 'RULER', 'ALARM', 'BED##'],
    clues: {
      SET: 'Ready, ___, go!',
      GRAVE: 'Very serious',
      RULER: 'Foot-long measurer',
      ALARM: 'Morning wake-up call',
      BED: 'Breakfast in ___',
      GRAB: 'Snatch',
      RULE: 'Golden ___',
      SALAD: 'Caesar, for one',
      EVER: 'Happily ___ after',
      TERM: 'School semester',
    },
  },
  {
    id: 'playground',
    title: 'Playground',
    grid: ['##GIG', 'SLIDE', 'KOALA', 'INNER', 'PET##'],
    clues: {
      GIG: "Band's booking",
      SLIDE: 'Playground fixture',
      KOALA: 'Eucalyptus muncher',
      INNER: '___ peace',
      PET: 'Cat or dog, at home',
      SKIP: 'Hop, ___ and a jump',
      LONE: 'Solitary',
      GIANT: 'Huge',
      IDLE: 'Not working',
      GEAR: 'Bike part',
    },
  },
]

export type Slot = { num: number; dir: 'across' | 'down'; cells: [number, number][]; answer: string; clue: string }

export function slotsFor(p: CrosswordData) {
  const n = p.grid.length
  const open = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n && p.grid[r][c] !== '#'
  const numbers: Record<string, number> = {}
  const slots: Slot[] = []
  let num = 0
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!open(r, c)) continue
      const startsAcross = !open(r, c - 1) && open(r, c + 1)
      const startsDown = !open(r - 1, c) && open(r + 1, c)
      if (!startsAcross && !startsDown) continue
      num++
      numbers[`${r},${c}`] = num
      for (const dir of ['across', 'down'] as const) {
        if (dir === 'across' ? !startsAcross : !startsDown) continue
        const cells: [number, number][] = []
        let [y, x] = [r, c]
        while (open(y, x)) {
          cells.push([y, x])
          if (dir === 'across') x++
          else y++
        }
        const answer = cells.map(([a, b]) => p.grid[a][b]).join('')
        slots.push({ num, dir, cells, answer, clue: p.clues[answer] ?? '?' })
      }
    }
  }
  return { numbers, slots }
}
