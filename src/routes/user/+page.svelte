<script lang="ts">
	import { onMount } from "svelte";
	import { pbBrowser } from "$lib/pb/client";
	import { invalidateAll } from "$app/navigation";
	import { Printer, FileUp } from "@lucide/svelte";
	import AlertBanner from "$lib/components/AlertBanner.svelte";
	import QuotaBar from "$lib/components/QuotaBar.svelte";
	import StagedPrintForm from "$lib/components/Print-Com/user/StagedPrintForm.svelte";
	import UserJobsTable from "$lib/components/Print-Com/user/UserJobsTable.svelte";
	import type { PageData, ActionData } from "./$types";

	let { data, form }: { data: PageData; form: ActionData } = $props();

	onMount(() => {
		let unsubscribeJobs: (() => void) | null = null;
		let unsubscribeQuota: (() => void) | null = null;

		async function init() {
			try {
				const pb = pbBrowser();

				// Subscribe to print_jobs changes for the current user
				unsubscribeJobs = await pb
					.collection("print_jobs")
					.subscribe("*", (e) => {
						if (e.record.user === data.user?.id) {
							invalidateAll();
						}
					});

				// Subscribe to Quota changes for the current user
				if (data.user?.quota?.id) {
					unsubscribeQuota = await pb
						.collection("Quota")
						.subscribe(data.user.quota.id, () => {
							invalidateAll();
						});
				}
			} catch (err) {
				console.error("Failed to subscribe to realtime updates:", err);
			}
		}

		init();

		return () => {
			if (unsubscribeJobs) unsubscribeJobs();
			if (unsubscribeQuota) unsubscribeQuota();
		};
	});
</script>

<svelte:head>
	<title>พิมพ์เอกสารและตรวจสอบโควต้า · CS KMITL</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-6 py-8 space-y-6">
	<!-- Page Header -->
	<header class="flex flex-col justify-between gap-4 border-b border-app pb-6 sm:flex-row sm:items-end">
		<div class="space-y-1">
			<div class="flex items-center gap-2">
				<span class="inline-flex items-center gap-1.5 rounded-md border border-app bg-surface px-2 py-0.5 font-mono text-[11px] text-muted-app">
					<Printer class="size-3" strokeWidth={1.5} />
					<span>CS Print Spooler</span>
				</span>
			</div>
			<h1 class="text-2xl font-semibold tracking-tight text-fg-app">
				อัปโหลดและจัดการคิวงานพิมพ์
			</h1>
			<p class="text-xs text-muted-app">
				ส่งเอกสาร PDF ไปยังเครื่องพิมพ์ประจำภาควิชา และติดตามสถานะคิวงานพิมพ์แบบเรียลไทม์
			</p>
		</div>
	</header>

	{#if form?.message}
		<AlertBanner
			variant={form.ok ? "success" : "error"}
			message={form.message}
		/>
	{/if}

	<!-- ── Quota summary ── -->
	<section
		class="rounded-xl border border-app bg-surface p-5 transition-colors"
	>
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<p class="text-xs font-mono text-muted-app">
					โควต้าคงเหลือ (Quota Remaining)
				</p>
				<p class="mt-1 text-2xl font-semibold text-fg-app tabular-nums">
					{#if (data.user?.isUnlimited || ['000000000000002', '000000000000004', '000000000000005', '000000000000006', '000000000000007', '000000000000009', '000000000000010'].includes(data.user?.user_type_id ?? ''))}
						<span class="text-accent font-sans text-lg">ไม่จำกัด (Unlimited)</span>
					{:else}
						<span
							class={data.quota.remaining <= 0
								? "text-danger font-mono"
								: "text-fg-app font-mono"}
						>
							{data.quota.remaining}
						</span>
						<span class="text-xs font-normal text-muted-app font-mono"
							>/ {data.quota.total} หน้า</span
						>
					{/if}
				</p>
			</div>
			{#if (data.user?.isUnlimited || ['000000000000002', '000000000000004', '000000000000005', '000000000000006', '000000000000007', '000000000000009', '000000000000010'].includes(data.user?.user_type_id ?? ''))}
				<div class="text-right">
					<p class="text-xs font-mono text-muted-app">
						ใช้ไปแล้ว {data.quota.used} หน้า
					</p>
				</div>
			{:else if data.quota.total > 0}
				<div class="w-full sm:max-w-xs">
					<QuotaBar used={data.quota.used} total={data.quota.total} />
					<p class="mt-1 text-right text-xs font-mono text-muted-app">
						ใช้ไป {data.quota.used} หน้า ({Math.round(
							(data.quota.used / data.quota.total) * 100,
						)}%)
					</p>
				</div>
			{/if}
		</div>
	</section>

	<StagedPrintForm maxUploadBytes={data.maxUploadBytes} />

	<UserJobsTable jobs={data.jobs} />
</div>
