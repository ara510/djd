import { Component, OnInit, ElementRef, QueryList, ViewChildren, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './services.html',
  styleUrl: './services.scss',
})
export class ServicesComponent implements OnInit {
  @ViewChildren('revealEl') revealEls!: QueryList<ElementRef>;
  lang = inject(TranslationService);

  services = [
    { number: '01', titleKey: 'services.1.title', descKey: 'services.1.desc' },
    { number: '02', titleKey: 'services.2.title', descKey: 'services.2.desc' },
    { number: '03', titleKey: 'services.3.title', descKey: 'services.3.desc' },
    { number: '04', titleKey: 'services.4.title', descKey: 'services.4.desc' },
    { number: '05', titleKey: 'services.5.title', descKey: 'services.5.desc' },
    { number: '06', titleKey: 'services.6.title', descKey: 'services.6.desc' },
  ];

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
