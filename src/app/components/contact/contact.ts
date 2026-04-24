import { Component, OnInit, ElementRef, QueryList, ViewChildren, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TranslationService } from '../../services/translation.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contact.html',
  styleUrl: './contact.scss',
})
export class ContactComponent implements OnInit {
  @ViewChildren('revealEl') revealEls!: QueryList<ElementRef>;
  lang    = inject(TranslationService);
  toast   = inject(ToastService);
  http    = inject(HttpClient);

  form = { name: '', email: '', message: '' };
  loading = false;
  currentYear = new Date().getFullYear();

  onSubmit() {
    if (this.loading) return;
    this.loading = true;

    this.http.post<{ success: boolean }>('/api/contact', this.form).subscribe({
      next: () => {
        this.toast.show('Message envoyé avec succès !', 'success');
        this.form = { name: '', email: '', message: '' };
        this.loading = false;
      },
      error: () => {
        this.toast.show("Échec de l'envoi. Veuillez réessayer.", 'error');
        this.loading = false;
      },
    });
  }

  ngOnInit(): void {
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('visible');
      }),
      { threshold: 0.1 }
    );
    setTimeout(() => {
      this.revealEls?.forEach(el => io.observe(el.nativeElement));
    }, 100);
  }
}
