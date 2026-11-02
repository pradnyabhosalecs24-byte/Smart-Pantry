import { useQuery } from "@tanstack/react-query";
import { get } from "./api";

export interface Badge {
  key: string;
  title: string;
  description: string;
  icon: string;
  tier: "bronze" | "silver" | "gold";
  earned: boolean;
  earnedAt: string | null;
  seen: boolean;
  progress: { current: number; target: number };
}

export interface Gamification {
  xp: number;
  level: { number: number; name: string; min: number; next: { number: number; name: string; min: number } | null; progress: number };
  breakdown: { uses: number; rescues: number; cooks: number; adds: number; purchases: number; honesty: number; challenges: number };
  points: { use: number; rescue: number; cook: number; add: number; purchase: number; honestWaste: number };
  streaks: { kitchen: number; bestKitchen: number; wasteFree: number; usedToday: boolean };
  stats: { uses: number; rescued: number; cooks: number; added: number; purchases: number; wasted: number };
  challenge: { key: string; title: string; description: string; target: number; reward: number; progress: number; completed: boolean; endsOn: string };
  badges: Badge[];
  newBadges: string[];
}

export const useGamification = () => useQuery({ queryKey: ["gamification"], queryFn: () => get<Gamification>("/gamification"), staleTime: 15_000 });
