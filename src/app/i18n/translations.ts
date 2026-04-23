export type Lang = 'fr' | 'en';

export const TRANSLATIONS: Record<Lang, Record<string, string>> = {
  fr: {
    // Navbar
    'nav.about':    'À propos',
    'nav.services': 'Services',
    'nav.izao':     'Initiative',
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
    'about.body1':   'Depuis plus de 16 ans, Dujardin Delacour & Cie intervient à Madagascar, sur l\'ensemble du territoire, au contact direct des réalités institutionnelles, économiques et communautaires.',
    'about.body2':   'Cet ancrage permet une compréhension fine des dynamiques locales, des équilibres sociaux et des attentes implicites qui structurent les environnements d\'intervention.',
    'about.body3':   'Parallèlement, notre activité s\'inscrit dans des contextes internationaux. Nous accompagnons principalement des organisations à capitaux étrangers, engagées dans des projets nécessitant une articulation précise entre standards internationaux et réalités locales.',
    'about.body4':   'Cette double lecture — locale et internationale — constitue un levier central de notre capacité d\'intervention et la marque distinctive de notre approche.',
    'about.stat1':   'Année de fondation',
    'about.stat2':   'Années d\'expertise',
    'about.stat3':   'Vision communication',

    // Services
    'services.label': 'Nos services',
    'services.title': 'Domaines d\'intervention',
    'services.1.title': 'Conseil stratégique & réputation',
    'services.1.desc':  'Nous accompagnons les organisations dans la définition et la structuration de leur positionnement, en intégrant les enjeux d\'image, de perception et de crédibilité. Notre intervention vise à sécuriser les décisions stratégiques en tenant compte de leur impact sur l\'environnement institutionnel, médiatique et sociétal.',
    'services.2.title': 'Gestion de crise',
    'services.2.desc':  'Nous intervenons en amont, pendant et après les situations de crise pour maîtriser les risques réputationnels. Notre approche privilégie la préparation, la clarté des messages et la coordination des acteurs afin de contenir les effets, restaurer la confiance et stabiliser l\'environnement.',
    'services.3.title': 'Relations parties prenantes',
    'services.3.desc':  'Nous facilitons le dialogue entre les organisations et leurs parties prenantes — institutions, communautés, leaders d\'opinion — en construisant des cadres d\'échange adaptés aux réalités locales et aux enjeux spécifiques de chaque projet.',
    'services.4.title': 'Communication ESG',
    'services.4.desc':  'Nous accompagnons la structuration et la mise en cohérence des engagements environnementaux, sociaux et de gouvernance. L\'objectif est de rendre ces engagements lisibles, crédibles et alignés avec les attentes des parties prenantes — qu\'il s\'agisse d\'investisseurs, de régulateurs ou de communautés locales.',
    'services.5.title': 'Présence terrain & engagement',
    'services.5.desc':  'Nous assurons une présence opérationnelle au plus près des réalités locales, afin de suivre les dynamiques, anticiper les tensions et ajuster les stratégies en continu. Cette proximité permet une gestion fine des situations et une meilleure appropriation des actions engagées.',
    'services.6.title': 'Accompagnement & renforcement des équipes',
    'services.6.desc':  'Nous travaillons avec les directions et les équipes pour renforcer l\'alignement interne, structurer les messages et développer les capacités de prise de parole. L\'objectif est de faire des organisations des acteurs cohérents et crédibles dans leur environnement.',

    // Izao Akia a
    'izao.label':         'Initiative',
    'izao.title':         'Izao Akia a…',
    'izao.body1':         'En partenariat avec l\'Ordre des Journalistes de Madagascar, Dujardin Delacour & Cie lance "Izao Akia a…" — une initiative pour inspirer la prochaine génération de femmes et de filles à travers des messages d\'encouragement et de conseils.',
    'izao.body2':         'Des voix du monde entier sont invitées à partager une pensée, un conseil ou une courte vidéo compilée dans un album spécial "Voix pour demain", diffusé sur les plateformes de l\'OJM, LinkedIn et les réseaux de Karine Rabefaritra.',
    'izao.partners':      'Partenaires',
    'izao.channels':      'Diffusion',
    'izao.channels.body': 'Page Facebook de l\'OJM (album "Voix pour demain") · LinkedIn Dujardin Delacour & Cie · Plateformes de Karine Rabefaritra',

    // Approach
    'approach.label': 'Notre approche',
    'approach.title': 'Une méthode fondée sur la compréhension et la maîtrise des équilibres',
    'approach.intro': 'Notre approche repose sur une lecture systémique des situations : nous analysons les interactions entre acteurs, les dynamiques implicites, les perceptions et les zones de tension avant toute prise de parole.',
    'approach.intro2': 'Cette lecture s\'accompagne d\'une présence terrain permanente, seule façon de saisir les réalités opérationnelles et d\'ajuster les stratégies en continu.',
    'approach.intro3': 'Nous intervenons avec une exigence de discrétion absolue, condition essentielle pour préserver les intérêts de nos clients et garantir la qualité des échanges.',
    'approach.p1.title': 'Cohérence',
    'approach.p1.body':  'Aligner les décisions, les messages et les actions pour éviter toute dissonance entre ce qui est dit et ce qui est perçu.',
    'approach.p2.title': 'Lisibilité',
    'approach.p2.body':  'Rendre les positions compréhensibles, crédibles et structurées pour chaque partie prenante — quelle que soit la complexité du contexte.',
    'approach.p3.title': 'Confiance',
    'approach.p3.body':  'Créer les conditions d\'un dialogue durable, même dans les situations les plus sensibles ou les plus exposées.',
    'approach.quote':    '"Nous combinons communication stratégique, réseau d\'influence solide et compréhension profonde des dynamiques locales et internationales pour offrir des solutions durables."',

    // Contact
    'contact.label':   'Contact',
    'contact.title1':  'Prenons le temps',
    'contact.title2':  'd\'une conversation.',
    'contact.desc':    'Nous travaillons avec des organisations qui savent ce qu\'elles doivent protéger, et qui cherchent à clarifier leur position dans des environnements exigeants.',
    'contact.desc2':   'Un premier échange permet d\'identifier rapidement les enjeux et les modalités d\'accompagnement adaptées à votre situation.',
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

// ------------------------------------ ENG FORM ------------------------------------ //

  en: {
    // Navbar
    'nav.about':    'About',
    'nav.services': 'Services',
    'nav.izao':     'Initiative',
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
    'services.title': 'Areas of Expertise',
    'services.1.title': 'Strategic Advisory & Reputation',
    'services.1.desc':  'We support organizations in defining and structuring their positioning, integrating the challenges of image, perception and credibility. Our work aims to secure strategic decisions by accounting for their impact on the institutional, media and societal environment.',
    'services.2.title': 'Crisis Management',
    'services.2.desc':  'We intervene before, during and after crisis situations to manage reputational risks. Our approach prioritizes preparation, message clarity and stakeholder coordination to contain effects, restore trust and stabilize the environment.',
    'services.3.title': 'Stakeholder Relations',
    'services.3.desc':  'We facilitate dialogue between organizations and their stakeholders — institutions, communities, opinion leaders — by building engagement frameworks adapted to local realities and the specific challenges of each project.',
    'services.4.title': 'ESG Communication',
    'services.4.desc':  'We support the structuring and alignment of environmental, social and governance commitments. The goal is to make these commitments readable, credible and aligned with stakeholder expectations — whether investors, regulators or local communities.',
    'services.5.title': 'Field Presence & Engagement',
    'services.5.desc':  'We maintain an operational presence close to local realities, to monitor dynamics, anticipate tensions and continuously adjust strategies. This proximity enables refined situation management and better ownership of the actions undertaken.',
    'services.6.title': 'Team Support & Capacity Building',
    'services.6.desc':  'We work with leadership and teams to strengthen internal alignment, structure messages and develop public speaking capabilities. The goal is to make organizations coherent and credible actors in their environment.',

    // Izao Akia a
    'izao.label':         'Initiative',
    'izao.title':         'Izao Akia a…',
    'izao.body1':         'In partnership with the Ordre des Journalistes de Madagascar, Dujardin Delacour & Cie launches "Izao Akia a…" — an initiative to inspire the next generation of women and girls through messages of encouragement and advice.',
    'izao.body2':         'Voices from around the world are invited to share a thought, advice, or a short video compiled in a special album "Voix pour demain", broadcast on OJM platforms, LinkedIn and Karine Rabefaritra\'s networks.',
    'izao.partners':      'Partners',
    'izao.channels':      'Distribution',
    'izao.channels.body': 'OJM Facebook page (album "Voix pour demain") · Dujardin Delacour & Cie LinkedIn · Karine Rabefaritra\'s platforms',

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
