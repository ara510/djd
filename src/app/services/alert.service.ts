import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { AuthService } from './auth.service';

export type AlertKind = 'realtime' | 'daily' | 'weekly';

/** Un fait : intitulé + sources (texte) + lien éventuel. `date` (jj/mm) sert au bulletin hebdo. */
export interface RecapFact {
  text: string;
  sources?: string;
  url?: string;
  date?: string;
}

/** Une rubrique (Politique, Économie…) avec ses faits. */
export interface RecapRubrique {
  name: string;
  facts: RecapFact[];
}

/** Corps structuré d'un récapitulatif quotidien (rubriques + faits à suivre) ou d'un bulletin hebdomadaire. */
export interface RecapPayload {
  rubriques: RecapRubrique[];
  follow_up?: string;     // récap quotidien : faits à suivre le lendemain
  period_from?: string;   // bulletin : période couverte (ISO)
  period_to?: string;
  summary?: string;       // bulletin : résumé exécutif
  trends?: string;        // bulletin : tendances de la semaine
  signals?: string;       // bulletin : signaux d'alerte / sujets à suivre
}

export interface AlertItem {
  id: number;
  kind: AlertKind;
  title: string;
  source?: string | null;
  url?: string | null;
  context?: string | null;
  payload?: RecapPayload | null;
  published_at: string;
  created_at: string;
}

/** Alertes « Option » (temps réel) — diffusées par email à la publication, visibles côté admin. */
@Injectable({ providedIn: 'root' })
export class AlertService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  readonly items   = signal<AlertItem[]>([]);
  readonly loading = signal(false);

  private headers() {
    return { Authorization: `Bearer ${this.auth.token()}` };
  }

  load(kind: AlertKind = 'realtime') {
    this.loading.set(true);
    const params = new HttpParams().set('kind', kind);
    this.http.get<AlertItem[]>('/api/alerts', { headers: this.headers(), params }).subscribe({
      next: rows => { this.items.set(rows); this.loading.set(false); },
      error: ()   => { this.loading.set(false); },
    });
  }

  /** Crée + diffuse une alerte par email. La réponse inclut `sent` (nombre de destinataires). */
  create(body: Partial<AlertItem>) {
    return this.http.post<AlertItem & { sent: number }>('/api/alerts', body, { headers: this.headers() });
  }

  update(id: number, body: Partial<AlertItem>) {
    return this.http.patch<AlertItem>(`/api/alerts/${id}`, body, { headers: this.headers() });
  }

  remove(id: number) {
    return this.http.delete<{ success: boolean }>(`/api/alerts/${id}`, { headers: this.headers() });
  }
}
