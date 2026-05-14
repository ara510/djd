import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, QueryList, ViewChild, ViewChildren, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TranslationService } from '../../services/translation.service';
import { ToastService } from '../../services/toast.service';
import lottie, { AnimationItem } from 'lottie-web';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contact.html',
  styleUrl: './contact.scss',
})
export class ContactComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChildren('revealEl') revealEls!: QueryList<ElementRef>;
  @ViewChild('loadingLottie') loadingLottieRef!: ElementRef<HTMLDivElement>;

  lang    = inject(TranslationService);
  toast   = inject(ToastService);
  http    = inject(HttpClient);

  form = { name: '', email: '', message: '' };
  loading = false;
  currentYear = new Date().getFullYear();

  private loadAnim?: AnimationItem;

  ngAfterViewInit() {
    this.loadAnim = lottie.loadAnimation({
      container: this.loadingLottieRef.nativeElement,
      renderer:  'svg',
      loop:      true,
      autoplay:  false,
      path:      'assets/loading-animation.json',
    });
  }

  ngOnDestroy() { this.loadAnim?.destroy(); }

  onSubmit() {
    if (this.loading) return;
    this.loading = true;
    this.loadAnim?.play();
    const start = Date.now();

    const finish = (fn: () => void) => {
      const wait = Math.max(0, 1500 - (Date.now() - start));
      setTimeout(() => { this.loadAnim?.stop(); this.loading = false; fn(); }, wait);
    };

    this.http.post<{ success: boolean }>(`${environment.apiUrl}/api/contact`, this.form).subscribe({
      next: () => finish(() => {
        this.toast.show('Message envoyé avec succès !', 'success');
        this.form = { name: '', email: '', message: '' };
      }),
      error: () => finish(() => {
        this.toast.show("Échec de l'envoi. Veuillez réessayer.", 'error');
      }),
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
