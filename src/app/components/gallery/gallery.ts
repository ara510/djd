import {
  Component,
  HostListener,
  OnDestroy,
  signal,
  computed,
  inject,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../services/translation.service';
import { GalleryService }      from '../../services/gallery.service';

export interface GalleryPhoto {
  src: string;
  caption: string;
  captionEn: string;
  /** classe Ken Burns différente par photo */
  kb: 'kb-1' | 'kb-2' | 'kb-3' | 'kb-4';
}

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gallery.html',
  styleUrl: './gallery.scss',
})
export class GalleryComponent implements OnDestroy {
  lang    = inject(TranslationService);
  gallery = inject(GalleryService);
  zone    = inject(NgZone);

  // ─── État ──────────────────────────────────────────────────────────────────
  current    = signal(0);
  prevIdx    = signal(0);
  animating  = signal(false);   // lock pendant la transition
  isPlaying  = signal(true);    // autoplay
  progress   = signal(0);       // 0-100 pour la barre de progression
  showGrid   = signal(false);   // vue grille vs plein écran

  private timer: ReturnType<typeof setInterval> | null = null;
  private progTimer: ReturnType<typeof setInterval> | null = null;
  readonly DURATION = 5000; // ms par photo

  photos: GalleryPhoto[] = [
    { src: 'g01.png', caption: 'Terrain — Zébus traversant un point d\'eau, Madagascar',          captionEn: 'Field — Zebu cattle crossing a watering hole, Madagascar',      kb: 'kb-1' },
    { src: 'g02.png', caption: 'Programme IFC — Communication pour l\'industrie malagasy',        captionEn: 'IFC Programme — Communication for Malagasy industry',           kb: 'kb-2' },
    { src: 'g03.png', caption: 'Atelier stratégie — Session de travail en salle',                 captionEn: 'Strategy Workshop — Indoor working session',                    kb: 'kb-3' },
    { src: 'g04.png', caption: 'Antananarivo by night — Monument illuminé en bleu',               captionEn: 'Antananarivo by night — Monument illuminated in blue',          kb: 'kb-4' },
    { src: 'g05.png', caption: 'Communication terrain — Conférence de presse',                    captionEn: 'Field Communication — Press conference',                       kb: 'kb-1' },
    { src: 'g06.png', caption: 'Engagement local — Architecture et ancrage territorial',          captionEn: 'Local Engagement — Architecture and territorial presence',      kb: 'kb-2' },
    { src: 'g07.png', caption: 'Dujardin Delacour — Table ronde avec partenaires',               captionEn: 'Dujardin Delacour — Round table with partners',                kb: 'kb-3' },
    { src: 'g08.png', caption: 'Colloque pour le développement — Photo officielle',               captionEn: 'Development Symposium — Official group photo',                  kb: 'kb-4' },
    { src: 'g09.png', caption: 'Mobilisation communautaire — Événement en plein air',             captionEn: 'Community Outreach — Open-air event',                          kb: 'kb-1' },
    { src: 'g10.png', caption: 'Déploiement terrain — Mise en place de la signalétique',          captionEn: 'Field Deployment — Setting up event signage',                   kb: 'kb-2' },
    { src: 'g11.png', caption: 'Salon professionnel — Networking et représentation',              captionEn: 'Professional Fair — Networking and representation',             kb: 'kb-3' },
    { src: 'g12.png', caption: 'Prise de parole — Maîtrise de la scène et du message',           captionEn: 'Public Speaking — Mastering the stage and the message',        kb: 'kb-4' },
    { src: 'g13.png', caption: 'Captana — Partenariat stratégique',                              captionEn: 'Captana — Strategic partnership',                               kb: 'kb-1' },
    { src: 'g14.png', caption: 'Territoire — Paysage rural de Madagascar',                       captionEn: 'Territory — Rural landscape of Madagascar',                     kb: 'kb-2' },
    { src: 'g15.png', caption: 'Table ronde institutionnelle — Dialogue et gouvernance',          captionEn: 'Institutional Round Table — Dialogue and governance',           kb: 'kb-3' },
    { src: 'g16.png', caption: 'Terrain rural — Proximité et engagement communautaire',           captionEn: 'Rural Field — Proximity and community engagement',              kb: 'kb-4' },
    { src: 'g17.png', caption: 'Échange professionnel — Rencontre avec un partenaire',           captionEn: 'Professional Exchange — Meeting with a partner',                kb: 'kb-1' },
    { src: 'g18.png', caption: 'Atelier participatif — Co-construction avec les acteurs',        captionEn: 'Participatory Workshop — Co-building with stakeholders',        kb: 'kb-2' },
    { src: 'g19.png', caption: 'Racines — Case traditionnelle malagasy, ancrage culturel',       captionEn: 'Roots — Traditional Malagasy hut, cultural grounding',          kb: 'kb-3' },
  ];

  total = computed(() => this.photos.length);
  photo = computed(() => this.photos[this.current()]);

  caption(p: GalleryPhoto) {
    return this.lang.lang() === 'fr' ? p.caption : p.captionEn;
  }

  // ─── Ouverture / fermeture ─────────────────────────────────────────────────
  open(index = 0) {
    this.current.set(index);
    this.prevIdx.set(index);
    this.showGrid.set(false);
    this.gallery.open();
    this.startAutoplay();
  }

  close() {
    this.gallery.close();
    this.stopAutoplay();
    this.showGrid.set(false);
  }

  // ─── Navigation ────────────────────────────────────────────────────────────
  navigate(dir: 1 | -1) {
    if (this.animating()) return;
    this.animating.set(true);
    this.prevIdx.set(this.current());
    this.current.update(i => (i + dir + this.photos.length) % this.photos.length);
    this.resetProgress();
    setTimeout(() => this.animating.set(false), 600);
  }

  prev() { this.navigate(-1); }
  next() { this.navigate(1); }

  goTo(index: number) {
    if (index === this.current() || this.animating()) return;
    this.animating.set(true);
    this.prevIdx.set(this.current());
    this.current.set(index);
    this.resetProgress();
    setTimeout(() => this.animating.set(false), 600);
  }

  // ─── Autoplay ──────────────────────────────────────────────────────────────
  startAutoplay() {
    this.stopAutoplay();
    this.progress.set(0);
    if (!this.isPlaying()) return;

    // progress bar : tick toutes les 50ms
    const step = (50 / this.DURATION) * 100;
    this.progTimer = setInterval(() => {
      this.zone.run(() => {
        this.progress.update(p => Math.min(p + step, 100));
      });
    }, 50);

    this.timer = setInterval(() => {
      this.zone.run(() => this.next());
    }, this.DURATION);
  }

  stopAutoplay() {
    if (this.timer)     { clearInterval(this.timer);     this.timer = null; }
    if (this.progTimer) { clearInterval(this.progTimer); this.progTimer = null; }
  }

  resetProgress() {
    this.progress.set(0);
    this.stopAutoplay();
    this.startAutoplay();
  }

  togglePlay() {
    this.isPlaying.update(p => !p);
    if (this.isPlaying()) this.startAutoplay();
    else this.stopAutoplay();
  }

  toggleGrid() { this.showGrid.update(v => !v); }

  pauseOnHover()  { if (this.isPlaying()) this.stopAutoplay(); }
  resumeOnHover() { if (this.isPlaying()) this.startAutoplay(); }

  // ─── Keyboard ──────────────────────────────────────────────────────────────
  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (!this.gallery.isOpen()) return;
    if (e.key === 'Escape')     this.close();
    if (e.key === 'ArrowLeft')  { this.prev(); }
    if (e.key === 'ArrowRight') { this.next(); }
    if (e.key === ' ')          { e.preventDefault(); this.togglePlay(); }
    if (e.key === 'g')          this.toggleGrid();
  }

  ngOnDestroy() { this.stopAutoplay(); }
}
