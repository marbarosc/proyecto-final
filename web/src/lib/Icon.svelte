<script lang="ts">
  let { name, size = 18 }: { name: string; size?: number } = $props()
  const icons: Record<string, string> = {
    chat: 'M21 11a8 8 0 0 1-8 8H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4ZM7 8h10M7 12h7',
    file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9ZM14 3v6h6M8 13h8M8 17h6',
    link: 'm9 15 6-6M9 6l1-1a5 5 0 0 1 7 7l-1 1M8 11l-1 1a5 5 0 0 0 7 7l1-1',
    search: 'M18 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-2 6 5 5',
    arrow: 'M5 12h14m-5-5 5 5-5 5', send: 'M12 19V5m-6 6 6-6 6 6',
    back: 'M19 12H5m5-5-5 5 5 5', close: 'm6 6 12 12M6 18 18 6',
    plus: 'M12 5v14M5 12h14', chevron: 'm9 5 7 7-7 7',
    calendar: 'M8 3v4m8-4v4M4 11h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
    sparkles: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4',
    check: 'm5 12 4 4L19 6', info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-1v6m0-10v.1',
    copy: 'M8 8h12v13H8ZM16 8V3H3v13h5',
    refresh: 'M20 7A9 9 0 0 0 5 5L3 8m0-5v5h5m-4 9a9 9 0 0 0 15 2l2-3m0 5v-5h-5',
    grid: 'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',
    shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6',
    book: 'M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1Zm0 0v15',
    alert: 'm12 3 10 18H2Zm0 6v5m0 3v.1',
  }
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="icon"><path d={icons[name] ?? icons.file} /></svg>
