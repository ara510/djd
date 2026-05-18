import { Component, signal, inject, HostListener } from '@angular/core';
import { AuthService } from './services/auth.service';
import { PrivacyService } from './services/privacy.service';
import { CookieBannerComponent } from './components/cookie-banner/cookie-banner';
import { PrivacyModalComponent } from './components/privacy-modal/privacy-modal';
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
      <app-profile (closed)="showProfile.set(false)"></app-profile>
    }
    @if (showCookieBanner()) {
      <app-cookie-banner (accepted)="showCookieBanner.set(false)"></app-cookie-banner>
    }
    @if (privacy.isOpen()) {
      <app-privacy-modal></app-privacy-modal>
    }
  `,
  styles: [``],
})
export class App {
  private auth = inject(AuthService);
  privacy      = inject(PrivacyService);
  showAuth         = signal(false);
  showProfile      = signal(false);
  showCookieBanner = signal(!localStorage.getItem('djd_cookies'));

  @HostListener('document:mousemove')
  @HostListener('document:click')
  @HostListener('document:keydown')
  @HostListener('document:scroll')
  @HostListener('document:touchstart')
  onActivity() { this.auth.resetActivityTimer(); }
}
