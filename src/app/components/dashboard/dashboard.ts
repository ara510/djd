import { Component, HostListener, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslationService } from '../../services/translation.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { VeilleService, VeilleItem } from '../../services/veille.service';
import { AlertService, AlertItem, AlertKind, RecapPayload } from '../../services/alert.service';
import { AdminService, FeedbackItem, AdminUser } from '../../services/admin.service';
import { ChatService, ChatConversation, ChatMessage } from '../../services/chat.service';
import { VeilleIconComponent } from '../veille-icon/veille-icon';
import { SeenDirective } from './seen.directive';

interface Option { value: string; fr: string; en: string; }

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, VeilleIconComponent, SeenDirective],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent implements OnDestroy {
  lang   = inject(TranslationService);
  auth   = inject(AuthService);
  toast  = inject(ToastService);
  veille = inject(VeilleService);
  alerts = inject(AlertService);
  admin  = inject(AdminService);
  chat   = inject(ChatService);
  private sanitizer = inject(DomSanitizer);

  closing = signal(false);

  // Vue active (admin) : feed, option (alertes), retours, messagerie, utilisateurs, statistiques, journal, corbeille
  view = signal<'veille' | 'option' | 'feedback' | 'messages' | 'users' | 'stats' | 'activity' | 'trash'>('veille');

  // ── Messagerie (chat support) ──────────────────────────────────────────────
  conversations = signal<ChatConversation[]>([]);
  convLoading   = signal(false);
  selectedConv  = signal<ChatConversation | null>(null);
  chatMessages  = signal<ChatMessage[]>([]);
  replyDraft    = '';
  sendingReply  = signal(false);
  chatUnread    = computed(() => this.conversations().reduce((s, c) => s + (c.unread || 0), 0));

  private convPoll?:   ReturnType<typeof setInterval>;
  private threadPoll?: ReturnType<typeof setInterval>;

  constructor() {
    // Verrouille le défilement de la page derrière l'overlay plein écran (évite le double scrollbar).
    document.body.style.overflow = 'hidden';
    // Rafraîchit la liste des conversations (badge + vue) tant que le dashboard est ouvert.
    this.convPoll = setInterval(() => { if (this.isAdmin) this.loadConversations(true); }, 10_000);
    if (this.isAdmin) this.loadConversations(true);
  }

  ngOnDestroy() {
    document.body.style.overflow = '';
    clearInterval(this.convPoll);
    clearInterval(this.threadPoll);
  }

  loadConversations(quiet = false) {
    if (!quiet) this.convLoading.set(true);
    this.chat.loadConversations().subscribe({
      next: rows => { this.convLoading.set(false); this.conversations.set(rows); },
      error: () => { this.convLoading.set(false); },
    });
  }

  openConversation(c: ChatConversation) {
    this.selectedConv.set(c);
    this.replyDraft = '';
    this.chatMessages.set([]);
    this.loadThread(c.id);
    this.startThreadPoll(c.id);
  }

  closeConversation() {
    this.selectedConv.set(null);
    this.stopThreadPoll();
    this.loadConversations(true);
  }

  private loadThread(id: number, quiet = false) {
    this.chat.loadConversation(id).subscribe({
      next: res => {
        const grew = res.messages.length > this.chatMessages().length;
        this.chatMessages.set(res.messages);
        const cur = this.selectedConv();
        if (cur && cur.id === id) this.selectedConv.set({ ...cur, ...res.conversation });
        this.markConvRead(id);
        if (grew || !quiet) this.scrollChat();
      },
      error: () => {},
    });
  }

  sendReply() {
    const id = this.selectedConv()?.id;
    const body = this.replyDraft.trim();
    if (!id || !body || this.sendingReply()) return;
    this.sendingReply.set(true);
    this.chat.reply(id, body).subscribe({
      next: res => {
        this.chatMessages.update(m => [...m, res.message]);
        this.replyDraft = '';
        this.sendingReply.set(false);
        this.scrollChat();
      },
      error: () => {
        this.sendingReply.set(false);
        this.toast.show(this.fr ? 'Échec de l\'envoi.' : 'Send failed.', 'error');
      },
    });
  }

  private markConvRead(id: number) {
    this.conversations.update(list => list.map(c => c.id === id ? { ...c, unread: 0 } : c));
  }
  private startThreadPoll(id: number) {
    this.stopThreadPoll();
    this.threadPoll = setInterval(() => this.loadThread(id, true), 4000);
  }
  private stopThreadPoll() { if (this.threadPoll) { clearInterval(this.threadPoll); this.threadPoll = undefined; } }
  private scrollChat() {
    setTimeout(() => { const el = document.querySelector('.chatadm__messages'); if (el) el.scrollTop = el.scrollHeight; }, 50);
  }

  // Affichage d'une conversation dans la liste / l'en-tête.
  convName(c: ChatConversation): string {
    if (c.user_id) return `${c.prenoms || ''} ${c.nom || ''}`.trim() || ('@' + (c.username || ''));
    return c.guest_name || c.guest_email || (this.fr ? 'Visiteur' : 'Visitor');
  }
  convSub(c: ChatConversation): string {
    if (c.user_id) return '@' + (c.username || '') + (c.plan ? ' · ' + this.lang.t('sub.' + c.plan + '.short') : '');
    return c.guest_email || (this.fr ? 'Visiteur anonyme' : 'Anonymous visitor');
  }
  convInitials(c: ChatConversation): string {
    return (this.convName(c).trim()[0] || '?').toUpperCase();
  }

  readonly activityMeta: Record<string, { fr: string; en: string; cat: string }> = {
    'veille.create': { fr: 'a créé une veille',        en: 'created a watch item',   cat: 'create' },
    'veille.update': { fr: 'a modifié une veille',     en: 'updated a watch item',   cat: 'update' },
    'veille.delete': { fr: 'a supprimé une veille',    en: 'deleted a watch item',   cat: 'delete' },
    'veille.pin':    { fr: 'a épinglé une veille',     en: 'pinned a watch item',    cat: 'update' },
    'veille.unpin':  { fr: 'a désépinglé une veille',  en: 'unpinned a watch item',  cat: 'update' },
    'veille.restore':{ fr: 'a restauré une veille',    en: 'restored a watch item',  cat: 'create' },
    'veille.purge':  { fr: 'a supprimé définitivement une veille', en: 'permanently deleted a watch item', cat: 'delete' },
    'alert.create':  { fr: 'a publié une alerte',      en: 'published an alert',     cat: 'create' },
    'alert.update':  { fr: 'a modifié une alerte',     en: 'updated an alert',       cat: 'update' },
    'alert.delete':  { fr: 'a supprimé une alerte',    en: 'deleted an alert',       cat: 'delete' },
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

  // Option « Veille en continu » : temps réel / récapitulatif quotidien / bulletin hebdomadaire
  optionKind = signal<AlertKind>('realtime');

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
  // Champs médias/lien repliés : on les révèle au clic sur leur bouton (gain de place).
  showUrl    = signal(false);
  showImages = signal(false);
  showVideo  = signal(false);
  form = this.emptyForm();

  /** Aligne l'affichage des champs médias/lien sur le contenu chargé. */
  private syncMediaToggles() {
    this.showUrl.set(!!this.form.url);
    this.showImages.set(this.form.images.length > 0);
    this.showVideo.set(!!this.form.video);
  }

  /** Annule l'ajout : vide le champ et replie sa section. */
  cancelUrl()    { this.form.url = ''; this.showUrl.set(false); }
  cancelImages() { this.form.images = []; this.form.imageDraft = ''; this.showImages.set(false); }
  cancelVideo()  { this.form.video = ''; this.showVideo.set(false); }
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

  // Indicateur de ton (cf. PDF de veille) : ● Positif ● Neutre/Informatif ● Négatif/Sensible
  readonly tones: Option[] = [
    { value: 'positif', fr: 'Positif',           en: 'Positive'         },
    { value: 'neutre',  fr: 'Neutre / Informatif', en: 'Neutral / Info'  },
    { value: 'negatif', fr: 'Négatif / Sensible',  en: 'Negative / Sensitive' },
  ];
  toneLabel(value?: string | null): string {
    const o = this.tones.find(t => t.value === value);
    return o ? (this.fr ? o.fr : o.en) : '';
  }

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
    mines: 2, telecoms: 2,
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
      title: '', sources: [] as string[], sourceDraft: '', source_types: [] as string[], social_network: '', sectors: [] as string[], tone: '',
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
  /** Liste des secteurs d'une veille (avec repli sur l'ancien champ unique). */
  sectorsOf(item: VeilleItem): string[] {
    return item.sectors?.length ? item.sectors : (item.sector ? [item.sector] : []);
  }
  /** Faut-il afficher les secteurs comme étiquettes (quand ils ne sont pas déjà le titre) ? */
  showSectorChip(item: VeilleItem): boolean { return !!item.title && this.sectorsOf(item).length > 0; }

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

  // ── Sélection multi-secteurs (éditeur) ───────────────────────────────────
  hasSector(value: string): boolean { return this.form.sectors.includes(value); }
  addSector(value: string) {
    if (value && !this.form.sectors.includes(value)) this.form.sectors.push(value);
  }
  removeSector(value: string) {
    this.form.sectors = this.form.sectors.filter(s => s !== value);
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

  // ── Option : temps réel / récapitulatif quotidien / bulletin hebdomadaire ──
  readonly optionKinds: { value: AlertKind; fr: string; en: string }[] = [
    { value: 'realtime', fr: 'Temps réel',             en: 'Real-time'     },
    { value: 'daily',    fr: 'Récapitulatif quotidien', en: 'Daily recap'  },
    { value: 'weekly',   fr: 'Bulletin hebdomadaire',   en: 'Weekly bulletin' },
  ];

  setOption(kind: AlertKind) {
    this.optionKind.set(kind);
    this.view.set('option');
    this.alerts.load(kind);
  }

  /** Retour au fil de veille (utilisé par la navigation des abonnés Générale). */
  goToVeille() {
    this.view.set('veille');
    this.veille.load(this.currentFilters());
  }

  /** Nombre total de faits relevés dans un récapitulatif. */
  recapFactCount(item: AlertItem): number {
    return (item.payload?.rubriques || []).reduce((n, r) => n + (r.facts?.length || 0), 0);
  }

  // ── Aperçu complet d'un récap / bulletin (overlay, comme le détail veille) ──
  selectedAlert = signal<AlertItem | null>(null);
  openAlertDetail(a: AlertItem) { this.selectedAlert.set(a); }
  closeAlertDetail() { this.selectedAlert.set(null); }

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

  // ── Mode d'affichage selon l'abonnement ────────────────────────────────────
  //  grid        : Veille Générale (gratuite) — grille de cartes compactes (clic = détail)
  //  sectorielle : Veille Sectorielle — veilles classées par date, rangées horizontales scrollables
  //  feed        : Veille Dédiée — fil vertical, veilles affichées en entier (style Facebook, sans clic d'ouverture)
  //  admin       : combiné Générale + Sectorielle (cartes compactes groupées par date, clic = détail)
  get feedMode(): 'admin' | 'feed' | 'sectorielle' | 'grid' {
    if (this.isAdmin) return 'admin';
    if (this.userLevel >= 2) return 'feed';        // dédiée
    if (this.userLevel === 1) return 'sectorielle';
    return 'grid';                                 // générale (gratuite)
  }

  /** Veilles regroupées par date de publication (locale), les plus récentes en premier. */
  get groupedByDate(): { key: string; label: string; items: VeilleItem[] }[] {
    const map = new Map<string, VeilleItem[]>();
    for (const it of this.displayedVeille) {
      const key = this.localDateKey(it.published_at);
      (map.get(key) ?? map.set(key, []).get(key)!).push(it);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => ({ key, label: this.dateGroupLabel(key), items }));
  }

  private localDateKey(iso: string): string {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  dateGroupLabel(key: string): string {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - date.getTime()) / 86_400_000);
    if (diff === 0) return this.fr ? "Aujourd'hui" : 'Today';
    if (diff === 1) return this.fr ? 'Hier' : 'Yesterday';
    return date.toLocaleDateString(this.fr ? 'fr-FR' : 'en-US', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  /** Marque une veille comme lue (fil Dédiée : au défilement). */
  markRead(item: VeilleItem) {
    if (item.read) return;
    this.veille.setState(item.id, { read: true }).subscribe({ error: () => {} });
  }

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
    if (!this.isAdmin && !item.read) this.veille.setState(item.id, { read: true }).subscribe({ error: () => {} });
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

  // ── Galerie du fil Dédiée (un index par veille, plusieurs cartes ouvertes) ──
  feedGallery = signal<Record<number, number>>({});
  galleryFor(item: VeilleItem): number { return this.feedGallery()[item.id] ?? 0; }
  feedPrev(item: VeilleItem) {
    const n = this.detailImages(item).length;
    if (n) this.feedGallery.update(g => ({ ...g, [item.id]: ((g[item.id] ?? 0) - 1 + n) % n }));
  }
  feedNext(item: VeilleItem) {
    const n = this.detailImages(item).length;
    if (n) this.feedGallery.update(g => ({ ...g, [item.id]: ((g[item.id] ?? 0) + 1) % n }));
  }
  setFeedGallery(item: VeilleItem, i: number) { this.feedGallery.update(g => ({ ...g, [item.id]: i })); }

  // ── Vue admin (Veille / Retours / Utilisateurs / Stats) ─────────────────
  setView(v: 'veille' | 'option' | 'feedback' | 'messages' | 'users' | 'stats' | 'activity' | 'trash') {
    this.view.set(v);
    if (v !== 'messages') { this.selectedConv.set(null); this.stopThreadPoll(); }
    if (v === 'feedback') this.admin.loadFeedback();
    if (v === 'messages') this.loadConversations();
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
    this.syncMediaToggles();
    this.showEditor.set(true);
  }

  private buildForm(item: VeilleItem) {
    return {
      title: item.title ?? '',
      sources: item.sources?.length ? [...item.sources] : (item.source ? [item.source] : []),
      sourceDraft: '',
      source_types: item.source_types?.length ? [...item.source_types] : (item.source_type ? [item.source_type] : []),
      social_network: item.social_network ?? '',
      sectors: item.sectors?.length ? [...item.sectors] : (item.sector ? [item.sector] : []),
      tone: item.tone ?? '',
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
    this.syncMediaToggles();
    this.showEditor.set(true);
    // La liste ne renvoie que l'image principale + has_video : on charge le détail complet
    // pour ne pas perdre les images supplémentaires ni la vidéo à l'enregistrement.
    this.veille.getOne(item.id).subscribe({
      next: full => {
        if (this.editingId() !== item.id) return;
        if (full.images?.length) { this.form.images = [...full.images]; this.showImages.set(true); }
        if (full.video) { this.form.video = full.video; this.showVideo.set(true); }
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
    this.syncMediaToggles();
    this.showEditor.set(true);
    // Charge images/vidéo complètes depuis l'original
    this.veille.getOne(item.id).subscribe({
      next: full => {
        if (this.editingId() !== null || !this.showEditor()) return;
        if (full.images?.length) { this.form.images = [...full.images]; this.showImages.set(true); }
        if (full.video) { this.form.video = full.video; this.showVideo.set(true); }
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
    if (this.saving() || !this.form.sectors.length || !this.form.source_types.length) return;
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
      sectors: this.form.sectors,
      tone: (this.form.tone || null) as VeilleItem['tone'],
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

  // ── Éditeur d'alerte (Option temps réel, admin) ─────────────────────────
  showAlertEditor = signal(false);
  editingAlertId  = signal<number | null>(null);
  savingAlert     = signal(false);
  alertDateDisplay = '';
  alertForm = this.emptyAlertForm();

  private emptyAlertForm() {
    return { title: '', source: '', url: '', context: '', published_at: '' };
  }

  private todayIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Parse le champ texte jj/mm/aaaa → met à jour alertForm.published_at (ISO). */
  parseAlertDate() {
    const s = this.alertDateDisplay.trim();
    if (!s) { this.alertForm.published_at = ''; return; }
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const d = m ? +m[1] : 0, mo = m ? +m[2] : 0, y = m ? +m[3] : 0;
    if (!m || mo < 1 || mo > 12 || d < 1 || d > 31) {
      this.toast.show(this.fr ? 'Date invalide — format jj/mm/aaaa.' : 'Invalid date — dd/mm/yyyy.', 'error');
      this.alertDateDisplay = this.isoToDisplay(this.alertForm.published_at);
      return;
    }
    this.alertForm.published_at = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    this.alertDateDisplay = this.isoToDisplay(this.alertForm.published_at);
  }

  setAlertDateFromPicker(iso: string) {
    this.alertForm.published_at = iso || '';
    this.alertDateDisplay = this.isoToDisplay(this.alertForm.published_at);
  }

  openNewAlert() {
    this.editingAlertId.set(null);
    this.alertForm = this.emptyAlertForm();
    this.alertForm.published_at = this.todayIso();
    this.alertDateDisplay = this.isoToDisplay(this.alertForm.published_at);
    this.showAlertEditor.set(true);
  }

  openEditAlert(item: AlertItem) {
    this.editingAlertId.set(item.id);
    this.alertForm = {
      title: item.title ?? '',
      source: item.source ?? '',
      url: item.url ?? '',
      context: item.context ?? '',
      published_at: item.published_at ? item.published_at.slice(0, 10) : '',
    };
    this.alertDateDisplay = this.isoToDisplay(this.alertForm.published_at);
    this.showAlertEditor.set(true);
  }

  closeAlertEditor() { this.showAlertEditor.set(false); }

  saveAlert() {
    if (this.savingAlert() || !this.alertForm.title.trim()) return;
    this.savingAlert.set(true);
    const body: Partial<AlertItem> = {
      kind: this.optionKind(),
      title: this.alertForm.title.trim(),
      source: this.alertForm.source.trim() || null,
      url: this.alertForm.url.trim() || null,
      context: this.alertForm.context.trim() || null,
      published_at: this.alertForm.published_at || undefined,
    };
    const id = this.editingAlertId();
    const req = id ? this.alerts.update(id, body) : this.alerts.create(body);
    req.subscribe({
      next: (res) => {
        this.savingAlert.set(false);
        this.showAlertEditor.set(false);
        this.alerts.load(this.optionKind());
        const sent = (res as AlertItem & { sent?: number }).sent;
        if (!id && typeof sent === 'number') {
          this.toast.show(
            this.fr ? `Alerte diffusée à ${sent} abonné(s).` : `Alert sent to ${sent} subscriber(s).`,
            'success'
          );
        } else {
          this.toast.show(this.fr ? 'Alerte enregistrée.' : 'Alert saved.', 'success');
        }
      },
      error: (err) => {
        this.savingAlert.set(false);
        this.toast.show(err.error?.error || 'Erreur.', 'error');
      },
    });
  }

  async confirmDeleteAlert(item: AlertItem) {
    const ok = await this.toast.confirm({
      title: this.fr ? 'Supprimer cette alerte ?' : 'Delete this alert?',
      text:  this.fr ? 'Elle disparaîtra du dashboard (les emails déjà envoyés ne sont pas rappelés).' : 'It will be removed from the dashboard (already-sent emails cannot be recalled).',
      danger: true,
      confirmText: this.fr ? 'Supprimer' : 'Delete',
    });
    if (!ok) return;
    this.alerts.remove(item.id).subscribe({
      next: () => {
        this.alerts.load(this.optionKind());
        this.toast.show(this.fr ? 'Alerte supprimée.' : 'Alert deleted.', 'success');
      },
      error: (err) => this.toast.show(err.error?.error || 'Erreur.', 'error'),
    });
  }

  // ── Éditeur récap quotidien / bulletin hebdo (Option, admin) ─────────────
  // Un seul éditeur, piloté par recapEditKind : 'daily' (récap) ou 'weekly' (bulletin).
  showRecapEditor = signal(false);
  recapEditKind   = signal<'daily' | 'weekly'>('daily');
  editingRecapId  = signal<number | null>(null);
  savingRecap     = signal(false);
  recapDateDisplay = '';   // récap : date ; bulletin : non utilisé (period_from/to à la place)
  periodFromDisplay = '';  // bulletin : début de période
  periodToDisplay   = '';  // bulletin : fin de période
  recapForm = this.emptyRecapForm();

  // Rubriques suggérées (le champ reste libre : on peut saisir « Économie / Mines », etc.).
  readonly recapRubriqueSuggestions = ['Politique', 'Économie', 'Social', 'International', 'Diplomatie', 'Mines', 'Environnement'];

  private emptyFact() { return { date: '', text: '', sources: '', url: '' }; }

  private emptyRecapForm() {
    return {
      published_at: '',
      rubriques: [{ name: '', facts: [this.emptyFact()] }],
      follow_up: '',                                   // récap quotidien
      period_from: '', period_to: '', summary: '', trends: '', signals: '', // bulletin hebdo
    };
  }

  // Parse jj/mm/aaaa → ISO ; renvoie null si invalide (et affiche une erreur), '' si vide.
  private parseDmy(display: string): string | null {
    const s = display.trim();
    if (!s) return '';
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const d = m ? +m[1] : 0, mo = m ? +m[2] : 0, y = m ? +m[3] : 0;
    if (!m || mo < 1 || mo > 12 || d < 1 || d > 31) {
      this.toast.show(this.fr ? 'Date invalide — format jj/mm/aaaa.' : 'Invalid date — dd/mm/yyyy.', 'error');
      return null;
    }
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  parseRecapDate() {
    const iso = this.parseDmy(this.recapDateDisplay);
    if (iso === null) { this.recapDateDisplay = this.isoToDisplay(this.recapForm.published_at); return; }
    this.recapForm.published_at = iso;
    this.recapDateDisplay = this.isoToDisplay(iso);
  }
  setRecapDateFromPicker(iso: string) {
    this.recapForm.published_at = iso || '';
    this.recapDateDisplay = this.isoToDisplay(this.recapForm.published_at);
  }

  parsePeriodFrom() {
    const iso = this.parseDmy(this.periodFromDisplay);
    if (iso === null) { this.periodFromDisplay = this.isoToDisplay(this.recapForm.period_from); return; }
    this.recapForm.period_from = iso;
    this.periodFromDisplay = this.isoToDisplay(iso);
  }
  setPeriodFromPicker(iso: string) {
    this.recapForm.period_from = iso || '';
    this.periodFromDisplay = this.isoToDisplay(this.recapForm.period_from);
  }
  parsePeriodTo() {
    const iso = this.parseDmy(this.periodToDisplay);
    if (iso === null) { this.periodToDisplay = this.isoToDisplay(this.recapForm.period_to); return; }
    this.recapForm.period_to = iso;
    this.periodToDisplay = this.isoToDisplay(iso);
  }
  setPeriodToPicker(iso: string) {
    this.recapForm.period_to = iso || '';
    this.periodToDisplay = this.isoToDisplay(this.recapForm.period_to);
  }

  // Faits totaux saisis dans le formulaire (compteur d'en-tête « N faits relevés »).
  get recapFormFactCount(): number {
    return this.recapForm.rubriques.reduce((n, r) => n + r.facts.filter(f => f.text.trim()).length, 0);
  }

  addRubrique() { this.recapForm.rubriques.push({ name: '', facts: [this.emptyFact()] }); }
  removeRubrique(ri: number) {
    this.recapForm.rubriques.splice(ri, 1);
    if (!this.recapForm.rubriques.length) this.addRubrique();
  }
  addFact(ri: number) {
    if (this.recapForm.rubriques[ri].facts.length < 6) this.recapForm.rubriques[ri].facts.push(this.emptyFact());
  }
  removeFact(ri: number, fi: number) {
    this.recapForm.rubriques[ri].facts.splice(fi, 1);
    if (!this.recapForm.rubriques[ri].facts.length) this.addFact(ri);
  }

  // ── Mise en forme d'un fait (gras / italique / surligner) ────────────────
  // Encadre la sélection avec des marqueurs ; rendus en <strong>/<em>/<mark> à l'affichage.
  private readonly fmtMarkers: Record<'bold' | 'italic' | 'mark', string> = { bold: '**', italic: '*', mark: '==' };

  wrapText(ta: HTMLTextAreaElement, fact: { text: string }, kind: 'bold' | 'italic' | 'mark') {
    const m = this.fmtMarkers[kind];
    const value = fact.text ?? '';
    const start = ta.selectionStart ?? value.length;
    const end   = ta.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || (this.fr ? 'texte' : 'text');
    fact.text = value.slice(0, start) + m + selected + m + value.slice(end);
    // Replace le curseur après la mise à jour du DOM (sélection sur le texte encadré).
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = start + m.length;
      ta.selectionEnd   = start + m.length + selected.length;
    });
  }

  /** Convertit les marqueurs (**gras**, *italique*, ==surligné==) en HTML (sanitizé par Angular à l'affichage). */
  formatRecapText(text?: string | null): string {
    if (!text) return '';
    return text
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/==([^=]+)==/g, '<mark>$1</mark>');
  }

  openNewRecap() {
    this.editingRecapId.set(null);
    this.recapEditKind.set('daily');
    this.recapForm = this.emptyRecapForm();
    this.recapForm.published_at = this.todayIso();
    this.recapDateDisplay = this.isoToDisplay(this.recapForm.published_at);
    this.showRecapEditor.set(true);
  }

  openNewBulletin() {
    this.editingRecapId.set(null);
    this.recapEditKind.set('weekly');
    this.recapForm = this.emptyRecapForm();
    this.recapForm.published_at = this.todayIso();
    this.periodFromDisplay = '';
    this.periodToDisplay = '';
    this.showRecapEditor.set(true);
  }

  openEditRecap(item: AlertItem) {
    this.editingRecapId.set(item.id);
    this.recapEditKind.set(item.kind === 'weekly' ? 'weekly' : 'daily');
    const rubriques = (item.payload?.rubriques || []).map(r => ({
      name: r.name ?? '',
      facts: (r.facts?.length ? r.facts : [this.emptyFact()]).map(f => ({
        date: f.date ?? '', text: f.text ?? '', sources: f.sources ?? '', url: f.url ?? '',
      })),
    }));
    this.recapForm = {
      published_at: item.published_at ? item.published_at.slice(0, 10) : '',
      rubriques: rubriques.length ? rubriques : [{ name: '', facts: [this.emptyFact()] }],
      follow_up: item.payload?.follow_up ?? '',
      period_from: item.payload?.period_from ?? '',
      period_to: item.payload?.period_to ?? '',
      summary: item.payload?.summary ?? '',
      trends: item.payload?.trends ?? '',
      signals: item.payload?.signals ?? '',
    };
    this.recapDateDisplay  = this.isoToDisplay(this.recapForm.published_at);
    this.periodFromDisplay = this.isoToDisplay(this.recapForm.period_from);
    this.periodToDisplay   = this.isoToDisplay(this.recapForm.period_to);
    this.showRecapEditor.set(true);
  }

  closeRecapEditor() { this.showRecapEditor.set(false); }

  saveRecap() {
    if (this.savingRecap()) return;
    const weekly = this.recapEditKind() === 'weekly';
    const rubriques = this.recapForm.rubriques
      .map(r => ({
        name: r.name.trim(),
        facts: r.facts
          .filter(f => f.text.trim())
          .map(f => ({ date: f.date.trim(), text: f.text.trim(), sources: f.sources.trim(), url: f.url.trim() })),
      }))
      .filter(r => r.name || r.facts.length);
    if (!rubriques.some(r => r.facts.length)) {
      this.toast.show(this.fr ? 'Ajoutez au moins une rubrique contenant un fait.' : 'Add at least one section with a fact.', 'error');
      return;
    }
    this.savingRecap.set(true);
    const payload: RecapPayload = weekly
      ? {
          rubriques,
          period_from: this.recapForm.period_from || undefined,
          period_to: this.recapForm.period_to || undefined,
          summary: this.recapForm.summary.trim(),
          trends: this.recapForm.trends.trim(),
          signals: this.recapForm.signals.trim(),
        }
      : { rubriques, follow_up: this.recapForm.follow_up.trim() };
    const body: Partial<AlertItem> = {
      kind: weekly ? 'weekly' : 'daily',
      payload,
      published_at: this.recapForm.published_at || undefined,
    };
    const id = this.editingRecapId();
    const req = id ? this.alerts.update(id, body) : this.alerts.create(body);
    req.subscribe({
      next: () => {
        this.savingRecap.set(false);
        this.showRecapEditor.set(false);
        this.alerts.load(weekly ? 'weekly' : 'daily');
        const noun = weekly ? 'Bulletin' : (this.fr ? 'Récapitulatif' : 'Recap');
        if (id) this.toast.show(this.fr ? `${noun} enregistré.` : `${noun} saved.`, 'success');
        else    this.toast.show(this.fr ? `${noun} publié.` : `${noun} published.`, 'success');
      },
      error: (err) => {
        this.savingRecap.set(false);
        this.toast.show(err.error?.error || 'Erreur.', 'error');
      },
    });
  }

  close() {
    this.closing.set(true);
    setTimeout(() => { this.closing.set(false); this.veille.close(); }, 280);
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.lightboxImage())   { this.lightboxImage.set(null); return; }
    if (this.selectedAlert())   { this.selectedAlert.set(null); return; }
    if (this.showRecapEditor()) { this.showRecapEditor.set(false); return; }
    if (this.showAlertEditor()) { this.showAlertEditor.set(false); return; }
    if (this.showEditor())      { this.showEditor.set(false); return; }
    if (this.selectedItem())  { this.selectedItem.set(null); return; }
    this.close();
  }
}
