export type MitClub = {
  id: string;
  name: string;
  description: string;
  url: string;
  linkLabel: string;
  icon: string;
  keywords: string[];
  coursePrefixes: string[];
};

export const mitClubs: MitClub[] = [
  {
    id: "solar-car",
    name: "MIT Solar Electric Vehicle Team",
    description: "Design, build, and race a road-legal solar car with a student-run engineering team.",
    url: "https://www.mitsolar.com/",
    linkLabel: "Visit MIT SEVT",
    icon: "☀️",
    keywords: ["engineering", "energy", "solar", "sustainability", "mechanical", "electrical", "design", "build"],
    coursePrefixes: ["2", "6", "16", "22"],
  },
  {
    id: "rocket-team",
    name: "MIT Rocket Team",
    description: "Build sounding rockets with a large undergraduate team spanning propulsion, avionics, and structures.",
    url: "https://rocketry.mit.edu/about",
    linkLabel: "Visit MIT Rocket Team",
    icon: "🚀",
    keywords: ["aerospace", "rocket", "rockets", "space", "engineering", "avionics", "propulsion", "build"],
    coursePrefixes: ["2", "3", "6", "8", "16"],
  },
  {
    id: "motorsports",
    name: "MIT Motorsports",
    description: "Design, manufacture, and race an electric formula-style car; no prior experience is required.",
    url: "https://fsae.mit.edu/about",
    linkLabel: "Visit MIT Motorsports",
    icon: "🏎️",
    keywords: ["car", "automotive", "engineering", "manufacturing", "mechanical", "electrical", "design", "build"],
    coursePrefixes: ["2", "3", "6", "16"],
  },
  {
    id: "biomakers",
    name: "MIT BioMakers",
    description: "Explore biology, chemistry, engineering, and design through workshops and community projects.",
    url: "https://biomakers.mit.edu/about-us/student-group/",
    linkLabel: "Visit MIT BioMakers",
    icon: "🧬",
    keywords: ["biology", "biotech", "bioengineering", "chemistry", "health", "medicine", "design", "build"],
    coursePrefixes: ["5", "7", "9", "10", "20", "HST"],
  },
  {
    id: "esp",
    name: "MIT Educational Studies Program",
    description: "Teach what you love and help run programs such as Splash for students from the Boston area and beyond.",
    url: "https://esp.mit.edu/join/index.html",
    linkLabel: "Join MIT ESP",
    icon: "🧑‍🏫",
    keywords: ["education", "teaching", "mentoring", "service", "outreach", "community"],
    coursePrefixes: ["11", "17", "21", "24"],
  },
  {
    id: "shakespeare",
    name: "MIT Shakespeare Ensemble",
    description: "Act, design, direct, or work backstage in a close-knit student theatre ensemble.",
    url: "https://ensemble.mit.edu/",
    linkLabel: "Visit the Ensemble",
    icon: "🎭",
    keywords: ["theater", "theatre", "acting", "arts", "performance", "design", "writing", "shakespeare"],
    coursePrefixes: ["4", "21", "CMS", "MAS"],
  },
  {
    id: "outing-club",
    name: "MIT Outing Club",
    description: "Meet people through hiking, climbing, paddling, skiing, and other outdoor trips for many experience levels.",
    url: "https://mitoc.mit.edu/join",
    linkLabel: "Join MITOC",
    icon: "🥾",
    keywords: ["outdoor", "outdoors", "hiking", "climbing", "skiing", "nature", "fitness", "sports"],
    coursePrefixes: ["PE"],
  },
  {
    id: "origamit",
    name: "OrigaMIT",
    description: "Fold paper and learn from other artists at free weekly meetings open to every experience level.",
    url: "https://origamit.mit.edu/",
    linkLabel: "Visit OrigaMIT",
    icon: "🦢",
    keywords: ["origami", "paper", "art", "arts", "craft", "creative", "design"],
    coursePrefixes: ["4", "21", "CMS", "MAS"],
  },
  {
    id: "chocolate",
    name: "Laboratory for Chocolate Science",
    description: "Share chocolate through tastings, truffle making, and other decidedly delicious campus events.",
    url: "https://chocolate.mit.edu/",
    linkLabel: "Visit Chocolate Science",
    icon: "🍫",
    keywords: ["food", "chocolate", "cooking", "science", "chemistry", "social"],
    coursePrefixes: ["5", "7", "10", "20"],
  },
  {
    id: "assassins-guild",
    name: "MIT Assassins’ Guild",
    description: "Play and create live-action roleplaying games with one of MIT’s famously unusual student groups.",
    url: "https://assassin.mit.edu/web/Join_the_Guild",
    linkLabel: "Visit the Guild",
    icon: "🎲",
    keywords: ["games", "game", "roleplaying", "writing", "acting", "puzzles", "creative"],
    coursePrefixes: ["21", "CMS"],
  },
];
