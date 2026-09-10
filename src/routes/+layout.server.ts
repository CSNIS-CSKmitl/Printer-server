import type { LayoutServerLoad } from './$types';
import { serverEnv } from '$lib/server/env';

/**
 * Forward the resolved session user and discordLink to every page via `page.data`
 * so shared chrome (navbar, etc.) can render without each page doing
 * its own lookup.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user,
		discordLink: serverEnv.discordLink
	};
};