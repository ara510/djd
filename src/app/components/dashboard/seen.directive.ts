import { Directive, ElementRef, EventEmitter, OnDestroy, OnInit, Output, inject } from '@angular/core';

/**
 * Émet `appSeen` une seule fois lorsque l'élément devient visible à l'écran.
 * Utilisé par le fil Dédiée pour marquer une veille comme lue au défilement.
 */
@Directive({ selector: '[appSeen]', standalone: true })
export class SeenDirective implements OnInit, OnDestroy {
  private el = inject(ElementRef<HTMLElement>);
  @Output() appSeen = new EventEmitter<void>();
  private obs?: IntersectionObserver;

  ngOnInit() {
    if (typeof IntersectionObserver === 'undefined') { this.appSeen.emit(); return; }
    this.obs = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) { this.appSeen.emit(); this.obs?.disconnect(); break; }
      }
    }, { threshold: 0.5 });
    this.obs.observe(this.el.nativeElement);
  }

  ngOnDestroy() { this.obs?.disconnect(); }
}
