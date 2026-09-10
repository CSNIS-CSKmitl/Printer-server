<script lang="ts">
	import { Check, Copy, ExternalLink, X } from "@lucide/svelte";
	import QRCode from "qrcode";
	import Discord from "$lib/components/icons/Discord.svelte";

	let {
		open = false,
		link = "",
		onclose,
	}: {
		open: boolean;
		link: string;
		onclose: () => void;
	} = $props();

	let qrDataUrl = $state<string>("");
	let generating = $state<boolean>(false);
	let copied = $state<boolean>(false);
	let copyTimeout: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (open && link) {
			generating = true;
			QRCode.toDataURL(link, {
				width: 300,
				margin: 2,
				color: {
					dark: "#18181b",
					light: "#ffffff",
				},
				errorCorrectionLevel: "M",
			})
				.then((url) => {
					qrDataUrl = url;
				})
				.catch((err) => {
					console.error("Failed to generate QR code:", err);
				})
				.finally(() => {
					generating = false;
				});
		}
	});

	async function copyLink(): Promise<void> {
		if (!link) return;
		try {
			await navigator.clipboard.writeText(link);
			copied = true;
			if (copyTimeout) clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (err) {
			console.error("Failed to copy Discord link:", err);
		}
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (open && event.key === "Escape") {
			onclose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity duration-200"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) onclose();
		}}
	>
		<div
			class="relative w-full max-w-sm overflow-hidden rounded-2xl border border-app bg-surface p-6 shadow-2xl transition-all duration-200 animate-in fade-in zoom-in-95 focus:outline-none"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			aria-labelledby="discord-modal-title"
		>
			<!-- Close button -->
			<button
				type="button"
				onclick={onclose}
				class="absolute right-4 top-4 rounded-lg p-1.5 text-muted-app transition-colors hover:bg-elevated hover:text-fg-app"
				aria-label="ปิดหน้าต่าง"
			>
				<X class="h-4 w-4" />
			</button>

			<!-- Header -->
			<div class="flex items-center gap-3 pr-8">
				<div
					class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#5865F2]/10 text-[#5865F2]"
				>
					<Discord class="h-6 w-6" />
				</div>
				<div>
					<h2
						id="discord-modal-title"
						class="text-base font-semibold text-fg-app"
					>
						Discord Support Server
					</h2>
					<p class="text-xs text-muted-app">
						พบปัญหาหรือต้องการความช่วยเหลือ ติดต่อเราได้ทันที
					</p>
				</div>
			</div>

			<!-- QR Code Section -->
			<div class="mt-5 flex flex-col items-center justify-center">
				<div
					class="flex h-52 w-52 items-center justify-center overflow-hidden rounded-xl border border-strong-app bg-white p-2.5 shadow-sm"
				>
					{#if qrDataUrl && !generating}
						<img
							src={qrDataUrl}
							alt="QR Code สำหรับเข้าร่วม Discord Support Server"
							class="h-full w-full object-contain"
						/>
					{:else}
						<div
							class="flex h-full w-full items-center justify-center"
						>
							<div
								class="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent"
							></div>
						</div>
					{/if}
				</div>
				<p class="mt-2.5 text-center text-xs text-muted-app">
					สแกน QR Code ด้วยมือถือเพื่อเข้าร่วมเซิร์ฟเวอร์
				</p>
			</div>

			<!-- Discord Link & Actions -->
			<div class="mt-4 space-y-2.5">
				<!-- URL input with copy button -->
				<div
					class="flex items-center gap-1.5 rounded-lg border border-strong-app bg-app px-3 py-1.5"
				>
					<span
						class="flex-1 truncate font-mono text-xs text-secondary-app"
						title={link}
					>
						{link}
					</span>
					<button
						type="button"
						onclick={copyLink}
						class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-secondary-app transition-colors hover:bg-elevated hover:text-fg-app"
						title="คัดลอกลิงก์"
					>
						{#if copied}
							<Check class="h-3.5 w-3.5 text-success" />
							<span class="text-success">คัดลอกแล้ว</span>
						{:else}
							<Copy class="h-3.5 w-3.5" />
							<span>คัดลอก</span>
						{/if}
					</button>
				</div>

				<!-- Direct join button -->
				<a
					href={link}
					target="_blank"
					rel="noopener noreferrer"
					class="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#5865F2] font-mono text-xs font-medium text-white shadow-sm transition-colors hover:bg-[#4752C4]"
				>
					<Discord class="h-4 w-4 text-white" />
					<span>ไปยัง Discord Support</span>
					<ExternalLink class="h-3.5 w-3.5 text-white/80" />
				</a>
			</div>
		</div>
	</div>
{/if}
