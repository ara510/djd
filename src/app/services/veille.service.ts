import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { AuthService } from './auth.service';

export type VeilleType = 'web' | 'social' | 'radio' | 'tv' | 'presse';

export interface VeilleItem {
  id: number;
  title?: string | null;
  source?: string | null;
  sources?: string[];
  source_type: VeilleType;
  source_types?: string[];
  social_network?: string | null;
  sector?: string | null;
  sectors?: string[];
  url?: string | null;
  excerpt?: string | null;
  image?: string | null;
  images?: string[];
  images_count?: number;
  video?: string | null;
  has_video?: boolean;
  author?: string | null;
  status?: 'draft' | 'published';
  pinned?: boolean;
  scheduled?: boolean;
  published_at: string;
  created_at: string;
  deleted_at?: string | null;
  favorite?: boolean;
  read?: boolean;
}

export interface VeilleFilters {
  type?: string | null;
  sector?: string | null;
  q?: string;
  from?: string;
  to?: string;
}

@Injectable({ providedIn: 'root' })
export class VeilleService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  readonly isOpen  = signal(false);
  readonly items   = signal<VeilleItem[]>([]);
  readonly loading = signal(false);

  readonly trash        = signal<VeilleItem[]>([]);
  readonly trashLoading = signal(false);

  open()  { this.isOpen.set(true); this.load(); }
  close() { this.isOpen.set(false); }

  private headers() {
    return { Authorization: `Bearer ${this.auth.token()}` };
  }

  loadTrash() {
    this.trashLoading.set(true);
    this.http.get<VeilleItem[]>('/api/veille/trash', { headers: this.headers() }).subscribe({
      next: rows => { this.trash.set(rows); this.trashLoading.set(false); },
      error: ()   => { this.trashLoading.set(false); },
    });
  }

  restore(id: number) {
    return this.http.post(`/api/veille/${id}/restore`, {}, { headers: this.headers() });
  }

  deletePermanent(id: number) {
    return this.http.delete(`/api/veille/${id}/permanent`, { headers: this.headers() });
  }

  load(filters: VeilleFilters = {}) {
    this.loading.set(true);
    let params = new HttpParams();
    if (filters.type)   params = params.set('type', filters.type);
    if (filters.sector) params = params.set('sector', filters.sector);
    if (filters.q)      params = params.set('q', filters.q);
    if (filters.from)   params = params.set('from', filters.from);
    if (filters.to)     params = params.set('to', filters.to);
    this.http.get<VeilleItem[]>('/api/veille', { headers: this.headers(), params }).subscribe({
      next: rows => { this.items.set(rows); this.loading.set(false); },
      error: ()   => { this.loading.set(false); },
    });
  }

  create(body: Partial<VeilleItem>) {
    return this.http.post<VeilleItem>('/api/veille', body, { headers: this.headers() });
  }

  update(id: number, body: Partial<VeilleItem>) {
    return this.http.patch<VeilleItem>(`/api/veille/${id}`, body, { headers: this.headers() });
  }

  remove(id: number) {
    return this.http.delete<{ success: boolean }>(`/api/veille/${id}`, { headers: this.headers() });
  }

  /** Détail complet d'une veille (inclut la vidéo, chargée à la demande). */
  getOne(id: number) {
    return this.http.get<VeilleItem>(`/api/veille/${id}`, { headers: this.headers() });
  }

  /** Met à jour l'état (favori/lu) localement + côté serveur. */
  setState(id: number, patch: { favorite?: boolean; read?: boolean }) {
    this.items.update(list => list.map(i => i.id === id ? { ...i, ...patch } : i));
    return this.http.post(`/api/veille/${id}/state`, patch, { headers: this.headers() });
  }

  /** Épingle / désépingle une veille (admin). */
  setPinned(id: number, pinned: boolean) {
    return this.http.patch(`/api/veille/${id}/pin`, { pinned }, { headers: this.headers() });
  }

  /** Upload de médias sur le serveur (fichiers) → renvoie les URLs. */
  upload(files: File[]) {
    const fd = new FormData();
    files.forEach(f => fd.append('files', f));
    return this.http.post<{ urls: string[] }>('/api/upload', fd, { headers: this.headers() });
  }
}
