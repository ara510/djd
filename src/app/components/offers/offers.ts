import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TranslationService } from '../../services/translation.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-offers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './offers.html',
  styleUrl: './offers.scss',
})
export class OffersComponent {
  private http = inject(HttpClient);
  lang  = inject(TranslationService);
  toast = inject(ToastService);

  openAuth = output<void>();

  get fr(): boolean { return this.lang.lang() === 'fr'; }

  readonly plans: { id: string; free?: boolean; popular?: boolean }[] = [
    { id: 'generale', free: true },
    { id: 'sectorielle', popular: true },
    { id: 'dediee' },
  ];

  // ── Modale de capture d'email (lead) ────────────────────────────────────
  showLead   = signal(false);
  leadKind   = signal('');
  leadDetail = signal('');
  leadEmail  = '';
  sending    = signal(false);

  openReport() {
    this.openLead('rapport_exemple', this.fr ? 'Rapport d\'exemple' : 'Sample report');
  }
  openQuote(plan: string) {
    this.openLead('devis:' + plan, this.lang.t('sub.' + plan + '.name'));
  }
  private openLead(kind: string, detail: string) {
    this.leadKind.set(kind); this.leadDetail.set(detail);
    this.leadEmail = ''; this.showLead.set(true);
  }
  closeLead() { this.showLead.set(false); }

  submitLead() {
    if (this.sending()) return;
    const email = this.leadEmail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      this.toast.show(this.fr ? 'Adresse email invalide.' : 'Invalid email.', 'error');
      return;
    }
    this.sending.set(true);
    this.http.post('/api/leads', { email, kind: this.leadKind(), detail: this.leadDetail() }).subscribe({
      next: () => {
        this.sending.set(false);
        this.showLead.set(false);
        this.toast.show(
          this.fr ? 'Merci ! Nous vous recontactons très vite.' : 'Thank you! We\'ll be in touch soon.',
          'success'
        );
      },
      error: (e) => { this.sending.set(false); this.toast.show(e.error?.error || 'Erreur.', 'error'); },
    });
  }
}
