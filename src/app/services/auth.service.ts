import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';

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
  phone_verified?: boolean;
  deleted_at?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  currentUser = signal<User | null>(null);
  token       = signal<string | null>(localStorage.getItem('djd_token'));

  constructor() {
    if (this.token()) this.loadMe();
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
    localStorage.removeItem('djd_token');
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
    this.token.set(token);
    this.currentUser.set(user);
  }
}
