import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../services/translation.service';

interface NavLink { target: string; key: string; }

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class NavbarComponent implements OnInit {
  lang = inject(TranslationService);

  scrolled      = signal(false);
  hidden        = signal(false);
  menuOpen      = signal(false);
  activeSection = signal('');

  private lastScrollY = 0;

  links: NavLink[] = [
    { key: 'nav.about',    target: 'about'    },
    { key: 'nav.services', target: 'services' },
    { key: 'nav.approach', target: 'approach' },
    { key: 'nav.contact',  target: 'contact'  },
  ];

  ngOnInit() {
    const io = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) this.activeSection.set(entry.target.id);
        }
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
    );
    for (const link of this.links) {
      const el = document.getElementById(link.target);
      if (el) io.observe(el);
    }
  }

  @HostListener('window:scroll')
  onScroll() {
    const current = window.scrollY;
    this.scrolled.set(current > 60);
    this.hidden.set(current > this.lastScrollY && current > 80);
    this.lastScrollY = current;
  }

  scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    this.menuOpen.set(false);
  }

  toggleMenu() { this.menuOpen.update(v => !v); }
}
