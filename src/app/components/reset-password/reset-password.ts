import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPasswordComponent {
  token   = input.required<string>();

  private auth  = inject(AuthService);
  private toast = inject(ToastService);
  lang          = inject(TranslationService);

  closed   = output<void>();
  loading  = signal(false);
  done     = signal(false);
  showPwd  = signal(false);

  password = '';
  confirm  = '';

  get pwdStrength(): 0 | 1 | 2 | 3 {
    const p = this.password;
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8)          s++;
    if (/[a-z]/.test(p))        s++;
    if (/[A-Z]/.test(p))        s++;
    if (/[0-9]/.test(p))        s++;
    if (/[^a-zA-Z0-9]/.test(p)) s++;
    return s <= 2 ? 1 : s <= 3 ? 2 : 3;
  }

  get strengthLabel() {
    const fr = ['', 'Faible', 'Moyen', 'Fort'];
    const en = ['', 'Weak', 'Medium', 'Strong'];
    return (this.lang.lang() === 'fr' ? fr : en)[this.pwdStrength];
  }

  submit() {
    if (this.loading()) return;
    if (this.password !== this.confirm) {
      this.toast.show(
        this.lang.lang() === 'fr' ? 'Les mots de passe ne correspondent pas.' : 'Passwords do not match.',
        'error'
      );
      return;
    }
    if (this.pwdStrength < 3) {
      this.toast.show(
        this.lang.lang() === 'fr' ? 'Mot de passe trop faible.' : 'Password too weak.',
        'error'
      );
      return;
    }
    this.loading.set(true);
    this.auth.resetPassword(this.token(), this.password).subscribe({
      next: () => { this.loading.set(false); this.done.set(true); },
      error: (err) => {
        this.toast.show(err.error?.error || 'Erreur.', 'error');
        this.loading.set(false);
      },
    });
  }
}
