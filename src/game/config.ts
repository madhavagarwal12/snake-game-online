export const ARENA_CONFIG = {
  // Map dimensions
  MAP_SIZE: 2400,
  
  // Speed & Motion (PRD §6.1)
  BASE_SPEED: 180, // units per second
  BOOST_SPEED: 330, // units per second
  MAX_TURN_RATE: 4.8, // rad/s snappy responsive turn rate
  
  // Collision & Sizing
  HEAD_RADIUS: 12,
  BODY_RADIUS: 10,
  MAX_BODY_RADIUS: 18, // Large snakes get thicker!
  SEGMENT_SPACING: 7.5,
  INITIAL_LENGTH: 25, // Start with comfortable length to boost immediately
  
  // Boost mechanics
  MIN_BOOST_LENGTH: 12, // Can boost down to 12 length
  BOOST_COST_PER_SEC: 2.2, // length lost per second of boosting
  BOOST_PELLET_INTERVAL: 0.25, // seconds between dropping boost pellets
  
  // Environment
  DEFAULT_CAPACITY: 30,
  FOOD_COUNT: 350,
  BOT_COUNT: 28,
  SPAWN_INVULNERABILITY_SEC: 3.0,
  
  // Grid partition size for spatial indexing (§6.7)
  GRID_CELL_SIZE: 200,
  
  // Viewport & Zoom
  BASE_VIEW_WIDTH: 900,
  MAX_ZOOM_OUT: 1.6,
  
  // Minimap
  MINIMAP_SIZE: 130,
};

export interface SkinDefinition {
  id: string;
  name: string;
  cost: number;
  primaryColor: string;
  secondaryColor: string;
  eyeColor: string;
  glowColor: string;
  pattern: "solid" | "striped" | "gradient" | "sparkle";
}

export const SKINS: Record<string, SkinDefinition> = {
  classic_green: {
    id: "classic_green",
    name: "Classic Viper",
    cost: 0,
    primaryColor: "#10b981",
    secondaryColor: "#34d399",
    eyeColor: "#064e3b",
    glowColor: "rgba(16, 185, 129, 0.4)",
    pattern: "striped",
  },
  neon_cyber: {
    id: "neon_cyber",
    name: "Cyber Neon",
    cost: 100,
    primaryColor: "#06b6d4",
    secondaryColor: "#ec4899",
    eyeColor: "#ffffff",
    glowColor: "rgba(6, 182, 212, 0.6)",
    pattern: "striped",
  },
  inferno_blaze: {
    id: "inferno_blaze",
    name: "Inferno Blaze",
    cost: 250,
    primaryColor: "#f97316",
    secondaryColor: "#ef4444",
    eyeColor: "#fef08a",
    glowColor: "rgba(249, 115, 22, 0.6)",
    pattern: "gradient",
  },
  gold_vip: {
    id: "gold_vip",
    name: "Royal Gold",
    cost: 500,
    primaryColor: "#eab308",
    secondaryColor: "#fde047",
    eyeColor: "#713f12",
    glowColor: "rgba(234, 179, 8, 0.7)",
    pattern: "sparkle",
  },
  void_phantom: {
    id: "void_phantom",
    name: "Void Phantom",
    cost: 1000,
    primaryColor: "#7c3aed",
    secondaryColor: "#c084fc",
    eyeColor: "#e0e7ff",
    glowColor: "rgba(124, 58, 237, 0.6)",
    pattern: "gradient",
  },
};
