import { Component } from '@angular/core';
import { NavbarComponent }   from './components/navbar/navbar';
import { HeroComponent }     from './components/hero/hero';
import { AboutComponent }    from './components/about/about';
import { ServicesComponent } from './components/services/services';
import { IzaoComponent }     from './components/izao/izao';
import { ApproachComponent } from './components/approach/approach';
import { ContactComponent }  from './components/contact/contact';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    NavbarComponent,
    HeroComponent,
    AboutComponent,
    ServicesComponent,
    IzaoComponent,
    ApproachComponent,
    ContactComponent,
  ],
  template: `
    <app-navbar></app-navbar>
    <main>
      <app-hero></app-hero>
      <app-about></app-about>
      <app-services></app-services>
      <app-izao></app-izao>
      <app-approach></app-approach>
      <app-contact></app-contact>
    </main>
  `,
  styles: [``],
})
export class App {}
