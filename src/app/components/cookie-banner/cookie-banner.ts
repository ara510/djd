import { Component, inject, output } from '@angular/core';
import { PrivacyService } from '../../services/privacy.service';
import { TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-cookie-banner',
  standalone: true,
  templateUrl: './cookie-banner.html',
  styleUrl: './cookie-banner.scss',
})
export class CookieBannerComponent {
  privacy = inject(PrivacyService);
  lang    = inject(TranslationService);

  accepted = output<void>();

  accept() {
    localStorage.setItem('djd_cookies', 'accepted');
    this.accepted.emit();
  }

  openPrivacy() {
    this.privacy.open();
  }
}
