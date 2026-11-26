<script lang="ts">
	import { onMount } from 'svelte';
	import { pbBrowser } from '$lib/pb/client';
	import { invalidateAll } from '$app/navigation';
	import { toast } from '$lib/toast';
	import AlertBanner from '$lib/components/AlertBanner.svelte';
	import PrintQueueTable from '$lib/components/Print-Com/admin/PrintQueueTable.svelte';
	import UserQuotasTable from '$lib/components/Print-Com/admin/UserQuotasTable.svelte';
	import AdminStats from '$lib/components/Print-Com/admin/AdminStats.svelte';
	import {
		filterPrintJobs,
		type PrintDrilldownFilter,
		type PrintTimeRange
	} from '$lib/print-stats';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let range = $state<PrintTimeRange>('all');
	let drilldown = $state<PrintDrilldownFilter>('all');
	let realtime = $state(true);
	let refreshing = $state(false);
	let lastUpdated = $state('');
	let lastToastedForm: ActionData | null = null;

	$effect(() => {
		if (form && form !== lastToastedForm && form.message) {
			lastToastedForm = form;
			if (form.ok) {
				toast.success(form.message);
			} else {
				toast.error(form.message);
			}
		}
	});

	$effect(() => {
		if (data.loadedAt) {
			lastUpdated = data.loadedAt;
		}
	});

	const filteredJobs = $derived(
		filterPrintJobs(data.jobs, {
			range,
			drilldown
		}) as typeof data.jobs
	);

	async function refresh() {
		refreshing = true;
		try {
			await invalidateAll();
			lastUpdated = new Date().toISOString();
		} finally {
			refreshing = false;
		}
	}

	onMount(() => {
		let unsubscribeJobs: (() => void) | null = null;
		let unsubscribeQuota: (() => void) | null = null;

		async function init() {
			try {
				const pb = pbBrowser();

				unsubscribeJobs = await pb.collection('print_jobs').subscribe('*', () => {
					if (realtime) {
						void refresh();
					}
				});

				unsubscribeQuota = await pb.collection('Quota').subscribe('*', () => {
					if (realtime) {
						void refresh();
					}
				});
			} catch (err) {
				console.error('Failed to subscribe to admin realtime updates:', err);
			}
		}

		init();

		return () => {
			if (unsubscribeJobs) unsubscribeJobs();
			if (unsubscribeQuota) unsubscribeQuota();
		};
	});
</script>

<div class="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
	{#if form?.message}
		<div class="mb-4">
			<AlertBanner
				variant={form.ok ? 'success' : 'error'}
				message={form.message}
			/>
		</div>
	{/if}

	<AdminStats
		stats={data.stats}
		statJobs={data.statJobs}
		users={data.users}
		bind:range
		bind:drilldown
		bind:realtime
		loading={refreshing}
		error={data.statsError}
		{lastUpdated}
		onRefresh={refresh}
	/>

	<PrintQueueTable
		jobs={filteredJobs}
		bind:drilldown
		loading={refreshing}
		onClearFilter={() => (drilldown = 'all')}
	/>

	<UserQuotasTable users={data.users} loading={refreshing} />
</div>
