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

<Navbar onAnnouncement={() => (announcementOpen = true)} />
<AnnouncementCenter userId={data.user?.id ?? null} bind:open={announcementOpen} />

<main class="min-h-[calc(100dvh-3.5rem)] bg-app text-fg-app transition-colors duration-300">
	{@render children()}
</main>
