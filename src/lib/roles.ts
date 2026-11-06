export function getUserRoles(record: any): string[] {
	if (!record) return [];
	const roles = new Set<string>();

	// Check record.roles if already computed
	if (Array.isArray(record.roles)) {
		for (const r of record.roles) {
			if (typeof r === 'string') roles.add(r.toLowerCase().trim());
		}
	}

	// Check expand.user_type (array or object)
	const expanded = record.expand?.user_type;
	if (Array.isArray(expanded)) {
		for (const item of expanded) {
			if (item?.type) roles.add(item.type.toLowerCase().trim());
			if (item?.id) addIdRole(item.id, roles);
		}
	} else if (expanded && typeof expanded === 'object') {
		if (expanded.type) roles.add(expanded.type.toLowerCase().trim());
		if (expanded.id) addIdRole(expanded.id, roles);
	}

	// Check user_type field (array of ids/strings or single string)
	const ut = record.user_type ?? record.user_type_id;
	if (Array.isArray(ut)) {
		for (const item of ut) {
			if (typeof item === 'string') {
				roles.add(item.toLowerCase().trim());
				addIdRole(item, roles);
			}
		}
	} else if (typeof ut === 'string') {
		roles.add(ut.toLowerCase().trim());
		addIdRole(ut, roles);
	}

	return Array.from(roles);
}

function addIdRole(id: string, set: Set<string>) {
	if (id === '000000000000000') set.add('admin');
	if (id === '000000000000001') set.add('students');
	if (id === '000000000000002') { set.add('teachers'); set.add('teacher'); }
	if (id === '000000000000003') { set.add('guests'); set.add('guest'); }
	if (id === '000000000000009') { set.add('superadmin'); set.add('super_admin'); }
	if (id === '000000000000004') { set.add('staff'); set.add('stuff'); }
	if (id === '000000000000005') set.add('head');
	if (id === '000000000000006') { set.add('teacher'); set.add('teachers'); }
	if (id === '000000000000007') { set.add('stuff'); set.add('staff'); }
	if (id === '000000000000008') { set.add('guest'); set.add('guests'); }
	if (id === '0000000000000010' || id === '000000000000010') { set.add('super_admin'); set.add('superadmin'); }
}

export function hasRole(record: any, ...targetRoles: string[]): boolean {
	const userRoles = getUserRoles(record);
	for (const target of targetRoles) {
		const t = target.toLowerCase().trim();
		if (userRoles.includes(t)) return true;
		// Handle aliases
		if ((t === 'teacher' || t === 'teachers') && (userRoles.includes('teacher') || userRoles.includes('teachers') || userRoles.includes('อาจารย์'))) return true;
		if ((t === 'staff' || t === 'stuff') && (userRoles.includes('staff') || userRoles.includes('stuff'))) return true;
		if ((t === 'superadmin' || t === 'super_admin') && (userRoles.includes('superadmin') || userRoles.includes('super_admin'))) return true;
		if ((t === 'guest' || t === 'guests') && (userRoles.includes('guest') || userRoles.includes('guests'))) return true;
		if ((t === 'student' || t === 'students') && (userRoles.includes('student') || userRoles.includes('students'))) return true;
		if (t === 'head' && userRoles.includes('head')) return true;
	}
	return false;
}

/**
 * In printer-server, admin access to /admin requires:
 * super_admin OR head (or PB_ADMIN_EMAIL).
 */
export function canAccessAdmin(record: any): record is NonNullable<App.Locals['user']> {
	if (!record) return false;
	if (record.email === 'log@cskmitl.com') return true;
	return hasRole(record, 'superadmin', 'super_admin', 'head');
}

/**
 * In printer-server, unlimited printing is granted to:
 * teacher (teachers), staff (stuff), super_admin (superadmin), head.
 */
export function hasUnlimitedPrinting(record: any): boolean {
	if (!record) return false;
	if (record.email === 'log@cskmitl.com') return true;
	return hasRole(record, 'teacher', 'teachers', 'staff', 'stuff', 'superadmin', 'super_admin', 'head');
}
