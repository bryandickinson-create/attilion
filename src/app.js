/* Attillion: find the rarest right answer.
 * Everything runs in the browser. Accounts, Elo and the leaderboard are kept
 * in this browser's storage until an online backend (Supabase) is connected.
 */
(function () {
"use strict";

/* ---------- constants ---------- */
const ROUNDS = 7;
const ROUND_SECONDS = 30;
const VALID_SHARE = 92;          // GUESS: % of players who give a valid answer
const FAMILIAR = 65;             // the first 65 answers of a list are the ones a fair player could think of
const KRILLION_FROM = 0.85;      // 1 in Attillion starts 85% of the way down that familiar part
const HADAL_DEPTH = 6000;        // metres where the Attillion zone starts
const MAX_DEPTH = 10935;         // Challenger Deep
const PLAYER_PRIOR = 200;        // how many "virtual answers" the curated list is worth
const START_ELO = 1000;
// Only the owner's account may use a name starting with "Admin".
// GUESS: the owner's username; change it here if Bryan wants a different one.
const OWNER_NAME = "AdminAtticus";
const SFX = (name, gain) => { if (window.KrillionSound) window.KrillionSound.play(name, gain); };

const BOTS = {
  // pick() returns a position in the familiar answers: 0 = most common, 1 = rarest.
  // lucky = chance of launching straight into the Attillion zone on a round.
  dust:      { name: "Space Dust", av: "✨", elo: 500,  miss: 0.30, lucky: 0.02, pick: () => Math.pow(Math.random(), 3) * 0.08, blurb: "Floats around. Sometimes says nothing at all." },
  minnow:    { name: "Asteroid",  av: "🪨", elo: 800,  miss: 0.15, lucky: 0.04, pick: () => Math.pow(Math.random(), 2.2) * 0.15, blurb: "Says the first thing that drifts by." },
  fish:      { name: "Comet",     av: "☄️", elo: 1100, miss: 0.10, lucky: 0.07, pick: () => Math.pow(Math.random(), 1.5) * 0.35, blurb: "Goes around the block, rarely leaves orbit." },
  rover:     { name: "Rover",     av: "🛻", elo: 1250, miss: 0.08, lucky: 0.04, pick: () => Math.pow(Math.random(), 1.2) * 0.45, blurb: "Explores a little further every round." },
  barracuda: { name: "Star",      av: "🌟", elo: 1400, miss: 0.07, lucky: 0.05, pick: () => 0.03 + Math.random() * 0.5,         blurb: "Bright, fast, sometimes too clever." },
  shark:     { name: "Black Hole", av: "🕳️", elo: 1700, miss: 0.04, lucky: 0.09, pick: () => 0.06 + Math.random() * 0.69,        blurb: "Pulls in answers nobody else can reach." },
  nova:      { name: "Supernova", av: "💥", elo: 2000, miss: 0.03, lucky: 0.13, pick: () => 0.12 + Math.random() * 0.7,        blurb: "Explodes with rare answers. Hard to outshine." },
  quasar:    { name: "Quasar",    av: "🌠", elo: 2300, miss: 0.02, lucky: 0.17, pick: () => 0.2 + Math.random() * 0.68,         blurb: "The brightest thing in the universe. Good luck." }
};

// Avatars unlock by your best (peak) Elo, so a losing streak never takes one away.
const AVATARS = [
  { id: "rocket",   e: "🚀", name: "Rocket",         elo: 0 },
  { id: "satellite",e: "🛰️", name: "Satellite",      elo: 0 },
  { id: "moon",     e: "🌙", name: "Crescent moon",  elo: 0 },
  { id: "scope",    e: "🔭", name: "Telescope",      elo: 1050 },
  { id: "astro",    e: "🧑‍🚀", name: "Astronaut",      elo: 1100 },
  { id: "earth",    e: "🌍", name: "Earth",          elo: 1150 },
  { id: "shoot",    e: "🌠", name: "Shooting star",  elo: 1200 },
  { id: "robot",    e: "🤖", name: "Rover bot",      elo: 1275 },
  { id: "fullmoon", e: "🌕", name: "Full moon",      elo: 1350 },
  { id: "planet",   e: "🪐", name: "Ringed planet",  elo: 1425 },
  { id: "star",     e: "⭐", name: "Star",           elo: 1500 },
  { id: "sun",      e: "🌞", name: "Sun",            elo: 1600 },
  { id: "galaxy",   e: "🌌", name: "Nebula",         elo: 1750 },
  { id: "hole",     e: "🕳️", name: "Black hole",     elo: 1900 },
  // Attillion trophies: unlocked by how many 1 in Attillions you have found.
  { id: "k10",      e: "☄️", name: "Comet",           krill: 10 },
  { id: "k20",      e: "🌘", name: "Eclipse",         krill: 20 },
  { id: "gdragon",  e: "🪐", name: "Golden Saturn",   krill: 50 },
  { id: "rdragon",  e: "🌌", name: "Rainbow Nebula",  krill: 100 },
  { id: "k1000",    e: "👑", name: "Attillion Crown", krill: 1000 },
  // Daily Launch streaks
  { id: "streak7",  e: "🔥", name: "Streak Flame",    streak: 7 },
  { id: "streak30", e: "☀️", name: "Thirty-Day Sun",  streak: 30 },
  { id: "allbadges", e: "🏆", name: "Grand Champion",  allBadges: true },
  // Secret: only appears after a game where every answer was a 1 in Attillion
  { id: "perfect",  e: "🌌", name: "Perfect Nebula", perfect: true },
  // Secret: only appears after you find a question's hidden BEST answer
  { id: "bestans",  e: "💎", name: "Best Answer Diamond", bestAv: true },
  // Secret avatars: only unlocked by typing a code in Settings. Codes are
  // stored as hashes so they don't show up as plain text in the page source.
  { id: "alien",    e: "👽", name: "Alien",          code: 32697793 },
  { id: "ufo",      e: "🛸", name: "Flying saucer",  code: 477561382 },
  { id: "spacedog", e: "🐕", name: "Space dog",      code: 1213739381 },
  { id: "cheese",   e: "🧀", name: "Moon cheese",    code: 190172967 },
  { id: "saturn",   e: "🪐", name: "Saturn",         code: 812187123 },
  // the Developer avatars always sit last, in this order
  { id: "dev",      e: "👾", name: "Developer",      code: 4277053133, dev: true },
  { id: "gdev",     e: "👾", name: "Gold Developer", code: 2110502093, dev: true },
  { id: "rdev",     e: "👾", name: "Rainbow Developer", code: 207743465, dev: true }
];

// A short description for every avatar, shown on the avatar page
const AV_DESC = {
  rocket: "Every journey starts on the launch pad. Strap in!",
  satellite: "Quietly circles the planet, listening for rare answers.",
  moon: "A sliver of moon for the late-night thinkers.",
  scope: "Spots answers nobody else can see from down here.",
  astro: "Suited up and ready to walk among the stars.",
  earth: "Home base. Big, blue and full of answers.",
  shoot: "Make a wish. Then make it a rare one.",
  robot: "Rolls across strange planets collecting odd answers.",
  fullmoon: "Bright, round and shining on the whole board.",
  planet: "Wears its rings like a champion's medals.",
  star: "You're officially a star. Keep shining.",
  sun: "So bright the other players need sunglasses.",
  galaxy: "Swirls of stardust for a player who's seen a lot of sky.",
  hole: "Nothing escapes its pull, not even the rarest answer.",
  k10: "Your first streak across the sky.",
  k20: "You've blocked out the sun.",
  gdragon: "Glows solid gold.",
  rdragon: "Shimmers through every color.",
  k1000: "Royalty of the rare answer, with its own crown animation.",
  streak7: "Flickers like a real flame, with a wall-of-fire animation.",
  streak30: "A whole month of sunshine, with the same fire animation.",
  allbadges: "A spinning golden trophy for the ultimate Attillion player.",
  perfect: "Shifts between purple, green and blue.",
  bestans: "Sparkles with its own diamond animation.",
  alien: "Visiting from a galaxy far, far away to play one round.",
  ufo: "Spotted hovering over the leaderboard late at night.",
  spacedog: "A very good dog who has been to space and back.",
  cheese: "Proof that the moon really is made of cheese.",
  saturn: "The planet with the fanciest rings in the solar system.",
  dev: "The original builder's badge, with a full-screen takeover animation.",
  gdev: "Dipped in gold, with a golden takeover animation.",
  rdev: "Cycles through the rainbow, with a rainbow takeover animation."
};
function avDesc(a) {
  if (AV_DESC[a.id]) return AV_DESC[a.id];
  if (a.ev) { const ev = findEvent(a.ev); return ev ? `The prize from the ${ev.name} event.` : "An event prize."; }
  return "";
}
// how you got it (or how to get it)
function avHow(a, open) {
  const ev = a.ev ? findEvent(a.ev) : null;
  const how = a.elo === 0 ? "Everyone starts with this one."
    : a.krill ? `Find ${a.krill.toLocaleString()} answers that are a 1 in Attillion.`
    : a.streak ? `Play the Daily Launch ${a.streak} days in a row.`
    : a.allBadges ? `Earn all ${BADGES.length} badges.`
    : a.perfect ? "Make every answer in one game a 1 in Attillion (or use its secret code)."
    : a.bestAv ? "Find a question's hidden BEST answer (or use its secret code)."
    : a.ev ? `Collect ${EVENT_GOAL} ${ev ? ev.tokenName + " " + ev.token : "tokens"} by playing the event bots while ${ev ? ev.name : "the event"} is on.`
    : a.code ? (a.dev ? "Typed in a secret developer code." : "Typed in a secret code.")
    : `Reach a best Elo of ${a.elo}.`;
  return open ? (a.elo === 0 ? how : "You unlocked it: " + how.charAt(0).toLowerCase() + how.slice(1)) : "How to get it: " + how;
}
function avLock(a) { return a.krill ? `🔒 ${a.krill} Attillions` : a.ev ? `🔒 ${EVENT_GOAL} ${EVENT.token}` : a.streak ? `🔒 ${a.streak}-day streak` : a.allBadges ? `🔒 All ${BADGES.length} badges` : `🔒 ${a.elo} Elo`; }
function showAvInfo(id) {
  const a = AVATARS.find(x => x.id === id); if (!a) return;
  const u = me(), open = isOpen(a, u), sel = a.id === myAvatarObj().id;
  closeAvInfo();
  const el = document.createElement("div");
  el.className = "av-sheet"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", a.name);
  el.innerHTML = `<div class="avs-card">
    <button class="avs-x" data-act="avinfo-close" aria-label="Close">✕</button>
    <div class="avs-e">${avMarkup(a)}</div>
    <h2>${esc(a.name)}${a.dev ? ` <i class="devtag">DEV</i>` : a.code || a.perfect || a.bestAv ? ` <i class="secrettag">secret</i>` : a.ev ? ` <i class="secrettag">event</i>` : ""}</h2>
    ${avDesc(a) ? `<p class="avs-desc">${esc(avDesc(a))}</p>` : ""}
    <p class="avs-how ${open ? "got" : ""}">${esc(avHow(a, open))}</p>
    ${open ? `<p class="avs-stars">⭐ ${(avKrill(u)[a.id] || 0).toLocaleString()} 1 in Attillions found wearing it</p>` : ""}
    ${open ? (sel ? `<p class="avs-sel">This is your avatar right now</p>` : `<button class="btn primary" data-act="avatar" data-id="${a.id}">Use this avatar</button>`) : `<p class="avs-lock">${avLock(a)}</p>`}
    <button class="btn ghost small avs-anim" data-act="avpreview" data-id="${a.id}">✨ Watch its 1 in Attillion animation</button>
  </div>`;
  el.addEventListener("click", e => { if (e.target === el) closeAvInfo(); });
  document.body.appendChild(el);
}
function closeAvInfo() { document.querySelectorAll(".av-sheet").forEach(x => x.remove()); }

/* ---------- seasonal events ----------
 * Every two weeks a new event starts, themed to the time of year. It brings three
 * event bots (easy, medium, hard) and a token. Every game against them earns
 * tokens (more for wins and tougher bots); collect enough in those two weeks and
 * the event's avatar is yours for good. */
const EVENT_EPOCH = new Date(2026, 10, 16);       // a Monday; events run Monday to Sunday-after-next
const EVENT_DAYS = 14, EVENT_GOAL = 150;
const EVENT_TIERS = [
  { elo: 900,  miss: 0.10, lucky: 0.06, pick: () => Math.pow(Math.random(), 1.6) * 0.3, win: 12, draw: 7,  loss: 3 },
  { elo: 1300, miss: 0.07, lucky: 0.05, pick: () => 0.03 + Math.random() * 0.45,       win: 20, draw: 12, loss: 5 },
  { elo: 1800, miss: 0.04, lucky: 0.10, pick: () => 0.08 + Math.random() * 0.7,        win: 32, draw: 20, loss: 8 }
];
const EVENTS = {
  fall: [
    { key: "haunted", name: "Haunted Orbit", token: "👻", tokenName: "Ghost Dust", prize: { e: "🧛", name: "Space Vampire" },
      bots: [["🎃", "Pumpkin Probe", "Glows in the dark, not much else."], ["🦇", "Bat Satellite", "Hangs upside down and sees answers you don't."], ["💀", "Skull Nebula", "Spooky good at rare answers."]] },
    { key: "harvest", name: "Harvest Moon", token: "🌽", tokenName: "Moon Corn", prize: { e: "🦃", name: "Turkey Lander" },
      bots: [["🥧", "Pie Planet", "Sweet, round and easy to beat."], ["🌾", "Wheat Comet", "Gathers answers from far fields."], ["🍂", "Autumn Storm", "Blows in the rarest answers of the season."]] },
    { key: "leaves", name: "Falling Leaves", token: "🍁", tokenName: "Maple Stars", prize: { e: "🦔", name: "Hedgehog Cadet" },
      bots: [["🐿️", "Squirrel Scout", "Busy collecting the obvious answers."], ["🦉", "Night Owl", "Wise, patient and quietly tricky."], ["🍄", "Mushroom Moon", "Pops up with answers from nowhere."]] }
  ],
  winter: [
    { key: "frost", name: "Frost Comet", token: "❄️", tokenName: "Snowflakes", prize: { e: "☃️", name: "Snow Astronaut" },
      bots: [["⛄", "Snow Rover", "Rolls slowly downhill."], ["🐧", "Penguin Pilot", "Can't fly, but can think."], ["🧊", "Ice Giant", "Cold, calculating, rare."]] },
    { key: "holiday", name: "Holiday Star", token: "🎁", tokenName: "Gifts", prize: { e: "🎄", name: "Cosmic Tree" },
      bots: [["🦌", "Reindeer Rocket", "Fast, but sticks to the usual route."], ["🧝", "Elf Engineer", "Builds clever answers in the workshop."], ["🎅", "Santa's Sleigh", "Knows every answer, naughty or nice."]] },
    { key: "aurora", name: "Northern Lights", token: "💎", tokenName: "Aurora Gems", prize: { e: "🧣", name: "Starlight Scarf" },
      bots: [["🦭", "Seal Sat", "Happy with the first answer it finds."], ["🐻‍❄️", "Polar Bear", "Big, strong and hard to surprise."], ["🌨️", "Blizzard", "Buries you in rare answers."]] }
  ],
  spring: [
    { key: "bloom", name: "Bloom Belt", token: "🌸", tokenName: "Petals", prize: { e: "🌻", name: "Sun Flower" },
      bots: [["🐝", "Buzz Drone", "Busy, but not very creative."], ["🦋", "Butterfly Probe", "Flits to unexpected answers."], ["🌷", "Tulip Titan", "Blooms with the rarest picks."]] },
    { key: "egghunt", name: "Egg Hunt", token: "🥚", tokenName: "Star Eggs", prize: { e: "🐰", name: "Moon Bunny" },
      bots: [["🐣", "Chick Capsule", "Just hatched. Still learning."], ["🥕", "Carrot Rocket", "Crunchy and surprisingly sharp."], ["🌈", "Rainbow Arc", "Finds the treasure at the end."]] },
    { key: "showers", name: "Meteor Showers", token: "💧", tokenName: "Raindrops", prize: { e: "☂️", name: "Umbrella Ship" },
      bots: [["🐌", "Snail Probe", "Slow and steady, mostly steady."], ["🐸", "Frog Lander", "Leaps past the common answers."], ["⛈️", "Storm Cell", "Thunders in with rare answers."]] }
  ],
  summer: [
    { key: "flare", name: "Solar Flare", token: "☀️", tokenName: "Sunbeams", prize: { e: "😎", name: "Sun Pilot" },
      bots: [["🍉", "Melon Moon", "Juicy, sweet, predictable."], ["🕶️", "Cool Comet", "Too cool for common answers."], ["🔥", "Flare Core", "Burns hot with rare answers."]] },
    { key: "sparks", name: "Star-Spangled Sky", token: "🎆", tokenName: "Sparks", prize: { e: "🎇", name: "Sparkler" },
      bots: [["🌭", "Hot Dog Hauler", "Goes with the classics."], ["🎈", "Balloon Probe", "Floats a little higher each round."], ["🦅", "Eagle Eye", "Spots answers from miles away."]] },
    { key: "ocean", name: "Ocean Moons", token: "🐚", tokenName: "Shells", prize: { e: "🐙", name: "Space Octopus" },
      bots: [["🦀", "Crab Crawler", "Scuttles sideways to easy answers."], ["🐬", "Dolphin Dart", "Smart and playful."], ["🦈", "Shark Comet", "Hunts down the rarest answers."]] }
  ],
  special: [
    // inspired by big releases (original names, no borrowed characters or logos)
    { key: "heist", name: "Neon Heist", token: "💰", tokenName: "Neon Cash", prize: { e: "🏎️", name: "Getaway Car" },
      bots: [["🚕", "Cab Driver", "Knows the main streets, nothing fancy."], ["🚓", "Patrol Cruiser", "Always on your tail."], ["🕶️", "The Kingpin", "Runs the whole city's rarest answers."]] },
    { key: "doomsday", name: "Doomsday", token: "🛡️", tokenName: "Hero Shields", prize: { e: "🦸", name: "Cosmic Hero" },
      bots: [["🦹", "Henchbot", "Follows orders, not imagination."], ["⚡", "Thunder Knight", "Strikes with surprising answers."], ["☠️", "The Doom Engine", "Built to end the world, one rare answer at a time."]] },
    { key: "biggame", name: "The Big Game", token: "🏈", tokenName: "Touchdowns", prize: { e: "🏆", name: "Galaxy Trophy" },
      bots: [["🧢", "Benchwarmer", "Mostly here for the snacks."], ["📣", "Head Coach", "Has a play for every prompt."], ["🏟️", "The Dynasty", "Champions three years running."]] },
    { key: "heart", name: "Heart Nebula", token: "💖", tokenName: "Heart Stars", prize: { e: "💘", name: "Cupid Comet" },
      bots: [["🍫", "Chocolate Box", "Sweet and very predictable."], ["🌹", "Rose Rover", "Charming and a little clever."], ["💌", "Secret Admirer", "Full of answers you never saw coming."]] },
    { key: "clover", name: "Lucky Clover", token: "🍀", tokenName: "Four-Leaf Clovers", prize: { e: "🌈", name: "Rainbow Road" },
      bots: [["🥔", "Spud Probe", "Hearty, plain and easy."], ["🪙", "Gold Coin", "Lucky now and then."], ["🧙", "Leprechaun Lord", "Hides the rarest answers at the end of the rainbow."]] },
    { key: "greenplanet", name: "Green Planet", token: "🌱", tokenName: "Seedlings", prize: { e: "🌳", name: "Planet Tree" },
      bots: [["♻️", "Recycle Bot", "Reuses the same old answers."], ["🐢", "Sea Turtle", "Slow, steady, and wiser than you think."], ["🌋", "Mother Nature", "Unpredictable and powerful."]] },
    { key: "arcade", name: "Galactic Arcade", token: "🎟️", tokenName: "Prize Tickets", prize: { e: "🕹️", name: "Joystick" },
      bots: [["👻", "Maze Ghost", "Wanders the same paths."], ["🎮", "Button Masher", "Fast fingers, fair answers."], ["👑", "High Score", "Has never lost a game. Yet."]] },
    { key: "deepdive", name: "Deep Dive", token: "🦪", tokenName: "Pearls", prize: { e: "🦑", name: "Giant Squid" },
      bots: [["🐠", "Reef Fish", "Stays near the surface."], ["🐋", "Blue Whale", "Huge and patient."], ["🦈", "Megalodon", "From the deepest, rarest waters."]] },
    { key: "spacecamp", name: "Space Camp", token: "🏅", tokenName: "Mission Patches", prize: { e: "🧪", name: "Star Chemist" },
      bots: [["🔦", "Camp Counselor", "Knows the camp songs, not much else."], ["🧭", "Navigator", "Finds new paths every round."], ["🛰️", "Mission Control", "Calculates the rarest answer."]] },
    { key: "games", name: "Summer Games", token: "🥉", tokenName: "Medals", prize: { e: "🥇", name: "Gold Medalist" },
      bots: [["🏃", "Jogger", "Steady pace, safe answers."], ["🤸", "Gymnast", "Flips into unexpected answers."], ["🏊", "Champion", "Built for gold."]] },
    { key: "academy", name: "Cosmic Academy", token: "✏️", tokenName: "Gold Pencils", prize: { e: "🎓", name: "Star Scholar" },
      bots: [["🎒", "New Kid", "Still finding the classroom."], ["📚", "Bookworm", "Has read every list twice."], ["🧑‍🏫", "The Principal", "Knows every answer in the school."]] },
    { key: "dino", name: "Dino Dig", token: "🦴", tokenName: "Fossils", prize: { e: "🦖", name: "Rocket Rex" },
      bots: [["🥚", "Dino Egg", "Hasn't hatched any ideas yet."], ["🦕", "Long Neck", "Reaches a little higher."], ["☄️", "The Asteroid", "Wiped out everything before you."]] },
    { key: "orchard", name: "Orchard Orbit", token: "🍎", tokenName: "Star Apples", prize: { e: "🍏", name: "Apple Moon" },
      bots: [["🧃", "Juice Box", "Sweet and simple."], ["🥧", "Apple Pie", "Warm, and a little tricky."], ["🌳", "Ancient Tree", "Rooted in the rarest answers."]] },
    { key: "monster", name: "Monster Mash", token: "🍬", tokenName: "Candy", prize: { e: "🧟", name: "Zombie Pilot" },
      bots: [["🕸️", "Cobweb", "Hangs around the obvious answers."], ["🐺", "Werewolf", "Wild on a full moon."], ["🧙‍♀️", "Moon Witch", "Brews the rarest answers in her cauldron."]] }
  ]
};
// 26 two-week windows a year, each with its own event, starting Mon Nov 16 2026
const EVENT_CALENDAR = [
  "harvest",     // Nov 16  Thanksgiving
  "heist",       // Nov 30  the big crime-city game launch
  "holiday",     // Dec 14  Christmas
  "doomsday",    // Dec 28  the big superhero movie
  "frost",       // Jan 11
  "biggame",     // Jan 25  football's big game
  "heart",       // Feb 8   Valentine's Day
  "aurora",      // Feb 22
  "clover",      // Mar 8   St. Patrick's Day
  "egghunt",     // Mar 22  Easter
  "showers",     // Apr 5
  "greenplanet", // Apr 19  Earth Day
  "bloom",       // May 3
  "arcade",      // May 17
  "ocean",       // May 31
  "flare",       // Jun 14  summer solstice
  "sparks",      // Jun 28  Fourth of July
  "deepdive",    // Jul 12
  "spacecamp",   // Jul 26
  "games",       // Aug 9
  "academy",     // Aug 23  back to school
  "dino",        // Sep 6
  "orchard",     // Sep 20
  "leaves",      // Oct 4
  "monster",     // Oct 18  Halloween
  "haunted"      // Nov 1
];
function eventWindow(d) { d = d || new Date(); return Math.floor((d - EVENT_EPOCH) / (EVENT_DAYS * 864e5)); }
function eventFor(w) {
  const start = new Date(EVENT_EPOCH.getTime() + w * EVENT_DAYS * 864e5);
  const key = EVENT_CALENDAR[((w % EVENT_CALENDAR.length) + EVENT_CALENDAR.length) % EVENT_CALENDAR.length];
  const ev = Object.values(EVENTS).flat().find(x => x.key === key);
  return Object.assign({ w, start, end: new Date(start.getTime() + EVENT_DAYS * 864e5) }, ev);
}
const EVENT = eventFor(eventWindow());
// each event's colour and emojis, used for its themed 1 in Attillion animation
const EVENT_RGB = { haunted: "255,140,40", harvest: "240,170,60", leaves: "230,110,40", frost: "150,220,255", holiday: "235,70,80", aurora: "90,240,190", bloom: "255,150,200", egghunt: "255,220,120", showers: "110,170,255", flare: "255,200,60", sparks: "255,90,90", ocean: "60,200,230", heist: "60,255,200", doomsday: "170,90,255", biggame: "120,200,90", heart: "255,90,160", clover: "80,220,110", greenplanet: "110,210,90", arcade: "255,230,80", deepdive: "60,130,230", spacecamp: "220,230,255", games: "255,200,60", academy: "255,220,90", dino: "200,160,100", orchard: "240,70,70", monster: "170,255,90" };
function findEvent(key) { return Object.values(EVENTS).flat().find(x => x.key === key) || null; }
function eventTheme(ev) { return ev ? { name: ev.name, rgb: EVENT_RGB[ev.key] || "255,201,60", emojis: [ev.token, ev.token, ev.prize.e].concat(ev.bots.map(b => b[0])) } : null; }
// every event's prize, so prizes from past events stay in your collection
Object.values(EVENTS).flat().forEach(ev => AVATARS.splice(AVATARS.findIndex(a => a.code), 0, { id: "ev-" + ev.key, e: ev.prize.e, name: ev.prize.name, ev: ev.key }));
EVENT.bots.forEach(([av, name, blurb], i) => { BOTS["ev" + i] = Object.assign({ name, av, blurb, event: true, tier: i }, EVENT_TIERS[i]); });
function eventTokens(u) { const x = u ? (u.events || {}) : store.get("guestEvents", {}); return x[EVENT.w] || 0; }
function evPrizes(u) { return u ? (u.evAvatars || []) : store.get("guestEvAvatars", []); }
function awardTokens(n) {
  const id = "ev-" + EVENT.key; let unlocked = false;
  const upd = (ev, pz) => { ev[EVENT.w] = (ev[EVENT.w] || 0) + n; if (ev[EVENT.w] >= EVENT_GOAL && !pz.includes(id)) { pz.push(id); unlocked = true; } };
  if (me()) updateUser(x => { x.events = x.events || {}; x.evAvatars = x.evAvatars || []; upd(x.events, x.evAvatars); });
  else { const ev = store.get("guestEvents", {}), pz = store.get("guestEvAvatars", []); upd(ev, pz); store.set("guestEvents", ev); store.set("guestEvAvatars", pz); }
  return unlocked;
}
function daysLeft() { return Math.max(1, Math.ceil((EVENT.end - Date.now()) / 864e5)); }
function regularBots() { return Object.entries(BOTS).filter(([, b]) => !b.event); }
function viewEventCard() {
  const u = me(), have = eventTokens(u), prize = avatarById("ev-" + EVENT.key), got = evPrizes(u).includes(prize.id);
  const pct = Math.min(100, Math.round(have / EVENT_GOAL * 100));
  return `<article class="mode event">
    <div class="mode-head"><h2>${EVENT.token} ${esc(EVENT.name)}</h2><span class="tag">${daysLeft()} day${daysLeft() === 1 ? "" : "s"} left</span></div>
    <p>A two-week event. Play the event bots to collect <b>${EVENT.token} ${esc(EVENT.tokenName)}</b>. Wins earn more, and tougher bots pay more. Collect ${EVENT_GOAL} to unlock the ${avMarkup(prize)} <b>${esc(prize.name)}</b> avatar for good.</p>
    <div class="ev-progress"><div class="ev-bar" style="--p:${pct}%"></div><span>${got ? `Unlocked! ${have} collected` : `${have} / ${EVENT_GOAL}`} ${EVENT.token}</span></div>
    <div class="bots-grid ev-bots">
      ${[0, 1, 2].map(i => { const b = BOTS["ev" + i]; return `
        <button class="bot ev-bot" data-act="bot" data-level="ev${i}">
          <span class="bot-name">${b.av} ${esc(b.name)}</span>
          <span class="bot-elo">${b.elo}</span>
          <span class="bot-blurb">${esc(b.blurb)} Win +${b.win}, lose +${b.loss}.</span>
        </button>`; }).join("")}
    </div>
  </article>`;
}

// Bundle codes unlock a whole group at once.
const ELO_BOOST_CAP = 2000;
const ELO_BOOST_CODE = 3265732527;
const POWER_RESET_CODE = 2919067109; // lets BOLTCACHE58 be used again today
const POWER_CODE = 3522492995; // +3 of each power-up, once a day
const BUNDLES = [
  { id: "krill-all", code: 1175683394, name: "every Attillion trophy", pick: "rdragon" },
  { id: "krill-all", code: 2284514118, name: "every Attillion trophy", pick: "rdragon" },   // the old code still works
  { id: "k1000", code: 1553214958, name: "the Attillion Crown", pick: "k1000", show: "👑" },
  { id: "bestans", code: 1753198704, name: "the Best Answer Diamond", pick: "bestans", show: "💎" },
  { id: "perfect", code: 3629488017, name: "the Perfect Nebula", pick: "perfect", show: "🌌" }
];
function codeHash(raw) { return hashStr("krillion-code:" + String(raw).toUpperCase().replace(/[^A-Z0-9]/g, "")); }
function redeemed(u) { return u ? (u.codes || []) : store.get("guestCodes", []); }
// The saved list keeps the latest 500, so a separate running total counts every one.
function krillCount(u) { return u ? Math.max((u.krillions || []).length, u.krillTotal || 0) : Math.max(store.get("guestKrillions", []).length, store.get("guestKrillTotal", 0)); }
function bestDone(u) { return u ? !!u.bestFound : !!store.get("guestBest", false); }
// how many 1 in Attillions you've found while wearing each avatar
function avKrill(u) { return (u ? u.avKrill : store.get("guestAvKrill", {})) || {}; }
function perfectDone(u) { return u ? !!u.perfect : !!store.get("guestPerfect", false); }
function isOpen(a, u) {
  if (a.ev) return evPrizes(u).includes(a.id);
  if (a.streak) return streakBest(u) >= a.streak;
  if (a.allBadges) return badgesEarned(u).length >= BADGES.length;
  if (a.perfect) return perfectDone(u) || redeemed(u).includes("perfect");
  if (a.bestAv) return bestDone(u) || redeemed(u).includes("bestans");
  if (a.code) return redeemed(u).includes(a.id);
  if (a.krill) return krillCount(u) >= a.krill || redeemed(u).includes(a.id) || (a.krill < 1000 && redeemed(u).includes("krill-all"));
  return a.elo === 0 || (u && a.elo <= u.peak);
}
function avatarById(x) { return AVATARS.find(a => a.id === x || a.e === x) || null; }
// Avatars are drawn through this so special ones (gold, rainbow) get their effect everywhere.
function avMarkup(a) { return a ? `<span class="avg av-${a.id}">${a.e}</span>` : ""; }
// "Played like": maps a score to the Elo of a computer opponent that averages it.
const PERF = [[0, 400], [134, 800], [294, 1100], [450, 1400], [547, 1700], [700, 2300]];
function perfElo(points, rounds) {
  const t = Math.max(0, Math.min(700, points * ROUNDS / Math.max(1, rounds)));
  for (let i = 1; i < PERF.length; i++) {
    const [x0, y0] = PERF[i - 1], [x1, y1] = PERF[i];
    if (t <= x1) return Math.round((y0 + (y1 - y0) * (t - x0) / (x1 - x0)) / 10) * 10;
  }
  return 2300;
}

const ZONES = [
  { key: "sunlight", name: "Sky",          min: 0 },
  { key: "twilight", name: "Stratosphere", min: 200 },
  { key: "midnight", name: "Orbit",        min: 1000 },
  { key: "abyss",    name: "Moon",         min: 4000 },
  { key: "hadal",    name: "1 in Attillion", min: HADAL_DEPTH }
];

// Rarity is stored as a "depth" number (0 to 10,935) and shown as how high you climbed:
// Sky 0-12 km, Stratosphere 12-100 km, Orbit 100-36,000 km, Moon 36,000-384,400 km,
// then 1 in Attillion: past the Moon toward the edge of the Solar System.
const ALT_D = [0, 200, 1000, 4000, 6000, 10935];
const ALT_KM = [0, 12, 100, 36000, 384400, 18e9];
function altitudeKm(depth) {
  for (let i = 0; i < ALT_D.length - 1; i++) {
    if (depth <= ALT_D[i + 1] || i === ALT_D.length - 2) {
      const f = Math.max(0, Math.min(1, (depth - ALT_D[i]) / (ALT_D[i + 1] - ALT_D[i])));
      if (i === 0) return ALT_KM[1] * f;
      return Math.exp(Math.log(ALT_KM[i]) + f * (Math.log(ALT_KM[i + 1]) - Math.log(ALT_KM[i])));
    }
  }
  return ALT_KM[ALT_KM.length - 1];
}
function altText(depth) {
  const km = altitudeKm(depth);
  if (km >= 1e9) return (km / 1e9).toFixed(1).replace(/\.0$/, "") + " billion km";
  if (km >= 1e6) return (km / 1e6).toFixed(1).replace(/\.0$/, "") + " million km";
  if (km < 10) return km.toFixed(1).replace(/\.0$/, "") + " km";
  return Math.round(km).toLocaleString() + " km";
}

/* ---------- safe storage ---------- */
const mem = {};
const store = {
  get(k, d) { try { const v = localStorage.getItem("krillion:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : d; } },
  set(k, v) { mem[k] = v; try { localStorage.setItem("krillion:" + k, JSON.stringify(v)); } catch (e) {} }
};

/* ---------- text matching ---------- */
function norm(s) {
  return String(s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim()
    .replace(/^(the|a|an) /, "");
}
function singular(s) {
  if (s.length > 4 && s.endsWith("ies")) return s.slice(0, -3) + "y";
  if (s.length > 4 && /(ches|shes|xes|ses|oes)$/.test(s)) return s.slice(0, -2);
  if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) return s.slice(0, -1);
  return s;
}
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i), pp = prev;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // swapped neighbours ("pualing" for "pauling") count as one typo
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], pp[j - 2] + 1);
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    pp = prev; prev = cur;
  }
  return prev[b.length];
}

/* ---------- prompt bank ---------- */
// entries: [{ forms: [...] }] in order from most to least common.
// familiarCount: how many of them a fair player could think of (bots and
// "down in the trench" examples only use those).
const ALIASES = {
  "phone": ["telephone", "cell phone", "cellphone", "smartphone", "smart phone", "mobile phone", "iphone", "landline"],
  "telephone": ["phone", "landline"],
  "tv": ["television", "telly", "tv set", "smart tv"], "television": ["tv", "telly"],
  "video games": ["video game", "nintendo", "xbox", "playstation", "ps5", "ps4", "game console", "gaming", "switch", "nintendo switch", "game boy", "wii"],
  "video game": ["video games", "nintendo", "xbox", "playstation", "ps5", "ps4", "game console", "gaming", "nintendo switch", "game boy", "wii"],
  "nintendo switch": ["nintendo", "switch"], "game console": ["nintendo", "xbox", "playstation", "console"],
  "computer": ["pc", "desktop", "desktop computer"], "laptop": ["notebook computer", "macbook", "chromebook"], "tablet": ["ipad"], "ipad": ["tablet"],
  "refrigerator": ["fridge"], "fridge": ["refrigerator"], "couch": ["sofa"], "sofa": ["couch"],
  "bike": ["bicycle"], "bicycle": ["bike"], "car": ["automobile"], "plane": ["airplane", "aeroplane", "jet"], "airplane": ["plane", "aeroplane"],
  "mom": ["mommy", "mother", "mama"], "dad": ["daddy", "father", "papa"], "grandma": ["granny", "nana", "grandmother"], "grandpa": ["grandfather", "pop pop"],
  "teddy bear": ["teddy"], "stuffed animal": ["stuffy", "plushie", "plush", "stuffie"], "lego": ["legos"], "legos": ["lego"],
  "french fries": ["fries", "chips"], "fries": ["french fries"], "soda": ["pop", "soda pop", "soft drink"], "hamburger": ["burger", "cheeseburger"]
};
function buildPrompt(id, q, entries, familiarCount, extra) {
  const answers = []; const index = new Map();
  entries.forEach(e => {
    const keys = e.forms.map(norm).filter(k => k && !index.has(k));
    if (!keys.length) return;
    const i = answers.length;
    answers.push({ display: e.forms[0], keys });
    keys.forEach(k => { index.set(k, i); const s = singular(k); if (!index.has(s) && (!extra || !extra.test || extra.test(s))) index.set(s, i); });
  });
  // everyday other names for an answer that's already on the list
  Object.entries(ALIASES).forEach(([k, al]) => { if (!index.has(k)) return; const i = index.get(k); al.forEach(a => { if (!index.has(a) && (!extra || !extra.test || extra.test(a))) index.set(a, i); }); });
  let H = 0; answers.forEach((_, r) => { H += 1 / (r + 1); });
  answers.forEach((a, r) => { a.base = VALID_SHARE * (1 / (r + 1)) / H; });
  // The most common answer sits at the surface (0 m). 1 in Attillion starts
  // 85% of the way down the familiar answers; anything past them also counts.
  const familiar = Math.max(4, Math.min(answers.length, familiarCount));
  const krillFrom = Math.min(answers.length - 1, Math.floor(familiar * ((extra && extra.krillFrac) || KRILLION_FROM)));
  const zeroShare = answers[0].base;
  const krillShare = answers[krillFrom].base;
  return Object.assign({ id, q, answers, index, zeroShare, krillShare, familiar, krillFrom }, extra || {});
}

/* Twists change how you search a list instead of shrinking it to a handful of
   answers: "Name a fruit with no E in it", "...that's two or more words".
   Each variant keeps the base list's common-to-rare order, and is only used when
   plenty of answers (and plenty of familiar ones) still fit. */
const letters = k => k.replace(/[^a-z]/g, "");
const TWISTS = [
  ...["e", "a", "i", "o"].map(x => ({ key: "no" + x, fam: "no", test: k => !k.includes(x), label: `with no “${x.toUpperCase()}” in it` })),
  { key: "words2", fam: "words", test: k => k.includes(" "), label: "that's two or more words" },
  { key: "word1", fam: "words", test: k => !k.includes(" ") && letters(k).length >= 6, label: "that's one word, 6+ letters" },
  { key: "short", fam: "len", test: k => letters(k).length <= 5, label: "that's 5 letters or fewer" },
  { key: "long", fam: "len", test: k => letters(k).length >= 10, label: "that's 10+ letters long" },
  { key: "dbl", fam: "dbl", test: k => /([a-z])\1/.test(k), label: "with a double letter, like “LL” or “EE”" },
  { key: "uniq", fam: "dbl", test: k => { const l = letters(k); return new Set(l).size === l.length; }, label: "with no letter used twice" },
  { key: "vowel", fam: "start", test: k => /^[aeiou]/.test(k), label: "that starts with a vowel" },
  { key: "am", fam: "start", test: k => /^[a-m]/.test(k), label: "that starts with a letter from A to M" },
  { key: "len8", fam: "len", test: k => letters(k).length >= 8, label: "that's 8 or more letters" },
  { key: "rare", fam: "rare", test: k => /[jkqxz]/.test(k), label: "with a J, K, Q, X or Z in it" },
  { key: "nz", fam: "start", test: k => /^[n-z]/.test(k), label: "that starts with a letter from N to Z" },
  ...["b", "c", "m", "p", "s", "t"].map(x => ({ key: "s" + x, fam: "start", test: k => k.startsWith(x), label: `that starts with “${x.toUpperCase()}”` })),
  { key: "vow3", fam: "vow", test: k => (k.match(/[aeiou]/g) || []).length >= 4, label: "with four or more vowels" },
  // "contains a ___": only letters that leave plenty of answers make it past the checks below
  ..."bcdfghkmpuvwyz".split("").map(x => ({ key: "has" + x, fam: "has", test: k => k.includes(x), label: `that contains the letter “${x.toUpperCase()}”` }))
];
// a twist must leave this many answers, and this many familiar ones
const TWIST_MIN = 45, TWIST_MIN_FAMILIAR = 25, TWIST_MIN_HARD = 18, TWIST_MIN_FAMILIAR_HARD = 10;
const BASES = []; const PROMPTS = []; const VARIANTS = {};
// Subject Launches: which topics belong to which subject (new topics carry their own `cat`)
const SUBJECTS = [
  { key: "sports", name: "Sports", icon: "⚽" },
  { key: "literature", name: "Literature", icon: "📚" },
  { key: "history", name: "History", icon: "🏛️" },
  { key: "geography", name: "Geography", icon: "🌍" },
  { key: "religion", name: "Religion", icon: "🕊️" },
  { key: "movies", name: "Movies & TV", icon: "🎬" },
  { key: "weather", name: "Weather & Disasters", icon: "🌪️" },
  { key: "seasonal", get name() { return SEASONS[seasonKey()].name; }, get icon() { return SEASONS[seasonKey()].icon; } }
];
// Seasonal Launch: topics change with the time of year
const SEASONS = { winter: { name: "Winter", icon: "❄️" }, spring: { name: "Spring", icon: "🌸" }, summer: { name: "Summer", icon: "☀️" }, fall: { name: "Fall", icon: "🍂" } };
function seasonKey(d) { const m = (d || new Date()).getMonth(); return m === 11 || m < 2 ? "winter" : m < 5 ? "spring" : m < 8 ? "summer" : "fall"; }
const SUBJECT_BY_KEY = Object.fromEntries(SUBJECTS.map(x => [x.key, x]));
const CAT_OF = {
  sport: "sports", martial: "sports", athlete: "sports", sportsgear: "sports",
  shakespeare: "literature", author: "literature", myth: "literature",
  president: "history", scientist: "history", painter: "history", composer: "history", landmark: "history geography",
  capital: "geography", africa: "geography", europe: "geography", asia: "geography", samerica: "geography", state: "geography",
  uscity: "geography", island: "geography", water: "geography", mountain: "geography", europecity: "geography", asiacity: "geography",
  language: "geography",
  god: "religion",
  beach: "season-summer", icecream: "season-summer", camping: "season-summer", carnival: "season-summer",
  flower: "season-spring", insect: "season-spring", holiday: "season-winter",
  animated: "movies", superhero: "movies",
  weather: "weather", volcano: "weather geography", disaster: "history weather", rainthing: "season-spring weather"
};
(window.KRILLION_PROMPTS || []).forEach(p => {
  // extra answers: hand-picked lists first, then the big dictionary list at the rare end
  const more = [window.KRILLION_MORE, window.KRILLION_MORE3, window.KRILLION_MORE2].map(m => (m || {})[p.id]).filter(Boolean);
  const entries = [p.a].concat(more).join(";").split(";").map(e => ({ forms: e.split("|").map(s => s.trim()).filter(Boolean) })).filter(e => e.forms.length);
  const base = buildPrompt(p.id, p.q, entries, FAMILIAR, { baseId: p.id });
  base.cats = ((p.cat || "") + " " + (CAT_OF[p.id] || "")).split(/[ ,]+/).filter(Boolean);
  BASES.push(base); PROMPTS.push(base); VARIANTS[p.id] = [];
  TWISTS.forEach(t => {
    let familiarHits = 0;
    const kept = [];
    entries.forEach((e, i) => {
      const forms = e.forms.filter(f => t.test(norm(f)));
      if (!forms.length) return;
      kept.push({ forms }); if (i < FAMILIAR) familiarHits++;
    });
    if (kept.length < (t.hard ? TWIST_MIN_HARD : TWIST_MIN) || familiarHits < (t.hard ? TWIST_MIN_FAMILIAR_HARD : TWIST_MIN_FAMILIAR)) return;
    // a twist that barely filters the list isn't a twist
    if (t.easy || kept.length > entries.length * 0.8) { if (kept.length > entries.length * 0.6) return; }
    const v = buildPrompt(p.id + "~" + t.key, p.q + " " + t.label, kept, familiarHits, { baseId: p.id, baseQ: p.q, twist: t.label, test: t.test, fam: t.fam });
    PROMPTS.push(v); VARIANTS[p.id].push(v.id);
  });
});
/* ---------- Little Kid Mode ----------
   Its own prompts (no twists), 1 in Attillion much easier to reach, and its own
   Elo, daily launch and leaderboard. Switched in Settings, saved on this device. */
const KID_FAMILIAR = 40, KID_KRILL_FROM = 0.72;
const KID_EXTRA = {   // kid topics also accept answers from matching grown-up lists
  "k-fruit": "fruit", "k-color": "color", "k-ocean": "ocean fish", "k-body": "body bone", "k-dino": "dino", "k-pet": "pet dog breed_cat", "k-bug": "insect",
  "k-vehicle": "vehicle wheels boat", "k-clothes": "clothing hat shoe wintercloth", "k-sport": "sport", "k-dessert": "dessert candy cake cookie icecream", "k-animal": "mammal bird reptile pet",
  "k-weather": "weather", "k-music": "instrument", "k-veg": "veg", "k-bird": "bird", "k-drink": "drink coffee", "k-zoo": "mammal reptile bird", "k-yummy": "pizza",
  "k-ice": "icecream", "k-tool": "tool", "k-space": "space", "k-camp": "camping", "k-game": "game playground", "k-tvshow": "cartoonshow", "k-movie": "animated",
  "k-character": "disneychar cartoonshow superhero", "k-princess": "disneychar", "k-superhero": "superhero", "k-snack": "candy", "k-job": "job", "k-holiday": "holiday winterholiday",
  "k-kitchen": "appliance utensil", "k-school": "classroom schoolsupply", "k-garden": "garden flower veg", "k-house": "room furniture bathroom", "k-sky": "space weather", "k-sea": "beach",
  "k-feel": "emotion", "k-farm": "farm", "k-breakfast": "breakfast cereal", "k-food": "fastfood pizza breakfast", "k-ride": "playground", "k-wheels": "wheels vehicle", "k-farmfood": "veg fruit",
  "k-shape": "shape", "k-room": "room", "k-birthday": "", "k-zoo2": "", "k-place": "state uscity country landmark europecity worldcity nacity asiacity usparks" };
const KID_LETTER = { "k-letter": "b", "k-letter2": "s" };
// words for "starts with B / S": every one-word answer from any list
const KID_WORDS = {};
Object.values(KID_LETTER).forEach(l => { const set = new Set(); BASES.forEach(b => b.answers.forEach(a => { const d = norm(a.display); if (d[0] === l && !d.includes(" ") && d.length <= 10) set.add(d); })); KID_WORDS[l] = [...set].join(";"); });
(window.KRILLION_KIDS || []).forEach(p => {
  const srcs = (KID_EXTRA[p.id] || "").split(" ").filter(Boolean);
  // hand-picked grown-up extras first, the big dictionary lists last
  const more = [window.KRILLION_MORE, window.KRILLION_MORE3].flatMap(m => srcs.map(x => (m || {})[x]))
    .concat(srcs.map(x => (window.KRILLION_PROMPTS || []).find(q => q.id === x)).filter(Boolean).map(q => q.a))
    .concat(srcs.map(x => (window.KRILLION_MORE2 || {})[x]))
    .concat(KID_LETTER[p.id] ? [KID_WORDS[KID_LETTER[p.id]]] : []).filter(Boolean);
  const entries = [p.a, (window.KRILLION_KIDS_MORE || {})[p.id]].filter(Boolean).concat(more).join(";").split(";").map(e => ({ forms: e.split("|").map(s => s.trim()).filter(Boolean) })).filter(e => e.forms.length);
  const base = buildPrompt(p.id, p.q, entries, KID_FAMILIAR, { baseId: p.id, kid: true, krillFrac: KID_KRILL_FROM });
  base.cats = ["kids"];
  BASES.push(base); PROMPTS.push(base); VARIANTS[p.id] = [];
});
/* ---------- Big Kid Mode ----------
   Between Little kids and Regular: its own topics plus easier regular topics, no
   twists, 1 in Attillion a bit easier than regular, and its own Elo, daily and board. */
const BIG_FAMILIAR = 52, BIG_KRILL_FROM = 0.82;
const BIG_EXTRA = {   // big kid topics also accept answers from matching regular lists
  "b-videogame": "", "b-country": "country africa europe asia samerica", "b-hero": "superhero", "b-pokemonlike": "myth", "b-lunch": "sandwich soup pizza fastfood",
  "b-board": "game", "b-gadget": "", "b-ocean2": "ocean fish", "b-snackfood": "candy", "b-outside": "playground", "b-mythbeast": "myth",
  "b-careers": "job", "b-instrument": "instrument", "b-bodyorg": "body bone", "b-pet": "pet", "b-history": "figure founder", "b-weather2": "weather space",
  "b-sportball": "sport", "b-space2": "space", "b-recess": "playground", "b-breakfast": "breakfast cereal", "b-cartoon": "cartoonshow disneychar",
  "b-bookchar": "character hpchar", "b-trip": "camping", "b-amusement": "carnival", "b-winter": "winterthing wintersport", "b-tvkids": "cartoonshow",
  "b-insect": "insect", "b-holidayx": "holiday winterholiday", "b-kitchen": "appliance utensil", "b-cityplace": "", "b-insidehome": "", "b-mathword": "shape unit" };
// regular topics that also show up in Big Kid Mode (with the big kid rarity)
const BIG_FROM_REGULAR = ["fruit", "veg", "dog", "color", "sport", "bird", "vehicle", "flower", "dino", "shape", "dessert", "beach", "mammal", "reptile", "clothing",
  "pizza", "icecream", "superpower", "emotion", "room", "furniture", "subject", "candy", "drink", "camping", "classroom", "carnival", "hobby", "farm", "animated",
  "cake", "cereal", "wheels", "sportsgear", "hpchar", "disneychar", "cartoonshow", "halloween", "christmas", "summerthing", "state", "uscity", "fastfood", "landmark",
  "invention", "kidsbook", "fairytale", "bookseries", "costume", "babyanimal", "olympic", "proteam",
  "vgchar", "famousdog", "famouscat", "tailthing", "sticky", "worlddish", "duo", "band"];
function addBig(id, q, a, srcs) {
  const more = [window.KRILLION_MORE, window.KRILLION_MORE3].flatMap(m => srcs.map(x => (m || {})[x]))
    .concat(srcs.map(x => (window.KRILLION_PROMPTS || []).find(r => r.id === x)).filter(Boolean).map(r => r.a))
    .concat(srcs.map(x => (window.KRILLION_MORE2 || {})[x])).filter(Boolean);
  const entries = [a].concat(more).join(";").split(";").map(e => ({ forms: e.split("|").map(t => t.trim()).filter(Boolean) })).filter(e => e.forms.length);
  const base = buildPrompt(id, q, entries, BIG_FAMILIAR, { baseId: id, big: true, krillFrac: BIG_KRILL_FROM });
  base.cats = ["bigkids"];
  BASES.push(base); PROMPTS.push(base); VARIANTS[id] = [];
}
(window.KRILLION_BIG || []).forEach(p => addBig(p.id, p.q, [p.a, (window.KRILLION_BIG_MORE || {})[p.id]].filter(Boolean).join(";"), (BIG_EXTRA[p.id] || "").split(" ").filter(Boolean)));
BIG_FROM_REGULAR.forEach(id => {
  const r = (window.KRILLION_PROMPTS || []).find(x => x.id === id);
  if (r && !(window.KRILLION_BIG || []).some(b => b.q === r.q)) addBig("b-" + id, r.q, r.a, [id]);
});
// "little", "big" or "regular" (saved on this device)
function ageMode() { const v = store.get("ageMode", null); if (v === "little" || v === "big" || v === "regular") return v; return store.get("kidMode", false) ? "little" : "regular"; }
function kidMode() { return ageMode() === "little"; }
function bigMode() { return ageMode() === "big"; }
function tierKey() { return kidMode() ? "kid" : bigMode() ? "big" : null; }
function modeBases() { const k = kidMode(), b = bigMode(); return BASES.filter(p => !!p.kid === k && !!p.big === b); }
const PROMPT_BY_ID = Object.fromEntries(PROMPTS.map(p => [p.id, p]));

// Extra words around a real answer still count: "Yellowstone National Park",
// "light blue", "the Dallas Cowboys". A last name or last word that only one
// answer ends with counts too: "Mahomes", "Cowboys".
function looseMatch(prompt, k) {
  const words = k.split(" ");
  const ok = w => w.replace(/ /g, "").length >= 4;
  if (words.length > 1) {
    for (let len = words.length - 1; len >= 1; len--) {
      for (let st = 0; st + len <= words.length; st++) {
        const sub = words.slice(st, st + len).join(" ");
        if (!ok(sub)) continue;
        if (prompt.index.has(sub)) return prompt.index.get(sub);
        const ss = singular(sub);
        if (prompt.index.has(ss)) return prompt.index.get(ss);
      }
    }
    return -1;
  }
  if (!prompt.tails) {
    const seen = new Map();
    for (const [key, i] of prompt.index) {
      if (!key.includes(" ")) continue;
      const w = key.slice(key.lastIndexOf(" ") + 1);
      if (w.length < 5 || prompt.index.has(w)) continue;
      const was = seen.get(w);
      seen.set(w, was === undefined || was === i ? i : -1);
    }
    prompt.tails = seen;
  }
  const t = prompt.tails.get(k) ?? prompt.tails.get(singular(k));
  return t === undefined ? -1 : t;
}
// Kid mode, for questions whose answers are little phrases ("do the dishes"):
// a single key word counts too ("dishes", "vacuuming", "sweeping"), matching the
// most common answer that uses it.
const KID_STOP = new Set(["the", "a", "an", "my", "up", "in", "on", "out", "of", "to", "with", "and", "for", "at", "help", "be", "do", "get", "put", "make", "take", "go", "play", "say", "give"]);
function kidKeyword(prompt, k) {
  if (!prompt.kid || k.includes(" ") || k.length < 3 || KID_STOP.has(k)) return -1;
  const phrases = prompt.answers.filter(a => a.display.includes(" ")).length;
  if (phrases < prompt.answers.length * 0.4) return -1;
  const stems = new Set([k, singular(k)]);
  if (/ing$/.test(k)) { const b = k.slice(0, -3); stems.add(b); stems.add(b + "e"); if (/(.)\1$/.test(b)) stems.add(b.slice(0, -1)); }
  for (let i = 0; i < prompt.answers.length; i++) {
    const words = norm(prompt.answers[i].display).split(" ");
    if (words.some(w => !KID_STOP.has(w) && (stems.has(w) || stems.has(singular(w))))) return i;
  }
  return -1;
}
function matchAnswer(prompt, raw) {
  const k = norm(raw);
  if (!k) return -1;
  if (prompt.index.has(k)) return prompt.index.get(k);
  const s = singular(k);
  if (prompt.index.has(s)) return prompt.index.get(s);
  const loose = looseMatch(prompt, k);
  if (loose >= 0) return loose;
  const kw = kidKeyword(prompt, k);
  if (kw >= 0) return kw;
  // Spelling forgiveness grows with length: 1 typo from 4 letters, 2 from 6, 3 from 13.
  const tight = k.replace(/ /g, "");
  const tolFor = n => n < 4 ? 0 : n < 6 ? 1 : n < 13 ? 2 : 3;
  const tol = tolFor(tight.length);
  if (!tol) return -1;
  let best = -1, bestD = Infinity;
  for (const [key, i] of prompt.index) {
    const kt = key.replace(/ /g, "");
    const allowed = Math.min(tol, tolFor(kt.length));
    if (!allowed) continue;
    let d = lev(tight, kt, allowed);
    if (d > allowed) continue;
    if (tight[0] !== kt[0]) d += 0.5;           // prefer answers that start the same way
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/* ---------- rarity + scoring ---------- */
// Player answers recorded on this device. With an online backend these counts
// would be global, so rarity would follow what real players actually say.
function counts() { return store.get("counts", {}); }
function recordAnswer(promptId, idx) {
  if (idx < 0) return;
  const c = counts(); c[promptId] = c[promptId] || { n: 0, a: {} };
  c[promptId].n++; c[promptId].a[idx] = (c[promptId].a[idx] || 0) + 1;
  store.set("counts", c);
}
function share(prompt, idx, fixed) {
  const base = prompt.answers[idx].base;
  if (fixed) return base;
  const c = counts()[prompt.id];
  if (!c || !c.n) return base;
  return (base * PLAYER_PRIOR + 100 * (c.a[idx] || 0)) / (PLAYER_PRIOR + c.n);
}
function depthFor(sh, prompt) {
  const ZERO_SHARE = prompt.zeroShare, KRILLION_SHARE = prompt.krillShare;
  if (sh >= ZERO_SHARE) return 0;
  if (sh <= KRILLION_SHARE) {
    const t = Math.min(1, Math.log(KRILLION_SHARE / Math.max(sh, 0.02)) / Math.log(KRILLION_SHARE / 0.02) * 3);
    return Math.round(HADAL_DEPTH + t * (MAX_DEPTH - HADAL_DEPTH));
  }
  return Math.round(HADAL_DEPTH * Math.log(ZERO_SHARE / sh) / Math.log(ZERO_SHARE / KRILLION_SHARE));
}
function zoneFor(depth) { let z = ZONES[0]; ZONES.forEach(x => { if (depth >= x.min) z = x; }); return z; }
// How many times you've given each answer (shown as a note; the rarity change
// itself comes from the shared human counts below).
function repeatKey(prompt, idx) { return (prompt.baseId || prompt.id) + ":" + norm(prompt.answers[idx].display); }
function repeatsStoreKey() { const u = me(); return "repeats:" + (u ? u.name.toLowerCase() : "guest"); }
function timesUsed(prompt, idx) { return store.get(repeatsStoreKey(), {})[repeatKey(prompt, idx)] || 0; }
function noteUsed(prompt, idx) {
  if (idx < 0) return;
  const m = store.get(repeatsStoreKey(), {}); const k = repeatKey(prompt, idx);
  m[k] = (m[k] || 0) + 1; store.set(repeatsStoreKey(), m);
}
/* Answers real players give, counted for everyone through the online answer_counts
   table (and on this device as a backup). Each one makes that answer HUMAN_STEP
   more common, so it is worth a little less next time, for every player. */
const HUMAN_STEP = 0.35;
const HC = {};   // base prompt id -> { answer: times given worldwide }
function humanKey(prompt, idx) { return norm(prompt.answers[idx].display).slice(0, 60); }
function humanCount(prompt, idx) {
  const base = prompt.baseId || prompt.id, k = humanKey(prompt, idx);
  const local = store.get("humanCounts", {})[base + ":" + k] || 0;
  return Math.max(local, (HC[base] && HC[base][k]) || 0);
}
async function loadHumanCounts(ids) {
  const bases = [...new Set((ids || []).map(id => (PROMPT_BY_ID[id] || {}).baseId || id))].filter(Boolean);
  if (!bases.length) return;
  try {
    const c = await withTimeout(cloud(), 8000); if (!c) return;
    const { data, error } = await withTimeout(c.from("answer_counts").select("prompt_id,answer,n").in("prompt_id", bases), 8000);
    if (error || !data) return;
    data.forEach(r => { (HC[r.prompt_id] = HC[r.prompt_id] || {})[r.answer] = r.n; });
  } catch (e) {}
}
function bumpHuman(prompt, idx) {
  if (idx < 0) return;
  const base = prompt.baseId || prompt.id, k = humanKey(prompt, idx);
  const m = store.get("humanCounts", {}); m[base + ":" + k] = (m[base + ":" + k] || 0) + 1; store.set("humanCounts", m);
  if (HC[base] && HC[base][k] != null) HC[base][k]++;
  cloud().then(c => c && c.rpc("bump_answer", { p_prompt: base, p_answer: k })).catch(() => {});
}
function repeatsCount() { return S.mode === "solo" || S.mode === "subject" || S.mode === "endless" || S.mode === "bot"; }

/* ---------- Endless Launch ----------
   Prompts never run out, and each prompt hides exactly ONE secret answer that is
   the 1 in Attillion. Everything else tops out just below it. */
// Never repeat a question within the last 15 you played: questions you haven't seen
// lately come first (shuffled), then the ones you saw longest ago.
const NO_REPEAT = 15;
function freshOrder(ids, r, seenList) {
  ids = ids.slice();
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const seen = (seenList || []).map(id => id.split("~")[0]);
  const age = new Map(seen.map((id, i) => [id, i]));   // smaller = longer ago
  return ids.filter(id => !age.has(id)).concat(ids.filter(id => age.has(id)).sort((a, b) => age.get(a) - age.get(b)));
}
function endlessQueue(seed, recent) {
  const ids = modeBases().map(p => p.id);
  return freshOrder(ids, rng(seed), store.get("seenPrompts", []).concat(recent || []));
}
function endlessSecret(prompt) {
  // somewhere in the less-obvious half of the answers people know
  const lo = Math.floor(prompt.familiar * 0.45), hi = Math.max(lo + 1, prompt.familiar);
  const r = rng(hashStr("secret:" + prompt.id + ":" + S.seed + ":" + S.round));
  return Math.min(prompt.answers.length - 1, lo + Math.floor(r() * (hi - lo)));
}
function endlessAdjust(prompt, res) {
  S.secret = endlessSecret(prompt);
  if (!res.valid) return res;
  if (res.idx === S.secret) return Object.assign({}, res, { points: 100, depth: MAX_DEPTH, zone: zoneFor(MAX_DEPTH), secretHit: true });
  const depth = Math.min(res.depth, HADAL_DEPTH - 1);
  return Object.assign({}, res, { points: Math.min(res.points, 95), depth, zone: zoneFor(depth) });
}
// Settings: how many prompts you may skip in one Endless run (-1 = unlimited).
function skipLimit() { const v = store.get("endlessSkips", 3); return v === -1 ? Infinity : v; }
function skipsLeft() { return Math.max(0, skipLimit() - (S.skipsUsed || 0)); }
function endlessSkip() {
  if (S.mode !== "endless" || S.phase !== "answer" || !skipsLeft()) return;
  S.skipsUsed = (S.skipsUsed || 0) + 1;
  S.prompts.splice(S.round, 1);
  if (S.round >= S.prompts.length - 1) S.prompts = S.prompts.concat(endlessQueue(S.seed + S.prompts.length + 7, S.prompts.slice(-NO_REPEAT)));
  beginRound();
}
function endlessStats() { const u = me(); return (u ? u.endless : store.get("guestEndless", null)) || {}; }
function scoreAnswer(prompt, raw, fixed, useRepeats) {
  const idx = matchAnswer(prompt, raw);
  if (idx < 0) return { raw: raw || "", idx: -1, points: 0, depth: 0, share: 0, zone: null, valid: false };
  // every time any real player (you included) gives this answer, it gets slightly more
  // common for everyone. Bots and players are scored the same way, so the same
  // answer is worth the same points whoever gives it.
  const used = useRepeats ? timesUsed(prompt, idx) : 0;
  let sh = share(prompt, idx, fixed);
  const said = useRepeats ? humanCount(prompt, idx) : 0;
  if (said) sh = Math.min(prompt.zeroShare, sh * (1 + HUMAN_STEP * said));
  const depth = depthFor(sh, prompt);
  const points = sh <= prompt.krillShare ? 100 : Math.max(2, Math.min(97, Math.round(100 * depth / HADAL_DEPTH)));
  return applyBest(prompt, { raw, idx, display: prompt.answers[idx].display, points, depth, share: sh, zone: zoneFor(depth), valid: true, used });
}
/* The secret BEST answer: every question hides exactly one, picked from its
   1 in Attillion answers, worth 150 points. Never shown until someone finds it.
   (Endless keeps its own secret instead.) */
const BEST_POINTS = 150;
const BEST_CACHE = {};
function bestDisplay(prompt) {
  const baseId = prompt.baseId || prompt.id;
  if (BEST_CACHE[baseId] !== undefined) return BEST_CACHE[baseId];
  const base = PROMPT_BY_ID[baseId] || prompt;
  const span = Math.max(1, base.familiar - base.krillFrom);
  const idx = Math.min(base.answers.length - 1, base.krillFrom + (hashStr("best:" + baseId) % span));
  return (BEST_CACHE[baseId] = norm(base.answers[idx].display));
}
function applyBest(prompt, res) {
  if (!res.valid || (S && S.mode === "endless") || norm(res.display) !== bestDisplay(prompt)) return res;
  return Object.assign({}, res, { points: BEST_POINTS, best: true, depth: MAX_DEPTH, zone: zoneFor(MAX_DEPTH) });
}
function oneIn(sh) { return sh <= 0 ? "" : "about 1 in " + Math.max(1, Math.round(100 / sh)).toLocaleString(); }

/* ---------- seeded picking ---------- */
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Picks 7 different topics; 2 or 3 of them get a twist ("...with no E in it").
// Topics this player saw recently are skipped when possible.
function pickSet(seed, seenList, cat, n) {
  const seen = new Set(seenList || []);
  const r = rng(seed);
  const catWant = cat === "seasonal" ? "season-" + seasonKey() : cat;
  const ids = modeBases().filter(p => !catWant || p.cats.includes(catWant)).map(p => p.id);
  const bases = freshOrder(ids, r, seenList).slice(0, n || ROUNDS);
  return addTwists(bases, r);
}
function addTwists(bases, r) {
  const twistable = bases.map((id, i) => i).filter(i => VARIANTS[bases[i]].length);
  const want = kidMode() || bigMode() ? 0 : r() < 0.5 ? 2 : 3;
  const twistSlots = new Set();
  while (twistSlots.size < Math.min(want, twistable.length)) twistSlots.add(twistable[Math.floor(r() * twistable.length)]);
  // no two twists of the same kind in one game
  const usedFam = new Set();
  return bases.map((id, i) => {
    if (!twistSlots.has(i)) return id;
    // pick a kind of twist first, so the many "no E / no O" variants don't crowd out the rest
    const fams = [...new Set(VARIANTS[id].map(v => PROMPT_BY_ID[v].fam))].filter(f => !usedFam.has(f));
    if (!fams.length) return id;
    const fam = fams[Math.floor(r() * fams.length)];
    const vs = VARIANTS[id].filter(v => PROMPT_BY_ID[v].fam === fam);
    const pick = vs[Math.floor(r() * vs.length)];
    usedFam.add(PROMPT_BY_ID[pick].fam);
    return pick;
  });
}
function pickPrompts(seed) { return pickSet(seed, []); }
const DAILY_ROTATE_FROM = "2026-11-24";
function dailyPrompts(key) {
  const day = String(key).replace(/^(kids|big)-/, "");
  if (day < DAILY_ROTATE_FROM) return pickPrompts(hashStr("daily:" + key));
  const tier = ageMode(), ids = freshOrder(modeBases().map(p => p.id).sort(), rng(hashStr("daily-order:" + tier)), []);
  const d = Math.round((Date.parse(day + "T12:00:00") - Date.parse(DAILY_ROTATE_FROM + "T12:00:00")) / 864e5);
  const bases = []; for (let i = 0; i < ROUNDS; i++) bases.push(ids[(d * ROUNDS + i) % ids.length]);
  return addTwists(bases, rng(hashStr("daily:" + key)));
}
function markSeen(ids) {
  const baseIds = ids.map(id => id.split("~")[0]);
  const seen = store.get("seenPrompts", []).map(id => id.split("~")[0]).filter(id => !baseIds.includes(id)).concat(baseIds);
  store.set("seenPrompts", seen.slice(-Math.floor(BASES.length * 0.8)));
}
function pickFresh(seed, cat, n) { return pickSet(seed, store.get("seenPrompts", []), cat, n); }
function todayKey(d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dailyKeyNow() { return (kidMode() ? "kids-" : bigMode() ? "big-" : "") + todayKey(); }
function dailyNumber(key) { key = String(key).replace(/^(kids|big)-/, ""); return Math.floor((Date.parse(key + "T12:00:00") - Date.parse("2026-11-21T12:00:00")) / 864e5) + 1; }

/* ---------- accounts + Elo ---------- */
// Local accounts: stored in this browser only. Replace with Supabase auth
// when the online backend is set up.
function users() { return store.get("users", {}); }
function saveUsers(u) { store.set("users", u); }
function unlockedAvatars(u) { return AVATARS.filter(a => isOpen(a, u)); }
function isDevAvatar(markup) { return /av-[rg]?dev"/.test(String(markup)); }
function myAvatarObj() {
  const u = me();
  const id = u ? u.avatar : store.get("guestAvatar", "rocket");
  return unlockedAvatars(u).find(x => x.id === id) || AVATARS[0];
}
function myAvatar() { return avMarkup(myAvatarObj()); }
// event bot matches use the event's theme; wearing an event avatar themes your own 1 in Attillion everywhere
function eventMatch() { return S.mode === "bot" && BOTS[S.level] && BOTS[S.level].event; }
// the two secret avatars bring their own 1 in Attillion animation
const AVATAR_THEMES = {
  perfect: { name: "Perfect Nebula", rgb: "190,140,255", emojis: ["🌌", "✨", "💫", "🌠", "⭐", "🪐"], style: "galaxy" },
  k1000: { name: "Attillion Crown", rgb: "255,200,60", emojis: ["👑", "🪙", "💰", "💎", "✨"], style: "crown" },
  bestans: { name: "Best Answer Diamond", rgb: "120,230,255", emojis: ["💎", "💎", "✨", "💠", "🔷"], style: "diamond" },
  streak7: { name: "Streak Flame", rgb: "255,120,40", emojis: ["🔥", "🔥", "✨", "💥", "☄️"], style: "flame" },
  streak30: { name: "Thirty-Day Sun", rgb: "255,120,40", emojis: ["🔥", "🔥", "✨", "💥", "☄️"], style: "flame" },
  allbadges: { name: "Grand Champion", rgb: "255,205,70", emojis: ["🏆", "🏅", "🎖️", "🥇", "⭐", "🌟"], style: "trophy" }
};
function myTheme() { const a = myAvatarObj(); if (AVATAR_THEMES[a.id]) return AVATAR_THEMES[a.id]; if (eventMatch()) return eventTheme(EVENT); return a.ev ? eventTheme(findEvent(a.ev)) : null; }
function curOppName() {
  return S.mode === "bot" ? BOTS[S.level].name : S.mode === "challenge-guest" ? S.challenge.from : S.mode === "live" && S.live ? S.live.opp.name : null;
}
function oppAvatar() {
  if (S.mode === "bot") return BOTS[S.level].av;
  if (S.mode === "live" && S.live) return avMarkup(avatarById(S.live.opp.av) || AVATARS[0]);
  if (S.mode === "challenge-guest") { const a = S.challenge && avatarById(S.challenge.av); return a ? avMarkup(a) : "🚀"; }
  return "🚀";
}
function me() { const n = store.get("session", null); const u = users(); return n && u[n.toLowerCase()] ? u[n.toLowerCase()] : null; }
async function hashPw(name, pw) {
  const text = "krillion:" + name.toLowerCase() + ":" + pw;
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch (e) { return "h" + hashStr(text).toString(16) + hashStr(text + "!").toString(16); }
}
function nameProblem(name, currentKey) {
  const key = name.toLowerCase();
  if (!/^[A-Za-z0-9_-]{2,20}$/.test(name)) return "Use 2 to 20 letters, numbers, - or _.";
  if (key.startsWith("admin") && key !== OWNER_NAME.toLowerCase()) return "Usernames can't start with “Admin”.";
  if (Object.values(BOTS).some(b => b.name.toLowerCase() === key)) return "That name belongs to a computer opponent.";
  if (key !== currentKey && users()[key]) return "That username is taken.";
  return "";
}
function newUser(name, hash) {
  return { name, hash, elo: START_ELO, peak: START_ELO, games: 0, wins: 0, losses: 0, draws: 0, daily: {}, history: [], created: Date.now() };
}
function updateUser(fn) { const u = me(); if (!u) return null; const all = users(); const rec = all[u.name.toLowerCase()]; fn(rec); rec.updated = Date.now(); saveUsers(all); if (rec.cloud) cloudPush(); return rec; }
function eloDelta(mine, theirs, result, games) {
  const k = games < 10 ? 40 : 24;
  const expected = 1 / (1 + Math.pow(10, (theirs - mine) / 400));
  return Math.round(k * (result - expected));
}
function applyMatchResult(oppName, oppElo, myTotal, oppTotal, kind, matchId, noLoss) {
  const u = me(); if (!u) return null;
  const result = myTotal > oppTotal ? 1 : myTotal < oppTotal ? 0 : 0.5;
  let delta = 0;
  const kid = tierKey();
  updateUser(x => {
    // Little Kid Mode and Big Kid Mode each keep a completely separate rating and record
    const r = kid ? (x[kid] = x[kid] || { elo: START_ELO, peak: START_ELO, games: 0, wins: 0, losses: 0, draws: 0, history: [] }) : x;
    r.history = r.history || [];
    if (matchId && r.history.some(h => h.id === matchId)) return;
    delta = eloDelta(r.elo, oppElo, result, r.games || 0);
    if (noLoss) delta = Math.max(0, delta);   // event bots can only raise your Elo
    r.elo += delta; r.peak = Math.max(r.peak || START_ELO, r.elo); r.games = (r.games || 0) + 1;
    if (result === 1) r.wins = (r.wins || 0) + 1; else if (result === 0) r.losses = (r.losses || 0) + 1; else r.draws = (r.draws || 0) + 1;
    r.history.unshift({ id: matchId || String(Date.now()), when: Date.now(), kind, opp: oppName, oppElo, me: myTotal, them: oppTotal, delta });
    r.history = r.history.slice(0, 50);
    if (kid) x[kid + "Elo"] = r.elo;   // copied up so the kids leaderboard can sort on it
  });
  return { delta, result };
}

/* ---------- computer opponent ---------- */
function botAnswer(level, prompt) {
  const b = BOTS[level];
  if (Math.random() < b.miss) return "";
  const n = prompt.familiar;
  const idx = Math.random() < b.lucky
    ? prompt.krillFrom + Math.floor(Math.random() * (n - prompt.krillFrom))   // a lucky deep dive
    : Math.min(n - 1, Math.floor(b.pick() * (prompt.kid ? KID_KRILL_FROM / KRILLION_FROM : prompt.big ? BIG_KRILL_FROM / KRILLION_FROM : 1) * n));   // kid lists reach 1 in Attillion sooner, so bots aim shallower there
  return prompt.answers[idx].display;
}

/* ---------- challenge codes ---------- */
function b64e(obj) { return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function b64d(s) { s = s.trim().replace(/^.*[#?&](c|r)=/, "").replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return JSON.parse(decodeURIComponent(escape(atob(s)))); }
function canLink() { return /^https?:/.test(location.protocol) && !/claude\.ai|claudeusercontent/.test(location.host); }
function linkFor(kind, code) { return location.origin + location.pathname + "#" + kind + "=" + code; }

/* ---------- state ---------- */
let S = { view: "home" };
let timer = null;
const $app = () => document.getElementById("app");
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function go(view, extra) {
  if (S.view === "queue" && view !== "queue") queueStop();
  if (S.live && view !== "play" && view !== "results") {
    // walking out of a live match counts as a loss
    if (S.view === "play" && !S.live.done) applyMatchResult(S.live.opp.name, S.live.opp.elo, 0, 1, "quick", S.live.name);
    liveStop(S.live);
  }
  clearInterval(timer); if (window.KrillionFX && window.KrillionFX.clear) window.KrillionFX.clear(); S = Object.assign({ view }, extra || {}); render(); window.scrollTo(0, 0); }

/* ---------- extras: power-ups, streaks, badges, rivals, mystery topic, bot talk ---------- */
// a value saved on your account, or on this device when you're a guest
function ugGet(field, def) { const u = me(); const v = u ? u[field] : store.get("guest_" + field, undefined); return v === undefined || v === null ? def : v; }
function ugSet(field, fn, def) {
  const u = me();
  if (u) updateUser(x => { x[field] = fn(x[field] === undefined || x[field] === null ? def : x[field]); });
  else store.set("guest_" + field, fn(store.get("guest_" + field, def)));
}

/* Power-ups: earned by playing, used during a round (not in Quick match, the
   Daily Launch or the Mystery topic, so those stay fair). */
const POWERS = {
  hint:   { ic: "💡", name: "Hint",   what: "Shows the first letter and length of one rare answer" },
  double: { ic: "✌️", name: "Double", what: "This round's points count twice" },
  freeze: { ic: "🧊", name: "Freeze", what: "Adds 10 seconds to the clock" }
};
const START_POWERS = { hint: 2, double: 1, freeze: 2 };
function powers() { return Object.assign({}, START_POWERS, ugGet("powers", {})); }
function addPower(k, n) { ugSet("powers", p => { p = Object.assign({}, START_POWERS, p); p[k] = Math.min(99, Math.max(0, (p[k] || 0) + n)); return p; }, {}); }
function powersAllowed() { return S.mode !== "live" && S.mode !== "daily" && S.mode !== "mystery"; }
function powerBar() {
  if (!powersAllowed() || S.phase !== "answer") return "";
  const have = powers(), used = (S.powerUsed && S.powerUsed[S.round]) || {};
  return `<div class="powers" role="group" aria-label="Power-ups">${Object.entries(POWERS).map(([k, p]) => {
    const off = !have[k] || used[k] || (k === "freeze" && S.deadline === Infinity);
    return `<button type="button" class="power ${used[k] ? "on" : ""}" data-act="power" data-k="${k}" ${off ? "disabled" : ""} title="${esc(p.what)}"><span aria-hidden="true">${p.ic}</span> ${p.name} <b>×${have[k] || 0}</b></button>`;
  }).join("")}</div>${S.hintText ? `<p class="hint-text">💡 ${esc(S.hintText)}</p>` : ""}${S.doubles && S.doubles[S.round] ? `<p class="hint-text">✌️ Double is on: this round counts twice</p>` : ""}`;
}
// Hint: pick an answer that really scores a 1 in Attillion right now in this mode,
// then show it as a fill-in-the-blanks pattern with just enough letters that no
// other answer to the question fits it.
function hintFor(prompt) {
  let pick;
  if (S.mode === "endless") pick = prompt.answers[endlessSecret(prompt)];
  else {
    const fixed = fixedRarity(), rep = repeatsCount(), best = bestDisplay(prompt);
    const good = prompt.answers.filter(a => norm(a.display) !== best && /^[a-z0-9 '\-&.]+$/i.test(a.display) && (() => { try { return scoreAnswer(prompt, a.display, fixed, rep).points >= 100; } catch (e) { return false; } })());
    // point at the secret BEST answer (150 pts) when it fits this question; otherwise a 1 in Attillion
    const bi = matchAnswer(prompt, best);
    pick = bi >= 0 && norm(prompt.answers[bi].display) === best ? prompt.answers[bi] : good[Math.floor(Math.random() * good.length)];
  }
  if (!pick) return "";
  const d = pick.display, chars = [...d];
  const letterIdx = chars.map((c, i) => /[a-z0-9]/i.test(c) ? i : -1).filter(i => i >= 0);
  const shown = new Set([letterIdx[0], letterIdx[letterIdx.length - 1]]);
  const others = prompt.answers.map(a => a.display.toLowerCase()).filter(x => x !== d.toLowerCase() && x.length === d.length);
  const fits = x => chars.every((c, i) => /[a-z0-9]/i.test(c) ? (!shown.has(i) || x[i] === c.toLowerCase()) && /[a-z0-9]/i.test(x[i]) : x[i] === c);
  // reveal more letters (spread out) until the pattern points to just this answer
  const order = letterIdx.slice(1, -1).sort((a, b) => ((a * 7) % 5) - ((b * 7) % 5) || a - b);
  while (others.some(fits) && order.length && shown.size < letterIdx.length - 1) shown.add(order.shift());
  const pattern = chars.map((c, i) => /[a-z0-9]/i.test(c) ? (shown.has(i) ? c.toUpperCase() : "_") : c === " " ? " " : c).join(" ");
  return `Try: ${pattern} (${letterIdx.length} letters)`;
}
function usePower(k) {
  if (!powersAllowed() || S.phase !== "answer" || !POWERS[k]) return;
  S.powerUsed = S.powerUsed || {}; const used = S.powerUsed[S.round] = S.powerUsed[S.round] || {};
  if (used[k] || !powers()[k]) return;
  const prompt = PROMPT_BY_ID[S.prompts[S.round]];
  if (k === "freeze") { if (S.deadline === Infinity) return; S.deadline += 10000; }
  if (k === "double") { S.doubles = S.doubles || {}; S.doubles[S.round] = true; }
  if (k === "hint") { const h = hintFor(prompt); if (!h) return; S.hintText = h; }
  used[k] = true; addPower(k, -1); SFX("pop");
  const inp = document.getElementById("answer"), val = inp ? inp.value : "";
  render();
  const again = document.getElementById("answer"); if (again) { again.value = val; again.focus(); }
}
// one power-up for finishing a game (two for a win against a bot)
function earnPowers(res) {
  if (S.mode === "endless" || S.mode === "mystery") return [];
  const keys = Object.keys(POWERS), got = [];
  const n = S.mode === "daily" ? 2 : S.mode === "bot" && res.my > res.their ? 2 : 1;
  for (let i = 0; i < n; i++) { const k = keys[Math.floor(Math.random() * keys.length)]; addPower(k, 1); got.push(k); }
  return got;
}

/* Daily streaks: days in a row with a Daily Launch played (any level). */
function dailyDays(u) {
  const d = u === undefined ? (me() ? me().daily : store.get("guestDaily", {})) : u ? u.daily : store.get("guestDaily", {});
  return [...new Set(Object.keys(d || {}).map(k => k.replace(/^(kids|big)-/, "")))].sort();
}
// Play streak: any finished game counts for the day (shown as the flame in the top bar)
function playDays() { return [...new Set((ugGet("playDays", []) || []).concat(dailyDays()))].sort(); }
function markPlayed() { const k = todayKey(); ugSet("playDays", l => (l || []).includes(k) ? l : (l || []).concat(k).slice(-400), []); }
function playedToday() { return playDays().includes(todayKey()); }
function playStreak() {
  const days = new Set(playDays()); let k = todayKey();
  if (!days.has(k)) k = dayShift(k, -1);
  let n = 0; while (days.has(k)) { n++; k = dayShift(k, -1); }
  return n;
}
function flameBadge() {
  const lit = playedToday(), n = playStreak();
  const tip = lit ? `${n}-day streak! You played today.` : n ? `${n}-day streak. Finish a game today to keep it going!` : "Finish a game today to start a streak!";
  return `<span class="streak-flame ${lit ? "lit" : "cold"}" title="${tip}" aria-label="${tip}"><span class="sf-fire" aria-hidden="true">🔥</span><b class="sf-n">${n}</b></span>`;
}
function dayShift(key, n) { const t = new Date(key + "T12:00:00"); t.setDate(t.getDate() + n); return todayKey(t); }
function streakNow(u) {
  const days = new Set(dailyDays(u)); let k = todayKey();
  if (!days.has(k)) k = dayShift(k, -1);
  let n = 0; while (days.has(k)) { n++; k = dayShift(k, -1); }
  return n;
}
function streakBest(u) {
  const days = dailyDays(u); let best = 0, run = 0, prev = null;
  days.forEach(k => { run = prev && dayShift(prev, 1) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; });
  return Math.max(best, (u && u.streakBest) || 0);
}

/* Achievements: worked out from what you've already done. */
function allHistory(u) { return u ? (u.history || []).concat((u.kid && u.kid.history) || [], (u.big && u.big.history) || []) : []; }
function beatBot(u, key) { const n = BOTS[key] && BOTS[key].name + " (computer)"; return allHistory(u).some(h => h.opp === n && h.me > h.them); }
const BADGES = [
  { id: "first",   ic: "🌟", name: "First Light",       what: "Find your first 1 in Attillion",        test: u => krillCount(u) >= 1 },
  { id: "k10",     ic: "✨", name: "Stargazer",         what: "Find 10 1 in Attillions",                test: u => krillCount(u) >= 10 },
  { id: "k100",    ic: "🌠", name: "Star Collector",    what: "Find 100 1 in Attillions",               test: u => krillCount(u) >= 100 },
  { id: "best",    ic: "💎", name: "Treasure Hunter",   what: "Find a secret BEST answer",              test: u => bestDone(u) },
  { id: "perfect", ic: "🌌", name: "Flawless",          what: "Every answer in a game a 1 in Attillion", test: u => perfectDone(u) },
  { id: "hole",    ic: "🕳️", name: "Event Horizon",     what: "Beat Black Hole",                        test: u => beatBot(u, "shark") },
  { id: "nova",    ic: "💥", name: "Supernova Slayer",  what: "Beat Supernova",                         test: u => beatBot(u, "nova") },
  { id: "quasar",  ic: "🌠", name: "Brighter Than Bright", what: "Beat Quasar",                          test: u => beatBot(u, "quasar") },
  { id: "friends", ic: "🤝", name: "Good Sport",        what: "Win 10 friend challenges",               test: u => allHistory(u).filter(h => h.kind === "friend" && h.me > h.them).length >= 10 },
  { id: "quick",   ic: "⚡", name: "Quick Draw",        what: "Win 5 Quick matches",                    test: u => allHistory(u).filter(h => h.kind === "quick" && h.me > h.them).length >= 5 },
  { id: "streak7", ic: "🔥", name: "On Fire",           what: "Play the Daily Launch 7 days in a row",  test: u => streakBest(u) >= 7 },
  { id: "subjects", ic: "📚", name: "Know-It-All",      what: "A 1 in Attillion in every subject",      test: u => SUBJECTS.every(x => ((u ? u.krillions : store.get("guestKrillions", [])) || []).some(k => k.mode === x.name + " Launch")) },
  { id: "event",   ic: "🎟️", name: "Event Champion",    what: "Win an event avatar",                    test: u => evPrizes(u).length >= 1 },
  { id: "games",   ic: "🚀", name: "Frequent Flyer",    what: "Play 50 games that count for Elo",       test: u => allHistory(u).length >= 50 },
  { id: "endless", ic: "♾️", name: "Secret Finder",     what: "Find the secret answer in Endless",      test: u => (((u ? u.endless : store.get("guestEndless", null)) || {}).found || 0) >= 1 },
  { id: "mystery", ic: "🔮", name: "Mystery Solver",    what: "Score 90+ on a Mystery topic",           test: u => ((ugGet("mysteryLog", []) || []).some(m => m.points >= 90)) }
];
function badgesEarned(u) { return BADGES.filter(b => { try { return b.test(u); } catch (e) { return false; } }).map(b => b.id); }
// badges you just earned (and marks them as seen)
function newBadges() {
  const earned = badgesEarned(me()), seen = ugGet("badgesSeen", null);
  if (seen === null) { ugSet("badgesSeen", () => earned, []); return []; }   // first time: don't announce old ones
  const fresh = earned.filter(id => !seen.includes(id));
  if (fresh.length) ugSet("badgesSeen", s => [...new Set(s.concat(fresh))], []);
  return fresh.map(id => BADGES.find(b => b.id === id));
}
function badgeWall(u) {
  const got = new Set(badgesEarned(u));
  return `<div class="badge-wall">${BADGES.map(b => `<div class="badge ${got.has(b.id) ? "got" : ""}" title="${esc(b.what)}"><span class="b-ic" aria-hidden="true">${got.has(b.id) ? b.ic : "🔒"}</span><b>${esc(b.name)}</b><small>${esc(b.what)}</small></div>`).join("")}</div>`;
}

/* Rivalries: your record against each real person you've played. */
function rivals(u) {
  const m = {};
  allHistory(u).filter(h => h.kind === "friend" || h.kind === "quick").forEach(h => {
    const r = m[h.opp] = m[h.opp] || { name: h.opp, w: 0, l: 0, d: 0, last: 0 };
    if (h.me > h.them) r.w++; else if (h.me < h.them) r.l++; else r.d++;
    r.last = Math.max(r.last, h.when || 0);
  });
  return Object.values(m).sort((a, b) => (b.w + b.l + b.d) - (a.w + a.l + a.d) || b.last - a.last);
}
function rivalTable(u) {
  const list = rivals(u).slice(0, 12);
  if (!list.length) return `<p class="hint">No rivals yet. Play a friend or a Quick match and your record against each person shows up here.</p>`;
  return `<div class="table-wrap"><table class="breakdown rivals"><thead><tr><th>Rival</th><th>Record</th><th></th></tr></thead><tbody>${list.map(r => {
    const lead = r.w > r.l ? `<span class="up">You lead</span>` : r.w < r.l ? `<span class="down">They lead</span>` : `<span>Even</span>`;
    return `<tr><td>${esc(r.name)}</td><td class="n">${r.w}–${r.l}${r.d ? "–" + r.d : ""}</td><td>${lead}</td></tr>`;
  }).join("")}</tbody></table></div>`;
}

/* Weekly Mystery topic: one surprise question a week, one try, its own board. */
function weekKey(d) { d = d || new Date(); const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return todayKey(t); }
function mysteryTier() { return ageMode(); }
function mysteryPromptId() { const ids = modeBases().map(p => p.id).sort(); return ids[hashStr("mystery:" + mysteryTier() + ":" + weekKey()) % ids.length]; }
function myMystery() { return (ugGet("mysteryLog", []) || []).find(m => m.week === weekKey() && m.tier === mysteryTier()) || null; }
let MYSTERY_BOARD = null, mysteryLoading = false, mysteryTried = 0;
function loadMysteryBoard() {
  if (mysteryLoading || Date.now() - mysteryTried < 30000 || (MYSTERY_BOARD && MYSTERY_BOARD.week === weekKey() && MYSTERY_BOARD.tier === mysteryTier() && Date.now() - MYSTERY_BOARD.at < 30000)) return;
  mysteryLoading = true; mysteryTried = Date.now();
  (async () => {
    let got = false;
    try {
      const c = await cloud(); if (!c) return;
      const r = await withTimeout(c.from("profiles").select("name,avatar,m:data->mysteryNow").eq("data->mysteryNow->>key", weekKey() + ":" + mysteryTier()).limit(200), 8000);
      if (!r.error && r.data) MYSTERY_BOARD = { week: weekKey(), tier: mysteryTier(), at: Date.now(), rows: r.data.map(x => ({ name: x.name, avatar: x.avatar, answer: x.m && x.m.answer, points: (x.m && x.m.points) || 0 })) }, got = true;
    } catch (e) {} finally { mysteryLoading = false; if (got && S.view === "mystery") render(); }
  })();
}
function viewMystery() {
  loadMysteryBoard();
  const pr = PROMPT_BY_ID[mysteryPromptId()], mine = myMystery();
  const local = Object.values(users()).map(u => ((u.mysteryLog || []).find(m => m.week === weekKey() && m.tier === mysteryTier()) || null) && Object.assign({ name: u.name, avatar: u.avatar }, (u.mysteryLog || []).find(m => m.week === weekKey() && m.tier === mysteryTier()))).filter(Boolean);
  const rows = (MYSTERY_BOARD && MYSTERY_BOARD.rows.length ? MYSTERY_BOARD.rows : local).slice().sort((a, b) => b.points - a.points);
  const next = new Date(weekKey() + "T12:00:00"); next.setDate(next.getDate() + 7);
  return `${header()}<button class="link back-link menu-back" data-go="modes">← Back to Play</button>
  <main class="narrow mystery">
    <p class="eyebrow">Mystery topic · week of ${new Date(weekKey() + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
    <h1>🔮 ${mine ? esc(pr.q) : "One secret question"}</h1>
    ${mine ? `<p class="lede small">You answered <b>${esc(mine.answer || "(blank)")}</b> for <b>${mine.points}</b> points. A new mystery topic arrives ${next.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}.</p>`
      : `<p class="lede small">Everyone gets the same surprise question this week, and you get one try. You won't see the question until you start. Find the rarest answer to top this week's board.</p>
         <button class="btn primary" data-act="mystery-play">Reveal the question</button>`}
    <h2>This week's board</h2>
    ${rows.length ? `<div class="table-wrap"><table class="board"><thead><tr><th>#</th><th>Player</th><th>${mine ? "Answer" : ""}</th><th>Points</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${me() && r.name === me().name ? "you" : ""}"><td class="n">${i + 1}</td><td>${esc(r.name)}</td><td>${mine ? esc(r.answer || "–") : "🔒"}</td><td class="n">${r.points}</td></tr>`).join("")}</tbody></table></div>
      ${mine ? "" : `<p class="hint">Answers stay hidden until you've played.</p>`}`
      : `<p class="hint">Nobody has solved this week's mystery yet. ${me() ? "" : `<button class="link" data-go="login">Log in</button> to get on the board.`}</p>`}
  </main>`;
}
function finishMystery() {
  const r = S.scores[0] || { raw: "", points: 0 };
  const entry = { week: weekKey(), tier: mysteryTier(), key: weekKey() + ":" + mysteryTier(), q: PROMPT_BY_ID[S.prompts[0]].q, answer: r.valid ? r.display : r.raw || "", points: r.points, when: Date.now() };
  ugSet("mysteryLog", l => [entry].concat((l || []).filter(m => !(m.week === entry.week && m.tier === entry.tier))).slice(0, 30), []);
  if (me()) updateUser(x => { x.mysteryNow = entry; });
  MYSTERY_BOARD = null; mysteryTried = 0;
  go("mystery");
}

/* What other players said: the most common answers given for this question. */
function saidCounts(prompt) {
  const base = prompt.baseId || prompt.id, counts = {};
  Object.entries(HC[base] || {}).forEach(([k, n]) => { counts[k] = Math.max(counts[k] || 0, n); });
  const local = store.get("humanCounts", {});
  Object.keys(local).forEach(k => { if (k.startsWith(base + ":")) { const a = k.slice(base.length + 1); counts[a] = Math.max(counts[a] || 0, local[k]); } });
  return counts;
}
// how many answers all players have given to this question so far
function answersGiven(prompt) { return Object.values(saidCounts(prompt)).reduce((a, n) => a + n, 0); }
function answerCounter(prompt) {
  const n = answersGiven(prompt);
  return `<p class="ans-counter">🧮 <b>${n.toLocaleString()}</b> ${n === 1 ? "answer" : "answers"} given by players so far</p>`;
}
function topSaid(prompt) {
  const base = prompt.baseId || prompt.id, counts = {};
  Object.entries(HC[base] || {}).forEach(([k, n]) => { counts[k] = Math.max(counts[k] || 0, n); });
  const local = store.get("humanCounts", {});
  Object.keys(local).forEach(k => { if (k.startsWith(base + ":")) { const a = k.slice(base.length + 1); counts[a] = Math.max(counts[a] || 0, local[k]); } });
  return Object.entries(counts).filter(([k]) => norm(k) !== bestDisplay(prompt)).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, n]) => { const i = prompt.index.get(k); return { a: i != null ? prompt.answers[i].display : k, n }; });
}
function topSaidBlock(prompt) {
  const top = topSaid(prompt);
  if (!top.length) return answerCounter(prompt);
  return `<div class="top-said"><p class="ts-h">What players said most</p><ol>${top.map(t => `<li><span>${esc(t.a)}</span><b>${t.n.toLocaleString()}×</b></li>`).join("")}</ol>${answerCounter(prompt)}</div>`;
}

/* Bot personalities: what each bot says when the game ends, or when it finds a 1 in Attillion. */
const BOT_TALK = {
  dust:      { win: ["Wait... I won? I was just floating here.", "Even space dust gets lucky sometimes!"], lose: ["Poof. Back to drifting.", "I'll settle somewhere eventually."], tie: ["We're both stuck in orbit!"], krill: ["Ooh, sparkly!"] },
  minnow:    { win: ["Rock solid answers!", "Didn't see that coming, did you?"], lose: ["Ouch. That's a crater-sized loss.", "I'll tumble back to the asteroid belt."], tie: ["We collided right in the middle!"], krill: ["Direct hit!"] },
  fish:      { win: ["Swung right past you!", "See you in 76 years for a rematch."], lose: ["Burned up on reentry.", "My tail is between my legs."], tie: ["Same orbit, same score."], krill: ["Whoosh! Found one!"] },
  rover:     { win: ["Exploration pays off!", "Found that answer under a rock."], lose: ["Low battery. Need a recharge.", "Stuck in the sand again."], tie: ["Mission status: even."], krill: ["Sample collected!"] },
  barracuda: { win: ["Shine bright!", "Twinkle twinkle, I win."], lose: ["Even stars fade sometimes.", "You outshined me."], tie: ["Two stars, same glow."], krill: ["Twinkle!"] },
  shark:     { win: ["That answer got sucked right in.", "Nothing escapes me."], lose: ["You escaped my pull?!", "Impossible... the event horizon failed."], tie: ["We're caught in each other's gravity."], krill: ["Pulled that one from the void."] },
  nova:      { win: ["BOOM! Too bright for you.", "What an explosive finish!"], lose: ["I... fizzled.", "That was a dud."], tie: ["A double explosion!"], krill: ["KABOOM!"] },
  quasar:    { win: ["The brightest thing in the universe wins again.", "Did you expect anything else?"], lose: ["You outshone a quasar. Respect.", "Recalculating the universe..."], tie: ["Nobody has ever tied me. Until now."], krill: ["Too easy."] }
};
function botTalk(key, kind) {
  const b = BOTS[key]; if (!b) return "";
  const lines = (BOT_TALK[key] || {})[kind] || (b.event ? {
    win: [`More ${EVENT.tokenName} for me!`, `That's how we do it in ${EVENT.name}.`],
    lose: [`Take some ${EVENT.tokenName}. You earned them.`, "Next time I'm coming for you!"],
    tie: ["Evenly matched!"], krill: ["Found a rare one!"] }[kind] : ["Good game!"]);
  return lines[Math.floor(Math.random() * lines.length)];
}
function botBubble(key, kind) { const b = BOTS[key]; return b ? `<div class="bot-talk"><span class="bt-av" aria-hidden="true">${b.av}</span><p><b>${esc(b.name)}:</b> “${esc(botTalk(key, kind))}”</p></div>` : ""; }

// Mid-round chatter: start (round begins), ahead / behind (bot leads or trails), think (halfway), lock (bot locks in), hurry (5 s left)
const BOT_CHAT = {
  dust:      { start: ["Floating in... ready!", "Is it my turn? Okay!", "La la la, drifting along."], ahead: ["Am I winning? Neat!", "Lucky breeze today."], behind: ["You're really good at this.", "I'm just happy to be here."], think: ["Hmm... thinking floaty thoughts.", "Is a cloud an answer?"], lock: ["I typed something!", "Done! I think."], hurry: ["Tick tock, little speck!", "Better hurry!"] },
  minnow:    { start: ["Bring it on!", "I'm a rock. Rocks don't panic.", "Ready to tumble."], ahead: ["Solid lead, solid rock.", "Feeling heavy with points."], behind: ["Chipping away at your lead.", "Not cracked yet!"], think: ["Grinding on this one...", "Rock brain working..."], lock: ["Locked in. Rock solid.", "Boulder answer, done."], hurry: ["Clock's crumbling!", "Five seconds, pebble!"] },
  fish:      { start: ["Here I come, swinging in!", "Round and round we go.", "Comet's coming through!"], ahead: ["Catch my tail if you can!", "Zooming ahead!"], behind: ["Just warming up my tail.", "Slingshotting around the sun..."], think: ["Whoosh... thinking at top speed.", "Hold on, orbiting this one."], lock: ["Locked! Zoom!", "Shot it out of the sky."], hurry: ["You're about to burn up!", "Faster than a comet, go go!"] },
  rover:     { start: ["Mission start. Scanning...", "Wheels down. Let's explore.", "Beep boop, ready."], ahead: ["Data says I'm winning.", "Mission going well."], behind: ["Rerouting to catch up.", "Recalculating path..."], think: ["Scanning the surface...", "Drilling for an answer..."], lock: ["Sample sent to base.", "Answer uploaded. Beep."], hurry: ["Warning: time low!", "Beep beep beep! Hurry!"] },
  barracuda: { start: ["Time to shine!", "Twinkle mode: on.", "Let's light this up."], ahead: ["I'm glowing right now.", "Brightest one here!"], behind: ["Just dimmed a little.", "Watch me flare back."], think: ["Thinking bright thoughts...", "Hmm, so many to choose from."], lock: ["Locked in with a sparkle.", "Twinkle! Done."], hurry: ["Your light's running out!", "Shine faster!"] },
  shark:     { start: ["Come closer...", "Nothing escapes my answers.", "Feel the pull?"], ahead: ["You're slipping toward me.", "Gravity's on my side."], behind: ["I'll pull you back in.", "This won't last."], think: ["Swallowing every idea in sight...", "Pulling answers from the void..."], lock: ["Absorbed. Locked in.", "Into the dark it goes."], hurry: ["Time is collapsing!", "The event horizon is near!"] },
  nova:      { start: ["Three... two... one...", "Ready to blow up the board!", "Charging up!"], ahead: ["Exploding ahead!", "That's a big bang lead."], behind: ["Building pressure...", "Just you wait. Boom's coming."], think: ["Fizzzzz...", "Heating up..."], lock: ["BOOM! Locked in.", "Kaboom, done!"], hurry: ["Fuse is almost out!", "Five seconds to detonation!"] },
  quasar:    { start: ["Try to keep up.", "I've seen every answer in the universe.", "Let's make this quick."], ahead: ["As expected.", "The universe is in order."], behind: ["Interesting. Very interesting.", "Nobody's ever done this to me."], think: ["Calculating the rarest possible...", "Too many good answers. Hmm."], lock: ["Done. Obviously.", "Locked in before you blinked."], hurry: ["Still typing?", "Time's nearly gone, little star."] }
};
function chatLine(kind) {
  const key = S.level, b = BOTS[key]; if (!b) return "";
  const lines = (BOT_CHAT[key] || {})[kind] || ({
    start: ["Let's go!", `Welcome to ${b.event ? EVENT.name : "my orbit"}!`], ahead: ["I'm in front!"], behind: ["I'll catch up!"],
    think: ["Hmm, let me think..."], lock: ["Locked in!"], hurry: ["Hurry up!"] }[kind]);
  let pick = lines[Math.floor(Math.random() * lines.length)];
  if (lines.length > 1 && pick === S.chat) pick = lines[(lines.indexOf(pick) + 1) % lines.length];
  return pick;
}
function setChat(kind) {
  if (S.mode !== "bot" || !BOTS[S.level]) return;
  S.chat = chatLine(kind); S.chatKind = kind;
  const el = document.getElementById("botchat-text");
  if (el) { el.textContent = `“${S.chat}”`; const box = el.closest(".bot-chat"); if (box) { box.classList.remove("pop"); void box.offsetWidth; box.classList.add("pop"); } }
}
function chatBox() {
  if (S.mode !== "bot" || !BOTS[S.level] || !S.chat || store.get("botChat", true) === false) return "";
  const b = BOTS[S.level];
  return `<div class="bot-talk bot-chat"><span class="bt-av" aria-hidden="true">${b.av}</span><p><b>${esc(b.name)}:</b> <span id="botchat-text">“${esc(S.chat)}”</span></p></div>`;
}

/* ---------- match flow ---------- */
function startMatch(opts) {
  // opts: { mode: "bot"|"daily"|"challenge-host"|"challenge-guest", level, seed, prompts, opp }
  const seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 2 ** 31);
  const prompts = opts.prompts || (opts.mode === "endless" ? endlessQueue(seed) : pickFresh(seed, opts.cat, roundsSetting(opts.mode)));
  if (opts.mode !== "endless") markSeen(prompts);
  loadHumanCounts(prompts);
  go("play", {
    mode: opts.mode, level: opts.level, seed, prompts, round: 0,
    mine: [], theirs: opts.theirsRaw ? opts.theirsRaw.slice() : [],
    opp: opts.opp || null, live: opts.live || null, challenge: opts.challenge || null, dailyKey: opts.dailyKey || null, cat: opts.cat || null,
    phase: "answer", rounds: opts.mode === "endless" ? ROUNDS : prompts.length
  });
  beginRound();
}
function fixedRarity() { return S.mode === "mystery" || S.mode === "endless" || S.mode === "live" || S.mode === "daily" || S.mode === "solo" || S.mode === "subject" || S.mode === "challenge-host" || S.mode === "challenge-guest"; }
// Settings switch: Endless and Free Launch can be played with no timer (neither mode changes Elo).
// Settings: timer and number of questions apply to every mode except Quick match
// (the Daily Launch also keeps 7 questions so everyone plays the same set).
function untimedOk() { return S.mode !== "live" && S.mode !== "mystery"; }
function roundsSetting(mode) { const v = store.get("rounds", ROUNDS); return mode === "live" || mode === "daily" ? ROUNDS : v === 10 ? 10 : ROUNDS; }
function isUntimedSetting() { return !!store.get("untimed", false); }
function nRounds() { return (S && S.rounds) || ROUNDS; }
function isUntimed() { return untimedOk() && store.get("untimed", false); }
// Endless and Free Launch can use 15, 25, 30 or 60 seconds; every other mode stays at 30
function roundSecs() { const v = store.get("timerSecs", ROUND_SECONDS); return untimedOk() && [15, 25, 30, 60].includes(v) ? v : ROUND_SECONDS; }
function sayBtnSize() { const v = store.get("sayBtnSize", "m"); return ["off", "s", "m", "l", "xl"].includes(v) ? v : "m"; }
function promptSpoken(pr) { return pr ? (pr.twist ? pr.baseQ + " " + pr.twist : pr.q) : ""; }
function beginRound() {
  S.bestUnlock = false; S.hintText = "";
  if (S.mode === "endless" && S.prompts[S.round]) markSeen([S.prompts[S.round]]);
  S.phase = "answer"; S.deadline = isUntimed() ? Infinity : Date.now() + roundSecs() * 1000; S.draft = "";
  S.botLockAt = S.mode === "bot" ? Date.now() + (2 + Math.random() * Math.min(19, roundSecs() * 0.63)) * 1000 : null;
  S.submittedAt = null; S.lastTick = null; S.chat = ""; S.chatKind = "";
  if (S.mode === "bot" && BOTS[S.level]) {
    const my = total(S.scores || []), their = total(S.oppScores || []);
    S.chat = chatLine(S.round === 0 || Math.abs(my - their) < 15 ? "start" : their > my ? "ahead" : "behind"); S.chatKind = "start";
  }
  if (S.live) { S.live.at = S.round; livePresence(); }
  render();
  const input = document.getElementById("answer"); if (input) input.focus();
  if (window.KrillionSound && window.KrillionSound.prompt) { const pr = PROMPT_BY_ID[S.prompts[S.round]]; window.KrillionSound.prompt(promptSpoken(pr)); }
  clearInterval(timer);
  timer = setInterval(tick, 100);
}
function tick() {
  if (S.view !== "play") { clearInterval(timer); return; }
  const now = Date.now();
  if (S.phase === "answer") {
    if (S.deadline === Infinity) return;
    const left = Math.max(0, S.deadline - now);
    const secs = Math.ceil(left / 1000);
    const t = document.getElementById("clock"); if (t) t.textContent = secs;
    if (secs <= 5 && secs > 0 && secs !== S.lastTick) { S.lastTick = secs; SFX("tick"); }
    const ring = document.getElementById("ring"); if (ring) ring.style.setProperty("--p", (left / (roundSecs() * 1000)).toFixed(3));
    const ol = document.getElementById("opplock");
    if (ol && S.botLockAt) ol.classList.toggle("on", now >= S.botLockAt);
    if (S.mode === "bot" && S.botLockAt) {
      const total_ = roundSecs() * 1000;
      if (now >= S.botLockAt && S.chatKind !== "lock" && S.chatKind !== "hurry") setChat("lock");
      else if (now < S.botLockAt && S.chatKind === "start" && left < total_ * 0.55) setChat("think");
      if (secs <= 5 && S.chatKind !== "hurry") setChat("hurry");
    }
    if (ol && S.live) ol.classList.toggle("on", liveOppAnswered(S.round));
    if (left <= 0) submit(true);
  } else if (S.phase === "waiting" && !S.live) {
    if (now >= S.botLockAt || now >= S.deadline) reveal();
  }
}
function submit(timeUp) {
  if (S.phase !== "answer") return;
  const input = document.getElementById("answer");
  const val = input ? input.value.trim() : (S.draft || "");
  if (!timeUp) {
    const prompt = PROMPT_BY_ID[S.prompts[S.round]];
    let msg = !val ? "Type an answer first." : matchAnswer(prompt, val) < 0 ? `“${val}” isn't on the list for this prompt. Try another.` : "";
    if (msg && val && prompt.twist && matchAnswer(PROMPT_BY_ID[prompt.baseId], val) >= 0) msg = `“${val}” would count normally, but this is a twist round. Your answer has to be ${prompt.twist.replace(/^that /, "one that ").replace(/^with/, "one with")}.`;
    if (msg) {
      const err = document.getElementById("answer-error");
      if (err) err.textContent = msg;
      if (input) { input.classList.remove("nope"); void input.offsetWidth; input.classList.add("nope"); input.select(); }
      SFX("error");
      return;
    }
  }
  S.mine[S.round] = val;
  if (!timeUp) SFX("lock");
  if (S.mode === "bot" && Date.now() < S.botLockAt && !timeUp) { S.phase = "waiting"; render(); return; }
  if (S.live) {
    S.live.ans[S.round] = val; livePresence();
    if (!liveOppAnswered(S.round) && !S.live.gone) { S.phase = "waiting"; render(); return; }
  }
  reveal();
}
function reveal() {
  clearInterval(timer);
  const prompt = PROMPT_BY_ID[S.prompts[S.round]];
  if (S.mode === "bot") S.theirs[S.round] = botAnswer(S.level, prompt);
  if (S.live) S.theirs[S.round] = liveOppAnswer(S.round);
  const fixed = fixedRarity();
  // score both sides before this answer is counted, so a shared answer is worth the same to both
  S.lastMine = scoreAnswer(prompt, S.mine[S.round], fixed, repeatsCount());
  if (S.mode === "endless") S.lastMine = endlessAdjust(prompt, S.lastMine);
  if (S.doubles && S.doubles[S.round] && S.lastMine.valid) S.lastMine = Object.assign({}, S.lastMine, { points: S.lastMine.points * 2, doubled: true });
  S.lastTheirs = (S.mode === "daily" || S.mode === "mystery" || S.mode === "solo" || S.mode === "subject" || S.mode === "endless" || S.mode === "challenge-host") ? null : scoreAnswer(prompt, S.theirs[S.round], fixed, repeatsCount());
  bumpHuman(prompt, S.lastMine.idx);
  if (repeatsCount()) noteUsed(prompt, S.lastMine.idx);
  if (S.mode !== "daily") { recordAnswer(prompt.id, S.lastMine.idx); }
  S.scores = S.scores || []; S.oppScores = S.oppScores || [];
  S.scores[S.round] = S.lastMine; if (S.lastTheirs) S.oppScores[S.round] = S.lastTheirs;
  if (S.lastMine.best && !bestDone(me())) {
    if (me()) updateUser(x => { x.bestFound = true; }); else store.set("guestBest", true);
    S.bestUnlock = true;
  }
  if (S.lastMine.points >= 100) {
    const found = { q: prompt.twist ? prompt.baseQ + " " + prompt.twist : prompt.q, a: S.lastMine.display, depth: S.lastMine.depth, share: S.lastMine.share, best: !!S.lastMine.best, av: myAvatarObj().id, when: Date.now(),
      mode: S.mode === "bot" ? "vs " + BOTS[S.level].name : S.mode === "live" ? "Quick match" : S.mode === "daily" ? "Daily Launch" : S.mode === "solo" ? "Free Launch" : S.mode === "subject" ? subjName() + " Launch" : S.mode === "endless" ? "Endless Launch" : "Friend challenge" };
    const before = krillCount(me());
    const avId = myAvatarObj().id;
    if (me()) updateUser(x => { x.avKrill = x.avKrill || {}; x.avKrill[avId] = (x.avKrill[avId] || 0) + 1; });
    else { const g = store.get("guestAvKrill", {}); g[avId] = (g[avId] || 0) + 1; store.set("guestAvKrill", g); }
    if (me()) updateUser(x => { x.krillions = (x.krillions || []); x.krillTotal = Math.max(x.krillTotal || 0, x.krillions.length) + 1; x.krillions.unshift(found); x.krillions = x.krillions.slice(0, 500); });
    else { const g = store.get("guestKrillions", []); store.set("guestKrillTotal", Math.max(store.get("guestKrillTotal", 0), g.length) + 1); g.unshift(found); store.set("guestKrillions", g.slice(0, 500)); }
    const unlocked = AVATARS.find(a => a.krill && before < a.krill && krillCount(me()) >= a.krill);
    S.unlockNote = unlocked ? unlocked : null;
  } else S.unlockNote = null;
  S.phase = "reveal";
  render();
  const btn = document.getElementById("next"); if (btn) btn.focus();
  playReveal();
}
function playReveal() {
  const FX = window.KrillionFX; if (!FX) return;
  const mineCard = document.querySelector(".ans.mine"), theirCard = document.querySelector(".ans.theirs");
  const oppName = curOppName() || "";
  const hitMine = S.lastMine.points >= 100;
  const dMe = document.querySelector(".diver.me"), dOpp = document.querySelector(".diver.opp");
  requestAnimationFrame(() => requestAnimationFrame(() => { if (dMe) dMe.classList.add("go"); }));
  if (mineCard) {
    FX.countUp(mineCard.querySelector(".pts b"), S.lastMine.points, 900);
    FX.reveal(mineCard, S.lastMine.valid ? S.lastMine.zone.key : null, "you", { devTakeover: ["dev", "rdev", "gdev"].includes(myAvatarObj().id) && !eventMatch() && !S.lastMine.best ? myAvatarObj().id : null, theme: myTheme(), best: !!S.lastMine.best, odds: S.lastMine.share > 0 && !S.lastMine.best ? oneIn(S.lastMine.share).replace("about ", "") : "" });
    SFX(S.lastMine.valid ? S.lastMine.zone.key : "miss");
    FX.countUp(document.getElementById("pod-me"), total(S.scores), 900);
  }
  if (theirCard) {
    const delay = hitMine ? 2900 : 1100;
    setTimeout(() => {
      if (!document.body.contains(theirCard)) return;
      theirCard.classList.remove("pending");
      if (dOpp) { dOpp.classList.remove("pending"); dOpp.classList.add("go"); }
      FX.countUp(theirCard.querySelector(".pts b"), S.lastTheirs.points, 900);
      FX.reveal(theirCard, S.lastTheirs.valid ? S.lastTheirs.zone.key : null, oppName, { theme: eventMatch() ? eventTheme(EVENT) : null, best: !!S.lastTheirs.best, odds: S.lastTheirs.share > 0 && !S.lastTheirs.best ? oneIn(S.lastTheirs.share).replace("about ", "") : "" });
      SFX(S.lastTheirs.valid ? S.lastTheirs.zone.key : "miss", 0.6);
      FX.countUp(document.getElementById("pod-opp"), total(S.oppScores), 900);
      const lead = document.getElementById("lead"); if (lead) lead.textContent = leadText(oppName);
    }, delay);
  }
}
function leadText(oppName) {
  const a = total(S.scores), b = total(S.oppScores);
  return a === b ? "Tied" : a > b ? `You lead by ${a - b}` : `${oppName} leads by ${b - a}`;
}
function nextRound() {
  if (S.live && S.round < ROUNDS - 1) {
    if (S.phase !== "reveal") return;
    // both players move on together
    S.phase = "next-wait"; S.live.at = S.round + 1; livePresence();
    const b = document.getElementById("next");
    if (b) { b.disabled = true; b.textContent = `Waiting for ${S.live.opp.name}…`; }
    liveCheck();
    return;
  }
  if (S.mode === "endless") {
    if (S.round + 1 >= S.prompts.length) S.prompts = S.prompts.concat(endlessQueue(S.seed + S.prompts.length, S.prompts.slice(-NO_REPEAT)));
    S.round++; beginRound(); return;
  }
  if (S.round < nRounds() - 1) { S.round++; beginRound(); }
  else finishMatch();
}
function total(list) { return (list || []).reduce((s, x) => s + (x ? x.points : 0), 0); }
function finishMatch() {
  markPlayed();
  if (S.mode === "mystery") { finishMystery(); return; }
  const my = total(S.scores), their = total(S.oppScores);
  const res = { my, their };
  if (S.mode === "bot") {
    const b = BOTS[S.level];
    res.elo = applyMatchResult(b.name + " (computer)", b.elo, my, their, "computer", null, !!b.event);
    if (b.event) { res.tokens = my > their ? b.win : my === their ? b.draw : b.loss; res.evUnlocked = awardTokens(res.tokens); }
  } else if (S.mode === "live") {
    const L = S.live;
    res.elo = applyMatchResult(L.opp.name, L.opp.elo, my, their, "quick", L.name);
    res.forfeit = L.gone;
    L.done = true; L.at = ROUNDS; livePresence();
    setTimeout(() => liveStop(L), 5000);   // stay a moment so they get our last answer
  } else if (S.mode === "solo") {
    const before = soloStats().best;
    const run = { score: my, when: Date.now() };
    const upd = x => { x.best = Math.max(x.best || 0, my); x.plays = (x.plays || 0) + 1; x.runs = [run].concat(x.runs || []).slice(0, 20); };
    if (me()) updateUser(x => { x.solo = x.solo || {}; upd(x.solo); });
    else { const g = store.get("guestSolo", {}); upd(g); store.set("guestSolo", g); }
    res.newBest = my > before; res.prevBest = before;
  } else if (S.mode === "endless") {
    S.prompts = S.prompts.slice(0, S.scores.length);
    const found = S.scores.filter(x => x && x.secretHit).length;
    const before = endlessStats();
    const upd = x => { x.best = Math.max(x.best || 0, my); x.mostFound = Math.max(x.mostFound || 0, found); x.longest = Math.max(x.longest || 0, S.scores.length); x.plays = (x.plays || 0) + 1; x.found = (x.found || 0) + found; };
    if (me()) updateUser(x => { x.endless = x.endless || {}; upd(x.endless); });
    else { const g = store.get("guestEndless", {}); upd(g); store.set("guestEndless", g); }
    res.newBest = my > (before.best || 0); res.prevBest = before.best || 0; res.found = found; res.rounds = S.scores.length;
  } else if (S.mode === "subject") {
    const before = subjectStats(S.cat).best;
    const run = { score: my, when: Date.now() };
    const upd = x => { x[S.cat] = x[S.cat] || {}; const y = x[S.cat]; y.best = Math.max(y.best || 0, my); y.plays = (y.plays || 0) + 1; y.runs = [run].concat(y.runs || []).slice(0, 20); };
    if (me()) updateUser(x => { x.subjects = x.subjects || {}; upd(x.subjects); });
    else { const g = store.get("guestSubjects", {}); upd(g); store.set("guestSubjects", g); }
    res.newBest = my > before; res.prevBest = before;
  } else if (S.mode === "daily") {
    const entry = { score: my, answers: S.scores.map(s => ({ raw: s.raw, points: s.points, depth: s.depth })), when: Date.now() };
    if (me()) updateUser(x => { if (!x.daily[S.dailyKey]) x.daily[S.dailyKey] = entry; });
    else { const g = store.get("guestDaily", {}); if (!g[S.dailyKey]) g[S.dailyKey] = entry; store.set("guestDaily", g); }
  } else if (S.mode === "challenge-host") {
    const u = me();
    const code = b64e({ v: 1, id: S.challenge.id, seed: S.seed, p: S.prompts, from: u ? u.name : (S.challenge.name || "A friend"), elo: u ? myElo(u) : null, av: myAvatarObj().id, a: S.mine });
    res.code = code;
    const sent = store.get("sentChallenges", {}); sent[S.challenge.id] = { when: Date.now(), my, mine: S.mine, prompts: S.prompts }; store.set("sentChallenges", sent);
  } else if (S.mode === "challenge-guest") {
    const c = S.challenge;
    const u = me();
    if (c.elo != null) res.elo = applyMatchResult(c.from, c.elo, my, their, "friend", c.id);
    res.code = b64e({ v: 1, id: c.id, reply: true, p: S.prompts, av: myAvatarObj().id, from: u ? u.name : "Your friend", elo: u ? myElo(u) - (res.elo ? res.elo.delta : 0) : null, a: S.mine, host: c.a, hostName: c.from });
  }
  res.powersEarned = earnPowers(res);
  ugSet("streakBest", n => Math.max(n || 0, streakBest(me())), 0);
  res.badges = newBadges();
  // every single answer a 1 in Attillion: the secret Perfect Nebula avatar
  if (S.mode !== "endless" && S.scores.length >= ROUNDS && S.scores.every(x => x && x.points >= 100) && !perfectDone(me())) {
    if (me()) updateUser(x => { x.perfect = true; }); else store.set("guestPerfect", true);
    res.perfectUnlocked = true;
  }
  S.result = res;
  S.view = "results";
  render();
  if (res.perfectUnlocked) setTimeout(() => {
    const a = avatarById("perfect"), el = document.querySelector(".perfect-note");
    if (a && el && window.KrillionFX && window.KrillionFX.celebrate) { SFX("hadal"); window.KrillionFX.celebrate(el, a.id, avMarkup(a), a.name, AVATAR_THEMES.perfect); }
  }, 400);
  if (res.evUnlocked) setTimeout(() => {   // the event prize arrives with the event's own animation
    const a = avatarById("ev-" + EVENT.key), el = document.querySelector(".unlock-note");
    if (a && el && window.KrillionFX && window.KrillionFX.celebrate) { SFX("hadal"); window.KrillionFX.celebrate(el, a.id, avMarkup(a), a.name, eventTheme(EVENT)); }
  }, 400);
  const hasOpp = S.mode === "bot" || S.mode === "challenge-guest" || S.mode === "live";
  SFX(!hasOpp ? "win" : my > their ? "win" : my < their ? "lose" : "tie");
}


/* ---------- quick match ----------
 * Uses the shared page's live room (window.claude "room" capability): everyone who
 * has Attillion open right now. Searchers put a card in their presence; every page
 * runs the same pairing (closest Elo, window widening the longer you wait) and two
 * players are matched once each names the other. The match then runs in its own
 * named room, where each player's presence carries their answers round by round.
 * Presence is visible to the room, so a determined player could peek at answers
 * early; the game never shows them before the round ends. */
let roomP = null, Q = null;
function getRoom() {
  if (!roomP) {
    const c = window.claude;
    roomP = (c && typeof c.use === "function" ? Promise.resolve(c.use("room")).catch(() => null) : Promise.resolve(null))
      .then(r => r || supaLobby());
  }
  return roomP;
}

/* On the public website there is no Claude room, so the same lobby/match-room
 * interface runs on Supabase Realtime presence instead (no tables needed).
 * The URL and publishable key are public client values. */
const SUPA_URL = "https://ankwkrxetvwtbtfiawmw.supabase.co";
const SUPA_KEY = "sb_publishable_d09tW8Ydb43XHhELn6JrgA_rUGurvVc";
const SUPA_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
let supaP = null;
function supaClient() {
  if (!supaP) supaP = new Promise((res, rej) => {
    if (window.supabase && window.supabase.createClient) return res(window.supabase.createClient(SUPA_URL, SUPA_KEY));
    const sc = document.createElement("script"); sc.src = SUPA_JS; sc.async = true;
    sc.onload = () => window.supabase && window.supabase.createClient ? res(window.supabase.createClient(SUPA_URL, SUPA_KEY)) : rej(new Error("no supabase"));
    sc.onerror = () => rej(new Error("supabase blocked"));
    document.head.appendChild(sc);
  });
  return supaP;
}
function deviceId() { let d = store.get("deviceId", null); if (!d) { d = Math.random().toString(36).slice(2, 12); store.set("deviceId", d); } return d; }
const TAB_ID = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
function supaRoom(client, name) {
  const self = TAB_ID;   // same id in every room, like the Claude room
  const dev = deviceId();
  const ch = client.channel("attillion-" + name, { config: { presence: { key: self } } });
  let state = { _dev: dev }, joined = false, closed = false;
  const subs = new Set();
  const list = () => Object.entries(ch.presenceState() || {}).map(([key, metas]) => {
    const m = Object.assign({}, metas[metas.length - 1] || {}); delete m.presence_ref;
    return { peer: key, kind: "viewer", sameTab: key === self, isMe: key !== self && m._dev === dev, presence: m };
  });
  const notify = () => { const peers = list(); subs.forEach(s => { try { s.cb({ peers }); } catch (e) {} }); };
  const room = {
    peer: self,
    peers: list,
    presence(obj) { Object.assign(state, obj); return joined && !closed ? ch.track(state) : Promise.resolve(); },
    onPeers(cb, err) { const s = { cb, err }; subs.add(s); setTimeout(() => s.cb({ peers: list() }), 0); return () => subs.delete(s); },
    join(n) { return openSupaRoom(client, n); },
    leave() { closed = true; subs.clear(); return Promise.resolve(ch.untrack()).catch(() => {}).then(() => client.removeChannel(ch)).catch(() => {}); }
  };
  ch.on("presence", { event: "sync" }, notify);
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("timeout")), 10000);
    ch.subscribe(status => {
      if (status === "SUBSCRIBED") { clearTimeout(t); joined = true; ch.track(state).then(() => res(room), () => res(room)); }
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        if (!joined) { clearTimeout(t); rej(new Error(status)); }
        else subs.forEach(s => { try { s.err && s.err(); } catch (e) {} });
      }
    });
  });
}
function openSupaRoom(client, name) { return supaRoom(client, name); }
function supaLobby() { return supaClient().then(c => supaRoom(c, "lobby")).catch(() => null); }

/* ---------- cloud accounts (Supabase) ----------
 * Accounts still live in this browser's storage; when Supabase is reachable they
 * are also saved to the "profiles" table so the same username and password work
 * on any device. Logins use a made-up email built from the username, because
 * Supabase Auth needs an email. Nothing here is secret: the key is public and
 * row-level security only lets a signed-in player change their own row. */
const CLOUD_DOMAIN = "players.attillion.app";
function cloudEmail(name) { return "p" + Array.from(new TextEncoder().encode(name.toLowerCase())).map(b => b.toString(16).padStart(2, "0")).join("") + "@" + CLOUD_DOMAIN; }
function cloudPw(pw) { return "attillion:" + pw; }   // Supabase wants 6+ characters
let cloudP = null;
function cloud() { if (!cloudP) cloudP = supaClient().catch(() => null); return cloudP; }
function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]); }
function authBusy(on) {
  const b = document.querySelector("#auth-form button[type=submit]"); if (!b) return;
  if (on) { b.dataset.label = b.textContent; b.textContent = "Connecting…"; b.disabled = true; }
  else { b.textContent = b.dataset.label || b.textContent; b.disabled = false; }
}
function cloudData(u) { const d = Object.assign({}, u); delete d.hash; delete d.cloud; return d; }
function cloudRow(u, id, email) {
  const t = u.daily && u.daily[todayKey()];
  const row = { name: u.name, elo: u.elo, peak: u.peak, avatar: u.avatar || null, wins: u.wins || 0, losses: u.losses || 0,
    today_key: t ? todayKey() : null, today_score: t ? t.score : null, data: cloudData(u), updated_at: new Date().toISOString() };
  if (id) row.id = id; if (email) row.login_email = email;
  return row;
}
async function cloudUserId(c) { try { const { data } = await c.auth.getSession(); return data && data.session ? data.session.user.id : null; } catch (e) { return null; } }
async function cloudFindName(c, name) {
  const { data, error } = await c.from("profiles").select("id,name,login_email").ilike("name", name.replace(/[_%\\]/g, "\\$&")).limit(1);
  if (error) throw error;
  return data && data[0] ? data[0] : null;
}
// Sign up online. Returns "" on success, an error message, or null if the cloud is unreachable.
async function cloudSignUp(u, pw) {
  const c = await cloud(); if (!c) return null;
  try {
    if (await withTimeout(cloudFindName(c, u.name), 8000)) return "That username is taken.";
    const email = cloudEmail(u.name);
    const { data, error } = await withTimeout(c.auth.signUp({ email, password: cloudPw(pw) }), 10000);
    if (error) return /registered|exists/i.test(error.message) ? "That username is taken." : null;
    if (!data.session) return null;   // email confirmation is still on: stay local
    const ins = await c.from("profiles").insert(cloudRow(u, data.session.user.id, email));
    if (ins.error) { await c.auth.signOut(); return /duplicate|unique/i.test(ins.error.message) ? "That username is taken." : null; }
    return "";
  } catch (e) { return null; }
}
// Log in online. Returns { user } on success, { wrong: true } for a bad password, or null if unreachable / no such account.
async function cloudLogIn(name, pw) {
  const c = await cloud(); if (!c) return null;
  try {
    const found = await withTimeout(cloudFindName(c, name), 8000);
    if (!found) return null;
    const { data, error } = await withTimeout(c.auth.signInWithPassword({ email: found.login_email, password: cloudPw(pw) }), 10000);
    if (error) return /invalid/i.test(error.message) ? { wrong: true } : null;
    const r = await c.from("profiles").select("*").eq("id", data.user.id).single();
    if (r.error || !r.data) return null;
    return { user: Object.assign(newUser(r.data.name, ""), r.data.data || {}, { name: r.data.name, elo: r.data.elo, peak: r.data.peak }) };
  } catch (e) { return null; }
}
let pushTimer = null;
function cloudPush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    const u = me(); if (!u || !u.cloud) return;
    const c = await cloud(); if (!c) return;
    const id = await cloudUserId(c); if (!id) return;
    try { await c.from("profiles").update(cloudRow(u)).eq("id", id); } catch (e) {}
  }, 1500);
}
// On load: pick up progress made on another device.
async function cloudPull() {
  const u = me(); if (!u || !u.cloud) return;
  const c = await cloud(); if (!c) return;
  const id = await cloudUserId(c); if (!id) return;
  try {
    const r = await c.from("profiles").select("*").eq("id", id).single();
    if (r.error || !r.data || r.data.name.toLowerCase() !== u.name.toLowerCase()) return;
    const remote = r.data.data || {};
    if ((remote.updated || 0) <= (u.updated || 0)) { if ((u.updated || 0) > (remote.updated || 0)) cloudPush(); return; }
    const all = users(); const key = u.name.toLowerCase();
    all[key] = Object.assign({}, all[key], remote, { hash: all[key].hash, cloud: true, elo: r.data.elo, peak: r.data.peak });
    saveUsers(all); render();
  } catch (e) {}
}
async function cloudSetPw(pw) { const u = me(); if (!u || !u.cloud) return; const c = await cloud(); if (!c) return; try { await c.auth.updateUser({ password: cloudPw(pw) }); } catch (e) {} }
async function cloudSignOut() { const c = await cloud(); if (c) try { await c.auth.signOut(); } catch (e) {} }
async function cloudBoard() {
  const c = await cloud(); if (!c) return null;
  try {
    const [a, b] = await withTimeout(Promise.all([
      c.from("profiles").select("name,elo,avatar,wins,losses").order("elo", { ascending: false }).limit(100),
      c.from("profiles").select("name,today_score").eq("today_key", todayKey()).order("today_score", { ascending: false }).limit(100)
    ]), 8000);
    if (a.error || b.error) return null;
    let kid = null;
    try {
      const k = await withTimeout(c.from("profiles").select("name,avatar,kid:data->kid").not("data->kidElo", "is", null).order("data->kidElo", { ascending: false, nullsFirst: false }).limit(100), 8000);
      if (!k.error && k.data) kid = k.data.map(r => ({ name: r.name, avatar: r.avatar, elo: (r.kid && r.kid.elo) || START_ELO, wins: (r.kid && r.kid.wins) || 0, losses: (r.kid && r.kid.losses) || 0 }));
    } catch (e) {}
    let big = null;
    try {
      const k = await withTimeout(c.from("profiles").select("name,avatar,big:data->big").not("data->bigElo", "is", null).order("data->bigElo", { ascending: false, nullsFirst: false }).limit(100), 8000);
      if (!k.error && k.data) big = k.data.map(r => ({ name: r.name, avatar: r.avatar, elo: (r.big && r.big.elo) || START_ELO, wins: (r.big && r.big.wins) || 0, losses: (r.big && r.big.losses) || 0 }));
    } catch (e) {}
    return { elo: a.data, daily: b.data, kid, big, at: Date.now() };
  } catch (e) { return null; }
}

function myElo(u) { u = u === undefined ? me() : u; if (!u) return START_ELO; const k = tierKey(); return k ? ((u[k] && u[k].elo) || START_ELO) : u.elo; }
function myCard() { const u = me(); return { name: u ? u.name : "Guest pilot", elo: myElo(u), av: myAvatarObj().id, kid: kidMode(), tier: ageMode() }; }
function cleanCard(p, field) {   // everything in presence is untrusted
  const q = p && p.presence && p.presence[field];
  if (!q || typeof q !== "object") return null;
  const elo = Math.max(100, Math.min(3500, Math.round(+q.elo) || START_ELO));
  const name = String(q.name || "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 20) || "Pilot";
  return { peer: p.peer, name, elo, av: avatarById(String(q.av)) ? String(q.av) : "rocket", t: +q.t || 0, want: typeof q.want === "string" ? q.want : null, kid: !!q.kid, tier: ["little", "big"].includes(q.tier) ? q.tier : q.kid ? "little" : "regular" };
}
function eloWindow(waitMs) { return Math.min(800, 150 + Math.floor(Math.max(0, waitMs) / 5000) * 75); }
function pairUp(list, now) {
  list.sort((a, b) => a.t - b.t || (a.peer < b.peer ? -1 : 1));
  const used = new Set(), pairs = new Map();
  for (const a of list) {
    if (used.has(a.peer)) continue;
    let best = null;
    for (const b of list) {
      if (b === a || used.has(b.peer) || a.tier !== b.tier) continue;
      const d = Math.abs(a.elo - b.elo);
      if (d <= Math.max(eloWindow(now - a.t), eloWindow(now - b.t)) && (!best || d < Math.abs(a.elo - best.elo))) best = b;
    }
    if (best) { used.add(a.peer); used.add(best.peer); pairs.set(a.peer, best); pairs.set(best.peer, a); }
  }
  return pairs;
}
let lobbyPeers = 0;
function onlineText() { return lobbyPeers > 1 ? `${lobbyPeers} players online` : lobbyPeers === 1 ? "Just you online" : ""; }
getRoom().then(room => {
  if (!room) return;
  room.onPeers(ch => {
    lobbyPeers = ch.peers.filter(p => p.kind === "viewer").length;
    const el = document.getElementById("online"); if (el) el.textContent = onlineText();
    if (Q) queueUpdate();
  }, () => {});
});

function queueStart() {
  const me_ = { since: Date.now(), want: null, matched: false, peer: null };
  Q = me_;
  getRoom().then(room => {
    if (Q !== me_) return;
    if (!room) { me_.none = true; queueText(); return; }
    me_.room = room;
    room.presence({ q: Object.assign(myCard(), { t: me_.since, want: null }) }).catch(() => {});
    me_.timer = setInterval(queueUpdate, 1000);
    queueUpdate();
  });
}
function queueStop() {
  if (!Q) return;
  clearInterval(Q.timer);
  if (Q.room && !Q.matched) Q.room.presence({ q: null }).catch(() => {});
  Q = null;
}
function queueUpdate() {
  if (!Q || !Q.room || Q.matched) return;
  const peers = Q.room.peers();
  const mine = peers.find(p => p.sameTab);
  if (!mine) { queueText(); return; }
  Q.peer = mine.peer;
  // other tabs of your own are not opponents
  const list = peers.filter(p => p.kind === "viewer" && !p.sameTab && !p.isMe).map(p => cleanCard(p, "q")).filter(Boolean);
  list.push(Object.assign({ peer: Q.peer, t: Q.since, want: Q.want }, myCard()));
  Q.searching = list.length;
  const partner = pairUp(list, Date.now()).get(Q.peer) || null;
  const want = partner ? partner.peer : null;
  if (want !== Q.want) { Q.want = want; Q.room.presence({ q: Object.assign(myCard(), { t: Q.since, want }) }).catch(() => {}); }
  if (partner && partner.want === Q.peer) { liveJoin(partner); return; }
  queueText();
}
function queueText() {
  const t = document.getElementById("q-text"), h = document.getElementById("q-title"), x = document.getElementById("q-extra");
  if (!t || !Q) return;
  if (Q.none) {
    h.textContent = "Can’t reach the match server";
    t.textContent = "Quick match couldn't connect to other players. Check your internet and try again. The computer and friend challenges still work.";
    if (x) x.hidden = false;
    return;
  }
  const waited = Date.now() - Q.since;
  if (Q.matched) { h.textContent = "Match found!"; t.textContent = "Diving in…"; return; }
  const others = Math.max(0, (Q.searching || 1) - 1);
  t.textContent = `${lobbyPeers || 1} online · ${others} other${others === 1 ? "" : "s"} searching · looking within ±${eloWindow(waited)} Elo · ${Math.floor(waited / 1000)}s`;
  if (x) x.hidden = waited < 30000;
}
function viewQueue() {
  const c = myCard();
  const near = regularBots().reduce((a, b) => Math.abs(b[1].elo - c.elo) < Math.abs(a[1].elo - c.elo) ? b : a);
  setTimeout(() => { if (!Q) queueStart(); queueText(); }, 0);
  return `${header()}<main class="queue">
    <div class="queue-card">
      <div class="sonar" aria-hidden="true"><i></i><i></i><i></i><span class="sonar-av">${myAvatar()}</span></div>
      <h1 id="q-title">Finding a player near ${c.elo}</h1>
      <p id="q-text" class="q-text">Connecting…</p>
      <div class="row center">
        <button class="btn ghost" data-act="quick-cancel">Cancel</button>
      </div>
      <div id="q-extra" class="q-extra" hidden>
        <p>Nobody close yet. You can keep waiting, or play the computer instead.</p>
        <button class="btn primary" data-act="bot" data-level="${near[0]}">Play ${near[1].name} (${near[1].elo})</button>
      </div>
    </div>
  </main>`;
}

async function liveJoin(opp) {
  const q = Q; q.matched = true; clearInterval(q.timer); queueText();
  const lobby = q.room;
  const [a, b] = [q.peer, opp.peer].sort();
  const ta = a === q.peer ? q.since : opp.t, tb = a === q.peer ? opp.t : q.since;
  const seed = hashStr("quick:" + a + "|" + b + "|" + ta + "|" + tb);
  const name = "km-" + seed.toString(36) + "-" + hashStr(b + a + tb).toString(36);
  // keep our lobby card (naming them) up until they arrive, so they see the match too
  let mr = null;
  try { mr = await lobby.join(name); } catch (e) { mr = null; }
  if (Q !== q) { if (mr) mr.leave().catch(() => {}); return; }
  if (!mr) { lobby.presence({ q: null }).catch(() => {}); Q = null; go("queue"); return; }
  const L = { room: mr, name, seed, opp, oppPeer: opp.peer, ans: Array(ROUNDS).fill(null), at: 0, gone: false, goneAt: null, done: false };
  mr.presence({ hi: myCard(), at: 0, ans: L.ans }).catch(() => {});
  // wait for them to arrive in the match room
  const arrived = await new Promise(res => {
    const until = Date.now() + 15000;
    const check = () => {
      if (mr.peers().some(p => p.peer === opp.peer)) return res(true);
      if (Date.now() > until || Q !== q) return res(false);
      setTimeout(check, 250);
    };
    check();
  });
  lobby.presence({ q: null }).catch(() => {});
  if (!arrived || Q !== q) { mr.leave().catch(() => {}); if (Q === q) { Q = null; go("queue"); } return; }
  Q = null;   // the search is over
  L.unsub = mr.onPeers(() => liveCheck(), () => { L.gone = true; liveCheck(); });
  L.poll = setInterval(liveCheck, 500);
  SFX("lock");
  startMatch({ mode: "live", seed, prompts: pickPrompts(seed), live: L });
}
function livePresence() {
  const L = S.live; if (!L || L.stopped) return;
  L.room.presence({ hi: myCard(), at: L.at, ans: L.ans, done: L.done || null }).catch(() => {});
}
function liveOpp() { const L = S.live; return L && !L.stopped ? L.room.peers().find(p => p.peer === L.oppPeer) || null : null; }
function liveOppAnswerRaw(r) { const o = liveOpp(); const a = o && Array.isArray(o.presence.ans) ? o.presence.ans[r] : null; return typeof a === "string" ? a.slice(0, 60) : null; }
function liveOppAnswered(r) { return liveOppAnswerRaw(r) != null; }
function liveOppAnswer(r) { const a = liveOppAnswerRaw(r); return a == null ? "" : a; }
function liveCheck() {
  const L = S.live;
  if (!L || L.stopped || S.view !== "play") return;
  const o = liveOpp();
  if (!o) { if (!L.goneAt) L.goneAt = Date.now(); if (!L.gone && Date.now() - L.goneAt > 8000) { L.gone = true; liveGoneNote(); } }
  else L.goneAt = null;
  const at = o && Number.isFinite(+o.presence.at) ? +o.presence.at : -1;
  if (S.phase === "waiting" && (liveOppAnswered(S.round) || L.gone || Date.now() > S.deadline + 8000)) reveal();
  else if (S.phase === "next-wait" && (at > S.round || L.gone)) { S.round++; beginRound(); }
}
function liveGoneNote() {
  const ol = document.getElementById("opplock");
  if (ol) { ol.classList.remove("on"); ol.textContent = `${S.live.opp.name} left the match. Finish your rounds and the win is yours.`; }
  const w = document.querySelector(".waiting");
  if (S.phase === "waiting" && w) reveal();
}
function liveStop(L) {
  if (!L || L.stopped) return;
  L.stopped = true;
  clearInterval(L.poll);
  if (L.unsub) L.unsub();
  L.room.leave().catch(() => {});
}

function deviceMode() { const v = store.get("device", "auto"); return ["auto", "phone", "ipad", "computer"].includes(v) ? v : "auto"; }
function setDeviceMode(v) { store.set("device", v); applyDeviceMode(); }
function applyDeviceMode() { const v = deviceMode(); if (v === "auto") delete document.documentElement.dataset.device; else document.documentElement.dataset.device = v; }
applyDeviceMode();
// picking an avatar plays the full 1 in Attillion moment with it
function celebrateAvatar(id) {
  const a = avatarById(id); if (!a) return;
  SFX("hadal");
  // launch from the avatar's card if it's on screen, otherwise from the middle of the screen
  const inView = x => { if (!x) return false; const r = x.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
  let el = [document.querySelector(`.avatars .avatar[data-id="${id}"]`), document.querySelector(".avbtn")].find(inView);
  if (!el) {
    el = document.createElement("div");
    el.style.cssText = "position:fixed;left:50%;top:50%;width:1px;height:1px;pointer-events:none";
    document.body.appendChild(el); setTimeout(() => el.remove(), 5000);
  }
  if (window.KrillionFX && window.KrillionFX.celebrate) window.KrillionFX.celebrate(el, a.id, avMarkup(a), a.name, AVATAR_THEMES[a.id] || (a.ev ? eventTheme(findEvent(a.ev)) : null));
}

/* ---------- views ---------- */
function header() {
  const u = me();
  return `<header class="top">
    <button class="brand" data-go="home" aria-label="Attillion home"><span class="mark" aria-hidden="true"></span>Attillion</button>
    <nav>
      <button data-go="leaderboard">Leaderboard</button>
      <button data-go="avatar" class="avbtn" aria-label="Change your avatar" title="Change your avatar">${myAvatar()}</button>
      ${kidMode() ? `<span class="kid-chip">🧸 Kid mode</span>` : bigMode() ? `<span class="kid-chip">🎒 Big kid mode</span>` : ""}${u ? `<button data-go="profile" class="chip">${esc(u.name)} · <b>${myElo(u)}</b></button>` : `<button data-go="login" class="chip">Log in</button>`}
      ${flameBadge()}
    </nav>
  </header>`;
}

function viewHome() {
  const u = me();
  const key = dailyKeyNow();
  const done = u ? u.daily[key] : store.get("guestDaily", {})[key];
  const now = new Date();
  const cal = `<span class="cal"><span class="cal-m">${now.toLocaleString("en-US", { month: "short" })}</span><span class="cal-d">${now.getDate()}</span></span>`;
  const box = (cls, attrs, ic, name, sub, tag) => `<button class="hub-box play-box ${cls}" ${attrs}>${tag ? `<span class="pb-tag">${tag}</span>` : ""}<span class="hub-ic" aria-hidden="true">${ic}</span><span class="hub-name">${name}</span><span class="hub-sub">${sub}</span></button>`;
  return `${header()}${tabsBar("modes")}
  <main class="home">
    <div class="play-grid">
      ${box("pb-quick", `data-act="quick"`, "⚡", "Quick match", "Play a real person near your Elo, right now", `<span id="online">${onlineText()}</span>`)}
      ${done ? box("pb-daily", `data-act="daily-view"`, cal, "Daily Launch", `Done today: ${done.score}. New one at midnight`, (streakNow() ? "🔥 " + streakNow() + " · " : "") + "#" + dailyNumber(key))
             : box("pb-daily", `data-act="daily"`, cal, "Daily Launch", "Same 7 prompts for everyone today", (streakNow() ? "🔥 " + streakNow() + " · " : "") + "#" + dailyNumber(key))}
      ${box("pb-endless", `data-act="endless"`, "♾️", "Endless", "Never-ending prompts, one secret 1 in Attillion each", endlessStats().best ? "Best " + endlessStats().best : "")}
      ${box("pb-solo", `data-act="solo"`, "🎯", "Free Launch", "7 new prompts, beat your high score", soloStats().best ? "Best " + soloStats().best : "")}
      ${kidMode() || bigMode() ? "" : box("pb-subjects", `data-go="subjects"`, "📚", "Subjects", "Sports, movies, history, weather and more", "")}
      ${box("pb-friends", `data-go="friends"`, "🤝", "Play a friend", "Send a challenge or enter a code", "")}
      ${box("pb-mystery", `data-go="mystery"`, "🔮", "Mystery topic", myMystery() ? `You scored ${myMystery().points}. See this week's board` : "One surprise question this week. One try.", "Weekly")}
    </div>
    <details class="how">
      <summary>How scoring works</summary>
    <section class="hero">
      <p class="eyebrow">${roundsSetting("solo")} prompts · ${isUntimedSetting() ? "no timer" : (store.get("timerSecs", 30) === 60 ? "1 minute" : store.get("timerSecs", 30) + " seconds") + " each"} · up to 100 points a round</p>
      <h1>Think of the answer <em>nobody else</em> will.</h1>
      <p class="lede">Every prompt has hundreds of right answers. Common ones barely leave the ground and score almost nothing. Rare ones launch higher. Find one of the truly rare answers, the few that almost nobody thinks of, and you break past the Moon: <strong>1 in Attillion</strong>, a full 100 points.</p>
      ${depthLegend()}
    </section>
    </details>
  </main>`;
}
function playSubView(inner) {
  return `${header()}<button class="link back-link menu-back" data-go="modes">← Back to Play</button>
  <main class="home">
    
    <section class="modes one">
${inner}
    </section>
  </main>`;
}
function viewSubjects() {
  const cols = ["#ff8a4c", "#7aa2ff", "#ffc93c", "#5fe08a", "#a58bff", "#ff5fa2", "#8fd8ff", "#e86bff", "#4cd6ff", "#ffb86b"];
  return `${header()}<button class="link back-link menu-back" data-go="modes">← Back to Play</button>
  <main class="home">
    <div class="play-grid subj-grid">
      ${SUBJECTS.map((x, i) => { const b = subjectStats(x.key).best; return `<button class="hub-box play-box subj-box" data-act="subject" data-cat="${x.key}" style="--hc:${cols[i % cols.length]}"><span class="pb-tag">${b ? "Best " + b : ""}</span><span class="hub-ic" aria-hidden="true">${x.icon}</span><span class="hub-name">${x.name}</span></button>`; }).join("")}
    </div>
  </main>`;
}
function viewFriends() {
  return playSubView(`
      <article class="mode friends">
        <div class="mode-head"><h2>Play a friend</h2></div>
        <p>Play your ${roundsSetting("challenge-host")} rounds, send the challenge, and your friend plays the same prompts. After each round they see what you said. Same answers are allowed.</p>
        <div class="row">
          <button class="btn primary" data-act="challenge-new">Create a challenge</button>
          <button class="btn ghost" data-go="join">Enter a code</button>
        </div>
      </article>
`);
}
function viewBots() {
  const u = me(), have = eventTokens(u);
  return `${header()}${tabsBar("bots")}
  <main class="hub">
    <div class="hub-grid two">
      <button class="hub-box hub-computer" data-go="computer"><span class="hub-ic" aria-hidden="true">🤖</span><span class="hub-name">Play the computer</span><span class="hub-sub">${regularBots().length} opponents from ${regularBots()[0][1].elo} to ${regularBots()[regularBots().length - 1][1].elo} Elo</span></button>
      <button class="hub-box hub-event" data-go="event"><span class="pb-tag">${daysLeft()} day${daysLeft() === 1 ? "" : "s"} left</span><span class="hub-ic" aria-hidden="true">${EVENT.token}</span><span class="hub-name">${esc(EVENT.name)}</span><span class="hub-sub">Event bots · ${have} / ${EVENT_GOAL} ${esc(EVENT.tokenName)}</span></button>
    </div>
  </main>`;
}
const BOT_COLORS = ["#8fd8ff", "#7aa2ff", "#5fe08a", "#ffc93c", "#ff8a4c", "#ff5fa2", "#a58bff", "#e86bff"];
function botBox(k, b, i, extra) {
  return `<button class="hub-box play-box bot-box bot-${k}" data-act="bot" data-level="${k}" style="--hc:${BOT_COLORS[i % BOT_COLORS.length]}"><span class="pb-tag">${b.elo} Elo</span><span class="hub-ic" aria-hidden="true">${b.av || "🤖"}</span><span class="hub-name">${esc(b.name)}</span><span class="hub-sub">${esc(b.blurb)}${extra || ""}</span></button>`;
}
function viewComputer() {
  const u = me();
  return `${header()}<button class="link back-link menu-back" data-go="bots">← Back to Play bots</button>
  <main class="home">
    <div class="play-grid bot-grid">${regularBots().map(([k, b], i) => botBox(k, b, i)).join("")}</div>
    ${u ? "" : `<p class="hint"><button class="link" data-go="login">Log in</button> to save your Elo. Guests can still play.</p>`}
  </main>`;
}
function viewEventBots() {
  const u = me(), have = eventTokens(u), prize = avatarById("ev-" + EVENT.key), got = evPrizes(u).includes(prize.id);
  const pct = Math.min(100, Math.round(have / EVENT_GOAL * 100));
  return `${header()}<button class="link back-link menu-back" data-go="bots">← Back to Play bots</button>
  <main class="home">
    <p class="ev-blurb">You never lose Elo to event bots. Beat them to collect <b>${EVENT.token} ${esc(EVENT.tokenName)}</b>. Collect ${EVENT_GOAL} to unlock the ${avMarkup(prize)} <b>${esc(prize.name)}</b> avatar. ${daysLeft()} day${daysLeft() === 1 ? "" : "s"} left.</p>
    <div class="ev-progress"><div class="ev-bar" style="--p:${pct}%"></div><span>${got ? `Unlocked! ${have} collected` : `${have} / ${EVENT_GOAL}`} ${EVENT.token}</span></div>
    <div class="play-grid ev-grid">${[0, 1, 2].map(i => { const b = BOTS["ev" + i]; return botBox("ev" + i, b, 3 + i * 2, ` Win +${b.win}, lose +${b.loss}.`); }).join("")}</div>
  </main>`;
}
function layoutBar() {
  return `<div class="layout-bar"><span>Layout</span><div class="seg-pick" role="group" aria-label="Screen layout">
    ${[["auto", "✨", "Auto"], ["phone", "📱", "Phone"], ["ipad", "📲", "iPad"], ["computer", "💻", "Computer"]].map(([v, ic, l]) => `<button data-act="device" data-v="${v}" aria-pressed="${deviceMode() === v}"><span aria-hidden="true">${ic}</span>${l}</button>`).join("")}
  </div></div>`;
}
function subjectStats(cat) { const u = me(); const all = (u ? u.subjects : store.get("guestSubjects", {})) || {}; const x = all[cat] || {}; return { best: x.best || 0, plays: x.plays || 0, runs: x.runs || [] }; }
function subjName() { return (SUBJECT_BY_KEY[S.cat] || {}).name || "Subject"; }
function soloStats() { const u = me(); const x = (u ? u.solo : store.get("guestSolo", {})) || {}; return { best: x.best || 0, plays: x.plays || 0, runs: x.runs || [] }; }

function depthLegend() {
  return `<ol class="legend" aria-label="Depth zones">
    ${ZONES.map((z, i) => `<li class="z-${z.key}"><span class="zn">${z.name}</span><span class="zd">${i === ZONES.length - 1 ? "past the Moon" : altText(z.min) + "+"}</span></li>`).join("")}
  </ol>`;
}

function viewPlay() {
  const prompt = PROMPT_BY_ID[S.prompts[S.round]];
  const oppName = curOppName();
  const revealing = S.phase === "reveal";
  const prevMine = total(S.scores) - (revealing && S.lastMine ? S.lastMine.points : 0);
  const prevOpp = total(S.oppScores) - (revealing && S.lastTheirs ? S.lastTheirs.points : 0);
  const pod = (name, list, id, prev, cls, note) => `<div class="pod ${cls}">
      <span class="pod-name">${esc(name)}</span>
      <b class="pod-total" id="${id}" data-from="${prev}">${note ? "?" : prev}</b>
      <div class="pod-rounds" aria-hidden="true">${Array.from({ length: nRounds() }, (_, j) => {
        const i = S.mode === "endless" ? Math.max(0, S.round - ROUNDS + 1) + j : j;
        const r = list && list[i];
        const fresh = revealing && i === S.round;
        return `<span class="seg ${r ? (r.valid ? "z-" + r.zone.key : "miss") : ""} ${fresh ? "fresh" : ""}" style="--h:${r ? Math.max(8, r.points) : 0}%"></span>`;
      }).join("")}</div>
      ${note ? `<span class="pod-note">${note}</span>` : ""}
    </div>`;
  const oppLabel = oppName || (S.mode === "challenge-host" ? "Your friend" : null);
  const scoreLine = `<div class="scoreboard ${oppLabel ? "duo" : "solo"}">
      ${pod("You", S.scores, "pod-me", prevMine, "me")}
      <div class="sb-mid"><span class="sb-round">${S.mode === "endless" ? "Round " + (S.round + 1) : `Round ${S.round + 1}/${nRounds()}`}</span>${oppName ? `<span class="sb-lead" id="lead">${S.round === 0 && !revealing ? "First launch" : leadTextAt(oppName, prevMine, prevOpp)}</span>` : S.mode === "daily" ? `<span class="sb-lead">Daily Launch</span>` : S.mode === "mystery" ? `<span class="sb-lead">🔮 Mystery topic</span>` : S.mode === "solo" ? `<span class="sb-lead">Free Launch</span>` : S.mode === "subject" ? `<span class="sb-lead">${subjName()} Launch</span>` : S.mode === "endless" ? `<span class="sb-lead">Endless · ${S.scores ? S.scores.filter(x => x && x.secretHit).length : 0} 🌟 found</span>` : ""}</div>
      ${oppLabel ? pod(oppLabel, oppName ? S.oppScores : null, "pod-opp", prevOpp, "opp", oppName ? "" : "plays after you") : ""}
    </div>`;
  let body = "";
  if (S.phase === "answer" || S.phase === "waiting") {
    body = `
      <div class="prompt-card">
        <div class="ring ${isUntimed() ? "untimed" : ""}" id="ring" style="--p:1"><span id="clock">${isUntimed() ? "∞" : roundSecs()}</span></div>
        <p class="round-label">${roundLabel()}${prompt.twist ? ` · <span class="twist-warn">twist round, read the rule!</span>` : ""}</p>
        <h2 class="prompt">${promptTitle(prompt)}</h2>
        ${sayBtnSize() !== "off" ? `<button type="button" class="say-btn say-${sayBtnSize()}" data-act="say" aria-label="Hear the question">🔊</button>` : ""}
        ${S.phase === "answer" ? `
        <form id="answer-form" autocomplete="off">
          <label for="answer" class="sr">Your answer</label>
          <input id="answer" maxlength="60" placeholder="Type the rarest answer you can" autocapitalize="off" spellcheck="false">
          <button class="btn primary" type="submit">Lock in</button>
        </form>
        <p class="answer-error" id="answer-error" role="alert"></p>
        ${powerBar()}
        ${chatBox()}
        ${answerCounter(prompt)}
        ${S.mode === "endless" && skipLimit() > 0 ? `<button class="btn ghost small skip-btn" data-act="skip" ${skipsLeft() ? "" : "disabled"}>⏭ Skip this one ${skipLimit() === Infinity ? "" : `(${skipsLeft()} left)`}</button>` : ""}` : `<p class="waiting">Locked in: <b>${esc(S.mine[S.round] || "(blank)")}</b>. Waiting for ${esc(oppName)}…</p>`}
        ${oppName ? `<p class="opp-status" id="opplock">${S.live && S.live.gone ? `${esc(oppName)} left the match. Finish your rounds and the win is yours.` : S.mode === "challenge-guest" ? `${esc(oppName)} already answered. You'll see it at the end of the round.` : `<span class="dot"></span>${esc(oppName)} is thinking`}</p>` : ""}
      </div>`;
  } else {
    body = revealBlock(prompt, oppName);
  }
  return `${header()}<main class="play">
    ${scoreLine}
    ${body}
  </main>`;
}

function roundLabel() { return S.mode === "mystery" ? "🔮 This week's Mystery topic · one try" : S.mode === "endless" ? `Round ${S.round + 1} · Endless` : `Round ${S.round + 1} of ${nRounds()}`; }
function promptTitle(p) { return p.twist ? `${esc(p.baseQ)} <span class="twist"><b class="twist-tag">Twist</b> ${esc(p.twist)}</span>` : esc(p.q); }
// Where an answer's avatar ends up in the sky column (percent from the top).
// Rarer answers climb higher; a miss stays on the launch pad at the bottom.
function diveY(r) {
  if (!r || !r.valid) return 93;
  // each zone is a 20% band, the rarest at the top; stay below the band's label
  const bounds = [0, 200, 1000, 4000, 6000, MAX_DEPTH];
  for (let z = 0; z < 5; z++) {
    if (r.depth <= bounds[z + 1] || z === 4) {
      const f = Math.min(1, (r.depth - bounds[z]) / (bounds[z + 1] - bounds[z]));
      return (4 - z) * 20 + 16 - f * 9;
    }
  }
  return 8;
}
function diveColumn(oppName) {
  const zones = ZONES.slice().reverse().map(z => `<div class="band z-${z.key}"><span>${z.name}</span></div>`).join("");
  // The Developer creature turns gold in the Attillion zone, and spins when tapped.
  const diver = (cls, av, label, r) => { const gold = isDevAvatar(av) && r && r.points >= 100; return `<div class="diver ${cls} ${r && r.valid ? "" : "miss"} ${gold ? "golden" : ""}" style="--y:${diveY(r).toFixed(1)}%" ${gold ? `data-act="spin" title="Tap me"` : ""}><span class="av">${av}</span><span class="tag">${esc(label)}${isDevAvatar(av) ? ` <i class="devtag">DEV</i>` : ""}</span></div>`; };
  return `<div class="dive ${S.lastTheirs ? "duo" : "solo"}" aria-hidden="true">${zones}
    ${diver("me", myAvatar(), "You", S.lastMine)}
    ${S.lastTheirs ? diver("opp pending", oppAvatar(), oppName, S.lastTheirs) : ""}
  </div>`;
}
function leadTextAt(oppName, a, b) { return a === b ? "Tied" : a > b ? `You lead by ${a - b}` : `${esc(oppName)} leads by ${b - a}`; }
function answerCard(label, r, me_) {
  if (!r) return "";
  const depthPct = r.valid ? Math.min(100, (r.depth / MAX_DEPTH) * 100) : 0;
  return `<div class="ans ${me_ ? "mine" : "theirs pending"} ${r.valid ? "z-" + r.zone.key : "invalid"}">
    <p class="who">${esc(label)}</p>
    <p class="said">${r.valid ? esc(r.display) : r.raw ? esc(r.raw) : "<i>no answer</i>"}</p>
    ${r.valid ? `
      ${norm(r.raw) !== norm(r.display) ? `<p class="matched">you typed “${esc(r.raw)}”</p>` : ""}
      <div class="gauge" aria-hidden="true"><span style="--d:${depthPct.toFixed(1)}%"></span></div>
      <p class="pts"><b>0</b> pts</p>
      <p class="meta">${r.zone.name} · ${altText(r.depth)} up · ${oneIn(r.share)}</p>${r.used ? `<p class="hint repeat-note">You've said this ${r.used === 1 ? "once" : r.used + " times"} before, so it is worth slightly less now.</p>` : ""}
      <p class="played">Played like <b>${perfElo(r.points, 1).toLocaleString()}</b></p>
      ${r.best ? `<p class="best-tag">👑 THE BEST ANSWER · +${BEST_POINTS}</p>${me_ && S.bestUnlock ? `<p class="unlock-note">You found a secret BEST answer and unlocked the secret ${avMarkup(avatarById("bestans"))} <b>Best Answer Diamond</b> avatar! <button class="link" data-go="avatar">Use it</button></p>` : ""}` : ""}
      ${r.points >= 100 ? `<p class="what" data-what="${esc(r.display)}" data-hint="${esc(curHint())}" hidden></p>` : ""}`
    : `<p class="pts"><b>0</b> pts</p><p class="meta">${r.raw ? "Not on our list for this prompt" : "Time ran out"}</p><p class="played">Played like <b>${perfElo(0, 1).toLocaleString()}</b></p>`}
  </div>`;
}

function revealBlock(prompt, oppName) {
  const deep = prompt.answers.slice(prompt.krillFrom, prompt.familiar).filter(a => norm(a.display) !== bestDisplay(prompt)).map((a, i) => ({ a, i }));   // never give away the BEST answer
  const r = rng(hashStr(prompt.id + S.seed));
  const samples = []; const pool = deep.slice();
  while (samples.length < 4 && pool.length) samples.push(pool.splice(Math.floor(r() * pool.length), 1)[0].a.display);
  const same = S.lastTheirs && S.lastMine.valid && S.lastTheirs.valid && S.lastMine.idx === S.lastTheirs.idx;
  return `<div class="reveal">
    <p class="round-label">${roundLabel()}</p>
    <h2 class="prompt small">${promptTitle(prompt)}</h2>
    <div class="reveal-grid">
    ${diveColumn(oppName)}
    <div class="answers">
      ${answerCard("You", S.lastMine, true)}
      ${S.lastTheirs ? answerCard(oppName, S.lastTheirs, false) : ""}
    </div>
    </div>
    ${same ? `<p class="same">Same answer. You both score it.</p>` : ""}
    ${S.unlockNote ? `<p class="unlock-note">That's Attillion #${S.unlockNote.krill}! You unlocked the ${avMarkup(S.unlockNote)} <b>${S.unlockNote.name}</b>. <button class="link" data-go="avatar">Use it</button></p>` : ""}
    ${S.mode === "endless" ? (S.lastMine.secretHit ? `<p class="best-note">You found the one secret 1 in Attillion!</p>` : `<p class="trench">The one secret 1 in Attillion was: <b>${esc(prompt.answers[S.secret].display)}</b></p>`) : `<p class="trench">Up among the stars: ${samples.map(esc).join(", ")}</p>`}
    ${topSaidBlock(prompt)}
    ${S.mode === "bot" && S.lastTheirs && S.lastTheirs.points >= 100 ? botBubble(S.level, "krill") : ""}
    ${S.mode === "endless" ? `<div class="row"><button class="btn primary" id="next" data-act="next">Next prompt</button><button class="btn ghost" data-act="endless-stop">Stop here</button></div>`
      : `<button class="btn primary" id="next" data-act="next">${S.round < nRounds() - 1 ? "Next prompt" : "See results"}</button>`}
  </div>`;
}

function viewResults() {
  const res = S.result;
  const oppName = curOppName();
  const verdict = !oppName ? "" : res.my > res.their ? "You win" : res.my < res.their ? `${esc(oppName)} wins` : "It's a tie";
  const rows = S.prompts.map((id, i) => {
    const m = S.scores[i], t = S.oppScores[i];
    return `<tr><td class="q">${esc(PROMPT_BY_ID[id].q)}</td><td>${esc(m.raw || "–")}</td><td class="n">${m.points}</td>${oppName ? `<td>${esc(t ? t.raw || "–" : "–")}</td><td class="n">${t ? t.points : 0}</td>` : ""}</tr>`;
  }).join("");
  let extra = "";
  if (res.elo) {
    const sign = res.elo.delta > 0 ? "+" : "";
    extra += `<p class="elo-change">${kidMode() ? "Kid " : bigMode() ? "Big kid " : ""}Elo ${sign}${res.elo.delta} → <b>${myElo()}</b></p>`;
  } else if (oppName && !me()) {
    extra += `<p class="hint"><button class="link" data-go="login">Log in</button> to have games count toward your Elo.</p>`;
  }
  if (S.mode === "live" && res.forfeit) extra += `<p class="hint">${esc(oppName)} left before the end, so their missing rounds scored 0.</p>`;
  if (S.mode === "bot") extra += botBubble(S.level, res.my > res.their ? "lose" : res.my < res.their ? "win" : "tie");
  if (res.powersEarned && res.powersEarned.length) extra += `<p class="best-note power-note">🎁 Power-up${res.powersEarned.length > 1 ? "s" : ""} earned: ${res.powersEarned.map(k => POWERS[k].ic + " " + POWERS[k].name).join(", ")}</p>`;
  if (res.badges && res.badges.length && badgesEarned(me()).length >= BADGES.length) extra += `<p class="unlock-note badge-note grand-note">🏆 You earned every badge! <b>Grand Champion</b> avatar unlocked.</p>`;
  if (res.badges && res.badges.length) extra += res.badges.map(b => `<p class="unlock-note badge-note">New badge: <b>${b.ic} ${esc(b.name)}</b> · ${esc(b.what)}</p>`).join("");
  if (S.mode === "daily") { const st = streakNow(); if (st > 1) extra += `<p class="best-note">🔥 ${st}-day streak! Come back tomorrow to keep it going.</p>`; }
  if (res.perfectUnlocked) extra += `<p class="unlock-note perfect-note">PERFECT GAME! Every answer was a 1 in Attillion. You unlocked the secret ${avMarkup(avatarById("perfect"))} <b>Perfect Nebula</b> avatar! <button class="link" data-go="avatar">Use it</button></p>`;
  if (res.tokens) {
    const prize = avatarById("ev-" + EVENT.key);
    extra += `<p class="best-note ev-note">+${res.tokens} ${EVENT.token} ${esc(EVENT.tokenName)} · ${eventTokens(me())} / ${EVENT_GOAL}</p>`;
    if (res.evUnlocked) extra += `<p class="unlock-note">You collected ${EVENT_GOAL} ${EVENT.token} and unlocked the ${avMarkup(prize)} <b>${esc(prize.name)}</b>! <button class="link" data-go="avatar">Use it</button></p>`;
  }
  if (S.mode === "solo") {
    const st = soloStats();
    extra += res.newBest && res.prevBest > 0 ? `<p class="best-note">New personal best! Up from ${res.prevBest}.</p>`
      : res.newBest ? `<p class="best-note">Your first Free Launch score. Now beat it.</p>`
      : `<p class="hint">Your best Free Launch: <b>${st.best}</b> · ${st.plays} launch${st.plays === 1 ? "" : "es"} so far</p>`;
  }
  if (S.mode === "endless") {
    const st = endlessStats();
    extra += `<p class="best-note">${res.rounds} prompt${res.rounds === 1 ? "" : "s"} played · ${res.found} secret 1 in Attillion${res.found === 1 ? "" : "s"} found</p>`;
    extra += res.newBest && res.prevBest > 0 ? `<p class="best-note">New Endless best! Up from ${res.prevBest}.</p>`
      : `<p class="hint">Best Endless score: <b>${st.best || 0}</b> · most secrets in one run: <b>${st.mostFound || 0}</b> · longest run: <b>${st.longest || 0}</b> prompts</p>`;
  }
  if (S.mode === "subject") {
    const st = subjectStats(S.cat);
    extra += res.newBest && res.prevBest > 0 ? `<p class="best-note">New ${subjName()} best! Up from ${res.prevBest}.</p>`
      : res.newBest ? `<p class="best-note">Your first ${subjName()} Launch score. Now beat it.</p>`
      : `<p class="hint">Your best ${subjName()} Launch: <b>${st.best}</b> · ${st.plays} launch${st.plays === 1 ? "" : "es"} so far</p>`;
  }
  if (S.mode === "daily") {
    extra += `<div class="share"><pre id="share-text">${esc(dailyShare(S.dailyKey, S.scores))}</pre><button class="btn ghost" data-act="copy" data-target="share-text">Copy result</button></div>`;
  }
  if (S.mode === "challenge-host") {
    extra += codeBox("Send this to your friend", res.code, "c",
      `They'll play the same ${nRounds()} prompts and see your answer after each round. When they finish, they'll get a reply code. Paste it under Enter a code to see who won.`);
  }
  if (S.mode === "challenge-guest") {
    extra += codeBox(`Send this back to ${esc(S.challenge.from)}`, res.code, "r", "Their game updates when they paste it under Enter a code.");
  }
  return `${header()}<main class="results">
    <p class="eyebrow">${S.mode === "live" ? "Quick match" : S.mode === "endless" ? "Endless Launch" : S.mode === "solo" ? "Free Launch" : S.mode === "subject" ? subjName() + " Launch" : S.mode === "daily" ? "Daily Launch #" + dailyNumber(S.dailyKey) : S.mode === "bot" ? "vs " + BOTS[S.level].name : S.mode === "challenge-host" ? "Challenge created" : "Challenge from " + esc(S.challenge.from)}</p>
    <h1>${verdict || `You scored ${res.my}`}</h1>
    <div class="totals">
      <div><span>${myAvatar()} You</span><b>${res.my}</b><em>played like ${perfElo(res.my, S.mode === "endless" ? Math.max(1, res.rounds) : nRounds()).toLocaleString()}</em></div>
      ${oppName ? `<div><span>${oppAvatar()} ${esc(oppName)}</span><b>${res.their}</b><em>played like ${perfElo(res.their, nRounds()).toLocaleString()}</em></div>` : ""}
      <div class="of">out of ${(S.mode === "endless" ? res.rounds : nRounds()) * 100}</div>
    </div>
    ${extra}
    <div class="table-wrap"><table class="breakdown"><thead><tr><th>Prompt</th><th>You</th><th>Pts</th>${oppName ? `<th>${esc(oppName)}</th><th>Pts</th>` : ""}</tr></thead><tbody>${rows}</tbody></table></div>
    <div class="row">
      ${S.mode === "live" ? `<button class="btn primary" data-act="quick">Find another match</button>` : ""}
      ${S.mode === "solo" ? `<button class="btn primary" data-act="solo">Launch again</button>` : ""}
      ${S.mode === "endless" ? `<button class="btn primary" data-act="endless">Start a new endless run</button>` : ""}
      ${S.mode === "subject" ? `<button class="btn primary" data-act="subject" data-cat="${S.cat}">Play ${subjName()} again</button>` : ""}
      ${S.mode === "bot" ? `<button class="btn primary" data-act="bot" data-level="${S.level}">Rematch ${BOTS[S.level].name}</button>` : ""}
      <button class="btn ghost" data-go="${S.mode === "bot" ? (BOTS[S.level].event ? "event" : "computer") : "modes"}">Back to Earth</button>
    </div>
  </main>`;
}

function codeBox(title, code, kind, note) {
  const link = canLink() ? linkFor(kind, code) : null;
  return `<div class="codebox">
    <h3>${title}</h3>
    ${link ? `<label for="share-link">Link</label><textarea id="share-link" readonly rows="2">${esc(link)}</textarea><button class="btn primary" data-act="copy" data-target="share-link">Copy link</button>` : ""}
    <label for="share-code">Code</label><textarea id="share-code" readonly rows="3">${esc(code)}</textarea>
    <button class="btn ${link ? "ghost" : "primary"}" data-act="copy" data-target="share-code">Copy code</button>
    <p class="hint">${note}</p>
  </div>`;
}

function dailyShare(key, scores) {
  const blocks = scores.map(s => !s.valid ? "⬛" : s.best ? "👑" : s.points >= 100 ? "🌟" : s.depth >= 4000 ? "🟪" : s.depth >= 1000 ? "🟦" : s.depth >= 200 ? "🟩" : "⬜").join("");
  const krill = scores.filter(s => s.points >= 100).length;
  return `Attillion Daily Launch #${dailyNumber(key)}\n${blocks}\n${total(scores)}/700${krill ? ` · ${krill}× 1 in Attillion` : ""}`;
}

function viewDailyDone() {
  const key = dailyKeyNow();
  const u = me();
  const done = u ? u.daily[key] : store.get("guestDaily", {})[key];
  const prompts = dailyPrompts(key);
  const scores = done.answers.map((a, i) => scoreAnswer(PROMPT_BY_ID[prompts[i]], a.raw, true));
  return `${header()}<main class="results">
    <p class="eyebrow">Daily Launch #${dailyNumber(key)}</p>
    <h1>You scored ${done.score}</h1>
    <div class="share"><pre id="share-text">${esc(dailyShare(key, scores))}</pre><button class="btn ghost" data-act="copy" data-target="share-text">Copy result</button></div>
    <div class="table-wrap"><table class="breakdown"><thead><tr><th>Prompt</th><th>You</th><th>Depth</th><th>Pts</th></tr></thead><tbody>
    ${prompts.map((id, i) => `<tr><td class="q">${esc(PROMPT_BY_ID[id].q)}</td><td>${esc(scores[i].raw || "–")}</td><td class="n">${altText(scores[i].depth)}</td><td class="n">${scores[i].points}</td></tr>`).join("")}
    </tbody></table></div>
    <button class="btn ghost" data-go="modes">Back to Earth</button>
  </main>`;
}

function viewLogin() {
  const mode = S.mode || "login";
  if (mode === "reset") return `${header()}<main class="narrow">
    <h1>Forgot your password?</h1>
    <p class="lede small">Accounts are saved in this browser, so you can set a new password for any account made here.</p>
    <form id="reset-form" class="stack" autocomplete="off">
      <label for="reset-name">Username</label>
      <input id="reset-name" required minlength="2" maxlength="20" autocomplete="username" value="${esc(S.resetName || "")}">
      <label for="reset-pw">New password</label>
      <span class="pw-wrap"><input id="reset-pw" type="password" required minlength="4" autocomplete="new-password"><button type="button" class="pw-eye" data-act="pw-eye" data-for="reset-pw" aria-label="Show password" aria-pressed="false">👁</button></span>
      <label for="reset-pw2">Type it again</label>
      <span class="pw-wrap"><input id="reset-pw2" type="password" required minlength="4" autocomplete="new-password"><button type="button" class="pw-eye" data-act="pw-eye" data-for="reset-pw2" aria-label="Show password" aria-pressed="false">👁</button></span>
      <p class="error" role="alert">${esc(S.error || "")}</p>
      <button class="btn primary" type="submit">Set new password and log in</button>
    </form>
    <p class="hint"><button class="link" data-act="auth-mode" data-m="login">Back to log in</button></p>
  </main>`;
  return `${header()}<main class="narrow">
    <h1>${mode === "login" ? "Log in" : "Create an account"}</h1>
    <p class="lede small">Your Elo, match history and Daily Launch scores are saved to your account.</p>
    <form id="auth-form" class="stack" autocomplete="on">
      <label for="auth-name">Username</label>
      <input id="auth-name" name="username" required minlength="2" maxlength="20" pattern="[A-Za-z0-9_\\-]+" autocomplete="username">
      <label for="auth-pw">Password</label>
      <span class="pw-wrap"><input id="auth-pw" name="password" type="password" required minlength="4" autocomplete="${mode === "login" ? "current-password" : "new-password"}"><button type="button" class="pw-eye" data-act="pw-eye" data-for="auth-pw" aria-label="Show password" aria-pressed="false">👁</button></span>
      <p class="error" id="auth-error" role="alert">${esc(S.error || "")}</p>
      <button class="btn primary" type="submit">${mode === "login" ? "Log in" : "Create account"}</button>
    </form>
    ${mode === "login" ? `<p class="hint"><button class="link" data-act="auth-mode" data-m="reset">Forgot your password?</button></p>` : ""}
    <p class="hint">${mode === "login" ? `New here? <button class="link" data-act="auth-mode" data-m="signup">Create an account</button>` : `Have an account? <button class="link" data-act="auth-mode" data-m="login">Log in</button>`}</p>
    <p class="note">Preview build: accounts are saved in this browser only. Online accounts arrive when the game is connected to a server.</p>
  </main>`;
}

// your saved 1 in Attillions, with sorting, a game-mode filter and a search box
const KSORTS = [["new", "Newest"], ["old", "Oldest"], ["rare", "Rarest"], ["common", "Least rare"], ["az", "A to Z"], ["za", "Z to A"], ["q", "By question"], ["mode", "By game mode"]];
function rarityOf(k) { return k.share > 0 ? k.share : 1 / Math.max(1, Math.pow(10, (k.depth || 0) / 1000)); }
function krillWall(list) {
  const sort = KSORTS.some(x => x[0] === store.get("krillSort")) ? store.get("krillSort") : "new";
  const modes = [...new Set(list.map(k => k.mode))].sort();
  const mf = modes.includes(store.get("krillMode")) ? store.get("krillMode") : "";
  const cmp = {
    new: (a, b) => b.when - a.when, old: (a, b) => a.when - b.when,
    rare: (a, b) => rarityOf(a) - rarityOf(b), common: (a, b) => rarityOf(b) - rarityOf(a),
    az: (a, b) => a.a.localeCompare(b.a), za: (a, b) => b.a.localeCompare(a.a),
    q: (a, b) => a.q.localeCompare(b.q) || b.when - a.when, mode: (a, b) => a.mode.localeCompare(b.mode) || b.when - a.when
  }[sort];
  const shown = list.filter(k => !mf || k.mode === mf).slice().sort(cmp);
  return `<div class="krill-tools">
      <div class="ks-chips" role="group" aria-label="Sort by">${KSORTS.map(([k, n]) => `<button class="ks-chip ${k === sort ? "on" : ""}" data-act="ksort" data-k="${k}" aria-pressed="${k === sort}">${n}</button>`).join("")}</div>
      <div class="ks-row">
        <select id="krill-mode" aria-label="Game mode"><option value="">All game modes (${list.length})</option>${modes.map(m => `<option value="${esc(m)}" ${m === mf ? "selected" : ""}>${esc(m)} (${list.filter(k => k.mode === m).length})</option>`).join("")}</select>
        <input id="krill-search" type="search" placeholder="Search answers or questions" autocomplete="off">
      </div>
    </div>
    <div class="krill-wall">${shown.map(k => `
      <div class="krill-card" data-s="${esc((k.a + " " + k.q).toLowerCase())}">
        <p class="kc-a">${esc(k.a)}${k.best ? ` <span class="kc-best">👑 BEST</span>` : ""}</p>
        ${k.share > 0 ? `<p class="kc-odds">1 in ${Math.max(1, Math.round(100 / k.share)).toLocaleString()}</p>` : ""}
        <p class="kc-q">${esc(k.q)}</p>
        <p class="what small" data-what="${esc(k.a)}" data-hint="${esc(topicHint(k.q))}" hidden></p>
        <p class="kc-m">${new Date(k.when).toLocaleDateString(undefined, { month: "short", day: "numeric", year: new Date(k.when).getFullYear() === new Date().getFullYear() ? undefined : "numeric" })} · ${esc(k.mode)} · ${altText(k.depth)}</p>
      </div>`).join("")}</div>
    <p class="hint" id="krill-none" hidden>No 1 in Attillions match that search.</p>`;
}

function viewProfile() {
  const u = me(); if (!u) return viewLogin();
  const dailies = Object.entries(u.daily).sort((a, b) => b[0].localeCompare(a[0]));
  return `${header()}<main class="narrow">
    <p class="eyebrow">Pilot profile</p>
    <h1>${esc(u.name)}</h1>
    <div class="stats">
      <div><span>Elo</span><b>${u.elo}</b></div>
      ${u.big ? `<div><span>🎒 Big kid Elo</span><b>${u.big.elo}</b></div>` : ""}
      ${u.kid ? `<div><span>🧸 Kid Elo</span><b>${u.kid.elo}</b></div>` : ""}
      <div><span>Peak</span><b>${u.peak}</b></div>
      <div><span>Record</span><b>${u.wins}–${u.losses}${u.draws ? "–" + u.draws : ""}</b></div>
      <div><span>Best free launch</span><b>${(u.solo && u.solo.best) || "–"}</b></div>
      ${SUBJECTS.map(x => `<div><span>Best ${x.name.toLowerCase()}</span><b>${(u.subjects && u.subjects[x.key] && u.subjects[x.key].best) || "–"}</b></div>`).join("")}
      <div><span>Best daily</span><b>${dailies.length ? Math.max(...dailies.map(d => d[1].score)) : "–"}</b></div>
      <div class="gold"><span>Attillions</span><b>${krillCount(u)}</b></div>
      <div><span>🔥 Daily streak</span><b>${streakNow(u)}</b></div>
      <div><span>Best streak</span><b>${streakBest(u)}</b></div>
      <div><span>Power-ups</span><b class="pw-count">${Object.entries(POWERS).map(([k, p]) => p.ic + powers()[k]).join(" ")}</b></div>
    </div>
    <h2>Your 1 in Attillions</h2>
    ${(u.krillions || []).length ? krillWall(u.krillions) : `<p class="hint">None yet. Find an answer almost nobody would say and it will be saved here.</p>`}
    <h2>Badges <small class="sub">${badgesEarned(u).length} of ${BADGES.length}</small></h2>
    ${badgeWall(u)}
    <h2>Rivals</h2>
    ${rivalTable(u)}
    <h2>Recent matches</h2>
    ${u.history.length ? `<div class="table-wrap"><table class="breakdown"><thead><tr><th>Opponent</th><th>Score</th><th>Elo</th></tr></thead><tbody>
      ${u.history.slice(0, 15).map(h => `<tr><td>${esc(h.opp)}</td><td class="n">${h.me}–${h.them}</td><td class="n ${h.delta >= 0 ? "up" : "down"}">${h.delta >= 0 ? "+" : ""}${h.delta}</td></tr>`).join("")}
    </tbody></table></div>` : `<p class="hint">No matches yet. Try Minnow to warm up.</p>`}
    <h2>Daily Launches</h2>
    ${dailies.length ? `<ul class="dives">${dailies.slice(0, 10).map(([k, d]) => `<li><span>#${dailyNumber(k)} · ${k}</span><b>${d.score}</b></li>`).join("")}</ul>` : `<p class="hint">You haven't dived yet today.</p>`}
    <div class="row"><button class="btn ghost" data-go="settings">Settings</button><button class="btn ghost" data-act="logout">Log out</button></div>
  </main>`;
}

const SECTIONS = [["modes", "🚀", "Play", "Quick match, daily, endless, free, subjects and friends"], ["bots", "🤖", "Play bots", "The computer and this event's bots"], ["avatar", "👩‍🚀", "Avatar", "Pick your avatar and enter codes"], ["settings", "⚙️", "Settings", "Timer, screen, sound and account"]];
// Inside a section: a way back to the main menu, plus quick hops to the other three.
function tabsBar(active) {
  return `<button class="link back-link menu-back" data-go="home">← Menu</button>`;
}
// The main menu: four big boxes that fill the screen.
function viewHub() {
  return `${header()}<main class="hub">
    <div class="hub-grid">
      ${SECTIONS.map(([v, ic, l, sub]) => `<button class="hub-box hub-${v}" data-go="${v}"><span class="hub-ic" aria-hidden="true">${v === "avatar" ? avMarkup(myAvatarObj()) : ic}</span><span class="hub-name">${l}</span><span class="hub-sub">${sub}</span></button>`).join("")}
    </div>
  </main>`;
}
function viewAvatar() {
  const u = me();
  const peak = u ? u.peak : 0;
  const current = myAvatarObj().e + myAvatarObj().id;
  return `${header()}${tabsBar("avatar")}<main class="narrow">
    <p class="eyebrow">Avatar</p>
    <h1>Your avatar</h1>
    <p class="lede small">This is you on the launch tower. Rarer answers send it higher. New avatars unlock as your best Elo climbs.${u ? ` Your best so far is <b>${peak}</b>.` : ""}</p>
    ${u ? "" : `<p class="hint"><button class="link" data-go="login">Log in</button> to earn Elo and unlock more avatars.</p>`}
    <div class="av-search"><input id="av-search" type="search" placeholder="🔍 Search avatars" autocomplete="off" aria-label="Search avatars"></div>
    <p class="av-swipe-hint">Swipe to see every avatar · tap one to learn how to get it</p>
    <p class="hint av-none" id="av-none" hidden>No avatars match that search.</p>
    <div class="avatars">
      ${AVATARS.filter(a => a.ev ? (isOpen(a, u) || a.ev === EVENT.key) : ((!a.code && !a.perfect && !a.bestAv) || isOpen(a, u))).map(a => {
        const open = isOpen(a, u);
        const sel = a.e + a.id === current;
        const tip = (avDesc(a) ? avDesc(a) + " " : "") + avHow(a, open);
        return `<button class="avatar ${sel ? "on" : ""} ${open ? "" : "locked"}" data-act="avinfo" data-id="${a.id}" aria-pressed="${sel}" data-tip="${esc(tip)}" data-search="${esc((a.name + " " + tip + " " + avLock(a) + (a.ev ? " event" : "") + (a.code || a.perfect || a.bestAv ? " secret" : "")).toLowerCase())}">
          ${open ? `<span class="av-stars" title="1 in Attillions found wearing this avatar">⭐ ${(avKrill(u)[a.id] || 0).toLocaleString()}</span>` : ""}
          <span class="ae">${avMarkup(a)}</span><span class="an">${a.name}${a.dev ? ` <i class="devtag">DEV</i>` : a.code || a.perfect || a.bestAv ? ` <i class="secrettag">secret</i>` : ""}</span>
          ${a.ev ? `<span class="asub" title="${esc((findEvent(a.ev) || {}).name || "")}">Event avatar</span>` : ""}
          <span class="al">${open ? (sel ? "Selected" : "Tap for info") : avLock(a)}</span>
        </button>`;
      }).join("")}
    </div>
    <form id="code-form" class="code-row">
      <label for="unlock-code">Have a code?</label>
      <input id="unlock-code" maxlength="32" placeholder="Type a code" autocomplete="off" autocapitalize="characters" spellcheck="false">
      <button class="btn primary small" type="submit">Unlock</button>
    </form>
    <p class="error" id="code-msg" role="alert">${esc(S.codeMsg || "")}</p>
  </main>`;
}
function viewSettings() {
  const u = me();
  return `${header()}${tabsBar("settings")}<main class="narrow">
    <p class="eyebrow">Settings</p>
    <h1>Settings</h1>
    <h2>Screen</h2>
    ${layoutBar()}
    <p class="hint">Auto fits whatever screen you're on. Pick one to use that layout anywhere. Saved on this device.</p>

    <h2>Question level</h2>
    <div class="seg-pick" role="group" aria-label="Question level">
      <button data-act="agemode" data-v="little" aria-pressed="${kidMode()}"><span aria-hidden="true">🧸</span>Little kids</button>
      <button data-act="agemode" data-v="big" aria-pressed="${bigMode()}"><span aria-hidden="true">🎒</span>Big kids</button>
      <button data-act="agemode" data-v="regular" aria-pressed="${ageMode() === "regular"}"><span aria-hidden="true">🚀</span>Regular</button>
    </div>
    <p class="hint">${kidMode() ? "Easy questions for little kids, no twists, and 1 in Attillions are much easier to find." : bigMode() ? "In between: questions for older kids, no twists, and 1 in Attillions a little easier to find than Regular." : "The full game, with twist rounds."} Little kids and Big kids each get their own Elo, their own Daily Launch and their own leaderboard. Saved on this device.</p>

    <h2>Timer</h2>
    <div class="seg-pick" role="group" aria-label="Timer">
      ${[15, 25, 30, 60].map(n => `<button data-act="timer" data-v="${n}" aria-pressed="${!store.get("untimed", false) && store.get("timerSecs", 30) === n}"><span aria-hidden="true">⏱️</span>${n === 60 ? "1 minute" : n + " seconds"}</button>`).join("")}
      <button data-act="untimed" data-v="1" aria-pressed="${!!store.get("untimed", false)}"><span aria-hidden="true">∞</span>No timer</button>
    </div>
    <p class="hint">Time for each question in every mode except Quick match, which always uses 30 seconds so both players get the same time. Saved on this device.</p>

    <h2>Questions per game</h2>
    <div class="seg-pick" role="group" aria-label="Questions per game">
      ${[7, 10].map(n => `<button data-act="rounds" data-v="${n}" aria-pressed="${roundsSetting("solo") === n}">${n} questions</button>`).join("")}
    </div>
    <p class="hint">For bots, Free Launch, Subjects and friend challenges. Quick match and the Daily Launch always have 7 questions, so everyone plays the same game. Endless keeps going until you stop. Saved on this device.</p>

    <h2>Endless skips</h2>
    <div class="seg-pick" role="group" aria-label="Skips per Endless run">
      ${[[0, "Off"], [3, "3"], [5, "5"], [10, "10"], [-1, "Unlimited"]].map(([v, l]) => `<button data-act="skips" data-v="${v}" aria-pressed="${store.get("endlessSkips", 3) === v}">${l}</button>`).join("")}
    </div>
    <p class="hint">How many prompts you can skip in one Endless run. Skipped prompts don't score and don't count as a round. Saved on this device.</p>

    <h2>Sound</h2>
    <div class="setting-row">
      <label for="vol">Volume</label>
      <input id="vol" type="range" min="0" max="100" step="5" value="${Math.round((window.KrillionSound ? window.KrillionSound.volume : 0.5) * 100)}">
      <output id="vol-out" for="vol">${Math.round((window.KrillionSound ? window.KrillionSound.volume : 0.5) * 100)}%</output>
      <button class="btn ghost small" data-act="sound-test">Test</button>
    </div>
    <p class="hint">Set it to 0% to turn sound off. Saved on this device.</p>

    <h2>Question sound</h2>
    <div class="seg-pick" role="group" aria-label="New question sound">
      ${[["off", "Off"], ["chime", "Chime"], ["voice", "Read it out loud"], ["both", "Both"]].map(([v, l]) => `<button data-act="pstyle" data-v="${v}" aria-pressed="${(window.KrillionSound ? window.KrillionSound.promptStyle : "chime") === v}">${l}</button>`).join("")}
    </div>
    <div class="setting-row">
      <label for="pvol">Loudness</label>
      <input id="pvol" type="range" min="0" max="100" step="5" value="${Math.round((window.KrillionSound ? window.KrillionSound.promptVolume : 0.5) * 100)}">
      <output id="pvol-out" for="pvol">${Math.round((window.KrillionSound ? window.KrillionSound.promptVolume : 0.5) * 100)}%</output>
      <button class="btn ghost small" data-act="pvol-test">Test</button>
    </div>
    <h3 class="sub-h">🔊 Hear the question button</h3>
    <div class="seg-pick" role="group" aria-label="Button size">
      ${[["off", "Hide"], ["s", "Small"], ["m", "Medium"], ["l", "Large"], ["xl", "Huge"]].map(([v, l]) => `<button data-act="saysize" data-v="${v}" aria-pressed="${sayBtnSize() === v}">${l}</button>`).join("")}
      ${sayBtnSize() !== "off" ? `<button type="button" class="say-btn say-${sayBtnSize()}" data-act="pvol-say" aria-label="Preview">🔊</button>` : ""}
    </div>
    <p class="hint">The sound plays each time a new question appears, and the 🔊 button next to each question reads it out loud when you tap it. Both use this loudness, so you can make it louder or quieter than the other sounds. Set it to 0% to turn it off. Saved on this device.</p>

    ${u ? `
    <h2>Account</h2>
    <form id="rename-form" class="stack">
      <label for="new-name">New username</label>
      <input id="new-name" required minlength="2" maxlength="20" value="${esc(u.name)}" autocomplete="username">
      <label for="rename-pw">Current password</label>
      <span class="pw-wrap"><input id="rename-pw" type="password" required autocomplete="current-password"><button type="button" class="pw-eye" data-act="pw-eye" data-for="rename-pw" aria-label="Show password" aria-pressed="false">👁</button></span>
      <p class="error" role="alert">${esc(S.renameMsg || "")}</p>
      <button class="btn primary" type="submit">Change username</button>
    </form>
    <form id="pw-form" class="stack">
      <label for="old-pw">Current password</label>
      <span class="pw-wrap"><input id="old-pw" type="password" required autocomplete="current-password"><button type="button" class="pw-eye" data-act="pw-eye" data-for="old-pw" aria-label="Show password" aria-pressed="false">👁</button></span>
      <label for="new-pw">New password</label>
      <span class="pw-wrap"><input id="new-pw" type="password" required minlength="4" autocomplete="new-password"><button type="button" class="pw-eye" data-act="pw-eye" data-for="new-pw" aria-label="Show password" aria-pressed="false">👁</button></span>
      <p class="error" role="alert">${esc(S.pwMsg || "")}</p>
      <button class="btn primary" type="submit">Change password</button>
    </form>
    <details class="forgot"${S.forgotMsg ? " open" : ""}>
      <summary>Don't know your current password?</summary>
      <p class="hint">You're logged in on this device, so you can set a new one without it.</p>
      <form id="forgot-form" class="stack">
        <label for="forgot-pw">New password</label>
        <span class="pw-wrap"><input id="forgot-pw" type="password" required minlength="4" autocomplete="new-password"><button type="button" class="pw-eye" data-act="pw-eye" data-for="forgot-pw" aria-label="Show password" aria-pressed="false">👁</button></span>
        <label for="forgot-pw2">Type it again</label>
        <span class="pw-wrap"><input id="forgot-pw2" type="password" required minlength="4" autocomplete="new-password"><button type="button" class="pw-eye" data-act="pw-eye" data-for="forgot-pw2" aria-label="Show password" aria-pressed="false">👁</button></span>
        <p class="error" role="alert">${esc(S.forgotMsg || "")}</p>
        <button class="btn primary" type="submit">Set new password</button>
      </form>
    </details>` : ""}
  </main>`;
}

let BOARD = null, boardLoading = false;
function loadBoard() {
  if (boardLoading || (BOARD && Date.now() - BOARD.at < 30000)) return;
  boardLoading = true;
  cloudBoard().then(b => { boardLoading = false; if (b) { BOARD = b; if (S.view === "leaderboard") render(); } });
}
function viewLeaderboard() {
  const tab = S.tab || (kidMode() ? "kids" : bigMode() ? "big" : "elo");
  loadBoard();
  const local = Object.values(users());
  if (tab === "kids" || tab === "big") return viewKidBoard(local, tab === "big" ? "big" : "kid");
  const all = BOARD ? BOARD.elo.map(r => ({ online: true, name: r.name, elo: r.elo, avatar: r.avatar, wins: r.wins, losses: r.losses, daily: {} })) : local;
  if (BOARD) BOARD.daily.forEach(r => { const x = all.find(u => u.name === r.name); if (x) x.daily[todayKey()] = { score: r.today_score }; else all.push({ name: r.name, elo: 0, avatar: null, wins: 0, losses: 0, daily: { [todayKey()]: { score: r.today_score } }, onlyDaily: true }); });
  const key = todayKey();
  let rows;
  if (tab === "elo") {
    const avOf = u => avMarkup((u.online ? avatarById(u.avatar) : AVATARS.find(x => x.id === u.avatar && isOpen(x, u))) || AVATARS[0]);
    const list = all.filter(u => !u.onlyDaily).map(u => ({ av: avOf(u), name: u.name, raw: u.name, val: u.elo, sub: `${u.wins}–${u.losses}`, human: true }))
      .concat(regularBots().map(([, b]) => b).map(b => ({ av: b.av, name: b.name, raw: b.name, val: b.elo, sub: "computer", human: false })))
      .sort((a, b) => b.val - a.val);
    rows = list.map((r, i) => `<tr class="${r.human ? "" : "botrow"} ${me() && r.raw === me().name ? "you" : ""}"><td class="n">${i + 1}</td><td>${r.av} ${esc(r.name)}</td><td class="sub">${esc(r.sub)}</td><td class="n">${r.val}</td></tr>`).join("");
  } else {
    const list = all.filter(u => u.daily[key]).map(u => ({ name: u.name, val: u.daily[key].score })).sort((a, b) => b.val - a.val);
    rows = list.length ? list.map((r, i) => `<tr class="${me() && r.name === me().name ? "you" : ""}"><td class="n">${i + 1}</td><td>${esc(r.name)}</td><td></td><td class="n">${r.val}</td></tr>`).join("")
      : `<tr><td colspan="4" class="empty">Nobody has finished today's launch yet.</td></tr>`;
  }
  return `${header()}<main class="narrow">
    <h1>Leaderboard</h1>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected="${tab === "elo"}" data-act="tab" data-tab="elo">Elo rating</button>
      <button role="tab" aria-selected="${tab === "daily"}" data-act="tab" data-tab="daily">Today's launch</button>
      <button role="tab" aria-selected="false" data-act="tab" data-tab="big">🎒 Big kids</button>
      <button role="tab" aria-selected="false" data-act="tab" data-tab="kids">🧸 Little kids</button>
    </div>
    <div class="table-wrap"><table class="board"><thead><tr><th>#</th><th>Player</th><th></th><th>${tab === "elo" ? "Elo" : "Score"}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">${BOARD ? "Worldwide board: every player with an online account, plus the computer opponents for reference." : "Showing accounts made in this browser, plus the computer opponents. The worldwide board appears when the game can reach the server."}</p>
  </main>`;
}

function viewKidBoard(local, k) {
  k = k || "kid"; const big = k === "big";
  const avOf = u => avMarkup((u.online ? avatarById(u.avatar) : AVATARS.find(x => x.id === u.avatar && isOpen(x, u))) || AVATARS[0]);
  const players = BOARD && BOARD[k] ? BOARD[k].map(r => Object.assign({ online: true }, r))
    : local.filter(u => u[k]).map(u => ({ name: u.name, avatar: u.avatar, elo: u[k].elo, wins: u[k].wins || 0, losses: u[k].losses || 0, krillions: u.krillions, krillTotal: u.krillTotal, peak: u.peak, codes: u.codes }));
  const list = players.map(u => ({ av: avOf(u), name: u.name, val: u.elo, sub: `${u.wins}–${u.losses}`, human: true }))
    .concat(regularBots().map(([, b]) => ({ av: b.av, name: b.name, val: b.elo, sub: "computer", human: false })))
    .sort((a, b) => b.val - a.val);
  const rows = list.map((r, i) => `<tr class="${r.human ? "" : "botrow"} ${me() && r.name === me().name ? "you" : ""}"><td class="n">${i + 1}</td><td>${r.av} ${esc(r.name)}</td><td class="sub">${esc(r.sub)}</td><td class="n">${r.val}</td></tr>`).join("");
  return `${header()}<main class="narrow">
    <h1>${big ? "🎒 Big kids" : "🧸 Little kids"} leaderboard</h1>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected="false" data-act="tab" data-tab="elo">Elo rating</button>
      <button role="tab" aria-selected="false" data-act="tab" data-tab="daily">Today's launch</button>
      <button role="tab" aria-selected="${big}" data-act="tab" data-tab="big">🎒 Big kids</button>
      <button role="tab" aria-selected="${!big}" data-act="tab" data-tab="kids">🧸 Little kids</button>
    </div>
    <div class="table-wrap"><table class="board"><thead><tr><th>#</th><th>Player</th><th></th><th>${big ? "Big kid" : "Kid"} Elo</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">${big ? "Big kid" : "Kid"} Elo is separate from regular Elo. It only changes when Question level is set to ${big ? "Big kids" : "Little kids"} in Settings.</p>
  </main>`;
}
function viewJoin() {
  return `${header()}<main class="narrow">
    <h1>Enter a code</h1>
    <p class="lede small">Paste a challenge code from a friend to play it, or paste the reply code they sent back to see who won.</p>
    <form id="join-form" class="stack">
      <label for="join-code">Challenge or reply code</label>
      <textarea id="join-code" rows="4" required></textarea>
      <p class="error" role="alert">${esc(S.error || "")}</p>
      <button class="btn primary" type="submit">Open</button>
    </form>
  </main>`;
}

function viewChallengeIntro() {
  const c = S.challenge;
  return `${header()}<main class="narrow">
    <p class="eyebrow">Challenge</p>
    <h1>${esc(c.from)} challenged you</h1>
    <p class="lede small">Same ${c.p.length} prompts they played. After every round you'll see what ${esc(c.from)} said.${c.elo != null ? ` Their Elo when they sent it: <b>${c.elo}</b>.` : ""}</p>
    ${me() ? "" : `<p class="hint"><button class="link" data-go="login">Log in</button> first if you want this to count toward your Elo.</p>`}
    <button class="btn primary" data-act="challenge-play">Start</button>
  </main>`;
}

function viewReplyResult() {
  const c = S.reply;
  const prompts = c.p.map(id => PROMPT_BY_ID[id]);
  const mine = c.host.map((a, i) => scoreAnswer(prompts[i], a, true));
  const theirs = c.a.map((a, i) => scoreAnswer(prompts[i], a, true));
  const my = total(mine), their = total(theirs);
  let eloLine = "";
  if (me() && c.elo != null) {
    const r = applyMatchResult(c.from, c.elo, my, their, "friend", c.id + ":host");
    const h = me().history.find(x => x.id === c.id + ":host");
    eloLine = `<p class="elo-change">Elo ${h.delta >= 0 ? "+" : ""}${h.delta} → <b>${myElo()}</b></p>`;
    void r;
  }
  const verdict = my > their ? "You win" : my < their ? `${esc(c.from)} wins` : "It's a tie";
  return `${header()}<main class="results">
    <p class="eyebrow">Challenge result</p>
    <h1>${verdict}</h1>
    <div class="totals"><div><span>${myAvatar()} You</span><b>${my}</b><em>played like ${perfElo(my, c.p.length).toLocaleString()}</em></div><div><span>${c.av && avatarById(c.av) ? avMarkup(avatarById(c.av)) : "🚀"} ${esc(c.from)}</span><b>${their}</b><em>played like ${perfElo(their, c.p.length).toLocaleString()}</em></div><div class="of">out of ${c.p.length * 100}</div></div>
    ${eloLine}
    <div class="table-wrap"><table class="breakdown"><thead><tr><th>Prompt</th><th>You</th><th>Pts</th><th>${esc(c.from)}</th><th>Pts</th></tr></thead><tbody>
      ${prompts.map((p, i) => `<tr><td class="q">${esc(p.q)}</td><td>${esc(mine[i].raw || "–")}</td><td class="n">${mine[i].points}</td><td>${esc(theirs[i].raw || "–")}</td><td class="n">${theirs[i].points}</td></tr>`).join("")}
    </tbody></table></div>
    <button class="btn ghost" data-go="home">Back to Earth</button>
  </main>`;
}

/* ---------- "What is it?" blurbs for 1 in Attillion answers ----------
 * Looked up live from Wikipedia (search for the answer plus the prompt's topic),
 * cached in this browser. If the lookup is blocked or finds nothing, the blurb
 * just doesn't show. */
function topicHint(q) {
  let t = String(q || "").replace(/^Name\s+/i, "").replace(/^(a|an|some)\s+/i, "");
  if (/^something\b/i.test(t)) { const w = t.split(/\s+/); return w[w.length - 1]; }
  t = t.replace(/^(type of|kind of|famous|piece of|way to|item of)\s+/i, "").replace(/^part of the human body/i, "anatomy").replace(/^game kids play.*/i, "game");
  t = t.split(/\s+(?:in|on|at|that|that's|with|or|you|people|for|ending|starting)\b|,/i)[0];
  return t.replace(/^(type of|kind of|famous)\s+/i, "").trim();
}
function curHint() { const pr = S.prompts && PROMPT_BY_ID[S.prompts[S.round]]; return pr ? topicHint(pr.baseQ || pr.q) : ""; }
const descMem = {};
function lookupDesc(answer, hint) {
  const key = (answer + "|" + hint).toLowerCase();
  if (key in descMem) return Promise.resolve(descMem[key]);
  const cache = store.get("desc", {});
  if (key in cache) { descMem[key] = cache[key]; return Promise.resolve(cache[key]); }
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const to = setTimeout(() => ctl && ctl.abort(), 7000);
  const url = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
    action: "query", format: "json", origin: "*", redirects: "1",
    generator: "search", gsrsearch: (answer + " " + hint).trim(), gsrlimit: "1",
    prop: "extracts|description|info", inprop: "url", exintro: "1", explaintext: "1", exsentences: "2"
  });
  const p = fetch(url, ctl ? { signal: ctl.signal } : {}).then(r => r.ok ? r.json() : Promise.reject(0)).then(j => {
    const pages = j && j.query && j.query.pages; if (!pages) return null;
    const pg = Object.values(pages)[0] || {};
    let text = String(pg.extract || "").replace(/\s*\([^()]*\)/g, "").replace(/\s+/g, " ").trim();
    const m = text.match(/^.{20,}?[.!?](?=\s|$)/); if (m) text = m[0];
    if (text.length > 200) text = text.slice(0, 197).replace(/\s+\S*$/, "") + "…";
    if (!text && pg.description) text = pg.description.charAt(0).toUpperCase() + pg.description.slice(1) + ".";
    if (!text || /may (also )?refer to/i.test(text)) return null;
    return { t: text, url: pg.fullurl || "https://en.wikipedia.org/wiki/" + encodeURIComponent(String(pg.title || answer).replace(/ /g, "_")) };
  }).then(v => {
    descMem[key] = v;
    const c = store.get("desc", {}); c[key] = v; const ks = Object.keys(c); if (ks.length > 400) delete c[ks[0]]; store.set("desc", c);
    return v;
  }, () => null).finally(() => clearTimeout(to));
  return p;
}
function fillDescriptions() {
  document.querySelectorAll("[data-what]:not([data-done])").forEach(el => {
    el.dataset.done = "1"; el.hidden = false; el.classList.add("loading"); el.textContent = "Looking it up…";
    lookupDesc(el.dataset.what, el.dataset.hint || "").then(d => {
      if (!document.body.contains(el)) return;
      el.classList.remove("loading");
      if (!d) { el.hidden = true; return; }
      el.textContent = "";
      const b = document.createElement("b"); b.textContent = "What is it? ";
      const a = document.createElement("a"); a.href = /^https:\/\/[a-z]+\.wikipedia\.org\//.test(d.url) ? d.url : "https://en.wikipedia.org/"; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Wikipedia";
      el.append(b, d.t + " ", a);
    });
  });
}

function render() {
  const v = S.view;
  const html = v === "play" ? viewPlay() : v === "results" ? viewResults() : v === "login" ? viewLogin()
    : v === "mystery" ? viewMystery() : v === "settings" ? viewSettings() : v === "avatar" ? viewAvatar() : v === "bots" ? viewBots() : v === "modes" ? viewHome() : v === "computer" ? viewComputer() : v === "event" ? viewEventBots() : v === "subjects" ? viewSubjects() : v === "friends" ? viewFriends() : v === "profile" ? viewProfile() : v === "leaderboard" ? viewLeaderboard() : v === "join" ? viewJoin()
    : v === "queue" ? viewQueue() : v === "challenge" ? viewChallengeIntro() : v === "reply" ? viewReplyResult() : v === "daily-done" ? viewDailyDone() : viewHub();
  $app().innerHTML = html;
  document.body.dataset.view = v;
  fillDescriptions();
  if (window.KrillionFX) window.KrillionFX.setDepth(v === "play" ? 0.15 + 0.85 * Math.min(1, S.round / Math.max(1, nRounds() - 1)) : 0);
}

/* ---------- events ---------- */
function openCode(raw) {
  let c;
  try { c = b64d(raw); } catch (e) { return "That code didn't read correctly. Copy the whole thing and try again."; }
  if (!c || !Array.isArray(c.p) || ![7, 10].includes(c.p.length) || c.p.some(id => !PROMPT_BY_ID[id])) return "That code is for a different version of Attillion.";
  if (c.reply) { go("reply", { reply: c }); return null; }
  go("challenge", { challenge: c });
  return null;
}

document.addEventListener("click", async e => {
  const ks = e.target.closest('[data-act="ksort"]');
  if (ks) { store.set("krillSort", ks.dataset.k); const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  const t = e.target.closest("[data-go],[data-act]");
  if (!t) return;
  if (t.dataset.go) { go(t.dataset.go); return; }
  const act = t.dataset.act;
  if (act === "bot") startMatch({ mode: "bot", level: t.dataset.level });
  else if (act === "daily") {
    const key = dailyKeyNow();
    startMatch({ mode: "daily", seed: hashStr("daily:" + key), prompts: dailyPrompts(key), dailyKey: key });
  }
  else if (act === "daily-view") go("daily-done");
  else if (act === "solo") startMatch({ mode: "solo" });
  else if (act === "endless") startMatch({ mode: "endless" });
  else if (act === "endless-stop") { if (S.view === "play" && S.mode === "endless" && S.phase === "reveal") finishMatch(); }
  else if (act === "subject" && SUBJECT_BY_KEY[t.dataset.cat]) startMatch({ mode: "subject", cat: t.dataset.cat });
  else if (act === "challenge-new") {
    const id = Math.random().toString(36).slice(2, 10);
    startMatch({ mode: "challenge-host", challenge: { id } });
  }
  else if (act === "challenge-play") {
    const c = S.challenge;
    startMatch({ mode: "challenge-guest", seed: c.seed, prompts: c.p, theirsRaw: c.a, challenge: c });
  }
  else if (act === "next") nextRound();
  else if (act === "quick") go("queue");
  else if (act === "quick-cancel") go("modes");
  else if (act === "sound-test") SFX("hadal");
  else if (act === "pstyle") { if (window.KrillionSound) window.KrillionSound.promptStyle = t.dataset.v; const y = window.scrollY; render(); window.scrollTo(0, y); if (window.KrillionSound) window.KrillionSound.prompt("Name a fruit"); }
  else if (act === "saysize") { store.set("sayBtnSize", t.dataset.v); const y = window.scrollY; render(); window.scrollTo(0, y); }
  else if (act === "pvol-say") { if (window.KrillionSound) window.KrillionSound.say("Name a fruit"); }
  else if (act === "say") { if (window.KrillionSound) window.KrillionSound.say(promptSpoken(PROMPT_BY_ID[S.prompts[S.round]])); const a = document.getElementById("answer"); if (a) a.focus(); }
  else if (act === "pvol-test") { if (window.KrillionSound) window.KrillionSound.prompt("Name a fruit"); }
  else if (act === "skip") endlessSkip();
  else if (act === "skips") { store.set("endlessSkips", Number(t.dataset.v)); render(); }
  else if (act === "agemode") { store.set("ageMode", t.dataset.v); store.set("kidMode", t.dataset.v === "little"); const y = window.scrollY; render(); window.scrollTo(0, y); }
  else if (act === "untimed") { store.set("untimed", t.dataset.v === "1"); const y = window.scrollY; render(); window.scrollTo(0, y); }
  else if (act === "power") usePower(t.dataset.k);
  else if (act === "mystery-play") { if (myMystery()) go("mystery"); else startMatch({ mode: "mystery", prompts: [mysteryPromptId()] }); }
  else if (act === "rounds") { store.set("rounds", +t.dataset.v); const y = window.scrollY; render(); window.scrollTo(0, y); }
  else if (act === "timer") { store.set("timerSecs", +t.dataset.v); store.set("untimed", false); const y = window.scrollY; render(); window.scrollTo(0, y); }
  else if (act === "spin") {
    const av = t.querySelector(".av");
    av.classList.remove("spin"); void av.offsetWidth; av.classList.add("spin");
    SFX("sunlight");
  }
  else if (act === "avinfo") { showAvInfo(t.dataset.id); }
  else if (act === "avinfo-close") { closeAvInfo(); }
  else if (act === "avatar") {
    const id = t.dataset.id; closeAvInfo();
    if (me()) updateUser(x => { x.avatar = id; }); else store.set("guestAvatar", id);
    render();
  }
  else if (act === "avpreview") { const id = t.dataset.id; closeAvInfo(); celebrateAvatar(id); }
  else if (act === "pw-eye") {
    const inp = document.getElementById(t.dataset.for); if (!inp) return;
    const show = inp.type === "password"; inp.type = show ? "text" : "password";
    t.setAttribute("aria-pressed", String(show)); t.setAttribute("aria-label", show ? "Hide password" : "Show password");
    t.textContent = show ? "🙈" : "👁"; inp.focus();
  }
  else if (act === "device") { setDeviceMode(t.dataset.v); render(); }
  else if (act === "tab") { S.tab = t.dataset.tab; render(); }
  else if (act === "auth-mode") go("login", { mode: t.dataset.m });
  else if (act === "logout") { cloudSignOut(); store.set("session", null); go("home"); }
  else if (act === "copy") {
    const el = document.getElementById(t.dataset.target);
    const text = el.value != null && el.tagName === "TEXTAREA" ? el.value : el.textContent;
    try { await navigator.clipboard.writeText(text); t.textContent = "Copied"; }
    catch (err) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); if (el.select) el.select(); t.textContent = "Selected. Press copy."; }
  }
});

document.addEventListener("submit", async e => {
  e.preventDefault();
  if (e.target.id === "answer-form") submit(false);
  else if (e.target.id === "auth-form") {
    const name = document.getElementById("auth-name").value.trim();
    const pw = document.getElementById("auth-pw").value;
    const all = users(); const key = name.toLowerCase();
    const h = await hashPw(name, pw);
    if ((S.mode || "login") === "signup") {
      const bad = nameProblem(name, null);
      if (bad) { go("login", { mode: "signup", error: bad }); return; }
      authBusy(true);
      const fresh = newUser(name, h);
      const cloudErr = await cloudSignUp(fresh, pw);
      authBusy(false);
      if (cloudErr) { go("login", { mode: "signup", error: cloudErr }); return; }
      fresh.cloud = cloudErr === "";
      all[key] = fresh; saveUsers(all);
      // carry over today's guest dive
      const g = store.get("guestDaily", {});
      if (g[todayKey()]) { all[key].daily[todayKey()] = g[todayKey()]; saveUsers(all); }
      const gk = store.get("guestKrillions", []);
      if (gk.length) { all[key].krillions = gk; saveUsers(all); store.set("guestKrillions", []); }
      if (store.get("guestPerfect", false)) { all[key].perfect = true; saveUsers(all); }
      if (store.get("guestBest", false)) { all[key].bestFound = true; saveUsers(all); }
      { const g = store.get("guestAvKrill", {}); if (Object.keys(g).length) { const m = all[key].avKrill = all[key].avKrill || {}; Object.entries(g).forEach(([k, n]) => { m[k] = (m[k] || 0) + n; }); saveUsers(all); store.set("guestAvKrill", {}); } }
    } else {
      authBusy(true);
      const res = await cloudLogIn(name, pw);
      if (res && res.user) {
        all[key] = Object.assign(res.user, { hash: h, cloud: true }); saveUsers(all);
      } else if (all[key] && all[key].hash === h) {
        // an account made before cloud saves: move it online now if the name is free
        if (!all[key].cloud && !(res && res.wrong)) { const err = await cloudSignUp(all[key], pw); if (err === "") { all[key].cloud = true; saveUsers(all); } }
      } else {
        authBusy(false);
        go("login", { mode: "login", error: res && res.wrong ? "That password doesn't match this account."
          : all[key] ? "Username or password doesn't match."
          : "There's no account called “" + name + "” on this device. If you made it somewhere else (like the Claude app or another device), log in there. Accounts only work on every device once the online save is turned on." });
        return;
      }
      authBusy(false);
    }
    store.set("session", all[key].name);
    go("home");
  }
  else if (e.target.id === "code-form") {
    const input = document.getElementById("unlock-code");
    const h = codeHash(input.value);
    // Elo boost: admin account only, +100 each time, never above 2000
    if (h === ELO_BOOST_CODE) {
      const u = me();
      if (!u || u.name.toLowerCase() !== OWNER_NAME.toLowerCase()) { SFX("error"); go("avatar", { codeMsg: "That code doesn't unlock anything." }); return; }
      if (myElo(u) >= ELO_BOOST_CAP) { go("avatar", { codeMsg: `The Elo boost stops at ${ELO_BOOST_CAP}. Your Elo is ${myElo(u)}.` }); return; }
      const k = tierKey();
      updateUser(x => {
        const r = k ? (x[k] = x[k] || { elo: START_ELO, peak: START_ELO, games: 0, wins: 0, losses: 0, draws: 0, history: [] }) : x;
        r.elo = Math.min(ELO_BOOST_CAP, r.elo + 100); r.peak = Math.max(r.peak || START_ELO, r.elo);
        if (k) x[k + "Elo"] = r.elo;
      });
      SFX("win");
      go("avatar", { codeMsg: `+Elo boost! Your ${k === "kid" ? "Kid " : k === "big" ? "Big kid " : ""}Elo is now ${myElo()} (it stops at ${ELO_BOOST_CAP}).` });
      return;
    }
    if (h === POWER_RESET_CODE) {
      if (ugGet("powerCodeDay", "") !== todayKey()) { go("avatar", { codeMsg: "Your power-up code is already ready. Go use it!" }); return; }
      ugSet("powerCodeDay", () => "", "");
      SFX("win");
      go("avatar", { codeMsg: "⚡ Recharged! You can use the power-up code again." });
      return;
    }
    if (h === POWER_CODE) {
      if (ugGet("powerCodeDay", "") === todayKey()) { go("avatar", { codeMsg: "You already used the power-up code today. Try again tomorrow!" }); return; }
      ugSet("powerCodeDay", () => todayKey(), "");
      Object.keys(POWERS).forEach(k => addPower(k, 3));
      SFX("win");
      const p = powers();
      go("avatar", { codeMsg: `🎁 +3 of every power-up! You now have ${Object.keys(POWERS).map(k => POWERS[k].ic + " " + p[k]).join(", ")}.` });
      return;
    }
    const bundle = BUNDLES.find(x => x.code === h);
    if (bundle) {
      const u = me();
      if (redeemed(u).includes(bundle.id) || (bundle.id === "perfect" && perfectDone(u)) || (bundle.id === "k1000" && krillCount(u) >= 1000) || (bundle.id === "bestans" && bestDone(u))) { go("avatar", { codeMsg: `You already unlocked ${bundle.name}.` }); return; }
      if (u) updateUser(x => { x.codes = (x.codes || []).concat(bundle.id); x.avatar = bundle.pick; });
      else { store.set("guestCodes", redeemed(null).concat(bundle.id)); store.set("guestAvatar", bundle.pick); }
      go("avatar", { codeMsg: `Unlocked ${bundle.name}: ${bundle.show || "☄️ 🌘 🪐 🌌"}` });
      celebrateAvatar(bundle.pick);
      return;
    }
    const a = AVATARS.find(x => x.code === h);
    if (!a) { SFX("error"); go("avatar", { codeMsg: "That code doesn't unlock anything." }); return; }
    const u = me();
    if (redeemed(u).includes(a.id)) { go("avatar", { codeMsg: `You already have the ${a.name}.` }); return; }
    if (u) updateUser(x => { x.codes = (x.codes || []).concat(a.id); x.avatar = a.id; });
    else { store.set("guestCodes", redeemed(null).concat(a.id)); store.set("guestAvatar", a.id); }
    go("avatar", { codeMsg: `Unlocked: ${a.e} ${a.name}${a.dev ? " (Developer)" : ""}. It's now your avatar.` });
    celebrateAvatar(a.id);
    return;
  }
  else if (e.target.id === "rename-form" || e.target.id === "pw-form") {
    const u = me(); if (!u) return;
    const all = users(); const oldKey = u.name.toLowerCase();
    if (e.target.id === "rename-form") {
      const name = document.getElementById("new-name").value.trim();
      const pw = document.getElementById("rename-pw").value;
      if ((await hashPw(u.name, pw)) !== all[oldKey].hash) { go("settings", { renameMsg: "That password doesn't match." }); return; }
      const bad = nameProblem(name, oldKey);
      if (bad) { go("settings", { renameMsg: bad }); return; }
      if (all[oldKey].cloud && name.toLowerCase() !== oldKey) {
        const c = await cloud();
        try { const f = c && await withTimeout(cloudFindName(c, name), 8000); if (f) { go("settings", { renameMsg: "That username is taken." }); return; } } catch (err) {}
      }
      const rec = all[oldKey]; delete all[oldKey];
      rec.name = name; rec.hash = await hashPw(name, pw);
      rec.updated = Date.now(); all[name.toLowerCase()] = rec; saveUsers(all); store.set("session", name);
      if (rec.cloud) cloudPush();
      SFX("lock"); go("settings", { renameMsg: "Username changed to " + name + "." });
    } else {
      const oldPw = document.getElementById("old-pw").value, newPw = document.getElementById("new-pw").value;
      if ((await hashPw(u.name, oldPw)) !== all[oldKey].hash) { go("settings", { pwMsg: "Your current password doesn't match." }); return; }
      all[oldKey].hash = await hashPw(u.name, newPw); saveUsers(all); cloudSetPw(newPw);
      SFX("lock"); go("settings", { pwMsg: "Password changed." });
    }
  }
  else if (e.target.id === "forgot-form") {
    const u = me(); if (!u) return;
    const a = document.getElementById("forgot-pw").value, b2 = document.getElementById("forgot-pw2").value;
    if (a !== b2) { go("settings", { forgotMsg: "Those two passwords don't match." }); return; }
    const all = users(); all[u.name.toLowerCase()].hash = await hashPw(u.name, a); saveUsers(all); cloudSetPw(a);
    SFX("lock"); go("settings", { forgotMsg: "New password set. Use it next time you log in." });
  }
  else if (e.target.id === "reset-form") {
    const name = document.getElementById("reset-name").value.trim();
    const a = document.getElementById("reset-pw").value, b2 = document.getElementById("reset-pw2").value;
    const all = users(); const rec = all[name.toLowerCase()];
    if (!rec) {
      let online = false;
      try { const c = await cloud(); online = !!(c && await withTimeout(cloudFindName(c, name), 8000)); } catch (err) {}
      go("login", { mode: "reset", resetName: name, error: online
        ? "That account is saved online. Go back to Log in and use your username and password, and it will open on this device too. A password can only be reset on the device where you last logged in."
        : "That account isn't saved on this device. Log in on the device or app where you made it (for example the Claude app instead of Safari), or go back to Log in and try your password here." });
      return;
    }
    if (a !== b2) { go("login", { mode: "reset", resetName: name, error: "Those two passwords don't match." }); return; }
    rec.hash = await hashPw(rec.name, a); saveUsers(all); store.set("session", rec.name);
    SFX("lock"); go("profile");
  }
  else if (e.target.id === "join-form") {
    const err = openCode(document.getElementById("join-code").value);
    if (err) go("join", { error: err });
  }
});

document.addEventListener("change", e => {
  if (e.target.id === "krill-mode") { store.set("krillMode", e.target.value); const y = window.scrollY; render(); window.scrollTo(0, y); }
});
document.addEventListener("input", e => {
  if (e.target.id === "av-search") {
    const q = e.target.value.trim().toLowerCase(); let shown = 0;
    document.querySelectorAll(".avatars .avatar").forEach(c => { const ok = !q || q.split(/\s+/).every(w => c.dataset.search.includes(w)); c.hidden = !ok; if (ok) shown++; });
    const none = document.getElementById("av-none"); if (none) none.hidden = shown > 0;
    return;
  }
  if (e.target.id === "krill-search") {
    const q = e.target.value.trim().toLowerCase(); let n = 0;
    document.querySelectorAll(".krill-wall .krill-card").forEach(c => { const hit = !q || c.dataset.s.includes(q); c.hidden = !hit; if (hit) n++; });
    const none = document.getElementById("krill-none"); if (none) none.hidden = n > 0;
  }
  if (e.target.id === "pvol" && window.KrillionSound) {
    window.KrillionSound.promptVolume = +e.target.value / 100;
    const o = document.getElementById("pvol-out"); if (o) o.textContent = e.target.value + "%";
  }
  if (e.target.id === "vol" && window.KrillionSound) {
    window.KrillionSound.volume = +e.target.value / 100;
    const o = document.getElementById("vol-out"); if (o) o.textContent = e.target.value + "%";
  }
  if (e.target.id === "answer") { const err = document.getElementById("answer-error"); if (err) err.textContent = ""; e.target.classList.remove("nope"); }
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && S.view === "play" && S.phase === "reveal" && document.activeElement && document.activeElement.tagName !== "BUTTON") { e.preventDefault(); nextRound(); }
});

function fromHash() {
  const m = location.hash.match(/^#(c|r)=(.+)$/);
  if (!m) return false;
  const err = openCode(m[2]);
  history.replaceState(null, "", location.pathname);
  if (err) go("join", { error: err });
  return true;
}

// test hook
window.Krillion = { loadHumanCounts, humanCount, getRoom, awardTokens, EVENT, PROMPTS, BASES, pickSet, noteUsed, state: () => S, scoreAnswer, matchAnswer, pickPrompts, dailyPrompts, endlessQueue, depthFor, botAnswer, BOTS, todayKey };

if (!fromHash()) render();
setTimeout(cloudPull, 500);
})();
