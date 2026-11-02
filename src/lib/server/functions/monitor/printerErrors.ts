export {
	parsePrinterError,
	checkCupsErrorLog
} from '../../printer-errors.mjs';

export interface PrinterErrorInfo {
	isError: boolean;
	isIppDataError: boolean;
	message?: string;
}
