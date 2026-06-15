import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslationService } from '../../services/translation.service';
import { AuthService } from '../../services/auth.service';
import { ChatService, ChatMessage } from '../../services/chat.service';

interface ViewMsg { key: string; from: 'bot' | 'user'; text: string; time: string; }
interface Faq { q: string; a: string | null; }

@Component({
  selector: 'app-chat-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-widget.html',
  styleUrl: './chat-widget.scss',
})
export class ChatWidgetComponent implements OnDestroy {
  private lang = inject(TranslationService);
  private auth = inject(AuthService);
  private chat = inject(ChatService);

  get fr(): boolean { return this.lang.lang() === 'fr'; }
  get loggedIn(): boolean { return !!this.auth.token(); }

  open      = signal(false);
  draft     = '';
  sending   = signal(false);
  hasEmail  = signal(false);          // visiteur anonyme : email déjà fourni ?
  askEmail  = signal(false);          // affiche le formulaire email
  unread    = signal(0);              // réponses du staff non lues (badge sur la bulle)
  guestEmail = '';
  guestName  = '';

  /** Messages locaux (accueil + FAQ), front-only. */
  private localMsgs  = signal<ViewMsg[]>([]);
  /** Messages réels venant du serveur (source de vérité de la conversation). */
  private serverMsgs = signal<ViewMsg[]>([]);

  view = computed<ViewMsg[]>(() => [...this.localMsgs(), ...this.serverMsgs()]);
  /** FAQ visibles tant qu'aucune vraie conversation n'a démarré. */
  showFaq = computed(() => this.serverMsgs().length === 0 && !this.askEmail());

  private pollTimer?: ReturnType<typeof setInterval>;
  private bgTimer?:   ReturnType<typeof setInterval>;

  constructor() {
    // Poll d'arrière-plan (chat fermé) : alimente le badge de messages non lus.
    this.bgTimer = setInterval(() => {
      if (!this.open() && this.chat.hasSession()) this.refreshBadge();
    }, 15_000);
    if (this.chat.hasSession()) this.refreshBadge();
  }

  faqs: Faq[] = this.fr ? [
    { q: 'Quelles sont vos offres de veille ?', a: 'Nous proposons 3 formules : Veille Générale (gratuite), Sectorielle et Dédiée. Retrouvez le détail dans la section « Nos offres ».' },
    { q: 'Recevoir un rapport d\'exemple ?', a: 'Cliquez sur « Recevoir un rapport d\'exemple gratuit » dans la section Offres et laissez-nous votre email.' },
    { q: 'Couvrez-vous l\'international ?', a: 'Oui — nous surveillons presse, TV, radio, web et réseaux sociaux à Madagascar comme à l\'international.' },
    { q: 'Parler à un conseiller', a: null },
  ] : [
    { q: 'What are your watch plans?', a: 'We offer 3 plans: General Watch (free), Sector and Dedicated. See the « Our plans » section for details.' },
    { q: 'Get a sample report?', a: 'Click « Get a free sample report » in the Plans section and leave us your email.' },
    { q: 'Do you cover international news?', a: 'Yes — we monitor press, TV, radio, web and social media in Madagascar and abroad.' },
    { q: 'Talk to an advisor', a: null },
  ];

  // ─── Ouverture / fermeture ───
  toggle() {
    this.open.update(v => !v);
    if (this.open()) {
      if (this.localMsgs().length === 0) {
        this.localMsgs.set([{
          key: 'welcome', from: 'bot',
          text: this.fr ? 'Bonjour 👋 Comment pouvons-nous vous aider ?' : 'Hello 👋 How can we help you?',
          time: this.now(),
        }]);
      }
      this.refresh(true);          // marque les réponses du staff comme lues → vide le badge
      this.startPolling();
      this.scrollSoon();
    } else {
      this.stopPolling();
    }
  }

  // ─── FAQ ───
  pickFaq(f: Faq) {
    if (f.a === null) {                       // « Parler à un conseiller »
      this.localMsgs.update(m => [...m, {
        key: 'faq-q-' + m.length, from: 'user', text: f.q, time: this.now(),
      }, {
        key: 'faq-a-' + m.length, from: 'bot',
        text: this.fr ? 'Avec plaisir ! Écrivez votre message ci-dessous.' : 'Sure! Type your message below.',
        time: this.now(),
      }]);
      if (!this.loggedIn && !this.hasEmail()) this.askEmail.set(true);
      this.scrollSoon();
      return;
    }
    this.localMsgs.update(m => [...m, {
      key: 'faq-q-' + m.length, from: 'user', text: f.q, time: this.now(),
    }, {
      key: 'faq-a-' + m.length, from: 'bot', text: f.a!, time: this.now(),
    }]);
    this.scrollSoon();
  }

  // ─── Envoi ───
  trySend() {
    const text = this.draft.trim();
    if (!text || this.sending()) return;
    if (!this.loggedIn && !this.hasEmail()) { this.askEmail.set(true); return; }
    this.performSend(text);
  }

  submitEmail() {
    const email = this.guestEmail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
    this.askEmail.set(false);
    const text = this.draft.trim();
    if (text) this.performSend(text, email, this.guestName.trim());
    else this.hasEmail.set(true);   // email enregistré, en attente d'un message
  }

  private performSend(text: string, email?: string, name?: string) {
    this.sending.set(true);
    // bulle optimiste
    this.serverMsgs.update(m => [...m, { key: 'tmp-' + Date.now(), from: 'user', text, time: this.now() }]);
    this.draft = '';
    this.scrollSoon();
    this.chat.send(text, email, name).subscribe({
      next: () => { this.hasEmail.set(true); this.sending.set(false); this.refresh(); },
      error: () => { this.sending.set(false); this.refresh(); },
    });
  }

  // ─── Synchronisation serveur ───
  private refresh(markRead = false) {
    this.chat.loadMine(markRead).subscribe({
      next: res => {
        if (res.conversation?.hasEmail) this.hasEmail.set(true);
        this.unread.set(res.unread ?? 0);
        this.serverMsgs.set((res.messages || []).map((m: ChatMessage) => ({
          key: 's' + m.id,
          from: m.sender === 'user' ? 'user' : 'bot',
          text: m.body,
          time: this.fmt(m.created_at),
        })));
        this.scrollSoon();
      },
      error: () => {},
    });
  }

  /** Récupère uniquement le nombre de non-lus (chat fermé, ne marque rien comme lu). */
  private refreshBadge() {
    this.chat.loadMine(false).subscribe({ next: res => this.unread.set(res.unread ?? 0), error: () => {} });
  }

  private startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => { if (this.open()) this.refresh(true); }, 4000);
  }
  private stopPolling() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = undefined; } }
  ngOnDestroy() { this.stopPolling(); if (this.bgTimer) clearInterval(this.bgTimer); }

  // ─── Utilitaires ───
  private now(): string {
    return new Date().toLocaleTimeString(this.fr ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  }
  private fmt(iso: string): string {
    return new Date(iso).toLocaleTimeString(this.fr ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  }
  private scrollSoon() {
    setTimeout(() => {
      const el = document.querySelector('.chat__body');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }
}
