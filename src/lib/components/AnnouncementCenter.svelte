<script lang="ts">
  import { onMount } from 'svelte';
  import { Megaphone, ExternalLink, X, ChevronLeft, ChevronRight } from '@lucide/svelte';
  import { AnnouncementFeed } from '$lib/announcement-feed.svelte';
  import { announcementPriorityLabels, announcementLink } from '$lib/announcements';
  import { floodAnnouncement as legacy } from '$lib/flood-announcement';
  let { open = $bindable(false), userId: _userId }: { open?: boolean; userId?: string | null } = $props();
  let dialog = $state<HTMLDialogElement>();
  const fallback = legacy.enabled ? { id: 'legacy-flood', title: legacy.title, body: `${legacy.description}\n\n${legacy.instruction}\n“${legacy.message}”`, priority: 'emergency' as const, revision: legacy.version, link_label: 'ไปที่ SOS KMITL', link_url: legacy.helpUrl, source_url: legacy.sourceUrl, start_at: '', end_at: '' } : null;
  const feed = new AnnouncementFeed(fallback, unseen => { if (unseen) open = true; }, () => { open = false; });
  onMount(() => feed.start());
  $effect(() => { feed.isOpen = open; if (open && !feed.selected && feed.items.length) feed.selected = feed.items[0]; });
  $effect(() => { if (!dialog) return; if (open && !dialog.open) dialog.showModal(); else if (!open && dialog.open) dialog.close(); });
  function dismiss() { feed.markRead(); open = false; }
  function acknowledge() { if (!feed.nextUnread()) open = false; }
</script>
<dialog bind:this={dialog} aria-labelledby="announcement-title" aria-describedby="announcement-body" class="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-app bg-surface p-0 text-fg-app shadow-2xl backdrop:bg-black/60" oncancel={(event) => { event.preventDefault(); dismiss(); }} onclick={(event) => { if (event.target === dialog) dismiss(); }} onclose={() => (open = false)}>
  <div class="relative flex flex-col gap-5 p-5 sm:p-6">
    <button type="button" onclick={dismiss} aria-label="ปิดประกาศ" class="absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-lg text-secondary-app hover:bg-elevated focus-visible:outline-2 focus-visible:outline-accent"><X aria-hidden="true" class="size-5" /></button>
    <header class="flex flex-col gap-3 pr-10"><div class="flex items-center gap-2 text-accent"><Megaphone aria-hidden="true" class="size-5 shrink-0" /><span class="text-sm font-medium">{feed.selected ? announcementPriorityLabels[feed.selected.priority] : 'ประกาศ'}</span></div><h2 id="announcement-title" class="break-words text-xl font-semibold leading-relaxed">{feed.selected?.title || (feed.loaded ? 'ยังไม่มีประกาศในขณะนี้' : 'กำลังโหลดประกาศ')}</h2><p id="announcement-body" class="whitespace-pre-wrap break-words text-sm leading-relaxed text-secondary-app">{feed.selected?.body || (feed.loaded ? 'ประกาศใหม่จะแสดงเมื่อเผยแพร่จากศูนย์ประกาศกลาง' : 'กรุณารอสักครู่')}</p></header>
    {#if feed.selected}
      {#if announcementLink(feed.selected.link_url)}<a href={announcementLink(feed.selected.link_url)} target="_blank" rel="noopener noreferrer" class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{feed.selected.link_label || 'เปิดลิงก์'}<ExternalLink aria-hidden="true" class="size-4" /></a>{/if}
      {#if announcementLink(feed.selected.source_url)}<a href={announcementLink(feed.selected.source_url)} target="_blank" rel="noopener noreferrer" class="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-app px-3 py-2 text-sm font-medium text-secondary-app hover:bg-elevated focus-visible:outline-2 focus-visible:outline-accent">อ่านประกาศต้นฉบับ<ExternalLink aria-hidden="true" class="size-4" /></a>{/if}
    {/if}
    {#if feed.items.length > 1}<div class="flex items-center justify-between gap-3"><button type="button" aria-label="ประกาศก่อนหน้า" onclick={() => feed.select(-1)} class="inline-flex size-11 items-center justify-center rounded-lg border border-app hover:bg-elevated focus-visible:outline-2 focus-visible:outline-accent"><ChevronLeft aria-hidden="true" class="size-4" /></button><p class="text-xs text-secondary-app">ประกาศ {feed.items.findIndex(item => item.id === feed.selected?.id) + 1} / {feed.items.length}</p><button type="button" aria-label="ประกาศถัดไป" onclick={() => feed.select(1)} class="inline-flex size-11 items-center justify-center rounded-lg border border-app hover:bg-elevated focus-visible:outline-2 focus-visible:outline-accent"><ChevronRight aria-hidden="true" class="size-4" /></button></div>{/if}
    <button type="button" onclick={feed.selected ? acknowledge : dismiss} class="min-h-11 rounded-lg bg-elevated px-4 py-2 text-sm font-medium hover:bg-strong-app focus-visible:outline-2 focus-visible:outline-accent">{feed.selected ? 'รับทราบ' : 'ปิด'}</button>
    <p class="text-center text-xs leading-relaxed text-secondary-app">ประกาศจะแสดงอีกครั้งเมื่อเปิดหรือรีโหลดเว็บ</p>
  </div>
</dialog>
