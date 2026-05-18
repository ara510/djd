import { Component, inject, output, signal, AfterViewInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { TranslationService } from '../../services/translation.service';
import { PrivacyService } from '../../services/privacy.service';
import lottie, { AnimationItem } from 'lottie-web';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfileComponent implements AfterViewInit, OnDestroy {
  @ViewChild('logoutLottie') logoutLottieRef!: ElementRef<HTMLDivElement>;
  auth    = inject(AuthService);
  toast   = inject(ToastService);
  lang    = inject(TranslationService);
  privacy = inject(PrivacyService);
  closed       = output<void>();
  openFeedback = output<void>();

  editing            = signal(false);
  loading            = signal(false);
  closing            = signal(false);
  showSubscription   = signal(false);
  billing            = signal<'monthly' | 'yearly'>('monthly');
  showDeleteZone     = signal(false);
  showDeleteConfirm  = signal(false);
  showLogoutAnim     = signal(false);
  deletePassword     = '';

  private logoutAnim?: AnimationItem;

  readonly currentPlan = 'free';

  readonly plans = [
    { id: 'free',    fr: 'Free',    en: 'Free',    current: true  },
    { id: 'pro',     fr: 'Pro',     en: 'Pro',     current: false },
    { id: 'premium', fr: 'Premium', en: 'Premium', current: false },
  ];

  form = {
    nom: '', prenoms: '', email: '', username: '', date_naissance: '',
    avatar: null as string | null,
    telephone: '', pays: '', ville: '', genre: '',
    notif_email: true,
    currentPassword: '', newPassword: '', confirmPassword: '',
  };

  readonly genreOptions = [
    { value: 'homme',       fr: 'Homme',              en: 'Man'              },
    { value: 'femme',       fr: 'Femme',              en: 'Woman'            },
    { value: 'autre',       fr: 'Autre',              en: 'Other'            },
    { value: 'non_specifie',fr: 'Préfère ne pas dire',en: 'Prefer not to say'},
  ];

  get user() { return this.auth.currentUser(); }

  get initials(): string {
    const u = this.user;
    if (!u) return '';
    return (u.nom[0] + u.prenoms[0]).toUpperCase();
  }

  get formInitials(): string {
    const n = (this.form.nom[0] ?? '').toUpperCase();
    const p = (this.form.prenoms[0] ?? '').toUpperCase();
    return n + p || this.initials;
  }

  get deletionDate(): string {
    const u = this.user;
    if (!u?.deleted_at) return '';
    const d = new Date(u.deleted_at);
    d.setDate(d.getDate() + 7);
    const locale = this.lang.lang() === 'fr' ? 'fr-FR' : 'en-US';
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  }

  get memberSince(): string {
    const u = this.user;
    if (!u) return '';
    const locale = this.lang.lang() === 'fr' ? 'fr-FR' : 'en-US';
    return new Date(u.created_at).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  }

  genreLabel(value: string | null | undefined): string {
    if (!value) return '—';
    const opt = this.genreOptions.find(o => o.value === value);
    if (!opt) return value;
    return this.lang.lang() === 'fr' ? opt.fr : opt.en;
  }

  startEdit() {
    this.showDeleteZone.set(false);
    this.showDeleteConfirm.set(false);
    this.deletePassword = '';
    const u = this.user!;
    this.form = {
      nom:            u.nom,
      prenoms:        u.prenoms,
      email:          u.email,
      username:       u.username,
      date_naissance: u.date_naissance?.slice(0, 10) ?? '',
      avatar:         u.avatar ?? null,
      telephone:      u.telephone ?? '',
      pays:           u.pays ?? '',
      ville:          u.ville ?? '',
      genre:          u.genre ?? '',
      notif_email:    u.notif_email !== false,
      currentPassword: '', newPassword: '', confirmPassword: '',
    };
    this.editing.set(true);
  }

  cancelEdit() { this.editing.set(false); }

  onAvatarChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { this.form.avatar = reader.result as string; };
    reader.readAsDataURL(file);
  }

  saveProfile() {
    if (this.loading()) return;
    if (this.form.newPassword && this.form.newPassword !== this.form.confirmPassword) {
      this.toast.show(
        this.lang.lang() === 'fr' ? 'Les mots de passe ne correspondent pas.' : 'Passwords do not match.',
        'error'
      );
      return;
    }
    this.loading.set(true);
    const payload: Record<string, unknown> = {
      nom:            this.form.nom,
      prenoms:        this.form.prenoms,
      email:          this.form.email,
      username:       this.form.username,
      date_naissance: this.form.date_naissance,
      avatar:         this.form.avatar,
      telephone:      this.form.telephone || null,
      pays:           this.form.pays || null,
      ville:          this.form.ville || null,
      genre:          this.form.genre || null,
      notif_email:    this.form.notif_email,
    };
    if (this.form.newPassword) {
      payload['currentPassword'] = this.form.currentPassword;
      payload['newPassword']     = this.form.newPassword;
    }
    this.auth.updateProfile(payload).subscribe({
      next: () => {
        this.toast.show(
          this.lang.lang() === 'fr' ? 'Profil mis à jour !' : 'Profile updated!',
          'success'
        );
        this.editing.set(false);
        this.loading.set(false);
      },
      error: (err) => {
        this.toast.show(err.error?.error || 'Erreur lors de la mise à jour.', 'error');
        this.loading.set(false);
      },
    });
  }

  onDeleteAccount() {
    if (!this.deletePassword || this.loading()) return;
    this.loading.set(true);
    this.auth.deleteAccount(this.deletePassword).subscribe({
      next: () => {
        this.auth.logout();
        this.close();
        this.loading.set(false);
      },
      error: (err) => {
        this.toast.show(err.error?.error || 'Erreur lors de la suppression.', 'error');
        this.loading.set(false);
      },
    });
  }

  onRecoverAccount() {
    if (this.loading()) return;
    this.loading.set(true);
    this.auth.recoverAccount().subscribe({
      next: () => {
        this.toast.show(
          this.lang.lang() === 'fr' ? 'Compte récupéré avec succès !' : 'Account successfully recovered!',
          'success'
        );
        this.loading.set(false);
      },
      error: () => {
        this.toast.show('Erreur lors de la récupération.', 'error');
        this.loading.set(false);
      },
    });
  }

  ngAfterViewInit() {
    this.logoutAnim = lottie.loadAnimation({
      container: this.logoutLottieRef.nativeElement,
      renderer:  'svg',
      loop:      true,
      autoplay:  false,
      path:      'assets/loading.json',
    });
  }

  ngOnDestroy() { this.logoutAnim?.destroy(); }

  close() {
    this.closing.set(true);
    setTimeout(() => { this.closing.set(false); this.closed.emit(); }, 300);
  }

  logout() {
    this.showLogoutAnim.set(true);
    this.logoutAnim?.play();
    setTimeout(() => {
      this.logoutAnim?.stop();
      this.auth.logout();
      this.close();
    }, 1500);
  }
}
