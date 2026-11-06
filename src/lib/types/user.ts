// User-related types.

export type UserRole = 'super_admin' | 'superadmin' | 'admin' | 'user' | 'teachers' | 'head';

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
