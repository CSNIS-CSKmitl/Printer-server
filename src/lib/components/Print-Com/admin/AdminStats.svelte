<script lang="ts">
	import {
		AlertTriangle,
		Award,
		BarChart3,
		CheckCircle2,
		Clock3,
		Download,
		FileSpreadsheet,
		FileText,
		Printer,
		RefreshCw,
		Users,
		XCircle
	} from '@lucide/svelte';
	import {
		calculatePrintStats,
		PRINT_TIME_RANGES,
		type PrintDrilldownFilter,
		type PrintTimeRange,
		type StatPrintJob,
		type StatUserRecord
	} from '$lib/print-stats';

	type ComputedStats = ReturnType<typeof calculatePrintStats>;

	let {
		stats,
		statJobs = [],
		users = [],
		range = $bindable<PrintTimeRange>('all'),
		drilldown = $bindable<PrintDrilldownFilter>('all'),
		realtime = $bindable(true),
		loading = false,
		error = '',
		lastUpdated = '',
		onRefresh
	}: {
		stats: ComputedStats;
		statJobs?: StatPrintJob[];
		users?: StatUserRecord[];
		range?: PrintTimeRange;
		drilldown?: PrintDrilldownFilter;
		realtime?: boolean;
		loading?: boolean;
		error?: string;
		lastUpdated?: string;
		onRefresh?: () => void | Promise<void>;
	} = $props();

	const computed = $derived(
		statJobs && statJobs.length > 0
			? calculatePrintStats(statJobs, users, { range })
			: stats
	);

	const statusCards = $derived([
		{
			key: 'all' as PrintDrilldownFilter,
			label: 'งานพิมพ์ทั้งหมด',
			value: computed.jobs,
			detail: `วันนี้ ${computed.jobsToday} งาน · ผู้ใช้ ${computed.users} คน`,
			Icon: FileText,
			color: 'text-accent'
		},
		{
			key: 'pending' as PrintDrilldownFilter,
			label: 'รอคิว / กำลังพิมพ์',
			value: computed.activeJobs,
			detail: `รอคิว ${computed.pendingJobs} · กำลังพิมพ์ ${computed.processingJobs}`,
			Icon: Printer,
			color: 'text-warning'
		},
		{
			key: 'completed' as PrintDrilldownFilter,
			label: 'พิมพ์สำเร็จ',
			value: computed.completedJobs,
			detail: `${computed.pagesInPeriod.toLocaleString()} หน้าในช่วงที่เลือก`,
			Icon: CheckCircle2,
			color: 'text-success'
		},
		{
			key: 'failed' as PrintDrilldownFilter,
			label: 'งานพิมพ์ผิดพลาด',
			value: computed.failedJobs,
			detail: `อัตราล้มเหลว ${computed.failureRate}%`,
			Icon: XCircle,
			color: 'text-danger'
		}
	]);

	const maxTrendPages = $derived(
		Math.max(1, ...(computed.trend || []).map((t) => Math.max(t.pages, t.jobs)))
	);

	const maxMonthlyPages = $derived(
		Math.max(1, ...(computed.monthlyTrend || []).map((t) => t.pages))
	);

	function selectDrilldown(key: PrintDrilldownFilter) {
		drilldown = drilldown === key && key !== 'all' ? 'all' : key;
	}

	function formatTime(value: string) {
		if (!value) return 'เมื่อสักครู่';
		const ts = Date.parse(value);
		if (!Number.isFinite(ts)) return 'เมื่อสักครู่';
		return new Intl.DateTimeFormat('th-TH', {
			dateStyle: 'short',
			timeStyle: 'medium',
			timeZone: 'Asia/Bangkok'
		}).format(new Date(ts));
	}

	function exportStatsCSV() {
		const rangeObj = PRINT_TIME_RANGES.find((r) => r.id === range);
		const rangeLabel = rangeObj ? rangeObj.label : range;
		const nowStr = new Date().toLocaleString('th-TH');

		let csv = '\uFEFF'; // UTF-8 BOM for Thai language in Excel
		csv += `รายงานสถิติระบบพิมพ์ Print Server\n`;
		csv += `ช่วงเวลาที่เลือก: ${rangeLabel}\n`;
		csv += `ส่งออกข้อมูลเมื่อ: ${nowStr}\n\n`;

		csv += `ภาพรวมสถิติ\n`;
		csv += `รายการ,ค่า\n`;
		csv += `งานพิมพ์ทั้งหมด,${computed.jobs}\n`;
		csv += `พิมพ์สำเร็จ,${computed.completedJobs}\n`;
		csv += `รอคิว / กำลังพิมพ์,${computed.activeJobs}\n`;
		csv += `งานพิมพ์ผิดพลาด,${computed.failedJobs}\n`;
		csv += `อัตราความล้มเหลว (%),${computed.failureRate}%\n`;
		csv += `จำนวนหน้าทั้งหมดในช่วงที่เลือก,${computed.pagesInPeriod}\n`;
		csv += `กระดาษที่ใช้เฉลี่ยต่อหน้า,${computed.avgPagesPerJob}\n`;
		csv += `ผู้ใช้งานทั้งหมดในช่วงที่เลือก,${computed.users}\n\n`;

		if (computed.topPrinters && computed.topPrinters.length > 0) {
			csv += `ผู้ใช้ที่พิมพ์มากที่สุด (Top Users)\n`;
			csv += `อันดับ,ชื่อผู้ใช้,อีเมล,จำนวนงานพิมพ์,จำนวนหน้า\n`;
			computed.topPrinters.forEach((u, i) => {
				const uName = (u.name || '-').replace(/"/g, '""');
				const uEmail = (u.email || '-').replace(/"/g, '""');
				csv += `${i + 1},"${uName}","${uEmail}",${u.jobs},${u.pages}\n`;
			});
			csv += `\n`;
		}

		if (computed.trend && computed.trend.length > 0) {
			csv += `แนวโน้มงานพิมพ์ตามช่วงเวลา\n`;
			csv += `ช่วงเวลา / วันที่,จำนวนงาน,จำนวนหน้า\n`;
			computed.trend.forEach((t: any) => {
				csv += `"${t.label}",${t.jobs},${t.pages}\n`;
			});
		}

		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.setAttribute('href', url);
		link.setAttribute('download', `print-stats-${range}-${new Date().toISOString().slice(0, 10)}.csv`);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}
</script>

<section class="mb-8" aria-labelledby="admin-stats-title">
	<!-- Top Control Bar: Title, Realtime/Snapshot badge, Last updated, Time range selector, Refresh -->
	<div
		class="mb-4 flex flex-col justify-between gap-3 rounded-xl border border-app bg-surface p-4 shadow-sm sm:flex-row sm:items-center"
	>
		<div class="flex flex-wrap items-center gap-2.5">
			<h1 id="admin-stats-title" class="text-lg font-semibold tracking-tight text-fg-app">
				ภาพรวมระบบพิมพ์
			</h1>
			<button
				type="button"
				onclick={() => (realtime = !realtime)}
				class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors {realtime
					? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
					: 'border-app bg-elevated text-muted-app'}"
				title="คลิกเพื่อสลับโหมด Realtime / Snapshot"
			>
				<span
					class="h-2 w-2 rounded-full {realtime
						? 'animate-pulse bg-emerald-500'
						: 'bg-muted-app'}"
				></span>
				{realtime ? 'Realtime' : 'Snapshot'}
			</button>
			<span class="text-xs text-muted-app">
				อัปเดตล่าสุด {formatTime(lastUpdated)}
			</span>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<div
				class="inline-flex flex-wrap rounded-lg border border-app bg-elevated p-1"
				role="group"
				aria-label="เลือกช่วงเวลาสถิติ"
			>
				{#each PRINT_TIME_RANGES as item (item.id)}
					<button
						type="button"
						onclick={() => (range = item.id)}
						aria-pressed={range === item.id}
						class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors {range === item.id
							? 'bg-accent text-white shadow-xs'
							: 'text-muted-app hover:text-fg-app'}"
					>
						{item.label}
					</button>
				{/each}
			</div>

			<button
				type="button"
				onclick={exportStatsCSV}
				class="inline-flex items-center gap-1.5 rounded-lg border border-app bg-surface px-3 py-1.5 text-xs font-medium text-fg-app hover:bg-elevated cursor-pointer transition-colors"
				title="ส่งออกรายงานสถิติเป็น CSV สำหรับ Excel"
			>
				<Download class="h-3.5 w-3.5 text-muted-app" />
				<span>ส่งออก CSV</span>
			</button>

			{#if onRefresh}
				<button
					type="button"
					onclick={onRefresh}
					disabled={loading}
					aria-label="รีเฟรชสถิติ"
					class="inline-flex items-center gap-1.5 rounded-lg border border-app bg-surface px-3 py-1.5 text-xs font-medium text-fg-app hover:bg-elevated disabled:opacity-50 cursor-pointer"
				>
					<RefreshCw class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" />
					รีเฟรช
				</button>
			{/if}
		</div>
	</div>

	<!-- Error / Loading States instead of showing misleading 0s -->
	{#if error}
		<div
			class="rounded-xl border border-red-500/40 bg-red-500/10 p-5 text-sm text-fg-app shadow-sm"
			role="alert"
		>
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="flex items-center gap-3">
					<AlertTriangle class="h-5 w-5 shrink-0 text-red-500" />
					<div>
						<p class="font-semibold text-red-500">โหลดข้อมูลไม่ได้</p>
						<p class="mt-0.5 text-xs text-secondary-app">{error}</p>
					</div>
				</div>
				{#if onRefresh}
					<button
						type="button"
						onclick={onRefresh}
						disabled={loading}
						class="inline-flex items-center gap-1.5 rounded-lg border border-app bg-surface px-3 py-1.5 text-xs font-medium text-fg-app hover:bg-elevated"
					>
						<RefreshCw class="h-3.5 w-3.5" />ลองใหม่
					</button>
				{/if}
			</div>
		</div>
	{:else if loading && statJobs.length === 0 && (!stats || stats.jobs === 0)}
		<div
			class="flex items-center justify-center gap-3 rounded-xl border border-app bg-surface py-10 text-sm text-muted-app shadow-sm"
		>
			<RefreshCw class="h-4 w-4 animate-spin text-accent" />
			<span>กำลังโหลดสถิติ...</span>
		</div>
	{:else}
		<!-- Clickable Status Drill-down Cards -->
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
			{#each statusCards as card (card.key)}
				{@const Icon = card.Icon}
				{@const selected = drilldown === card.key}
				<button
					type="button"
					onclick={() => selectDrilldown(card.key)}
					aria-pressed={selected}
					class="text-left rounded-xl border p-4 shadow-sm transition-all focus-visible:outline-2 focus-visible:outline-accent {selected
						? 'border-accent bg-elevated ring-2 ring-accent/30'
						: 'border-app bg-surface hover:border-accent/50'}"
				>
					<div class="flex items-start justify-between gap-3">
						<div>
							<p class="text-xs text-muted-app">{card.label}</p>
							<p class="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-fg-app">
								{loading ? '…' : card.value.toLocaleString()}
							</p>
						</div>
						<Icon class={`h-5 w-5 ${card.color}`} aria-hidden="true" />
					</div>
					<p class="mt-2 text-xs text-secondary-app">{card.detail}</p>
				</button>
			{/each}
		</div>

		<!-- App-Specific Metrics Row: Failure Rate, Avg Pages/Paper per Job, Pages Month/Year, Top User -->
		<div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
			<article class="rounded-xl border border-app bg-surface p-4 shadow-sm">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="text-xs text-muted-app">อัตรางานล้มเหลว (Failure Rate)</p>
						<p class="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-fg-app">
							{computed.failureRate}%
						</p>
					</div>
					<AlertTriangle
						class="h-5 w-5 {computed.failureRate > 10 ? 'text-danger' : 'text-muted-app'}"
						aria-hidden="true"
					/>
				</div>
				<p class="mt-2 text-xs text-secondary-app">
					ล้มเหลว {computed.failedJobs} จาก {computed.jobs} งาน
				</p>
			</article>

			<article class="rounded-xl border border-app bg-surface p-4 shadow-sm">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="text-xs text-muted-app">กระดาษที่ใช้เฉลี่ยต่องาน</p>
						<p class="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-fg-app">
							{computed.avgPagesPerJob.toLocaleString()} หน้า
						</p>
					</div>
					<FileSpreadsheet class="h-5 w-5 text-accent" aria-hidden="true" />
				</div>
				<p class="mt-2 text-xs text-secondary-app">
					รวม {computed.pagesInPeriod.toLocaleString()} หน้าในช่วงที่เลือก
				</p>
			</article>

			<article class="rounded-xl border border-app bg-surface p-4 shadow-sm">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="text-xs text-muted-app">หน้าที่พิมพ์เดือนนี้ / ปีนี้</p>
						<p class="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-fg-app">
							{computed.pagesThisMonth.toLocaleString()} / {computed.pagesThisYear.toLocaleString()}
						</p>
					</div>
					<Clock3 class="h-5 w-5 text-secondary-app" aria-hidden="true" />
				</div>
				<p class="mt-2 text-xs text-secondary-app">
					ผู้ใช้ทั้งหมดในระบบ {computed.users.toLocaleString()} บัญชี
				</p>
			</article>

			<article class="rounded-xl border border-app bg-surface p-4 shadow-sm">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<p class="text-xs text-muted-app">ผู้ใช้ที่พิมพ์มากที่สุด (Top User)</p>
						<p class="mt-1 truncate text-lg font-semibold tracking-tight text-fg-app">
							{computed.topUser ? computed.topUser.name : 'ยังไม่มีข้อมูล'}
						</p>
					</div>
					<Award class="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
				</div>
				<p class="mt-2 truncate text-xs text-secondary-app">
					{#if computed.topUser}
						{computed.topUser.pages.toLocaleString()} หน้า ({computed.topUser.jobs} งาน)
					{:else}
						รอข้อมูลงานพิมพ์ที่สำเร็จ
					{/if}
				</p>
			</article>
		</div>

		<!-- Trend Chart & Monthly Trend + Top Users Table -->
		<div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
			<!-- Trend Chart (Jobs & Pages Printed Over Time + Monthly Trend) -->
			<div class="rounded-xl border border-app bg-surface p-4 shadow-sm lg:col-span-6">
				<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
					<div>
						<h2 class="text-sm font-semibold text-fg-app">
							กราฟแนวโน้มงานพิมพ์และจำนวนหน้า
						</h2>
						<p class="text-xs text-muted-app">
							แสดงจำนวนงานพิมพ์และกระดาษที่ใช้ตามช่วงเวลา และแนวโน้มรายเดือน
						</p>
					</div>
					<div class="flex items-center gap-3 text-xs text-secondary-app">
						<span class="inline-flex items-center gap-1">
							<span class="h-2.5 w-2.5 rounded-xs bg-accent"></span>หน้ากระดาษ
						</span>
						<span class="inline-flex items-center gap-1">
							<span class="h-2.5 w-2.5 rounded-xs bg-emerald-500"></span>จำนวนงาน
						</span>
					</div>
				</div>

				<div
					class="flex h-36 items-end gap-2 border-b border-app pb-2 pt-4"
					role="img"
					aria-label="กราฟแนวโน้มงานพิมพ์และหน้ากระดาษ"
				>
					{#each computed.trend || [] as point (point.key)}
						{@const pageH = Math.max(4, Math.round((point.pages / maxTrendPages) * 96))}
						{@const jobH = Math.max(4, Math.round((point.jobs / maxTrendPages) * 96))}
						<div class="flex flex-1 flex-col items-center gap-1.5">
							<div class="flex h-24 w-full items-end justify-center gap-1">
								<div
									class="w-3 rounded-t bg-accent transition-all"
									style="height: {point.pages > 0 ? pageH : 3}px; opacity: {point.pages > 0
										? 1
										: 0.25}"
									title="{point.label}: {point.pages} หน้า"
								></div>
								<div
									class="w-3 rounded-t bg-emerald-500 transition-all"
									style="height: {point.jobs > 0 ? jobH : 3}px; opacity: {point.jobs > 0
										? 1
										: 0.25}"
									title="{point.label}: {point.jobs} งาน (สำเร็จ {point.completedJobs}, ล้มเหลว {point.failedJobs})"
								></div>
							</div>
							<span class="truncate text-[10px] tabular-nums text-muted-app">
								{point.label}
							</span>
						</div>
					{/each}
				</div>

				<!-- Monthly Trend Breakdown -->
				<div class="mt-3">
					<p class="mb-2 text-xs font-medium text-secondary-app">
						แนวโน้มรายเดือน (6 เดือนย้อนหลัง)
					</p>
					<div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
						{#each computed.monthlyTrend || [] as m (m.key)}
							<div class="rounded-lg border border-app/60 bg-elevated/40 p-2 text-center">
								<p class="text-[11px] font-medium text-muted-app">{m.label}</p>
								<p class="mt-0.5 text-sm font-semibold tabular-nums text-fg-app">
									{m.pages.toLocaleString()} หน้า
								</p>
								<p class="text-[10px] tabular-nums text-secondary-app">
									{m.jobs} งาน
								</p>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- Top Printers Table -->
			<div class="rounded-xl border border-app bg-surface p-4 shadow-sm lg:col-span-6">
				<div class="mb-3 flex items-center justify-between gap-3">
					<div>
						<h2 class="text-sm font-semibold text-fg-app">ผู้ใช้ที่พิมพ์มากที่สุด</h2>
						<p class="text-xs text-muted-app">เรียงตามจำนวนหน้าที่พิมพ์สำเร็จสะสม</p>
					</div>
					<Users class="h-4 w-4 text-muted-app" aria-hidden="true" />
				</div>
				{#if computed.topPrinters.length > 0}
					<div class="overflow-x-auto">
						<table class="w-full min-w-[440px] text-left text-sm">
							<thead class="border-b border-app text-xs text-muted-app">
								<tr>
									<th class="px-2 py-2">อันดับ</th>
									<th class="px-2 py-2">ผู้ใช้</th>
									<th class="px-2 py-2 text-right">งาน</th>
									<th class="px-2 py-2 text-right">หน้า</th>
								</tr>
							</thead>
							<tbody>
								{#each computed.topPrinters as printer, index (printer.userId)}
									<tr class="border-b border-app/60 last:border-0">
										<td class="px-2 py-2 font-semibold text-accent">{index + 1}</td>
										<td class="px-2 py-2">
											<div class="font-medium text-fg-app">{printer.name}</div>
											<div class="text-xs text-muted-app">{printer.email}</div>
										</td>
										<td class="px-2 py-2 text-right tabular-nums text-secondary-app">
											{printer.jobs.toLocaleString()}
										</td>
										<td class="px-2 py-2 text-right font-semibold tabular-nums text-fg-app">
											{printer.pages.toLocaleString()}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<p class="py-8 text-center text-sm text-muted-app">
						ยังไม่มีงานพิมพ์ที่สำเร็จในช่วงเวลานี้
					</p>
				{/if}
			</div>
		</div>
	{/if}
</section>
