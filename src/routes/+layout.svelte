<script lang="ts">
	import "./layout.css";
	import { version } from "$app/environment";
	import { page } from "$app/state";
	import Navbar from "$lib/components/Navbar.svelte";
	import AnnouncementCenter from "$lib/components/AnnouncementCenter.svelte";
	import type { LayoutData } from "./$types";
	import type { Snippet } from "svelte";
	import LegalConsent from "$lib/components/LegalConsent.svelte";

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	let announcementOpen = $state(false);
	let isLegalPage = $derived(['/privacy', '/terms'].includes(page.url.pathname.replace(/\/$/, '')));
</script>

<svelte:head><title>Print Server</title></svelte:head>

<div class="flex min-h-screen flex-col bg-app text-fg-app">
	<Navbar onAnnouncement={() => (announcementOpen = true)} />
	{#if !isLegalPage || announcementOpen}
		<AnnouncementCenter userId={data.user?.id ?? null} bind:open={announcementOpen} />
	{/if}

	<main class="flex-1 transition-colors duration-300">
		{@render children()}
	</main>
	<footer class="border-t border-strong-app px-4 py-3 text-center text-[11px] text-muted-app">
		<span>© {new Date().getFullYear()} · <a href="https://github.com/techasit5415" target="_blank" rel="noopener noreferrer" class="hover:text-fg-app hover:underline">นาย เตชสิทธิ์ วาณิชภัทรกุล</a> · <span class="font-mono tabular-nums" title="Semantic Versioning: MAJOR.MINOR.PATCH">v{version}</span></span>
		<nav aria-label="นโยบายและข้อกำหนด" class="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-0">
		  <a href="/privacy" class="inline-flex min-h-7 items-center underline underline-offset-4 hover:text-fg-app">นโยบายความเป็นส่วนตัว</a>
		  <a href="/terms" class="inline-flex min-h-7 items-center underline underline-offset-4 hover:text-fg-app">ข้อกำหนดการใช้งาน</a>
		</nav>
	</footer>
  <LegalConsent userId={data.user?.id ?? null} enabled={!isLegalPage} />
</div>
