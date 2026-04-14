import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../services/translation.service';
import { GalleryService }     from '../../services/gallery.service';
import { GalleryComponent }   from '../gallery/gallery';

interface NavLink { target: string; key: string; }

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, GalleryComponent],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class NavbarComponent implements OnInit {
  lang    = inject(TranslationService);
  gallery = inject(GalleryService);

  scrolled      = signal(false);
  menuOpen      = signal(false);
  activeSection = signal('');

  links: NavLink[] = [
    { key: 'nav.about',    target: 'about'    },
    { key: 'nav.services', target: 'services' },
    { key: 'nav.izao',     target: 'izao'     },
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
    this.scrolled.set(window.scrollY > 60);
  }

  scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    this.menuOpen.set(false);
  }

  toggleMenu() { this.menuOpen.update(v => !v); }
}
