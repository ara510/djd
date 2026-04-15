import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  inject,
  signal,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { GalleryService } from '../../services/gallery.service';
import { GalleryComponent } from '../gallery/gallery';

@Component({
  selector: 'app-photostrip',
  standalone: true,
  imports: [CommonModule, GalleryComponent],
  templateUrl: './photostrip.html',
  styleUrl: './photostrip.scss',
})
export class PhotoStripComponent implements AfterViewInit, OnDestroy {
  @ViewChild('track') trackRef!: ElementRef<HTMLElement>;

  gallery = inject(GalleryService);
  zone    = inject(NgZone);

  canPrev = signal(false);
  canNext = signal(true);

  photos = [
    'g01.png','g02.png','g03.png','g04.png','g05.png','g06.png','g07.png',
    'g08.png','g09.png','g10.png','g11.png','g12.png','g13.png','g14.png',
    'g15.png','g16.png','g17.png','g18.png','g19.png',
  ];

  private rafId: number | null = null;
  private speed = 0.6;          // px / frame
  private paused = false;
  private dragStartX = 0;
  private dragScrollStart = 0;
  private dragging = false;

  ngAfterViewInit() {
    this.startAutoScroll();
    this.updateArrows();
  }

  private startAutoScroll() {
    const tick = () => {
      if (!this.paused) {
        const el = this.trackRef?.nativeElement;
        if (el) {
          el.scrollLeft += this.speed;
          // boucle infinie : quand on atteint la moitié (clone), on repart
          if (el.scrollLeft >= el.scrollWidth / 2) {
            el.scrollLeft = 0;
          }
          this.zone.run(() => this.updateArrows());
        }
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  pause()  { this.paused = true; }
  resume() { this.paused = false; }

  scroll(dir: 1 | -1) {
    const el = this.trackRef?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: dir * 340, behavior: 'smooth' });
    setTimeout(() => this.updateArrows(), 400);
  }

  private updateArrows() {
    const el = this.trackRef?.nativeElement;
    if (!el) return;
    this.canPrev.set(el.scrollLeft > 10);
    this.canNext.set(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }

  openPhoto(index: number) {
    if (!this.dragging) this.gallery.open(index);
  }

  // ─── Drag to scroll ────────────────────────────────────────────────────────
  onDragStart(e: MouseEvent) {
    this.dragging = false;
    this.dragStartX = e.clientX;
    this.dragScrollStart = this.trackRef.nativeElement.scrollLeft;
    this.pause();
  }

  onDragMove(e: MouseEvent) {
    if (e.buttons !== 1) return;
    const dx = e.clientX - this.dragStartX;
    if (Math.abs(dx) > 5) this.dragging = true;
    this.trackRef.nativeElement.scrollLeft = this.dragScrollStart - dx;
    this.updateArrows();
  }

  onDragEnd() {
    setTimeout(() => { this.dragging = false; }, 50);
    this.resume();
  }

  ngOnDestroy() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }
}
