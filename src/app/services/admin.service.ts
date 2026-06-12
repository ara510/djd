import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';

export interface FeedbackItem {
  id: number;
  rating: number | null;
  category: string | null;
  comment: string | null;
  created_at: string;
  username: string | null;
  nom: string | null;
  prenoms: string | null;
  email: string | null;
}

export interface ActivityEntry {
  id: number;
  actor_name: string | null;
  action: string;
  target: string | null;
  created_at: string;
}

export interface Stats {
  veille: {
    total: number; published: number; draft: number;
    byType: { source_type: string; count: number }[];
    bySector: { sector: string; count: number }[];
    byMonth: { month: string; count: number }[];
  };
  users: {
    total: number; admins: number; verified: number; disabled: number;
    byPlan: { plan: string; count: number }[];
  };
  feedback: {
    total: number; avg: number;
    byCategory: { category: string; count: number }[];
  };
}

export interface AdminUser {
  id: number;
  nom: string;
  prenoms: string;
  username: string;
  email: string;
  avatar: string | null;
  plan: 'generale' | 'sectorielle' | 'dediee';
  is_admin: boolean;
  email_verified: boolean;
  disabled: boolean;
  created_at: string;
  deleted_at: string | null;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  readonly feedback        = signal<FeedbackItem[]>([]);
  readonly feedbackLoading = signal(false);

  readonly users        = signal<AdminUser[]>([]);
  readonly usersLoading = signal(false);

  readonly stats        = signal<Stats | null>(null);
  readonly statsLoading = signal(false);

  readonly activity        = signal<ActivityEntry[]>([]);
  readonly activityLoading = signal(false);

  private headers() {
    return { Authorization: `Bearer ${this.auth.token()}` };
  }

  loadStats() {
    this.statsLoading.set(true);
    this.http.get<Stats>('/api/stats', { headers: this.headers() }).subscribe({
      next: s => { this.stats.set(s); this.statsLoading.set(false); },
      error: () => { this.statsLoading.set(false); },
    });
  }

  loadActivity() {
    this.activityLoading.set(true);
    this.http.get<ActivityEntry[]>('/api/activity', { headers: this.headers() }).subscribe({
      next: rows => { this.activity.set(rows); this.activityLoading.set(false); },
      error: ()   => { this.activityLoading.set(false); },
    });
  }

  loadFeedback() {
    this.feedbackLoading.set(true);
    this.http.get<FeedbackItem[]>('/api/feedback', { headers: this.headers() }).subscribe({
      next: rows => { this.feedback.set(rows); this.feedbackLoading.set(false); },
      error: ()   => { this.feedbackLoading.set(false); },
    });
  }

  loadUsers() {
    this.usersLoading.set(true);
    this.http.get<AdminUser[]>('/api/users', { headers: this.headers() }).subscribe({
      next: rows => { this.users.set(rows); this.usersLoading.set(false); },
      error: ()   => { this.usersLoading.set(false); },
    });
  }

  updateUserPlan(id: number, plan: string) {
    return this.http.patch<{ id: number; plan: string }>(
      `/api/users/${id}/plan`, { plan }, { headers: this.headers() }
    );
  }

  setUserDisabled(id: number, disabled: boolean) {
    return this.http.patch<{ id: number; disabled: boolean }>(
      `/api/users/${id}/disabled`, { disabled }, { headers: this.headers() }
    );
  }
}
