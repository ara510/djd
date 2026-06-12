import { Injectable, inject, signal } from '@angular/core';
import Swal from 'sweetalert2';
import { TranslationService } from './translation.service';

export interface Toast {
  message: string;
  type: 'success' | 'error';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private lang = inject(TranslationService);

  // Conservé pour compatibilité avec <app-toast> (plus utilisé : SweetAlert2 prend le relais).
  readonly toast = signal<Toast | null>(null);

  private readonly toastMixin = Swal.mixin({
    toast: true,
    position: 'bottom-end',
    showConfirmButton: false,
    timer: 3500,
    timerProgressBar: true,
    customClass: { popup: 'djd-toast' },
    didOpen: (el) => {
      el.addEventListener('mouseenter', Swal.stopTimer);
      el.addEventListener('mouseleave', Swal.resumeTimer);
    },
  });

  /** Toast SweetAlert2 (remplace l'ancien toast maison). */
  show(message: string, type: Toast['type'] = 'success') {
    this.toastMixin.fire({ icon: type, title: message });
  }

  /** Boîte de confirmation SweetAlert2. Résout `true` si confirmé. */
  confirm(opts: {
    title: string;
    text?: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
    icon?: 'warning' | 'question' | 'info';
  }): Promise<boolean> {
    const fr = this.lang.lang() === 'fr';
    return Swal.fire({
      title: opts.title,
      text: opts.text,
      icon: opts.icon ?? 'warning',
      showCancelButton: true,
      reverseButtons: true,
      confirmButtonText: opts.confirmText ?? (fr ? 'Confirmer' : 'Confirm'),
      cancelButtonText:  opts.cancelText ?? (fr ? 'Annuler' : 'Cancel'),
      confirmButtonColor: opts.danger ? '#c0392b' : '#8B6B3D',
      cancelButtonColor: '#9A8E7E',
      customClass: { popup: 'djd-swal' },
    }).then(r => r.isConfirmed);
  }
}
