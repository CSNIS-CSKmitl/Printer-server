import test from 'node:test';
import assert from 'node:assert/strict';
import { getUploadLimit } from '../src/lib/upload-limit.ts';

test('upload limit follows adapter-node byte values and case-insensitive suffixes', () => {
	assert.equal(getUploadLimit(), 50 * 1024 ** 2);
	assert.equal(getUploadLimit('524288'), 524288);
	assert.equal(getUploadLimit('512k'), 512 * 1024);
	assert.equal(getUploadLimit('20M'), 20 * 1024 ** 2);
	assert.equal(getUploadLimit('1.5G'), 1.5 * 1024 ** 3);
	assert.equal(getUploadLimit('Infinity'), null);
});

test('invalid upload limits fail instead of being advertised to the browser', () => {
	for (const value of ['', 'invalid', '50MB', '-1', '0', 'NaN']) {
		assert.throws(() => getUploadLimit(value), /Invalid BODY_SIZE_LIMIT/);
	}
});
