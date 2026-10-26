/** Read the same byte and K/M/G suffix values as adapter-node. */
export function getUploadLimit(value = '50M'): number | null {
	if (value === 'Infinity') return null;
	const suffix = value.slice(-1).toUpperCase();
	const multiplier = { K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[suffix as 'K' | 'M' | 'G'];
	const bytes = multiplier ? Number(value.slice(0, -1)) * multiplier : Number(value);
	if (!Number.isFinite(bytes) || bytes <= 0) {
		throw new Error(`Invalid BODY_SIZE_LIMIT: ${value}`);
	}
	return bytes;
}
