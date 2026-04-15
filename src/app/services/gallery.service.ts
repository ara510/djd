import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GalleryService {
  isOpen     = signal(false);
  startIndex = signal(0);

  open(index = 0) {
    this.startIndex.set(index);
    this.isOpen.set(true);
    document.body.style.overflow = 'hidden';
  }

  close() {
    this.isOpen.set(false);
    document.body.style.overflow = '';
  }
}
