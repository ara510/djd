import { Component, OnInit, ElementRef, QueryList, ViewChildren, inject } from '@angular/core';
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

  stats = [
    { value: '2009', key: 'about.stat1' },
    { value: '15+',  key: 'about.stat2' },
    { value: '360°', key: 'about.stat3' },
  ];

  ngOnInit(): void {
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('visible');
      }),
      { threshold: 0.15 }
    );
    setTimeout(() => {
      this.revealEls?.forEach(el => io.observe(el.nativeElement));
    }, 100);
  }
}
