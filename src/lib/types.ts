export type Topic = { title: string; label?: string; description: string; category?: string; image?: string; imageName?: string; pageid?: number; dark?: boolean; importance?: string };
export type Article = Topic & { html: string; links: string[]; url: string };
export type RoomVisit = { id: string; title: string | null; topics: Topic[]; links: string[]; loaded: number; status: 'loading' | 'ready' | 'error'; error?: string; focusTitle?: string; description?: string; page?: number; scrollY: number };
