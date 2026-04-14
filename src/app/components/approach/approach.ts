import { Component, OnInit, ElementRef, QueryList, ViewChildren, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-approach',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './approach.html',
  styleUrl: './approach.scss',
})
export class ApproachComponent implements OnInit {
  @ViewChildren('revealEl') revealEls!: QueryList<ElementRef>;
  lang = inject(TranslationService);

  pillars = [
    { icon: '◈', titleKey: 'approach.p1.title', bodyKey: 'approach.p1.body' },
    { icon: '◉', titleKey: 'approach.p2.title', bodyKey: 'approach.p2.body' },
    { icon: '◎', titleKey: 'approach.p3.title', bodyKey: 'approach.p3.body' },
    { icon: '◇', titleKey: 'approach.p4.title', bodyKey: 'approach.p4.body' },
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
