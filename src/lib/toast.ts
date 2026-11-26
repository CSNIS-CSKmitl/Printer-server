import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
	id: number;
	message: string;
	type: ToastType;
}

const DEFAULT_DURATION_MS = 3200;

function createToastStore() {
	const { subscribe, update } = writable<ToastItem[]>([]);
	let nextId = 1;
	const timers = new Map<number, ReturnType<typeof setTimeout>>();

	function dismiss(id: number) {
		const timer = timers.get(id);
		if (timer) {
			clearTimeout(timer);
			timers.delete(id);
		}
		update((items) => items.filter((item) => item.id !== id));
	}

	function show(message: string, type: ToastType = 'info', duration = DEFAULT_DURATION_MS) {
		const text = message.trim();
		if (!text) return 0;

		const id = nextId++;
		update((items) => [...items.slice(-2), { id, message: text, type }]);

		if (duration > 0) {
			const timer = setTimeout(() => {
				timers.delete(id);
				dismiss(id);
			}, duration);
			timers.set(id, timer);
		}

		return id;
	}

	return {
		subscribe,
		show,
		success: (message: string, duration = DEFAULT_DURATION_MS) => show(message, 'success', duration),
		error: (message: string, duration = DEFAULT_DURATION_MS) => show(message, 'error', duration),
		info: (message: string, duration = DEFAULT_DURATION_MS) => show(message, 'info', duration),
		dismiss
	};
}

export const toast = createToastStore();
