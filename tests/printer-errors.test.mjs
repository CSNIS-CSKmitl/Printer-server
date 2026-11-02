import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrinterError } from '../src/lib/server/printer-errors.mjs';

test('detects error 017-734 from printer screen result', () => {
	const text = 'Result: Completed with Error 017-734\nDetails: The job was canceled due to an error.';
	const result = parsePrinterError(text);
	assert.equal(result.isError, true);
	assert.equal(result.isIppDataError, true);
	assert.equal(result.message, 'Completed with error(017-734): IPP Data Error');
});

test('detects error 017-734 from printer printout sheet', () => {
	const text = 'Job Status: Completed with error(017-734):IPP Data Error\nPages: 2 Sheets: 1 Error';
	const result = parsePrinterError(text);
	assert.equal(result.isError, true);
	assert.equal(result.isIppDataError, true);
	assert.equal(result.message, 'Completed with error(017-734): IPP Data Error');
});

test('detects CUPS status with generic Xerox fault code', () => {
	const text = 'Fuji_apeos_3560_IP-1400 user 1024 Mon Nov 2 16:22:00 2026\n\tStatus: Completed with error(016-799): Print Service Error';
	const result = parsePrinterError(text);
	assert.equal(result.isError, true);
	assert.equal(result.isIppDataError, false);
	assert.equal(result.message, 'Completed with error(016-799): Print Service Error');
});

test('detects job canceled due to an error', () => {
	const text = 'The job was canceled due to an error. Please look up the fault code in the manual.';
	const result = parsePrinterError(text);
	assert.equal(result.isError, true);
	assert.equal(result.isIppDataError, false);
	assert.equal(result.message, 'The job was canceled due to an error');
});

test('detects CUPS alert job-completed-with-errors', () => {
	const text = 'Fuji_apeos_3560_IP-1400 user 1024 Mon Nov 2 16:22:00 2026\n\tAlerts: job-completed-with-errors';
	const result = parsePrinterError(text);
	assert.equal(result.isError, true);
	assert.equal(result.message, 'Completed with errors at printer');
});

test('returns false for normal completed job', () => {
	const text = 'Fuji_apeos_3560_IP-1400 user 1024 Mon Nov 2 16:22:00 2026\n\tStatus: Successful completion';
	const result = parsePrinterError(text);
	assert.equal(result.isError, false);
	assert.equal(result.isIppDataError, false);
});

test('handles null or empty inputs safely', () => {
	assert.equal(parsePrinterError(null).isError, false);
	assert.equal(parsePrinterError(undefined).isError, false);
	assert.equal(parsePrinterError('').isError, false);
});
