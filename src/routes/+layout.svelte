<script lang="ts">
	import "./layout.css";
	import { page } from "$app/state";
	import { fly } from "svelte/transition";
	import { AlertCircle, CheckCircle2, Info, X } from "@lucide/svelte";
	import Navbar from "$lib/components/Navbar.svelte";
	import AnnouncementCenter from "$lib/components/AnnouncementCenter.svelte";
	import { toast } from "$lib/toast";
	import type { LayoutData } from "./$types";
	import type { Snippet } from "svelte";
	import LegalConsent from "$lib/components/LegalConsent.svelte";

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	let announcementOpen = $state(false);
	let isLegalPage = $derived(['/privacy', '/terms'].includes(page.url.pathname.replace(/\/$/, '')));
</script>

<svelte:head><title>Print Server</title></svelte:head>

{#if $toast.length > 0}
	<div
		aria-live="polite"
		aria-atomic="true"
		class="pointer-events-none fixed top-4 left-1/2 z-[120] flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4"
	>
		{#each $toast as item (item.id)}
			<div
				transition:fly={{ y: -24, duration: 220 }}
				role={item.type === "error" ? "alert" : "status"}
				class="pointer-events-auto flex w-full items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-md {item.type === 'success'
					? 'border-success/30 bg-surface/95 text-success'
					: item.type === 'error'
						? 'border-danger/30 bg-surface/95 text-danger'
						: 'border-accent/30 bg-surface/95 text-fg-app'}"
			>
				{#if item.type === "success"}
					<CheckCircle2 class="h-4 w-4 shrink-0 text-success" />
				{:else if item.type === "error"}
					<AlertCircle class="h-4 w-4 shrink-0 text-danger" />
				{:else}
					<Info class="h-4 w-4 shrink-0 text-accent" />
				{/if}
				<span class="flex-1 leading-snug text-fg-app">{item.message}</span>
				<button
					type="button"
					onclick={() => toast.dismiss(item.id)}
					aria-label="ปิดการแจ้งเตือน"
					class="rounded-md p-1 text-muted-app transition-colors hover:bg-elevated hover:text-fg-app"
				>
					<X class="h-3.5 w-3.5" />
				</button>
			</div>
		{/each}
	</div>
{/if}

<div class="flex min-h-screen flex-col bg-app text-fg-app">
	<Navbar onAnnouncement={() => (announcementOpen = true)} />
	{#if !isLegalPage || announcementOpen}
		<AnnouncementCenter userId={data.user?.id ?? null} bind:open={announcementOpen} />
	{/if}

	<main class="flex-1 transition-colors duration-300">
		{#key page.url.pathname}
			<div class="animate-page-enter">
				{@render children()}
			</div>
		{/key}
	</main>
	<footer class="border-t border-strong-app px-4 py-3 text-center text-[11px] text-muted-app">
		<span>© {new Date().getFullYear()} · <a href="https://github.com/techasit5415" target="_blank" rel="noopener noreferrer" class="hover:text-fg-app hover:underline">นาย เตชสิทธิ์ วาณิชภัทรกุล</a></span>
		<nav aria-label="นโยบายและข้อกำหนด" class="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-0">
		  <a href="/privacy" class="inline-flex min-h-7 items-center underline underline-offset-4 hover:text-fg-app">นโยบายความเป็นส่วนตัว</a>
		  <a href="/terms" class="inline-flex min-h-7 items-center underline underline-offset-4 hover:text-fg-app">ข้อกำหนดการใช้งาน</a>
		</nav>
	</footer>
  <LegalConsent userId={data.user?.id ?? null} enabled={!isLegalPage} />
</div>
