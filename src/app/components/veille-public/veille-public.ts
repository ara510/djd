import { Component, inject, signal, output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { TranslationService } from '../../services/translation.service';
import { AuthService } from '../../services/auth.service';
import { VeilleItem } from '../../services/veille.service';
import { VeilleIconComponent } from '../veille-icon/veille-icon';

interface Opt { value: string; fr: string; en: string; }

@Component({
  selector: 'app-veille-public',
  standalone: true,
  imports: [CommonModule, VeilleIconComponent],
  templateUrl: './veille-public.html',
  styleUrl: './veille-public.scss',
})
export class VeillePublicComponent implements OnInit {
  private http = inject(HttpClient);
  lang = inject(TranslationService);
  auth = inject(AuthService);

  /** Demande l'ouverture de la modale de connexion/inscription. */
  openAuth = output<void>();

  readonly LIMIT = 5;
  readonly STORE = 'djd_public_reads';

  items    = signal<VeilleItem[]>([]);
  loading  = signal(true);
  selected = signal<VeilleItem | null>(null);
  showGate = signal(false);

  get fr(): boolean { return this.lang.lang() === 'fr'; }
  get isLogged(): boolean { return !!this.auth.currentUser(); }

  readonly sourceTypes: Opt[] = [
    { value: 'web', fr: 'Site web', en: 'Website' }, { value: 'social', fr: 'Réseau social', en: 'Social media' },
    { value: 'radio', fr: 'Radio', en: 'Radio' }, { value: 'tv', fr: 'Télévision', en: 'TV' }, { value: 'presse', fr: 'Presse écrite', en: 'Print press' },
  ];
  readonly sectors: Opt[] = [
    { value: 'politique', fr: 'Politique', en: 'Politics' }, { value: 'economie', fr: 'Économie', en: 'Economy' },
    { value: 'international', fr: 'International', en: 'International' }, { value: 'social', fr: 'Social', en: 'Social' }, { value: 'autre', fr: 'Autre', en: 'Other' },
  ];
  readonly networks: Record<string, string> = { facebook: 'Facebook', youtube: 'YouTube', instagram: 'Instagram', x: 'X', linkedin: 'LinkedIn' };

  typeLabel(v?: string | null) { const o = this.sourceTypes.find(t => t.value === v); return o ? (this.fr ? o.fr : o.en) : ''; }
  sectorLabel(v?: string | null) { const o = this.sectors.find(s => s.value === v); return o ? (this.fr ? o.fr : o.en) : ''; }
  networkLabel(v?: string | null) { return v ? (this.networks[v] ?? '') : ''; }
  typesOf(i: VeilleItem): string[] { return i.source_types?.length ? i.source_types : (i.source_type ? [i.source_type] : []); }
  cardHeading(i: VeilleItem): string { return i.title || this.sectorLabel(i.sector) || i.source || this.typeLabel(i.source_type); }
  showSectorChip(i: VeilleItem): boolean { return !!i.title && !!i.sector; }

  ngOnInit() {
    this.http.get<VeilleItem[]>('/api/veille/public').subscribe({
      next: rows => { this.items.set(rows); this.loading.set(false); },
      error: ()  => this.loading.set(false),
    });
  }

  private reads(): number[] {
    try { return JSON.parse(localStorage.getItem(this.STORE) || '[]'); } catch { return []; }
  }
  get remaining(): number { return Math.max(0, this.LIMIT - this.reads().length); }

  openItem(item: VeilleItem) {
    if (this.isLogged) { this.selected.set(item); return; }       // connecté : pas de limite ici
    const r = this.reads();
    if (r.includes(item.id)) { this.selected.set(item); return; } // déjà lue → ne recompte pas
    if (r.length >= this.LIMIT) { this.showGate.set(true); return; }
    r.push(item.id);
    localStorage.setItem(this.STORE, JSON.stringify(r));
    this.selected.set(item);
  }

  close() { this.selected.set(null); }

  goSignup() { this.showGate.set(false); this.selected.set(null); this.openAuth.emit(); }
}
