export interface Point {
  x: number;
  y: number;
}

export interface FoodPellet {
  id: number;
  x: number;
  y: number;
  radius: number;
  color: string;
  value: number; // length / coin contribution
  isLoot?: boolean;
}

export interface SnakeSegment {
  x: number;
  y: number;
}

export interface Snake {
  id: number;
  name: string;
  isBot: boolean;
  skinId: string;
  
  // Position & motion
  head: Point;
  angle: number; // Radians
  targetAngle: number;
  speed: number;
  isBoosting: boolean;
  
  // Body segments
  segments: SnakeSegment[];
  length: number; // Floating target length
  
  // Status
  isAlive: boolean;
  invulnerableUntil: number; // Timestamp
  kills: number;
  coinsEarned: number;
  survivedTime: number; // Seconds
  
  // Internal timing
  boostTimer: number;
  aiTimer: number;
  aiState?: {
    wanderAngle: number;
    targetFoodId?: number;
    threatSnakeId?: number;
  };
}

export interface LeaderboardEntry {
  rank: number;
  id: number;
  name: string;
  score: number;
  isPlayer: boolean;
}

export interface GameStats {
  kills: number;
  length: number;
  coins: number;
  survivedSeconds: number;
  rank: number;
}
