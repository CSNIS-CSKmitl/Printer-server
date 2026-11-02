import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Parses printer output or status blocks to detect known faults,
 * specifically error 017-734 (IPP Data Error) and generic printer fault codes.
 *
 * @param {string | null | undefined} text
 * @returns {{ isError: boolean; isIppDataError: boolean; message?: string }}
 */
export function parsePrinterError(text) {
	if (!text) return { isError: false, isIppDataError: false };

	// 1. Direct match for 017-734 or IPP Data Error
	if (/017-?734/i.test(text) || /IPP\s+Data\s+Error/i.test(text)) {
		return {
			isError: true,
			isIppDataError: true,
			message: 'Completed with error(017-734): IPP Data Error'
		};
	}

	// 2. Generic Xerox / Fuji Xerox fault codes (e.g. 016-xxx, 017-xxx, 024-xxx)
	const faultMatch = text.match(/(?:Completed with [Ee]rror|fault code)[:\s(]*([0-9]{3}-[0-9]{3})\)?(?::\s*([^\n\r]+))?/i);
	if (faultMatch) {
		const code = faultMatch[1];
		const detail = faultMatch[2] ? `: ${faultMatch[2].trim()}` : '';
		return {
			isError: true,
			isIppDataError: code === '017-734',
			message: `Completed with error(${code})${detail}`
		};
	}

	// 3. Canceled due to an error (shown on printer screen details)
	if (/cancell?ed\s+due\s+to\s+an\s+error/i.test(text)) {
		return {
			isError: true,
			isIppDataError: false,
			message: 'The job was canceled due to an error'
		};
	}

	// 4. CUPS alerts indicating job completed with errors
	if (/job-completed-with-errors/i.test(text)) {
		return {
			isError: true,
			isIppDataError: false,
			message: 'Completed with errors at printer'
		};
	}

	return { isError: false, isIppDataError: false };
}

/**
 * Check /var/log/cups/error_log for error messages logged for the given CUPS job id.
 *
 * @param {number} cupsJobId
 * @returns {Promise<string | null>}
 */
export async function checkCupsErrorLog(cupsJobId) {
	try {
		const cmd = `grep -i -E '\\[Job\\s+${cupsJobId}\\]' /var/log/cups/error_log | tail -n 25`;
		const { stdout } = await execAsync(cmd, { shell: '/bin/bash' });
		if (!stdout) return null;

		const parsed = parsePrinterError(stdout);
		if (parsed.isError && parsed.message) {
			return parsed.message;
		}
	} catch {
		// error_log might not exist or be accessible in non-root environments
	}
	return null;
}
