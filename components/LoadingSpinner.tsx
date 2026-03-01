'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Loader2, BookOpen, Palette, Clock, Sparkles, Check, Film } from 'lucide-react'

interface LoadingSpinnerProps {
  message?: string
  stage?: 'story' | 'images' | 'movie'
  prompt?: string // The user's story prompt — used to pick relevant fun facts
}

// ─── Categorized fun facts ────────────────────────────────────────────
// Each key can be an animal, theme, or setting. A prompt like
// "a bear who goes to space" will match both "bear" and "space".
const FACTS_BY_TOPIC: Record<string, string[]> = {
  // ── Animals ──
  bear: [
    "Bears can run as fast as a horse — up to 35 mph!",
    "Polar bears have black skin under their white fur!",
    "A bear's sense of smell is 7 times better than a dog's!",
    "Bears can sleep for up to 7 months during winter!",
    "Baby bears are born tiny — about the size of a squirrel!",
    "Grizzly bears can eat 90 pounds of food a day!",
    "Sun bears have the longest tongues of any bear — up to 10 inches!",
  ],
  beaver: [
    "Beavers can hold their breath for 15 minutes!",
    "Beaver teeth never stop growing — they chew wood to keep them short!",
    "Beavers slap their tails on water to warn their family of danger!",
    "A beaver's home is called a 'lodge' and has underwater entrances!",
    "Baby beavers are called 'kits' and can swim when just 1 day old!",
    "A beaver can cut down a tree in just 15 minutes!",
    "Beaver dams can be seen from space — some are over 800 meters long!",
  ],
  cat: [
    "Cats spend 70% of their lives sleeping!",
    "A cat can jump up to 6 times its own length!",
    "Cats have over 20 different sounds they use to 'talk'!",
    "A group of cats is called a 'clowder'!",
    "Cats can rotate their ears 180 degrees!",
    "Every cat's nose print is unique, like a fingerprint!",
    "Cats can't taste sweetness!",
  ],
  kitten: [
    "Kittens are born with their eyes closed — they open after about a week!",
    "Kittens sleep up to 20 hours a day!",
    "A kitten can start purring when it's just a few days old!",
    "Kittens have 26 baby teeth that fall out and get replaced!",
    "A group of kittens is called a 'kindle'!",
  ],
  dog: [
    "Dogs can understand up to 250 words and gestures!",
    "A dog's nose print is unique, just like our fingerprints!",
    "Dogs dream just like humans do!",
    "A wagging tail to the right means a dog is happy!",
    "Dogs can hear sounds 4 times farther away than humans!",
    "Dalmatian puppies are born completely white!",
    "A dog's sense of smell is 40 times better than ours!",
  ],
  puppy: [
    "Puppies are born deaf — they can't hear until they're about 3 weeks old!",
    "Puppies sleep 18 to 20 hours a day!",
    "A puppy is fully grown by about 1 to 2 years old!",
    "Puppies have 28 baby teeth!",
    "A group of puppies is called a 'litter'!",
  ],
  rabbit: [
    "Rabbits can see almost 360 degrees around them!",
    "A happy rabbit does a jump-twist called a 'binky'!",
    "Rabbits' teeth never stop growing!",
    "Baby rabbits are called 'kittens' — just like cats!",
    "Rabbits can hop up to 3 feet high!",
    "A rabbit's ears can be up to 4 inches long!",
  ],
  bunny: [
    "Bunnies can see almost 360 degrees around them!",
    "A happy bunny does a jump-twist called a 'binky'!",
    "Bunnies' teeth never stop growing!",
    "Baby bunnies are called 'kittens' — just like cats!",
    "Bunnies can hop up to 3 feet high!",
  ],
  elephant: [
    "Elephants are the only animals that can't jump!",
    "An elephant's trunk has over 40,000 muscles!",
    "Elephants can 'hear' through their feet!",
    "Baby elephants suck their trunks like babies suck their thumbs!",
    "Elephants can swim — they use their trunk as a snorkel!",
    "Elephants mourn their friends and family, just like humans!",
  ],
  lion: [
    "A lion's roar can be heard from 5 miles away!",
    "Lions sleep up to 20 hours a day!",
    "Baby lions are called 'cubs' and have spots when they're born!",
    "A group of lions is called a 'pride'!",
    "Lions are the only cats that live in groups!",
    "A lion can run up to 50 mph in short bursts!",
  ],
  monkey: [
    "Monkeys can understand counting and basic math!",
    "A group of monkeys is called a 'troop'!",
    "Spider monkeys can hang by their tails!",
    "Monkeys peel their bananas and don't eat the skin — just like us!",
    "Some monkeys can recognize themselves in a mirror!",
    "Baby monkeys ride on their mom's back!",
  ],
  dolphin: [
    "Dolphins sleep with one eye open!",
    "Dolphins have names for each other — special whistles!",
    "A baby dolphin is called a 'calf'!",
    "Dolphins can swim up to 20 miles per hour!",
    "Dolphins are one of the smartest animals on Earth!",
    "Dolphins can hold their breath for up to 15 minutes!",
  ],
  penguin: [
    "Penguins propose to their mate with a pebble!",
    "Emperor penguins can dive deeper than any other bird!",
    "Penguins can drink salt water — they have a special gland!",
    "A group of penguins on land is called a 'waddle'!",
    "Baby penguins are super fluffy to stay warm!",
    "Some penguins can jump 6 feet out of the water!",
  ],
  owl: [
    "A group of owls is called a 'parliament'!",
    "Owls can turn their heads almost all the way around — 270 degrees!",
    "Owls can't move their eyeballs — that's why they turn their heads!",
    "Some owls are as small as a sparrow!",
    "Owls fly almost silently because of special feathers!",
    "Baby owls are called 'owlets'!",
  ],
  fox: [
    "Foxes use the Earth's magnetic field to hunt — like a compass!",
    "A fox's tail is called a 'brush'!",
    "Baby foxes are called 'kits' or 'cubs'!",
    "Foxes can hear a watch ticking from 40 yards away!",
    "Arctic foxes can survive temperatures as cold as -58 degrees!",
    "Foxes are related to dogs but climb trees like cats!",
  ],
  turtle: [
    "Some turtles can breathe through their butts!",
    "Turtles have been on Earth for over 200 million years — older than dinosaurs!",
    "A turtle's shell has about 60 bones!",
    "Sea turtles can hold their breath for up to 5 hours!",
    "Baby turtles find the ocean by following the moonlight!",
  ],
  frog: [
    "Frogs can freeze solid in winter and thaw back to life in spring!",
    "A frog can jump 20 times its own body length!",
    "Frogs drink water through their skin!",
    "Some frogs can glow in the dark!",
    "A group of frogs is called an 'army'!",
    "Frogs have teeth on the roof of their mouth!",
  ],
  fish: [
    "A goldfish has a memory longer than 3 seconds — up to 5 months!",
    "Some fish can walk on land!",
    "Clownfish are all born male — some turn female later!",
    "Seahorses are the only animal where the dad gives birth!",
    "A group of fish is called a 'school'!",
  ],
  butterfly: [
    "Butterflies taste with their feet!",
    "A butterfly's wings are actually transparent!",
    "Monarch butterflies travel 3,000 miles to stay warm!",
    "Butterflies can see colors that humans can't!",
    "A group of butterflies is called a 'flutter'!",
  ],
  horse: [
    "Horses can sleep standing up!",
    "A baby horse can walk just one hour after being born!",
    "Horses can see almost 360 degrees around them!",
    "A horse's teeth take up more space than its brain!",
    "Horses can run within hours of being born!",
  ],
  pony: [
    "Ponies are not baby horses — they're a different size!",
    "Ponies are actually stronger than horses for their size!",
    "Ponies can live for over 30 years!",
    "Shetland ponies are one of the smallest breeds in the world!",
    "Ponies have thicker manes and tails than horses!",
  ],
  dinosaur: [
    "The T-Rex had teeth as big as bananas!",
    "Some dinosaurs were as small as chickens!",
    "The word 'dinosaur' means 'terrible lizard'!",
    "Dinosaurs lived on Earth for about 165 million years!",
    "Some dinosaurs had feathers, not just scales!",
    "The biggest dinosaur eggs were the size of basketballs!",
  ],
  dragon: [
    "In China, dragons are symbols of good luck and power!",
    "The Komodo dragon is the largest living lizard!",
    "Dragonflies are some of the fastest insects — up to 35 mph!",
    "In stories, dragons love to guard treasure and gold!",
    "Some legends say dragons breathe fire, ice, or even lightning!",
  ],
  unicorn: [
    "The unicorn is the national animal of Scotland!",
    "In legends, a unicorn's horn could purify water!",
    "The word 'unicorn' means 'one horn'!",
    "Some ancient people thought narwhals were unicorns of the sea!",
    "Unicorns appear in stories from over 4,000 years ago!",
  ],
  shark: [
    "Sharks have been around for over 400 million years — before dinosaurs!",
    "Some sharks can glow in the dark!",
    "A whale shark's mouth is 5 feet wide!",
    "Sharks never run out of teeth — they grow them back!",
    "Baby sharks are called 'pups'!",
  ],
  whale: [
    "A blue whale's heart is as big as a car!",
    "Whale songs can travel 1,000 miles underwater!",
    "Baby blue whales gain 200 pounds every single day!",
    "Humpback whales blow bubbles to catch fish!",
    "A blue whale's tongue weighs as much as an elephant!",
  ],
  octopus: [
    "Octopuses have three hearts and blue blood!",
    "An octopus can change color in less than a second!",
    "Octopuses have 9 brains — one main brain and one in each arm!",
    "Octopuses can taste things with their arms!",
    "An octopus can squeeze through any hole bigger than its beak!",
  ],
  bird: [
    "Hummingbirds can fly backwards!",
    "An ostrich's eye is bigger than its brain!",
    "Crows can recognize human faces!",
    "A flamingo can only eat with its head upside down!",
    "Parrots can learn to say over 100 words!",
  ],
  flamingo: [
    "A group of flamingos is called a 'flamboyance'!",
    "Flamingos are born white — they turn pink from their food!",
    "Flamingos can only eat with their heads upside down!",
    "Flamingos can stand on one leg for hours!",
    "Baby flamingos are fluffy and gray!",
  ],
  koala: [
    "Koalas sleep up to 22 hours a day!",
    "Koalas have fingerprints — just like humans!",
    "Baby koalas are called 'joeys' and live in their mom's pouch!",
    "Koalas rarely drink water — they get moisture from leaves!",
    "Koalas can eat over a pound of eucalyptus leaves a day!",
  ],
  otter: [
    "Otters hold hands while sleeping so they don't drift apart!",
    "Sea otters have the thickest fur of any animal!",
    "Otters have a favorite rock they keep in a pouch under their arm!",
    "Baby otters can't swim at first — they float like corks!",
    "Otters juggle rocks for fun!",
  ],
  panda: [
    "Pandas spend about 12 hours a day eating bamboo!",
    "Baby pandas are born pink, tiny, and blind!",
    "Pandas do somersaults and roll down hills for fun!",
    "A panda's paw has a 'thumb' to help it hold bamboo!",
    "Pandas poop up to 40 times a day!",
  ],
  wolf: [
    "Wolves can hear sounds up to 6 miles away!",
    "A wolf pack is a family — led by mom and dad!",
    "Wolves can run up to 40 miles per hour!",
    "Baby wolves are called 'pups' and are born deaf and blind!",
    "Wolves howl to talk to each other across long distances!",
  ],
  giraffe: [
    "A giraffe's tongue is 20 inches long — and it's purple!",
    "Baby giraffes can stand within 30 minutes of being born!",
    "No two giraffes have the same pattern — like fingerprints!",
    "Giraffes only need 30 minutes of sleep a day!",
    "A giraffe's heart weighs about 25 pounds!",
  ],
  pig: [
    "Pigs are smarter than most dogs!",
    "Pigs can't look up at the sky — their necks don't bend that way!",
    "Baby pigs can run to their mama by name!",
    "Pigs love music and will fall asleep to it!",
    "Pigs dream just like people do!",
  ],
  squirrel: [
    "Squirrels plant thousands of trees by forgetting where they buried their nuts!",
    "A squirrel's front teeth never stop growing!",
    "Squirrels can find buried nuts under a foot of snow!",
    "Baby squirrels are called 'kits' or 'kittens'!",
    "Squirrels can run up to 20 miles per hour!",
  ],
  deer: [
    "A baby deer (fawn) has no smell — so predators can't find it!",
    "Deer can jump up to 10 feet high!",
    "Male deer grow new antlers every single year!",
    "Deer are great swimmers!",
    "A deer can run up to 30 miles per hour!",
  ],
  spider: [
    "Spiders have 8 legs and most have 8 eyes too!",
    "Spider silk is stronger than steel of the same thickness!",
    "Some spiders can walk on water!",
    "Baby spiders are called 'spiderlings'!",
    "Not all spiders spin webs — some hunt by jumping!",
  ],
  bee: [
    "Bees do a 'waggle dance' to tell friends where flowers are!",
    "A bee visits about 5,000 flowers in a single day!",
    "Honey never goes bad — even after thousands of years!",
    "Bees can fly up to 15 miles per hour!",
    "A queen bee can lay up to 2,000 eggs a day!",
  ],
  // ── Themes & Settings ──
  space: [
    "There are more stars in space than grains of sand on Earth!",
    "A day on Venus is longer than a year on Venus!",
    "The Moon is slowly drifting away from Earth!",
    "You'd weigh much less on the Moon — you could jump super high!",
    "The Sun is so big that 1.3 million Earths could fit inside it!",
    "Astronauts grow taller in space!",
    "There is a planet made entirely of diamonds!",
  ],
  ocean: [
    "The ocean is so deep we've explored less than 5% of it!",
    "There are more stars in space than grains of sand on all beaches!",
    "The ocean has underwater mountains taller than Mount Everest!",
    "Some ocean creatures make their own light — it's called bioluminescence!",
    "The Pacific Ocean is bigger than all the land on Earth combined!",
  ],
  sea: [
    "The ocean is so deep we've explored less than 5% of it!",
    "Sea cucumbers breathe through their butts!",
    "Starfish don't have brains!",
    "Some jellyfish can glow in the dark!",
    "The sea is salty because rivers wash minerals into it!",
  ],
  forest: [
    "Trees talk to each other through underground fungus networks!",
    "The tallest tree in the world is over 380 feet tall!",
    "A single tree can be home to hundreds of different animals!",
    "Some forests are so thick that rain takes 10 minutes to reach the ground!",
    "The oldest tree is over 5,000 years old!",
  ],
  jungle: [
    "Jungles are so thick that only 1% of sunlight reaches the floor!",
    "More than half of the world's animal species live in jungles!",
    "Some jungle plants eat bugs — like the Venus flytrap!",
    "Jungle frogs can be bright blue, red, or yellow!",
    "There are vines in the jungle longer than a football field!",
  ],
  rainbow: [
    "A rainbow is actually a full circle — we only see the top half!",
    "You can never reach the end of a rainbow — it moves with you!",
    "Rainbows have 7 colors: red, orange, yellow, green, blue, indigo, violet!",
    "Sometimes you can see a double rainbow!",
    "The longest rainbow ever seen lasted 9 hours!",
  ],
  princess: [
    "The word 'princess' comes from Latin and means 'first lady'!",
    "There are real princesses all over the world — in Japan, Sweden, and more!",
    "The longest royal gown ever had a 25-foot train!",
    "Some princesses trained to sword fight — not just dance!",
    "Princess Diana was known as 'the people's princess'!",
  ],
  pirate: [
    "Pirates wore eye patches to see better in the dark below deck!",
    "The most famous pirate flag is called the 'Jolly Roger'!",
    "Pirates had rules — they even had a code of conduct!",
    "Some pirate ships had cats to catch mice!",
    "The biggest pirate treasure ever found was worth $500 million!",
  ],
  robot: [
    "The word 'robot' comes from a Czech word meaning 'forced work'!",
    "There are robots on Mars right now — they're called rovers!",
    "Some robots can learn from their mistakes!",
    "The smallest robot ever made is tinier than a penny!",
    "Robots can be found in hospitals, helping doctors!",
  ],
  garden: [
    "Sunflowers turn to face the sun as it moves across the sky!",
    "The world's biggest flower smells like rotten meat!",
    "Strawberries are the only fruit with seeds on the outside!",
    "Plants can 'hear' water and grow their roots toward it!",
    "Bamboo can grow up to 3 feet in a single day!",
  ],
  magic: [
    "The oldest magic trick is the cups-and-balls — over 4,000 years old!",
    "Harry Houdini could hold his breath for over 3 minutes!",
    "Playing cards were invented in China over 1,000 years ago!",
    "The word 'abracadabra' may have meant 'I create as I speak'!",
    "Some magicians practiced up to 10 hours a day!",
  ],
  fairy: [
    "In old stories, fairies could be helpful or mischievous!",
    "The tooth fairy tradition started in Europe!",
    "In some legends, fairies are afraid of iron!",
    "Fairy rings (circles of mushrooms) were said to be fairy dance floors!",
    "Fireflies are sometimes called 'fairy lights'!",
  ],
  train: [
    "The fastest train goes over 370 miles per hour!",
    "The first steam train was called 'The Rocket'!",
    "The longest train ever was over 4 miles long!",
    "Trains existed before cars were invented!",
    "The Trans-Siberian Railway is over 5,700 miles long!",
  ],
  rocket: [
    "Rockets need to go 17,500 mph to reach space!",
    "The first animal in space was a fruit fly in 1947!",
    "Rocket fuel can be colder than -400 degrees!",
    "It takes about 3 days to travel from Earth to the Moon by rocket!",
    "The Saturn V rocket was taller than the Statue of Liberty!",
  ],
  superhero: [
    "Superman first appeared in a comic book in 1938!",
    "Spider-Man was created by a teenager's imagination!",
    "The first female superhero was Fantomah in 1940!",
    "Batman doesn't have any superpowers — just gadgets and training!",
    "Some superheroes were inspired by real people!",
  ],
}

// Generic fallback facts (used when no topic matches)
const GENERIC_FACTS = [
  "A group of flamingos is called a 'flamboyance'!",
  "Octopuses have three hearts and blue blood!",
  "Butterflies taste with their feet!",
  "Elephants are the only animals that can't jump!",
  "A snail can sleep for three years!",
  "Dolphins sleep with one eye open!",
  "Koalas sleep up to 22 hours a day!",
  "Otters hold hands while sleeping so they don't drift apart!",
  "A group of owls is called a 'parliament'!",
  "Penguins propose to their mate with a pebble!",
  "Honey never goes bad — even after thousands of years!",
  "Bananas are berries, but strawberries aren't!",
  "A bolt of lightning is 5 times hotter than the Sun's surface!",
  "Cows have best friends and get stressed when separated!",
  "The shortest war in history lasted 38 minutes!",
  "A cloud can weigh over a million pounds!",
  "Wombat poop is cube-shaped!",
  "Sloths can hold their breath longer than dolphins!",
  "A blue whale's heartbeat can be detected from 2 miles away!",
  "Cats spend 70% of their lives sleeping!",
]

/**
 * Given the user's story prompt, pick the best matching fun facts.
 * Returns topic-matched facts first, then generic ones to fill gaps.
 */
function buildFactList(prompt: string): string[] {
  if (!prompt) return shuffle(GENERIC_FACTS)

  const lower = prompt.toLowerCase()
  const matched: string[] = []

  // Check each topic key against the prompt
  for (const [topic, facts] of Object.entries(FACTS_BY_TOPIC)) {
    // Word-boundary match to avoid "hen" in "then", etc.
    const regex = new RegExp(`\\b${topic}\\b`, 'i')
    if (regex.test(lower)) {
      matched.push(...facts)
    }
  }

  if (matched.length === 0) {
    return shuffle(GENERIC_FACTS)
  }

  // Shuffle matched facts, then append shuffled generics (deduped)
  const shuffledMatched = shuffle(matched)
  const matchedSet = new Set(shuffledMatched)
  const extras = shuffle(GENERIC_FACTS.filter(f => !matchedSet.has(f)))
  return [...shuffledMatched, ...extras]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── Tic-Tac-Toe Mini-Game ────────────────────────────────────────────
// Two-player game for kid + parent to play together while waiting!
// Player 1 is ❌, Player 2 is ⭕. Take turns tapping cells.

const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6],             // diagonals
]

function checkWinner(board: (string | null)[]): string | null {
  for (const [a, b, c] of WINNING_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a]
    }
  }
  if (board.every(cell => cell !== null)) return 'draw'
  return null
}

/** Find the winning line indices (for highlighting) */
function getWinningLine(board: (string | null)[]): number[] | null {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return line
    }
  }
  return null
}

function TicTacToe() {
  const [board, setBoard] = useState<(string | null)[]>(Array(9).fill(null))
  const [isXTurn, setIsXTurn] = useState(true)
  const [winner, setWinner] = useState<string | null>(null)
  const [scores, setScores] = useState({ x: 0, o: 0, draws: 0 })
  const [statusMessage, setStatusMessage] = useState('')
  const [winningCells, setWinningCells] = useState<number[] | null>(null)

  // Auto-reset after game ends
  useEffect(() => {
    if (!winner) return
    const timer = setTimeout(() => {
      setBoard(Array(9).fill(null))
      setIsXTurn(true)
      setWinner(null)
      setStatusMessage('')
      setWinningCells(null)
    }, 2500)
    return () => clearTimeout(timer)
  }, [winner])

  const handleCellClick = useCallback((index: number) => {
    if (winner || board[index]) return

    const newBoard = [...board]
    newBoard[index] = isXTurn ? 'X' : 'O'
    setBoard(newBoard)

    const result = checkWinner(newBoard)
    if (result) {
      const line = getWinningLine(newBoard)
      setWinningCells(line)
      if (result === 'X') {
        setWinner('X')
        setStatusMessage('Player 1 wins! 🎉')
        setScores(prev => ({ ...prev, x: prev.x + 1 }))
      } else if (result === 'O') {
        setWinner('O')
        setStatusMessage('Player 2 wins! 🎉')
        setScores(prev => ({ ...prev, o: prev.o + 1 }))
      } else {
        setWinner('draw')
        setStatusMessage("It's a tie! Great game!")
        setScores(prev => ({ ...prev, draws: prev.draws + 1 }))
      }
    } else {
      setIsXTurn(!isXTurn)
    }
  }, [isXTurn, winner, board])

  return (
    <div className="mt-8 bg-white rounded-2xl p-6 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] border border-zinc-200">
      <p className="text-center text-base font-semibold text-zinc-700 mb-3">
        Play together while you wait! 🎮
      </p>

      {/* Score */}
      <div className="flex justify-center gap-4 text-sm text-zinc-500 mb-4">
        <span className={`font-medium ${isXTurn && !winner ? 'text-emerald-700 underline underline-offset-2' : ''}`}>
          P1 <span className="text-emerald-600">✕</span>: <span className="text-emerald-600 font-bold">{scores.x}</span>
        </span>
        <span className="text-zinc-300">|</span>
        <span className={`font-medium ${!isXTurn && !winner ? 'text-amber-700 underline underline-offset-2' : ''}`}>
          P2 <span className="text-amber-500">○</span>: <span className="text-amber-600 font-bold">{scores.o}</span>
        </span>
        {scores.draws > 0 && (
          <>
            <span className="text-zinc-300">|</span>
            <span className="font-medium">Ties: <span className="text-zinc-400">{scores.draws}</span></span>
          </>
        )}
      </div>

      {/* Board */}
      <div className="grid grid-cols-3 gap-2 w-[228px] mx-auto">
        {board.map((cell, i) => {
          const isWinCell = winningCells?.includes(i)
          return (
            <button
              key={i}
              onClick={() => handleCellClick(i)}
              disabled={!!cell || !!winner}
              className={`
                w-[72px] h-[72px] rounded-xl text-2xl font-bold flex items-center justify-center
                transition-all duration-150
                ${isWinCell
                  ? 'bg-emerald-100 border-2 border-emerald-400 scale-110'
                  : cell
                    ? 'bg-zinc-50 border border-zinc-200'
                    : 'bg-zinc-50 border border-zinc-200 hover:bg-emerald-50 hover:border-emerald-300 hover:scale-105 cursor-pointer active:scale-95'
                }
                ${!cell && !winner ? '' : 'cursor-default'}
              `}
            >
              {cell === 'X' && <span className="text-emerald-600">✕</span>}
              {cell === 'O' && <span className="text-amber-500">○</span>}
            </button>
          )
        })}
      </div>

      {/* Status */}
      <div className="h-7 mt-3">
        {statusMessage ? (
          <p className={`text-center text-base font-semibold ${
            winner === 'X' ? 'text-emerald-600' : winner === 'O' ? 'text-amber-600' : 'text-zinc-500'
          }`}>
            {statusMessage}
          </p>
        ) : (
          <p className="text-center text-sm text-zinc-400">
            {isXTurn ? 'Player 1\'s turn (✕)' : 'Player 2\'s turn (○)'}
          </p>
        )}
      </div>
    </div>
  )
}

const ALL_STAGES = [
  { key: 'story', label: 'Writing story', icon: BookOpen },
  { key: 'images', label: 'Painting illustrations', icon: Palette },
  { key: 'movie', label: 'Creating narrated movie', icon: Film },
] as const

export default function LoadingSpinner({ message = 'Loading...', stage = 'story', prompt = '' }: LoadingSpinnerProps) {
  const [elapsedTime, setElapsedTime] = useState(0)
  const [factIndex, setFactIndex] = useState(0)

  // Build the fact list ONCE based on the prompt
  const facts = useMemo(() => buildFactList(prompt), [prompt])

  useEffect(() => {
    // Start timer
    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // Cycle through facts every 8 seconds
  useEffect(() => {
    if (elapsedTime > 0 && elapsedTime % 8 === 0) {
      setFactIndex(prev => (prev + 1) % facts.length)
    }
  }, [elapsedTime, facts.length])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  }

  // Determine which stages are active based on whether movie stage is reached
  const hasMovie = stage === 'movie'
  const STAGES = hasMovie ? ALL_STAGES : ALL_STAGES.slice(0, 2)

  // Stage index for progress tracking
  const stageIndex = stage === 'story' ? 0 : stage === 'images' ? 1 : 2

  // Overall progress depends on whether we're generating a movie too
  const stageStartPct = hasMovie ? [0, 10, 60] : [0, 15]
  const stageEndPct = hasMovie ? [10, 60, 100] : [15, 100]
  const stageDurationSec = hasMovie ? [30, 70, 40] : [30, 70]

  const stageProgress = Math.min(elapsedTime / stageDurationSec[stageIndex], 1)
  const overallProgress = Math.min(
    stageStartPct[stageIndex] + stageProgress * (stageEndPct[stageIndex] - stageStartPct[stageIndex]),
    95 // never hit 100% until actually done
  )

  return (
    <div className="flex flex-col items-center justify-center py-12">
      {/* Main spinner */}
      <div className="relative">
        <Loader2 className="w-24 h-24 text-emerald-600 animate-spin" />
      </div>

      {/* Message */}
      <p className="mt-6 text-2xl font-semibold text-zinc-800 animate-pulse text-center">
        {message}
      </p>

      {/* Progress indicator */}
      <div className="mt-6 bg-white rounded-xl p-4 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] border border-zinc-200 max-w-md w-full">
        {/* Step tracker */}
        <div className="flex flex-col gap-2 mb-3">
          {STAGES.map((s, i) => {
            const Icon = s.icon
            const isComplete = i < stageIndex
            const isCurrent = i === stageIndex
            return (
              <div key={s.key} className="flex items-center gap-2 text-sm">
                {isComplete ? (
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                ) : (
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isCurrent ? 'text-emerald-600' : 'text-zinc-300'}`} />
                )}
                <span className={
                  isComplete ? 'text-emerald-500 line-through' :
                  isCurrent ? 'text-zinc-800 font-medium' :
                  'text-zinc-300'
                }>
                  {s.label}
                </span>
                {isCurrent && (
                  <span className="ml-auto text-xs text-zinc-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(elapsedTime)}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Overall progress bar */}
        <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
            style={{ width: `${overallProgress}%` }}
          />
        </div>

        {/* Total time estimate */}
        <p className="mt-2 text-xs text-zinc-400 text-center">
          Total estimated time: {hasMovie ? '~2-3 minutes' : '~1-2 minutes'}
        </p>
      </div>

      {/* Tic-Tac-Toe game */}
      <TicTacToe />

      {/* Fun fact */}
      <div className="mt-8 bg-amber-50 border border-amber-200 rounded-2xl p-6 max-w-lg">
        <p className="text-amber-700 text-center font-semibold text-base">
          🧠 Did you know?
        </p>
        <p className="text-amber-600 text-center mt-2 text-base leading-relaxed">
          {facts[factIndex]}
        </p>
      </div>
    </div>
  )
}
