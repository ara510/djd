import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';

export interface ChatMessage {
  id: number;
  sender: 'user' | 'staff' | 'bot';
  body: string;
  created_at: string;
}

export interface ChatConversation {
  id: number;
  user_id?: number | null;
  guest_email?: string | null;
  guest_name?: string | null;
  status: string;
  last_message_at: string;
  created_at?: string;
  username?: string | null;
  nom?: string | null;
  prenoms?: string | null;
  user_email?: string | null;
  plan?: string | null;
  last_body?: string | null;
  last_sender?: string | null;
  unread?: number;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  /** Jeton visiteur anonyme (persistant dans le navigateur). */
  private get guestToken(): string {
    let t = localStorage.getItem('djd_chat_token');
    if (!t) {
      t = (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem('djd_chat_token', t);
    }
    return t;
  }

  private authHeaders(): Record<string, string> {
    const tok = this.auth.token();
    return tok ? { Authorization: `Bearer ${tok}` } : {};
  }

  /** Une session de chat existe-t-elle déjà ? (compte connecté ou jeton visiteur déjà créé) */
  hasSession(): boolean {
    return !!this.auth.token() || !!localStorage.getItem('djd_chat_token');
  }

  // ─── Côté visiteur / utilisateur ───
  loadMine(markRead = false) {
    const params: Record<string, string> = this.auth.token() ? {} : { token: this.guestToken };
    if (markRead) params['seen'] = '1';
    return this.http.get<{ conversation: { id: number; status: string; hasEmail: boolean } | null; messages: ChatMessage[]; unread: number }>(
      '/api/chat/me', { headers: this.authHeaders(), params }
    );
  }

  send(body: string, guestEmail?: string, guestName?: string) {
    const payload: Record<string, string> = { body };
    if (!this.auth.token()) {
      payload['guestToken'] = this.guestToken;
      if (guestEmail) payload['guestEmail'] = guestEmail;
      if (guestName)  payload['guestName']  = guestName;
    }
    return this.http.post<{ conversationId: number; message: ChatMessage }>(
      '/api/chat/messages', payload, { headers: this.authHeaders() }
    );
  }

  // ─── Côté staff (admin DJD) ───
  loadConversations() {
    return this.http.get<ChatConversation[]>('/api/chat/conversations', {
      headers: { Authorization: `Bearer ${this.auth.token()}` },
    });
  }

  loadConversation(id: number) {
    return this.http.get<{ conversation: ChatConversation; messages: ChatMessage[] }>(
      `/api/chat/conversations/${id}`, { headers: { Authorization: `Bearer ${this.auth.token()}` } }
    );
  }

  reply(id: number, body: string) {
    return this.http.post<{ message: ChatMessage }>(
      `/api/chat/conversations/${id}/messages`, { body },
      { headers: { Authorization: `Bearer ${this.auth.token()}` } }
    );
  }
}
