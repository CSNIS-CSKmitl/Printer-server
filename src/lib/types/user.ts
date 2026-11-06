import type { UserRole } from './role';

export interface SessionUser {
	id: string;
	email: string;
	name?: string;
	username?: string;
	role: UserRole;
	roles?: string[];
	isAdmin?: boolean;
	isUnlimited?: boolean;
}

export interface UsersRecord {
	id: string;
	email: string;
	name?: string;
	username?: string;
	user_type?: string | string[];
	roles?: string[];
}
