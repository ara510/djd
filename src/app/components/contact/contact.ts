import { Component, OnInit, ElementRef, QueryList, ViewChildren, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contact.html',
  styleUrl: './contact.scss',
})
export class ContactComponent implements OnInit {
  @ViewChildren('revealEl') revealEls!: QueryList<ElementRef>;
  lang = inject(TranslationService);

  form = { name: '', email: '', message: '' };
  submitted = false;
  currentYear = new Date().getFullYear();

  onSubmit() { this.submitted = true; }

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
