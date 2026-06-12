import { Injectable, signal, inject, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { ToastService } from './toast.service';
import { TranslationService } from './translation.service';

export interface User {
  id: number;
  nom: string;
  prenoms: string;
  email: string;
  username: string;
  date_naissance: string;
  created_at: string;
  avatar?: string | null;
  telephone?: string | null;
  pays?: string | null;
  ville?: string | null;
  genre?: string | null;
  notif_email?: boolean;
  email_verified?: boolean;
  plan?: 'generale' | 'sectorielle' | 'dediee';
  is_admin?: boolean;
  deleted_at?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http  = inject(HttpClient);
  private toast = inject(ToastService);
  private lang  = inject(TranslationService);
  private zone  = inject(NgZone);

  private readonly TIMEOUT_MS = 5 * 60 * 60 * 1000; // 5 heures
  private inactivityTimer?: ReturnType<typeof setTimeout>;

  currentUser = signal<User | null>(null);
  token       = signal<string | null>(localStorage.getItem('djd_token'));

  /** Affiche la notif « bienvenue admin » après vérification de l'email d'un compte DJD. */
  readonly showAdminWelcome = signal(false);

  constructor() {
    if (this.token()) {
      if (this.isSessionExpired()) {
        this.expireSession();
      } else {
        this.loadMe();
        this.startInactivityTimer();
      }
    }
  }

  /** Appelé à chaque événement d'activité utilisateur (throttle 30s). */
  resetActivityTimer() {
    if (!this.currentUser()) return;
    const now  = Date.now();
    const last = parseInt(localStorage.getItem('djd_last_activity') || '0', 10);
    if (now - last < 30_000) return;
    localStorage.setItem('djd_last_activity', now.toString());
    this.startInactivityTimer();
  }

  private isSessionExpired(): boolean {
    const last = localStorage.getItem('djd_last_activity');
    if (!last) return false;
    return Date.now() - parseInt(last, 10) > this.TIMEOUT_MS;
  }

  private startInactivityTimer() {
    clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(
      () => this.zone.run(() => this.expireSession()),
      this.TIMEOUT_MS
    );
  }

  private expireSession() {
    this.logout();
    this.toast.show(
      this.lang.lang() === 'fr'
        ? 'Session expirée — veuillez vous reconnecter.'
        : 'Session expired — please sign in again.',
      'error'
    );
  }

  register(data: object) {
    return this.http.post<{ token: string; user: User }>('/api/auth/register', data).pipe(
      tap(res => this.saveSession(res.token, res.user))
    );
  }

  login(username: string, password: string) {
    return this.http.post<{ token: string; user: User }>('/api/auth/login', { username, password }).pipe(
      tap(res => this.saveSession(res.token, res.user))
    );
  }

  logout() {
    clearTimeout(this.inactivityTimer);
    localStorage.removeItem('djd_token');
    localStorage.removeItem('djd_last_activity');
    this.token.set(null);
    this.currentUser.set(null);
  }

  updateProfile(data: object) {
    return this.http.patch<{ token: string; user: User }>('/api/auth/me', data, {
      headers: { Authorization: `Bearer ${this.token()}` },
    }).pipe(
      tap(res => this.saveSession(res.token, res.user))
    );
  }

  deleteAccount(password: string) {
    return this.http.delete<{ success: boolean }>('/api/auth/me', {
      headers: { Authorization: `Bearer ${this.token()}` },
      body: { password },
    });
  }

  recoverAccount() {
    return this.http.post<{ token: string; user: User }>('/api/auth/recover', {}, {
      headers: { Authorization: `Bearer ${this.token()}` },
    }).pipe(
      tap(res => this.saveSession(res.token, res.user))
    );
  }

  sendEmailOtp() {
    return this.http.post('/api/auth/send-otp', {}, {
      headers: { Authorization: `Bearer ${this.token()}` },
    });
  }

  verifyEmailOtp(code: string) {
    return this.http.post<{ token: string; user: User }>('/api/auth/verify-otp', { code }, {
      headers: { Authorization: `Bearer ${this.token()}` },
    }).pipe(tap(res => {
      this.saveSession(res.token, res.user);
      if (res.user.is_admin && res.user.email_verified) this.showAdminWelcome.set(true);
    }));
  }

  forgotPassword(email: string) {
    return this.http.post('/api/auth/forgot-password', { email });
  }

  resetPassword(token: string, password: string) {
    return this.http.post('/api/auth/reset-password', { token, password });
  }

  private loadMe() {
    this.http.get<User>('/api/auth/me', {
      headers: { Authorization: `Bearer ${this.token()}` },
    }).subscribe({
      next:  user  => this.currentUser.set(user),
      error: ()    => this.logout(),
    });
  }

  private saveSession(token: string, user: User) {
    localStorage.setItem('djd_token', token);
    localStorage.setItem('djd_last_activity', Date.now().toString());
    this.token.set(token);
    this.currentUser.set(user);
    this.startInactivityTimer();
  }
}
