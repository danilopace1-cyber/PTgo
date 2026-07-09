export type UserRole = 'trainer' | 'client';

export type ConnectionStatus = 'invited' | 'active' | 'ended';

export type Profile = {
  id: string;
  role: UserRole;
  name: string;
  avatar_url: string | null;
  units: 'kg' | 'lb';
  invite_code: string | null;
  created_at: string;
};

export type ConnectionWithProfile = {
  id: string;
  status: ConnectionStatus;
  started_at: string;
  profile: Pick<Profile, 'id' | 'name'>;
};
