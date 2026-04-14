import { Component, OnInit, ElementRef, QueryList, ViewChildren, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-izao',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './izao.html',
  styleUrl: './izao.scss',
})
export class IzaoComponent implements OnInit {
  @ViewChildren('revealEl') revealEls!: QueryList<ElementRef>;
  lang = inject(TranslationService);

  partners = ['Ordre des Journalistes de Madagascar', 'Karine Rabefaritra'];

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
