import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-feedback-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './feedback-modal.html',
  styleUrl: './feedback-modal.scss',
})
export class FeedbackModalComponent {
  private http  = inject(HttpClient);
  private auth  = inject(AuthService);
  private toast = inject(ToastService);
  lang    = inject(TranslationService);

  closed  = output<void>();
  closing = signal(false);
  loading = signal(false);
  hover   = signal(0);

  rating   = signal(0);
  category = '';
  comment  = '';

  readonly categories = [
    { value: 'general',    fr: 'Général',     en: 'General'    },
    { value: 'bug',        fr: 'Bug / Erreur', en: 'Bug report' },
    { value: 'suggestion', fr: 'Suggestion',   en: 'Suggestion' },
  ];

  setRating(n: number) { this.rating.set(n); }
  starFill(n: number)  { return n <= (this.hover() || this.rating()); }

  close() {
    this.closing.set(true);
    setTimeout(() => { this.closing.set(false); this.closed.emit(); }, 300);
  }

  submit() {
    if (this.loading()) return;
    if (!this.rating() && !this.comment.trim()) {
      this.toast.show(
        this.lang.lang() === 'fr'
          ? 'Ajoutez une note ou un commentaire.'
          : 'Please add a rating or a comment.',
        'error'
      );
      return;
    }
    this.loading.set(true);
    this.http.post('/api/feedback',
      { rating: this.rating() || null, category: this.category || null, comment: this.comment || null },
      { headers: { Authorization: `Bearer ${this.auth.token()}` } }
    ).subscribe({
      next: () => {
        this.toast.show(
          this.lang.lang() === 'fr' ? 'Merci pour votre retour !' : 'Thank you for your feedback!',
          'success'
        );
        this.loading.set(false);
        this.close();
      },
      error: () => {
        this.toast.show(
          this.lang.lang() === 'fr' ? 'Erreur lors de l\'envoi.' : 'Failed to send feedback.',
          'error'
        );
        this.loading.set(false);
      },
    });
  }
}
