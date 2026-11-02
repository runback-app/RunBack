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
  sort_order: number;
};

export type Checkin = {
  id: string;
  court_id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  ended_at: string | null;
};

export type LiveCheckin = Checkin & {
  profiles: { display_name: string } | null;
};

export type Crew = {
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
  profiles: { display_name: string } | null;
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
