import { Component, inject, signal } from '@angular/core';
import { PrivacyService } from '../../services/privacy.service';
import { TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-privacy-modal',
  standalone: true,
  templateUrl: './privacy-modal.html',
  styleUrl: './privacy-modal.scss',
})
export class PrivacyModalComponent {
  privacy = inject(PrivacyService);
  lang    = inject(TranslationService);
  closing = signal(false);

  close() {
    this.closing.set(true);
    setTimeout(() => { this.closing.set(false); this.privacy.close(); }, 300);
  }
}
