import { Component, inject, output } from '@angular/core';
import { TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-admin-welcome',
  standalone: true,
  templateUrl: './admin-welcome.html',
  styleUrl: './admin-welcome.scss',
})
export class AdminWelcomeComponent {
  lang = inject(TranslationService);
  closed = output<void>();
  close() { this.closed.emit(); }
}
