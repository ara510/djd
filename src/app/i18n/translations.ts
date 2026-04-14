export type Lang = 'fr' | 'en';

export const TRANSLATIONS: Record<Lang, Record<string, string>> = {
  fr: {
    // Navbar
    'nav.about':    'À propos',
    'nav.services': 'Services',
    'nav.approach': 'Approche',
    'nav.contact':  'Contact',

    // Hero
    'hero.eyebrow':  'Fondée en 2009 · Antananarivo, Madagascar',
    'hero.title1':   'Stratégie.',
    'hero.title2':   'Durabilité.',
    'hero.title3':   'Impact.',
    'hero.sub':      'Communication stratégique et relations publiques\npour les organisations et leaders à Madagascar.',
    'hero.cta':      'Découvrir',

    // About
    'about.label':   'À propos',
    'about.h2.1':    'Confiance locale,',
    'about.h2.2':    'portée internationale.',
    'about.body1':   'Depuis 2009, Dujardin Delacour & Cie accompagne les organisations, institutions et leaders à Madagascar dans la construction et la gestion de leur image, de leur réputation et de leur intégration dans les communautés.',
    'about.body2':   'Notre force réside dans la combinaison d\'une expertise en communication stratégique, d\'un solide réseau d\'influence et d\'une compréhension profonde des dynamiques locales et internationales.',
    'about.stat1':   'Année de fondation',
    'about.stat2':   'Années d\'expertise',
    'about.stat3':   'Vision communication',

    // Services
    'services.label': 'Nos services',
    'services.title': 'Ce que nous faisons',
    'services.1.title': 'Communication Stratégique',
    'services.1.desc':  'Élaboration de stratégies de communication 360° sur mesure pour construire et renforcer votre positionnement auprès de vos publics cibles.',
    'services.2.title': 'Relations Publiques',
    'services.2.desc':  'Gestion des relations avec les parties prenantes — médias, institutions, société civile — pour bâtir une présence solide et pérenne.',
    'services.3.title': 'Gestion de Réputation',
    'services.3.desc':  'Surveillance, protection et valorisation de votre e-réputation. Gestion de crise et communication de rétablissement.',
    'services.4.title': 'Intégration Locale',
    'services.4.desc':  'Accompagnement à l\'intégration dans les communautés locales malgaches grâce à des campagnes de sensibilisation et d\'engagement.',
    'services.5.title': 'Production de Contenus',
    'services.5.desc':  'Création de supports de communication créatifs : visuels, brochures, contenus digitaux et matériaux pour décideurs.',
    'services.6.title': 'Conseil & Accompagnement',
    'services.6.desc':  'Coaching en communication pour leaders et dirigeants. Architecture de réputation personnelle et institutionnelle.',

    // Approach
    'approach.label': 'Notre approche',
    'approach.title': 'Ce qui nous distingue',
    'approach.intro': 'Notre agence allie expertise stratégique, réseau d\'influence et compréhension des dynamiques locales et internationales pour produire des solutions pérennes.',
    'approach.p1.title': 'Confiance mutuelle',
    'approach.p1.body':  'La confiance à long terme est notre premier actif. Nous cultivons des relations durables avec journalistes, décideurs et partenaires institutionnels.',
    'approach.p2.title': 'Ancrage local',
    'approach.p2.body':  'Une connaissance fine des dynamiques sociales, économiques et politiques malgaches, au service d\'une communication authentique et efficace.',
    'approach.p3.title': 'Impact mesurable',
    'approach.p3.body':  'Chaque stratégie est conçue avec des objectifs clairs et des indicateurs de performance. Nous mesurons, ajustons, et livrons des résultats concrets.',
    'approach.p4.title': 'Développement durable',
    'approach.p4.body':  'Nous plaçons la durabilité au cœur de nos recommandations, en favorisant un développement sociétal inclusif et responsable pour Madagascar.',
    'approach.quote':    '"Nous combinons communication stratégique, réseau d\'influence solide et compréhension profonde des dynamiques locales et internationales pour offrir des solutions durables."',

    // Contact
    'contact.label':   'Contact',
    'contact.title1':  'Parlons de',
    'contact.title2':  'votre projet.',
    'contact.desc':    'Que vous souhaitiez renforcer votre image, gérer une crise ou vous implanter à Madagascar, nous sommes à votre écoute.',
    'contact.address': 'Adresse',
    'contact.email':   'Email',
    'contact.phone':   'Téléphone',
    'contact.f.name':  'Nom complet',
    'contact.f.name.ph':    'Votre nom',
    'contact.f.email.ph':   'votre@email.com',
    'contact.f.message':    'Message',
    'contact.f.message.ph': 'Décrivez votre projet...',
    'contact.f.submit':     'Envoyer le message',
    'contact.success':      'Merci pour votre message. Nous vous répondrons dans les meilleurs délais.',
  },

  en: {
    // Navbar
    'nav.about':    'About',
    'nav.services': 'Services',
    'nav.approach': 'Approach',
    'nav.contact':  'Contact',

    // Hero
    'hero.eyebrow':  'Founded in 2009 · Antananarivo, Madagascar',
    'hero.title1':   'Strategy.',
    'hero.title2':   'Sustainability.',
    'hero.title3':   'Impact.',
    'hero.sub':      'Strategic communication and public relations\nfor organizations and leaders in Madagascar.',
    'hero.cta':      'Discover',

    // About
    'about.label':   'About',
    'about.h2.1':    'Local trust,',
    'about.h2.2':    'international reach.',
    'about.body1':   'Since 2009, Dujardin Delacour & Cie has supported organizations, institutions and leaders in Madagascar in building and managing their image, reputation and community integration.',
    'about.body2':   'Our strength lies in combining strategic communication expertise, a strong network of influence and a deep understanding of local and international dynamics.',
    'about.stat1':   'Year founded',
    'about.stat2':   'Years of expertise',
    'about.stat3':   'Communication vision',

    // Services
    'services.label': 'Our services',
    'services.title': 'What we do',
    'services.1.title': 'Strategic Communication',
    'services.1.desc':  'Developing tailored 360° communication strategies to build and strengthen your positioning with your target audiences.',
    'services.2.title': 'Public Relations',
    'services.2.desc':  'Managing relationships with stakeholders — media, institutions, civil society — to build a solid and lasting presence.',
    'services.3.title': 'Reputation Management',
    'services.3.desc':  'Monitoring, protecting and enhancing your e-reputation. Crisis management and recovery communication.',
    'services.4.title': 'Local Integration',
    'services.4.desc':  'Supporting integration into local Malagasy communities through awareness and engagement campaigns.',
    'services.5.title': 'Content Production',
    'services.5.desc':  'Creating creative communication materials: visuals, brochures, digital content and materials for decision-makers.',
    'services.6.title': 'Consulting & Coaching',
    'services.6.desc':  'Communication coaching for leaders and executives. Personal and institutional reputation architecture.',

    // Approach
    'approach.label': 'Our approach',
    'approach.title': 'What sets us apart',
    'approach.intro': 'Our agency combines strategic expertise, a network of influence and an understanding of local and international dynamics to deliver lasting solutions.',
    'approach.p1.title': 'Mutual trust',
    'approach.p1.body':  'Long-term trust is our primary asset. We cultivate lasting relationships with journalists, decision-makers and institutional partners.',
    'approach.p2.title': 'Local roots',
    'approach.p2.body':  'A deep knowledge of Malagasy social, economic and political dynamics, in service of authentic and effective communication.',
    'approach.p3.title': 'Measurable impact',
    'approach.p3.body':  'Every strategy is designed with clear objectives and performance indicators. We measure, adjust, and deliver concrete results.',
    'approach.p4.title': 'Sustainable development',
    'approach.p4.body':  'We place sustainability at the heart of our recommendations, fostering inclusive and responsible societal development for Madagascar.',
    'approach.quote':    '"We combine strategic communication, a strong network of influence and a deep understanding of local and international dynamics to deliver sustainable solutions."',

    // Contact
    'contact.label':   'Contact',
    'contact.title1':  'Let\'s talk about',
    'contact.title2':  'your project.',
    'contact.desc':    'Whether you want to strengthen your image, manage a crisis or establish yourself in Madagascar, we are here to listen.',
    'contact.address': 'Address',
    'contact.email':   'Email',
    'contact.phone':   'Phone',
    'contact.f.name':  'Full name',
    'contact.f.name.ph':    'Your name',
    'contact.f.email.ph':   'your@email.com',
    'contact.f.message':    'Message',
    'contact.f.message.ph': 'Describe your project...',
    'contact.f.submit':     'Send message',
    'contact.success':      'Thank you for your message. We will get back to you as soon as possible.',
  },
};
