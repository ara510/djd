import { Component, signal, inject } from '@angular/core';
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
    CookieBannerComponent,
    PrivacyModalComponent,
  ],
  template: `
    <app-navbar></app-navbar>

    <main>
      <app-hero></app-hero>
      <app-about></app-about>
      <app-services></app-services>
      <app-izao></app-izao>
      <app-approach></app-approach>
      <app-contact></app-contact>
    </main>

    <app-toast></app-toast>

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
  privacy          = inject(PrivacyService);
  showCookieBanner = signal(false);

  constructor() {
    if (!localStorage.getItem('djd_cookies'))
      setTimeout(() => this.showCookieBanner.set(true), 3000);
  }
}
