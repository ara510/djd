import {
  Component,
  HostListener,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  ElementRef,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../services/translation.service';
import { GalleryService }     from '../../services/gallery.service';

export interface GalleryPhoto {
  src: string;
  caption: string;
  captionEn: string;
  kb: 'kb-1' | 'kb-2' | 'kb-3' | 'kb-4';
}

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gallery.html',
  styleUrl: './gallery.scss',
})
export class GalleryComponent implements AfterViewInit, OnDestroy {
  @ViewChild('track') trackRef!: ElementRef<HTMLElement>;

  lang    = inject(TranslationService);
  gallery = inject(GalleryService);

  current = signal(0);

  photos: GalleryPhoto[] = [
    { src: 'g01.png', caption: 'Terrain — Zébus traversant un point d\'eau, Madagascar',        captionEn: 'Field — Zebu cattle crossing a watering hole, Madagascar',        kb: 'kb-1' },
    { src: 'g02.png', caption: 'Programme IFC — Communication pour l\'industrie malagasy',      captionEn: 'IFC Programme — Communication for Malagasy industry',             kb: 'kb-2' },
    { src: 'g03.png', caption: 'Atelier stratégie — Session de travail en salle',               captionEn: 'Strategy Workshop — Indoor working session',                      kb: 'kb-3' },
    { src: 'g04.png', caption: 'Antananarivo by night — Monument illuminé en bleu',             captionEn: 'Antananarivo by night — Monument illuminated in blue',            kb: 'kb-4' },
    { src: 'g05.png', caption: 'Communication terrain — Conférence de presse',                  captionEn: 'Field Communication — Press conference',                          kb: 'kb-1' },
    { src: 'g06.png', caption: 'Présence locale — Siège institutionnel à Madagascar',           captionEn: 'Local Presence — Institutional headquarters in Madagascar',        kb: 'kb-2' },
    { src: 'g07.png', caption: 'Dujardin Delacour — Prise de parole avec partenaires',         captionEn: 'Dujardin Delacour — Address with partners',                        kb: 'kb-3' },
    { src: 'g08.png', caption: 'Colloque pour le développement — Photo officielle',             captionEn: 'Development Symposium — Official group photo',                    kb: 'kb-4' },
    { src: 'g09.png', caption: 'Mobilisation communautaire — Événement en plein air',           captionEn: 'Community Outreach — Open-air event',                            kb: 'kb-1' },
    { src: 'g10.png', caption: 'Déploiement terrain — Mise en place de la signalétique',        captionEn: 'Field Deployment — Setting up event signage',                     kb: 'kb-2' },
    { src: 'g11.png', caption: 'Salon professionnel — Networking et représentation',            captionEn: 'Professional Fair — Networking and representation',               kb: 'kb-3' },
    { src: 'g12.png', caption: 'Prise de parole — Maîtrise de la scène et du message',         captionEn: 'Public Speaking — Mastering the stage and the message',           kb: 'kb-4' },
    { src: 'g13.png', caption: 'Captana — Partenariat stratégique',                            captionEn: 'Captana — Strategic partnership',                                  kb: 'kb-1' },
    { src: 'g14.png', caption: 'Infrastructure rurale — Canal d\'irrigation, Madagascar',       captionEn: 'Rural Infrastructure — Irrigation canal, Madagascar',             kb: 'kb-2' },
    { src: 'g15.png', caption: 'Table ronde institutionnelle — Dialogue et gouvernance',        captionEn: 'Institutional Round Table — Dialogue and governance',             kb: 'kb-3' },
    { src: 'g16.png', caption: 'Terrain — Élevage et activité rurale, Madagascar',              captionEn: 'Field — Livestock and rural activity, Madagascar',                kb: 'kb-4' },
    { src: 'g17.png', caption: 'Échange professionnel — Rencontre avec un partenaire',         captionEn: 'Professional Exchange — Meeting with a partner',                   kb: 'kb-1' },
    { src: 'g18.png', caption: 'Atelier participatif — Co-construction avec les acteurs',      captionEn: 'Participatory Workshop — Co-building with stakeholders',           kb: 'kb-2' },
    { src: 'g19.png', caption: 'Racines — Case traditionnelle malagasy, ancrage culturel',     captionEn: 'Roots — Traditional Malagasy hut, cultural grounding',             kb: 'kb-3' },
  ];

  total = computed(() => this.photos.length);

  caption(p: GalleryPhoto) {
    return this.lang.lang() === 'fr' ? p.caption : p.captionEn;
  }

  ngAfterViewInit() {}

  // ─── Défilement : centre la slide active ──────────────────────────────────
  private scrollToActive() {
    const track = this.trackRef?.nativeElement;
    if (!track) return;
    const slide = track.children[this.current()] as HTMLElement;
    if (!slide) return;
    const trackCenter = track.parentElement!.offsetWidth / 2;
    const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
    track.style.transform = `translateX(${trackCenter - slideCenter}px)`;
  }

  goTo(index: number) {
    this.current.set(index);
    setTimeout(() => this.scrollToActive(), 0);
  }

  prev() {
    this.current.update(i => Math.max(0, i - 1));
    setTimeout(() => this.scrollToActive(), 0);
  }

  next() {
    this.current.update(i => Math.min(this.photos.length - 1, i + 1));
    setTimeout(() => this.scrollToActive(), 0);
  }

  close() {
    this.gallery.close();
    this.current.set(0);
    const track = this.trackRef?.nativeElement;
    if (track) track.style.transform = '';
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (!this.gallery.isOpen()) return;
    if (e.key === 'Escape')     this.close();
    if (e.key === 'ArrowLeft')  this.prev();
    if (e.key === 'ArrowRight') this.next();
  }

  ngOnDestroy() {}
}
