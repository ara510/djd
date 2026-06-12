import { Component, signal, inject, HostListener } from '@angular/core';
import { AuthService } from './services/auth.service';
import { PrivacyService } from './services/privacy.service';
import { VeilleService } from './services/veille.service';
import { DashboardComponent } from './components/dashboard/dashboard';
import { AdminWelcomeComponent } from './components/admin-welcome/admin-welcome';
import { CookieBannerComponent } from './components/cookie-banner/cookie-banner';
import { PrivacyModalComponent } from './components/privacy-modal/privacy-modal';
import { FeedbackModalComponent } from './components/feedback-modal/feedback-modal';
import { ResetPasswordComponent } from './components/reset-password/reset-password';
import { NavbarComponent }   from './components/navbar/navbar';
import { HeroComponent }     from './components/hero/hero';
import { AboutComponent }    from './components/about/about';
import { ServicesComponent } from './components/services/services';
import { IzaoComponent }     from './components/izao/izao';
import { ApproachComponent } from './components/approach/approach';
import { ContactComponent }  from './components/contact/contact';
import { ToastComponent }    from './components/toast/toast';
import { AuthComponent }     from './components/auth/auth';
import { ProfileComponent }  from './components/profile/profile';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    NavbarComponent,
    HeroComponent,
    AboutComponent,
    ServicesComponent,
    IzaoComponent,
    ApproachComponent,
    ContactComponent,
    ToastComponent,
    AuthComponent,
    ProfileComponent,
    CookieBannerComponent,
    PrivacyModalComponent,
    FeedbackModalComponent,
    ResetPasswordComponent,
    DashboardComponent,
    AdminWelcomeComponent,
  ],
  template: `
    <app-navbar
      (openAuth)="showAuth.set(true)"
      (openProfile)="showProfile.set(true)">
    </app-navbar>

    <main>
      <app-hero></app-hero>
      <app-about></app-about>
      <app-services></app-services>
      <app-izao></app-izao>
      <app-approach></app-approach>
      <app-contact></app-contact>
    </main>

    <app-toast></app-toast>

    @if (showAuth()) {
      <app-auth (closed)="showAuth.set(false)"></app-auth>
    }
    @if (showProfile()) {
      <app-profile (closed)="showProfile.set(false)" (openFeedback)="showFeedback.set(true)"></app-profile>
    }
    @if (showFeedback()) {
      <app-feedback-modal (closed)="showFeedback.set(false)"></app-feedback-modal>
    }
    @if (showCookieBanner()) {
      <app-cookie-banner (accepted)="showCookieBanner.set(false)"></app-cookie-banner>
    }
    @if (privacy.isOpen()) {
      <app-privacy-modal></app-privacy-modal>
    }
    @if (resetToken()) {
      <app-reset-password [token]="resetToken()!" (closed)="clearResetToken()"></app-reset-password>
    }
    @if (veille.isOpen()) {
      <app-dashboard></app-dashboard>
    }
    @if (auth.showAdminWelcome()) {
      <app-admin-welcome (closed)="auth.showAdminWelcome.set(false)"></app-admin-welcome>
    }
  `,
  styles: [``],
})
export class App {
  auth         = inject(AuthService);
  privacy      = inject(PrivacyService);
  veille       = inject(VeilleService);
  showAuth         = signal(false);
  showProfile      = signal(false);
  showCookieBanner = signal(false);
  showFeedback     = signal(false);
  resetToken       = signal<string | null>(null);

  constructor() {
    if (!localStorage.getItem('djd_cookies'))
      setTimeout(() => this.showCookieBanner.set(true), 3000);

    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset');
    if (token) {
      this.resetToken.set(token);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  clearResetToken() { this.resetToken.set(null); }

  @HostListener('document:mousemove')
  @HostListener('document:click')
  @HostListener('document:keydown')
  @HostListener('document:scroll')
  @HostListener('document:touchstart')
  onActivity() { this.auth.resetActivityTimer(); }
}
