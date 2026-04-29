import { ChangeDetectorRef, Component, OnInit, ElementRef, QueryList, ViewChildren, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './about.html',
  styleUrl: './about.scss',
})
export class AboutComponent implements OnInit {
  @ViewChildren('revealEl') revealEls!: QueryList<ElementRef>;
  lang = inject(TranslationService);
  cdr  = inject(ChangeDetectorRef);

  stats = [
    { current: 0, target: 2009, suffix: '',  key: 'about.stat1' },
    { current: 0, target: 15,   suffix: '+', key: 'about.stat2' },
    { current: 0, target: 360,  suffix: '°', key: 'about.stat3' },
  ];

  ngOnInit(): void {
    const revealIO = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('visible');
      }),
      { threshold: 0.15 }
    );

    const odomIO = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          this.runCounters();
          odomIO.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    setTimeout(() => {
      this.revealEls?.forEach(el => revealIO.observe(el.nativeElement));
      const statsEl = document.querySelector('.about__stats');
      if (statsEl) odomIO.observe(statsEl);
    }, 100);
  }

  private runCounters(): void {
    const duration = 2000;
    const startTime = performance.now();
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = easeOut(progress);
      this.stats.forEach(s => s.current = Math.round(eased * s.target));
      this.cdr.detectChanges();
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }
}
