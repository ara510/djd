import { Component, HostListener, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslationService } from '../../services/translation.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { VeilleService, VeilleItem } from '../../services/veille.service';
import { AdminService, FeedbackItem, AdminUser } from '../../services/admin.service';
import { VeilleIconComponent } from '../veille-icon/veille-icon';

interface Option { value: string; fr: string; en: string; }

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, VeilleIconComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent {
  lang   = inject(TranslationService);
  auth   = inject(AuthService);
  toast  = inject(ToastService);
  veille = inject(VeilleService);
  admin  = inject(AdminService);
  private sanitizer = inject(DomSanitizer);

  closing = signal(false);

  // Vue active (admin) : feed, retours, utilisateurs, statistiques, journal, corbeille
  view = signal<'veille' | 'feedback' | 'users' | 'stats' | 'activity' | 'trash'>('veille');

  readonly activityMeta: Record<string, { fr: string; en: string; cat: string }> = {
    'veille.create': { fr: 'a créé une veille',        en: 'created a watch item',   cat: 'create' },
    'veille.update': { fr: 'a modifié une veille',     en: 'updated a watch item',   cat: 'update' },
    'veille.delete': { fr: 'a supprimé une veille',    en: 'deleted a watch item',   cat: 'delete' },
    'veille.pin':    { fr: 'a épinglé une veille',     en: 'pinned a watch item',    cat: 'update' },
    'veille.unpin':  { fr: 'a désépinglé une veille',  en: 'unpinned a watch item',  cat: 'update' },
    'veille.restore':{ fr: 'a restauré une veille',    en: 'restored a watch item',  cat: 'create' },
    'veille.purge':  { fr: 'a supprimé définitivement une veille', en: 'permanently deleted a watch item', cat: 'delete' },
    'user.plan':     { fr: 'a changé un abonnement',   en: 'changed a plan',         cat: 'user'   },
    'user.disable':  { fr: 'a désactivé un compte',    en: 'disabled an account',    cat: 'delete' },
    'user.enable':   { fr: 'a réactivé un compte',     en: 're-enabled an account',  cat: 'user'   },
  };

  actionLabel(a: string): string {
    const m = this.activityMeta[a];
    return m ? (this.fr ? m.fr : m.en) : a;
  }
  actionCat(a: string): string { return this.activityMeta[a]?.cat ?? 'update'; }

  readonly planValues = ['generale', 'sectorielle', 'dediee'];

  readonly feedbackCategories: Option[] = [
    { value: 'general',    fr: 'Général',      en: 'General'    },
    { value: 'bug',        fr: 'Bug / Erreur', en: 'Bug report' },
    { value: 'suggestion', fr: 'Suggestion',   en: 'Suggestion' },
  ];

  // Filtres
  activeType   = signal<string | null>(null);
  activeSector = signal<string | null>(null);
  readingFilter = signal<'all' | 'unread' | 'favorites'>('all');
  search = '';
  dateFrom = signal('');   // période — début (aaaa-mm-jj)
  dateTo   = signal('');   // période — fin   (aaaa-mm-jj)

  // Éditeur (admin)
  showEditor = signal(false);
  editingId  = signal<number | null>(null);
  saving     = signal(false);
  form = this.emptyForm();
  dateDisplay = ''; // date affichée/saisie en jj/mm/aaaa (form.published_at reste en ISO aaaa-mm-jj)

  // ── Date jj/mm/aaaa ↔ ISO aaaa-mm-jj ────────────────────────────────────
  private isoToDisplay(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return (d && m && y) ? `${d}/${m}/${y}` : '';
  }

  /** Parse le champ texte jj/mm/aaaa → met à jour form.published_at (ISO). */
  parseDate() {
    const s = this.dateDisplay.trim();
    if (!s) { this.form.published_at = ''; return; }
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const d = m ? +m[1] : 0, mo = m ? +m[2] : 0, y = m ? +m[3] : 0;
    if (!m || mo < 1 || mo > 12 || d < 1 || d > 31) {
      this.toast.show(this.fr ? 'Date invalide — format jj/mm/aaaa.' : 'Invalid date — dd/mm/yyyy.', 'error');
      this.dateDisplay = this.isoToDisplay(this.form.published_at);
      return;
    }
    this.form.published_at = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    this.dateDisplay = this.isoToDisplay(this.form.published_at);
  }

  /** Depuis le sélecteur natif (valeur ISO) → met à jour l'affichage jj/mm/aaaa. */
  setDateFromPicker(iso: string) {
    this.form.published_at = iso || '';
    this.dateDisplay = this.isoToDisplay(this.form.published_at);
  }

  // Vue détail (aperçu complet d'une veille)
  selectedItem = signal<VeilleItem | null>(null);

  // Visionneuse d'image plein écran (sans recadrage)
  lightboxImage = signal<string | null>(null);

  readonly sourceTypes: Option[] = [
    { value: 'web',    fr: 'Site web',       en: 'Website'     },
    { value: 'social', fr: 'Réseau social',  en: 'Social media'},
    { value: 'radio',  fr: 'Radio',          en: 'Radio'       },
    { value: 'tv',     fr: 'Télévision',     en: 'TV'          },
    { value: 'presse', fr: 'Presse écrite',  en: 'Print press' },
  ];

  readonly socialNetworks = [
    { value: 'facebook',  label: 'Facebook'  },
    { value: 'youtube',   label: 'YouTube'   },
    { value: 'instagram', label: 'Instagram' },
    { value: 'x',         label: 'X'         },
    { value: 'linkedin',  label: 'LinkedIn'  },
  ];

  readonly sectors: Option[] = [
    { value: 'politique',     fr: 'Politique',     en: 'Politics'     },
    { value: 'economie',      fr: 'Économie',      en: 'Economy'      },
    { value: 'international',  fr: 'International',  en: 'International' },
    { value: 'social',        fr: 'Social',        en: 'Social'       },
    { value: 'environnement', fr: 'Environnement', en: 'Environment'  },
    { value: 'agriculture',   fr: 'Agriculture',   en: 'Agriculture'  },
    { value: 'tourisme',      fr: 'Tourisme',      en: 'Tourism'      },
    { value: 'btp',           fr: 'BTP',           en: 'Construction' },
    { value: 'mines',         fr: 'Mines',         en: 'Mining'       },
    { value: 'telecoms',      fr: 'Télécoms',      en: 'Telecom'      },
    { value: 'biodiversite',  fr: 'Biodiversité',  en: 'Biodiversity' },
    { value: 'autre',         fr: 'Autre',         en: 'Other'        },
  ];

  get isAdmin(): boolean {
    const u = this.auth.currentUser();
    return !!(u?.is_admin && u?.email_verified);
  }
  get fr(): boolean { return this.lang.lang() === 'fr'; }

  // ── Gating par abonnement ──────────────────────────────────────────────────
  readonly PLAN_LEVEL: Record<string, number> = { generale: 0, sectorielle: 1, dediee: 2 };
  readonly SECTOR_MIN_LEVEL: Record<string, number> = {
    politique: 0, economie: 0, international: 0, social: 0, autre: 0,
    environnement: 1, agriculture: 1, tourisme: 1, btp: 1,
    mines: 2, telecoms: 2, biodiversite: 2,
  };

  get plan(): string { return this.auth.currentUser()?.plan ?? 'generale'; }
  get planLabel(): string { return this.lang.t('sub.' + this.plan + '.short'); }
  get userLevel(): number {
    return this.isAdmin ? 99 : (this.PLAN_LEVEL[this.plan] ?? 0);
  }

  canAccessSector(value: string): boolean {
    return this.userLevel >= (this.SECTOR_MIN_LEVEL[value] ?? 0);
  }

  /** Nom court de l'abonnement qui débloque ce secteur (pour le message d'upsell). */
  sectorRequiredPlan(value: string): string {
    const lvl = this.SECTOR_MIN_LEVEL[value] ?? 0;
    const planId = lvl >= 2 ? 'dediee' : lvl >= 1 ? 'sectorielle' : 'generale';
    return this.lang.t('sub.' + planId + '.name');
  }

  onLockedSector(value: string) {
    this.toast.show(
      this.fr
        ? `Secteur réservé à l'abonnement « ${this.sectorRequiredPlan(value)} ».`
        : `Sector reserved for the “${this.sectorRequiredPlan(value)}” plan.`,
      'error'
    );
  }

  private emptyForm() {
    return {
      title: '', sources: [] as string[], sourceDraft: '', source_types: [] as string[], social_network: '', sector: '',
      url: '', excerpt: '', images: [] as string[], imageDraft: '', video: '', author: '', published_at: '', status: 'published' as 'draft' | 'published',
      pinned: false,
    };
  }

  // ── Vidéo ───────────────────────────────────────────────────────────────
  youtubeId(url?: string | null): string | null {
    if (!url) return null;
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : null;
  }
  isDirectVideo(url?: string | null): boolean {
    return !!url && /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);
  }
  ytEmbed(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube.com/embed/${this.youtubeId(url)}`);
  }

  /** Titre affiché en tête de carte : le titre s'il existe, sinon le secteur. */
  cardHeading(item: VeilleItem): string {
    if (item.title) return item.title;
    if (item.sector) return this.sectorLabel(item.sector);
    return item.source || this.typeLabel(item.source_type);
  }
  /** Faut-il afficher le secteur comme étiquette (quand il n'est pas déjà le titre) ? */
  showSectorChip(item: VeilleItem): boolean { return !!item.title && !!item.sector; }

  typeLabel(value?: string | null): string {
    const o = this.sourceTypes.find(t => t.value === value);
    return o ? (this.fr ? o.fr : o.en) : '';
  }

  networkLabel(value?: string | null): string {
    return this.socialNetworks.find(n => n.value === value)?.label ?? '';
  }

  /** Liste des types d'une veille (avec repli sur l'ancien champ unique). */
  typesOf(item: VeilleItem): string[] {
    return item.source_types?.length ? item.source_types : (item.source_type ? [item.source_type] : []);
  }

  // ── Sélection multi-types (éditeur) ──────────────────────────────────────
  hasSourceType(value: string): boolean { return this.form.source_types.includes(value); }

  addSourceType(value: string) {
    if (value && !this.form.source_types.includes(value)) this.form.source_types.push(value);
  }

  removeSourceType(value: string) {
    this.form.source_types = this.form.source_types.filter(t => t !== value);
  }

  // ── Comptes / Pages / Groupes (saisie multiple, Entrée pour ajouter) ─────
  addSource() {
    const v = this.form.sourceDraft.trim();
    if (v && !this.form.sources.includes(v)) this.form.sources.push(v);
    this.form.sourceDraft = '';
  }

  removeSource(value: string) {
    this.form.sources = this.form.sources.filter(s => s !== value);
  }

  sectorLabel(value?: string | null): string {
    const o = this.sectors.find(s => s.value === value);
    return o ? (this.fr ? o.fr : o.en) : '';
  }

  /** Secteurs groupés par abonnement (pour les <optgroup> du formulaire). */
  get sectorGroups(): { label: string; options: Option[] }[] {
    return [
      { id: 'generale',    level: 0 },
      { id: 'sectorielle', level: 1 },
      { id: 'dediee',      level: 2 },
    ].map(g => ({
      label: this.lang.t('sub.' + g.id + '.name'),
      options: this.sectors.filter(s => (this.SECTOR_MIN_LEVEL[s.value] ?? 0) === g.level),
    }));
  }

  // ── Filtres ──────────────────────────────────────────────────────────────
  private currentFilters() {
    return {
      type: this.activeType(), sector: this.activeSector(), q: this.search.trim(),
      from: this.dateFrom(), to: this.dateTo(),
    };
  }

  selectType(value: string | null) {
    this.activeType.set(value);
    this.veille.load(this.currentFilters());
  }

  selectSector(value: string | null) {
    this.activeSector.set(value);
    this.veille.load(this.currentFilters());
  }

  applySearch() {
    this.veille.load(this.currentFilters());
  }

  // ── Filtre par période ─────────────────────────────────────────────────
  get hasDateFilter(): boolean { return !!this.dateFrom() || !!this.dateTo(); }

  setDateFrom(v: string) { this.dateFrom.set(v); this.veille.load(this.currentFilters()); }
  setDateTo(v: string)   { this.dateTo.set(v);   this.veille.load(this.currentFilters()); }

  resetDateFilter() {
    this.dateFrom.set('');
    this.dateTo.set('');
    this.veille.load(this.currentFilters());
  }

  // ── Lecture : favoris / lu-non lu ───────────────────────────────────────
  get displayedVeille(): VeilleItem[] {
    const items = this.veille.items();
    if (this.readingFilter() === 'favorites') return items.filter(i => i.favorite);
    if (this.readingFilter() === 'unread')    return items.filter(i => !i.read);
    return items;
  }
  get unreadCount(): number { return this.veille.items().filter(i => !i.read).length; }
  get favoritesCount(): number { return this.veille.items().filter(i => i.favorite).length; }

  setReadingFilter(f: 'all' | 'unread' | 'favorites') { this.readingFilter.set(f); }

  toggleFavorite(item: VeilleItem, e: Event) {
    e.stopPropagation();
    const fav = !item.favorite;
    this.veille.setState(item.id, { favorite: fav }).subscribe({ error: () => {} });
    if (this.selectedItem()?.id === item.id)
      this.selectedItem.update(s => s ? { ...s, favorite: fav } : s);
  }

  // ── Vue détail ─────────────────────────────────────────────────────────
  galleryIndex = signal(0);

  openDetail(item: VeilleItem) {
    this.selectedItem.set(item);
    this.galleryIndex.set(0);
    if (!item.read) this.veille.setState(item.id, { read: true }).subscribe({ error: () => {} });
    // La liste ne renvoie que l'image principale + has_video : on charge le détail complet
    // (toutes les images + vidéo) à la demande.
    if (item.has_video || (item.images_count ?? 0) > 1) {
      this.veille.getOne(item.id).subscribe({
        next: full => {
          if (this.selectedItem()?.id === item.id)
            this.selectedItem.update(s => s ? { ...s, video: full.video, images: full.images } : s);
        },
        error: () => {},
      });
    }
  }
  closeDetail() { this.selectedItem.set(null); }

  /** Images du détail (tableau complet, sinon repli sur l'image principale). */
  detailImages(item: VeilleItem): string[] {
    return item.images?.length ? item.images : (item.image ? [item.image] : []);
  }
  prevImage(item: VeilleItem) {
    const n = this.detailImages(item).length;
    if (n) this.galleryIndex.update(i => (i - 1 + n) % n);
  }
  nextImage(item: VeilleItem) {
    const n = this.detailImages(item).length;
    if (n) this.galleryIndex.update(i => (i + 1) % n);
  }

  openImage(src?: string | null) { if (src) this.lightboxImage.set(src); }
  closeImage() { this.lightboxImage.set(null); }

  // ── Vue admin (Veille / Retours / Utilisateurs / Stats) ─────────────────
  setView(v: 'veille' | 'feedback' | 'users' | 'stats' | 'activity' | 'trash') {
    this.view.set(v);
    if (v === 'feedback') this.admin.loadFeedback();
    if (v === 'users')    this.admin.loadUsers();
    if (v === 'stats')    this.admin.loadStats();
    if (v === 'activity') this.admin.loadActivity();
    if (v === 'trash')    this.veille.loadTrash();
  }

  // Largeur d'une barre (%) relative à la plus grande valeur de la liste.
  barPct(count: number, list: { count: number }[]): number {
    const max = Math.max(1, ...list.map(x => x.count));
    return Math.round((count / max) * 100);
  }

  monthLabel(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, (m || 1) - 1, 1);
    return d.toLocaleDateString(this.fr ? 'fr-FR' : 'en-US', { month: 'short', year: '2-digit' });
  }

  get adminUsers(): AdminUser[]  { return this.admin.users().filter(u => u.is_admin); }
  get normalUsers(): AdminUser[] { return this.admin.users().filter(u => !u.is_admin); }

  userInitials(u: AdminUser): string {
    return ((u.nom?.[0] ?? '') + (u.prenoms?.[0] ?? '')).toUpperCase();
  }

  async toggleDisabled(user: AdminUser) {
    const next = !user.disabled;
    const ok = await this.toast.confirm({
      title: next
        ? (this.fr ? `Désactiver @${user.username} ?` : `Disable @${user.username}?`)
        : (this.fr ? `Réactiver @${user.username} ?` : `Re-enable @${user.username}?`),
      text: next
        ? (this.fr ? 'Le compte ne pourra plus se connecter.' : 'The account will no longer be able to sign in.')
        : (this.fr ? 'Le compte pourra de nouveau se connecter.' : 'The account will be able to sign in again.'),
      danger: next,
      confirmText: next ? (this.fr ? 'Désactiver' : 'Disable') : (this.fr ? 'Réactiver' : 'Re-enable'),
    });
    if (!ok) return;
    this.admin.setUserDisabled(user.id, next).subscribe({
      next: () => {
        this.admin.users.update(list => list.map(u => u.id === user.id ? { ...u, disabled: next } : u));
        this.toast.show(
          next
            ? (this.fr ? `@${user.username} a été désactivé.` : `@${user.username} disabled.`)
            : (this.fr ? `@${user.username} a été réactivé.` : `@${user.username} re-enabled.`),
          'success'
        );
      },
      error: (err) => this.toast.show(err.error?.error || 'Erreur.', 'error'),
    });
  }

  planLabelOf(plan: string): string { return this.lang.t('sub.' + plan + '.short'); }

  changeUserPlan(user: AdminUser, plan: string) {
    const prev = user.plan;
    if (plan === prev) return;
    // Mise à jour optimiste : le signal change tout de suite pour que l'affichage suive.
    this.admin.users.update(list => list.map(u => u.id === user.id ? { ...u, plan: plan as AdminUser['plan'] } : u));
    this.admin.updateUserPlan(user.id, plan).subscribe({
      next: () => {
        this.toast.show(
          this.fr ? `Abonnement de @${user.username} mis à jour.` : `@${user.username}'s plan updated.`,
          'success'
        );
      },
      error: (err) => {
        // Échec : on revient à l'ancien abonnement.
        this.admin.users.update(list => list.map(u => u.id === user.id ? { ...u, plan: prev } : u));
        this.toast.show(err.error?.error || 'Erreur.', 'error');
      },
    });
  }

  selectValue(e: Event): string { return (e.target as HTMLSelectElement).value; }

  fbCategoryLabel(value: string | null): string {
    const o = this.feedbackCategories.find(c => c.value === value);
    return o ? (this.fr ? o.fr : o.en) : (this.fr ? 'Général' : 'General');
  }

  fbAuthor(f: FeedbackItem): string {
    if (f.username) return '@' + f.username;
    return this.fr ? 'Compte supprimé' : 'Deleted account';
  }

  get fbAvg(): number {
    const rated = this.admin.feedback().filter(f => f.rating);
    if (!rated.length) return 0;
    return Math.round((rated.reduce((s, f) => s + (f.rating || 0), 0) / rated.length) * 10) / 10;
  }
  get fbRatedCount(): number { return this.admin.feedback().filter(f => f.rating).length; }
  get fbStars(): number[] { return [1, 2, 3, 4, 5]; }

  // ── Éditeur (admin) ─────────────────────────────────────────────────────
  openNew() {
    this.editingId.set(null);
    this.form = this.emptyForm();
    this.dateDisplay = '';
    this.showEditor.set(true);
  }

  private buildForm(item: VeilleItem) {
    return {
      title: item.title ?? '',
      sources: item.sources?.length ? [...item.sources] : (item.source ? [item.source] : []),
      sourceDraft: '',
      source_types: item.source_types?.length ? [...item.source_types] : (item.source_type ? [item.source_type] : []),
      social_network: item.social_network ?? '',
      sector: item.sector ?? '',
      url: item.url ?? '',
      excerpt: item.excerpt ?? '',
      images: item.images?.length ? [...item.images] : (item.image ? [item.image] : []),
      imageDraft: '',
      video: item.video ?? '',
      author: item.author ?? '',
      published_at: item.published_at ? item.published_at.slice(0, 10) : '',
      status: (item.status ?? 'published') as 'draft' | 'published',
      pinned: item.pinned ?? false,
    };
  }

  openEdit(item: VeilleItem) {
    this.selectedItem.set(null);
    this.editingId.set(item.id);
    this.form = this.buildForm(item);
    this.dateDisplay = this.isoToDisplay(this.form.published_at);
    this.showEditor.set(true);
    // La liste ne renvoie que l'image principale + has_video : on charge le détail complet
    // pour ne pas perdre les images supplémentaires ni la vidéo à l'enregistrement.
    this.veille.getOne(item.id).subscribe({
      next: full => {
        if (this.editingId() !== item.id) return;
        if (full.images?.length) this.form.images = [...full.images];
        if (full.video) this.form.video = full.video;
      },
      error: () => {},
    });
  }

  /** Duplique une veille : ouvre l'éditeur en mode création, pré-rempli. */
  duplicateVeille(item: VeilleItem, e?: Event) {
    e?.stopPropagation();
    this.selectedItem.set(null);
    this.editingId.set(null); // mode création → l'enregistrement crée une copie
    this.form = this.buildForm(item);
    this.form.pinned = false; // on n'épingle pas la copie
    this.dateDisplay = this.isoToDisplay(this.form.published_at);
    this.showEditor.set(true);
    // Charge images/vidéo complètes depuis l'original
    this.veille.getOne(item.id).subscribe({
      next: full => {
        if (this.editingId() !== null || !this.showEditor()) return;
        if (full.images?.length) this.form.images = [...full.images];
        if (full.video) this.form.video = full.video;
      },
      error: () => {},
    });
  }

  closeEditor() { this.showEditor.set(false); }

  uploading = signal(false);

  /** Import d'images locales (multiple) → uploadées sur le serveur (fichiers), URLs dans form.images. */
  onImageFile(event: Event) {
    const input = event.target as HTMLInputElement;
    let files = Array.from(input.files ?? []).filter(f => f.type.startsWith('image/'));
    files = files.filter(f => {
      if (f.size > 5 * 1024 * 1024) {
        this.toast.show(this.fr ? `« ${f.name} » trop lourde (max 5 Mo).` : `"${f.name}" too large (max 5MB).`, 'error');
        return false;
      }
      return true;
    });
    const room = 10 - this.form.images.length;
    files = files.slice(0, Math.max(0, room));
    input.value = '';
    if (!files.length) return;
    this.uploading.set(true);
    this.veille.upload(files).subscribe({
      next: ({ urls }) => { this.form.images.push(...urls); this.uploading.set(false); },
      error: (err) => { this.uploading.set(false); this.toast.show(err.error?.error || 'Échec de l\'upload.', 'error'); },
    });
  }

  addImageUrl() {
    const v = this.form.imageDraft.trim();
    if (v && !this.form.images.includes(v)) this.form.images.push(v);
    this.form.imageDraft = '';
  }

  removeImage(index: number) { this.form.images.splice(index, 1); }

  /** Import d'une vidéo locale → uploadée sur le serveur (fichier), URL dans form.video (max 30 Mo). */
  onVideoFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      this.toast.show(this.fr ? 'Veuillez choisir une vidéo.' : 'Please choose a video.', 'error');
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      this.toast.show(this.fr ? 'Vidéo trop lourde (max 30 Mo).' : 'Video too large (max 30MB).', 'error');
      return;
    }
    this.uploading.set(true);
    this.veille.upload([file]).subscribe({
      next: ({ urls }) => { this.form.video = urls[0] ?? ''; this.uploading.set(false); },
      error: (err) => { this.uploading.set(false); this.toast.show(err.error?.error || 'Échec de l\'upload.', 'error'); },
    });
  }

  clearVideo() { this.form.video = ''; }

  /** Colle du texte « propre » dans le résumé : retire les retours à la ligne
   *  aléatoires (les remplace par une espace) en conservant les vrais paragraphes. */
  cleanPasteExcerpt(e: ClipboardEvent) {
    e.preventDefault();
    const raw = e.clipboardData?.getData('text/plain') ?? '';
    const cleaned = raw
      .replace(/\r\n?/g, '\n')                 // normalise les fins de ligne
      .replace(/(\S)-\n(\p{Ll})/gu, '$1$2')    // recolle les mots coupes en fin de ligne
      .split(/\n{2,}/)                          // separe les vrais paragraphes
      .map(p => p.replace(/\s*\n\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim())
      .filter(p => p.length > 0)
      .join('\n\n');

    const ta = e.target as HTMLTextAreaElement;
    const start = ta.selectionStart ?? this.form.excerpt.length;
    const end   = ta.selectionEnd ?? this.form.excerpt.length;
    this.form.excerpt = this.form.excerpt.slice(0, start) + cleaned + this.form.excerpt.slice(end);
    const pos = start + cleaned.length;
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = pos; });
  }

  /** Vrai si la vidéo est un fichier importé (base64 hérité ou fichier sur le serveur). */
  videoIsLocal(): boolean { return this.form.video.startsWith('data:') || this.form.video.includes('/uploads/'); }

  save() {
    if (this.saving() || !this.form.sector || !this.form.source_types.length) return;
    this.saving.set(true);
    const body: Partial<VeilleItem> = {
      title: this.form.title.trim() || null,
      sources: this.form.sources,
      source_types: this.form.source_types,
      social_network: this.form.source_types.includes('social') ? (this.form.social_network || null) : null,
      status: this.form.status,
      pinned: this.form.pinned,
      video: this.form.video.trim() || null,
      author: this.form.source_types.includes('presse') ? (this.form.author.trim() || null) : null,
      sector: this.form.sector,
      url: this.form.url.trim() || null,
      excerpt: this.form.excerpt.trim() || null,
      images: this.form.images,
      published_at: this.form.published_at || undefined,
    };
    const id = this.editingId();
    const req = id ? this.veille.update(id, body) : this.veille.create(body);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.showEditor.set(false);
        this.veille.load(this.currentFilters());
        this.toast.show(this.fr ? 'Veille enregistrée.' : 'Watch item saved.', 'success');
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.show(err.error?.error || 'Erreur.', 'error');
      },
    });
  }

  togglePin(item: VeilleItem, e: Event) {
    e.stopPropagation();
    const pinned = !item.pinned;
    this.veille.setPinned(item.id, pinned).subscribe({
      next: () => {
        this.veille.load(this.currentFilters()); // re-trie : épinglés en tête
        this.toast.show(
          pinned ? (this.fr ? 'Veille épinglée.' : 'Pinned.') : (this.fr ? 'Veille désépinglée.' : 'Unpinned.'),
          'success'
        );
      },
      error: (err) => this.toast.show(err.error?.error || 'Erreur.', 'error'),
    });
  }

  async confirmDelete(item: VeilleItem) {
    const ok = await this.toast.confirm({
      title: this.fr ? 'Mettre cette veille à la corbeille ?' : 'Move this item to trash?',
      text:  this.fr ? 'Elle sera conservée 15 jours, puis supprimée définitivement.' : 'It will be kept for 15 days, then permanently deleted.',
      danger: true,
      confirmText: this.fr ? 'Mettre à la corbeille' : 'Move to trash',
    });
    if (!ok) return;
    this.veille.remove(item.id).subscribe({
      next: () => {
        this.selectedItem.set(null);
        this.veille.load(this.currentFilters());
        this.toast.show(this.fr ? 'Veille déplacée vers la corbeille.' : 'Moved to trash.', 'success');
      },
      error: (err) => this.toast.show(err.error?.error || 'Erreur.', 'error'),
    });
  }

  // ── Corbeille (admin) ────────────────────────────────────────────────────
  /** Jours restants avant suppression définitive (15 jours après la mise en corbeille). */
  trashDaysLeft(item: VeilleItem): number {
    if (!item.deleted_at) return 15;
    const elapsed = (Date.now() - new Date(item.deleted_at).getTime()) / 86400000;
    return Math.max(0, Math.ceil(15 - elapsed));
  }

  restoreVeille(item: VeilleItem) {
    this.veille.restore(item.id).subscribe({
      next: () => {
        this.veille.loadTrash();
        this.toast.show(this.fr ? 'Veille restaurée.' : 'Restored.', 'success');
      },
      error: (err) => this.toast.show(err.error?.error || 'Erreur.', 'error'),
    });
  }

  async confirmPurge(item: VeilleItem) {
    const ok = await this.toast.confirm({
      title: this.fr ? 'Supprimer définitivement ?' : 'Delete permanently?',
      text:  this.fr ? 'Cette veille sera définitivement supprimée. Action irréversible.' : 'This item will be permanently deleted. This cannot be undone.',
      danger: true,
      confirmText: this.fr ? 'Supprimer définitivement' : 'Delete permanently',
    });
    if (!ok) return;
    this.veille.deletePermanent(item.id).subscribe({
      next: () => {
        this.veille.loadTrash();
        this.toast.show(this.fr ? 'Veille supprimée définitivement.' : 'Permanently deleted.', 'success');
      },
      error: (err) => this.toast.show(err.error?.error || 'Erreur.', 'error'),
    });
  }

  close() {
    this.closing.set(true);
    setTimeout(() => { this.closing.set(false); this.veille.close(); }, 280);
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.lightboxImage()) { this.lightboxImage.set(null); return; }
    if (this.showEditor())    { this.showEditor.set(false); return; }
    if (this.selectedItem())  { this.selectedItem.set(null); return; }
    this.close();
  }
}
