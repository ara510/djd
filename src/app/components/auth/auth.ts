import { Component, signal, inject, output, AfterViewInit, ElementRef, ViewChild, ViewChildren, QueryList, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { TranslationService } from '../../services/translation.service';
import lottie, { AnimationItem } from 'lottie-web';

type Tab = 'login' | 'signup';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.html',
  styleUrl: './auth.scss',
})
export class AuthComponent implements AfterViewInit, OnDestroy {
  @ViewChild('lottieContainer') lottieRef!: ElementRef<HTMLDivElement>;
  @ViewChild('authLoadingLottie') authLoadingRef!: ElementRef<HTMLDivElement>;

  auth  = inject(AuthService);
  toast = inject(ToastService);
  lang  = inject(TranslationService);

  closed = output<void>();

  tab               = signal<Tab>('login');
  loading           = signal(false);
  closing           = signal(false);
  forgotPasswordView = signal(false);

  showLoginPwd   = signal(false);
  showPwd        = signal(false);
  showConfirmPwd = signal(false);

  private anim!: AnimationItem;
  private loadAnim?: AnimationItem;

  login = { username: '', password: '' };

  signup = {
    nom: '', prenoms: '', date_naissance: '', email: '',
    username: '', password: '', passwordConfirm: '', acceptTerms: false,
  };

  ngAfterViewInit() {
    this.anim = lottie.loadAnimation({
      container: this.lottieRef.nativeElement,
      renderer:  'svg',
      loop:      true,
      autoplay:  true,
      path:      'assets/shapes.json',
    });
    this.loadAnim = lottie.loadAnimation({
      container: this.authLoadingRef.nativeElement,
      renderer:  'svg',
      loop:      true,
      autoplay:  false,
      path:      'assets/loading.json',
    });
  }

  ngOnDestroy() { this.anim?.destroy(); this.loadAnim?.destroy(); }

  get pwdStrength(): 0 | 1 | 2 | 3 {
    const p = this.signup.password;
    if (!p) return 0;
    let score = 0;
    if (p.length >= 8)          score++;
    if (/[a-z]/.test(p))        score++;
    if (/[A-Z]/.test(p))        score++;
    if (/[0-9]/.test(p))        score++;
    if (/[^a-zA-Z0-9]/.test(p)) score++;
    if (score <= 2) return 1;
    if (score <= 3) return 2;
    return 3;
  }

  get strengthLabel(): string {
    const fr = ['', 'Faible', 'Moyen', 'Fort'];
    const en = ['', 'Weak',   'Medium', 'Strong'];
    return (this.lang.lang() === 'fr' ? fr : en)[this.pwdStrength];
  }

  get pwdValid(): boolean { return this.pwdStrength === 3; }

  switchTab(t: Tab) {
    this.tab.set(t);
    this.forgotPasswordView.set(false);
  }

  close() {
    this.closing.set(true);
    setTimeout(() => { this.closing.set(false); this.closed.emit(); }, 300);
  }

  private finishLoading(fn: () => void, start: number) {
    const wait = Math.max(0, 1500 - (Date.now() - start));
    setTimeout(() => { this.loadAnim?.stop(); this.loading.set(false); fn(); }, wait);
  }

  onLogin() {
    if (this.loading()) return;
    this.loading.set(true);
    this.loadAnim?.play();
    const start = Date.now();
    this.auth.login(this.login.username, this.login.password).subscribe({
      next: () => this.finishLoading(() => {
        this.toast.show(this.lang.lang() === 'fr' ? 'Connexion réussie !' : 'Signed in successfully!', 'success');
        this.close();
      }, start),
      error: (err) => this.finishLoading(() => {
        this.toast.show(err.error?.error || 'Erreur de connexion.', 'error');
      }, start),
    });
  }

  onSignup() {
    if (this.loading()) return;
    if (this.signup.password !== this.signup.passwordConfirm) {
      this.toast.show(this.lang.lang() === 'fr' ? 'Les mots de passe ne correspondent pas.' : 'Passwords do not match.', 'error');
      return;
    }
    if (!this.signup.acceptTerms) {
      this.toast.show(this.lang.lang() === 'fr' ? 'Veuillez accepter les conditions.' : 'Please accept the terms.', 'error');
      return;
    }
    this.loading.set(true);
    this.loadAnim?.play();
    const start = Date.now();
    const { passwordConfirm, acceptTerms, ...payload } = this.signup;
    this.auth.register(payload).subscribe({
      next: () => this.finishLoading(() => {
        this.toast.show(this.lang.lang() === 'fr' ? 'Compte créé avec succès !' : 'Account created successfully!', 'success');
        this.close();
      }, start),
      error: (err) => this.finishLoading(() => {
        this.toast.show(err.error?.error || 'Erreur lors de l\'inscription.', 'error');
      }, start),
    });
  }
}
