export interface PrinterErrorInfo {
	isError: boolean;
	isIppDataError: boolean;
	message?: string;
}

export function parsePrinterError(text?: string | null): PrinterErrorInfo;
export function checkCupsErrorLog(cupsJobId: number): Promise<string | null>;
