import { Injectable, signal, computed } from '@angular/core';
import { Lang, TRANSLATIONS } from '../i18n/translations';

@Injectable({ providedIn: 'root' })
export class TranslationService {
  readonly lang = signal<Lang>('fr');

  toggle() {
    this.lang.update(l => l === 'fr' ? 'en' : 'fr');
  }

  t(key: string): string {
    return TRANSLATIONS[this.lang()][key] ?? key;
  }
}
