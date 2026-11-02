import type { WeekHours } from './hours';

export type Court = {
  id: string;
  slug: string;
  name: string;
  kind: 'indoor' | 'outdoor';
  area: string;
  address: string;
  hours: WeekHours;
  note: string | null;
  access_note?: string | null;
  hoop_count?: number | null;
  closure_note?: string | null;
  closure_until?: string | null;
  sort_order: number;
  lat: number | null;
  lng: number | null;
};

export type Profile = {
  id: string;
  display_name: string;
  position: string | null;
  skill: string | null;
  height_in: number | null;
  home_court_id: string | null;
  bio: string | null;
  avatar_url: string | null;
  notify_crew: boolean;
  created_at: string;
};

/** The few profile fields shown next to a name in lists. */
export type PlayerBrief = Pick<Profile, 'display_name' | 'avatar_url' | 'position' | 'skill' | 'height_in'>;

export type Checkin = {
  id: string;
  court_id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  ended_at: string | null;
};

export type LiveCheckin = Checkin & {
  profiles: PlayerBrief | null;
};

export type Crew = {
  description?: string;
  avatar_url?: string | null;
  id: string;
  name: string;
  court_id: string | null;
  schedule: string | null;
  invite_code: string;
  created_by: string;
  created_at: string;
};

export type CrewSummary = Crew & {
  courts: { name: string; slug: string } | null;
  crew_members: { count: number }[];
};

export type CrewMember = {
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  profiles: PlayerBrief | null;
};

export type CrewDetail = Crew & {
  courts: { name: string; slug: string } | null;
  crew_members: CrewMember[];
};

export type CrewPreview = {
  id: string;
  name: string;
  schedule: string | null;
  court_name: string | null;
  members: number;
};

export type Favorite = {
  court_id: string;
  alerts: boolean;
  alert_at: number;
};
