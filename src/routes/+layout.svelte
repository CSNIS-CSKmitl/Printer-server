<script lang="ts">
	import "./layout.css";
	import Navbar from "$lib/components/Navbar.svelte";
	import AnnouncementCenter from "$lib/components/AnnouncementCenter.svelte";
	import type { LayoutData } from "./$types";
	import type { Snippet } from "svelte";

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	let announcementOpen = $state(false);
</script>

<svelte:head><title>Print Server</title></svelte:head>

<div class="flex min-h-screen flex-col bg-app text-fg-app">
	<Navbar onAnnouncement={() => (announcementOpen = true)} />
	<AnnouncementCenter userId={data.user?.id ?? null} bind:open={announcementOpen} />

	<main class="flex-1 transition-colors duration-300">
		{@render children()}
	</main>
	<footer class="border-t border-strong-app px-4 py-6 text-center text-xs text-muted-app">
		<span>© {new Date().getFullYear()} <a href="https://github.com/techasit5415" target="_blank" rel="noopener noreferrer" class="hover:text-fg-app hover:underline">Techasit Vanitpattarakul</a></span>
	</footer>
</div>
