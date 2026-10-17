# Site web de l'IPTO — Institut Professionnel et Technologique d'Oyo

Site vitrine officiel de l'**Institut Professionnel et Technologique d'Oyo (IPTO)**, établissement de formation professionnelle et technologique situé à Oyo, République du Congo.

Site statique en **HTML, CSS et JavaScript** : aucune installation, aucune dépendance à compiler. Il s'ouvre directement dans un navigateur et se déploie gratuitement sur GitHub Pages.

![Page d'accueil](docs/screenshots/accueil.jpg)

## Pages

| Page | Fichier | Contenu |
|------|---------|---------|
| Accueil | `index.html` | Présentation, chiffres clés, filières, actualités, galerie du campus, témoignages, partenaires |
| À propos | `about.html` | Histoire, engagements, mot du ministre, valeurs, qualité de formation |
| Formations | `formation.html` | Les 4 filières BTS avec cours principaux |
| Admissions | `admission.html` | Processus, calendrier, conditions, documents, frais |
| Actualités | `actualite.html` | Événements de l'institut |
| Contact | `contact.html` | Coordonnées, formulaire de contact, FAQ |

<details>
<summary>Voir les captures des autres pages</summary>

| | |
|---|---|
| ![À propos](docs/screenshots/a-propos.jpg) | ![Formations](docs/screenshots/formations.jpg) |
| ![Admissions](docs/screenshots/admissions.jpg) | ![Actualités](docs/screenshots/actualites.jpg) |
| ![Contact](docs/screenshots/contact.jpg) | |

</details>

## Fonctionnalités

- Design responsive (ordinateur, tablette, mobile) avec menu mobile accessible
- Carrousel de témoignages (défilement automatique, points cliquables, balayage tactile, pause au survol)
- Partenaires en défilement continu
- Compteurs animés et apparition progressive des blocs au défilement
- Statut automatique **« À venir » / « Terminé »** des événements et des dates d'admission, calculé selon la date du jour
- Formulaire de contact avec validation (nom, e-mail, téléphone congolais ou international), envoi sans rechargement de page et protection anti-spam
- FAQ en accordéon
- Bouton « Retour en haut » et ancres qui tiennent compte de la barre de navigation
- Respect de `prefers-reduced-motion` et navigation au clavier

## Technologies

- HTML5, CSS3 (variables CSS, Grid, Flexbox), JavaScript vanilla (ES6+)
- [Font Awesome 6.5](https://fontawesome.com/) pour les icônes
- [Google Fonts](https://fonts.google.com/) : Playfair Display (titres) et Inter (texte)
- [Formspree](https://formspree.io/) pour l'envoi du formulaire de contact
- Google Analytics (balise `gtag.js`)

## Structure du projet

```
ipto-website/
├── index.html
├── about.html
├── formation.html
├── admission.html
├── actualite.html
├── contact.html
├── assets/
│   ├── css/
│   │   └── ipto.css        # Design system et styles de toutes les pages
│   ├── js/
│   │   └── script.js       # Menu, carrousel, formulaire, FAQ, animations…
│   ├── images/             # Logo et photos du campus / des filières
│   └── docs/               # Documents à télécharger (formulaire d'inscription)
├── docs/
│   └── screenshots/        # Captures utilisées dans ce README
├── .gitignore
└── README.md
```

## Lancer le site en local

Ouvrez simplement `index.html` dans votre navigateur.

Pour un rendu identique à la mise en ligne (recommandé), lancez un petit serveur local depuis le dossier du projet :

```bash
# avec Python
python -m http.server 8000

# ou avec Node.js
npx serve .
```

Puis ouvrez <http://localhost:8000>.

## Publier sur GitHub Pages

1. Envoyez le projet sur un dépôt GitHub (le dossier `ipto-website` doit être à la racine du dépôt).
2. Dans le dépôt : **Settings → Pages**.
3. Sous *Build and deployment*, choisissez **Deploy from a branch**, la branche `main` et le dossier `/ (root)`, puis **Save**.
4. Après une à deux minutes, le site est disponible à l'adresse `https://<votre-utilisateur>.github.io/<nom-du-depot>/`.

## Modifier le contenu

| Je veux modifier… | Où |
|-------------------|----|
| Les couleurs, polices, arrondis | Variables `:root` en haut de `assets/css/ipto.css` |
| Les événements (titre, date, lieu) | `actualite.html` et la section « Actualités » de `index.html`. La date se règle avec `data-date="AAAA-MM-JJ"` : le statut « À venir » / « Terminé » se met à jour tout seul |
| Le calendrier d'admission | Section `#dates` de `admission.html` (mêmes attributs `data-date`) |
| Les frais, conditions, documents | `admission.html` |
| Les témoignages | Section `#temoignages` de `index.html` (un bloc `<figure class="quote t-slide">` par témoignage) |
| Les partenaires | Section `#partenaires` de `index.html`. La liste est écrite **deux fois** (le second groupe est une copie pour que le défilement boucle sans coupure) : modifiez les deux |
| Les filières et leurs cours | `formation.html` |
| Les coordonnées et horaires | `contact.html` et le pied de page de chaque page |
| Le destinataire du formulaire de contact | Attribut `action` du formulaire dans `contact.html` (lien Formspree) |
| L'identifiant Google Analytics | Balise `gtag` dans le `<head>` de chaque page |
| Le bouton « Espace étudiant » | Lien `data-soon` dans la barre de navigation : remplacez-le par l'adresse de l'espace étudiant quand il existera |

> Le menu et le pied de page sont répétés dans chaque page HTML : une modification doit être reportée dans les 6 fichiers.

## À faire avant la mise en ligne

- [ ] Ajouter le vrai **formulaire d'inscription** dans `assets/docs/formulaire-ipto.pdf` (le lien « Télécharger le formulaire » de la page Admissions pointe vers ce fichier)
- [ ] Mettre à jour les **dates** d'admission (calendrier 2026-2027 déjà passé) et les **événements**
- [ ] Remplacer les **témoignages** de MAYANDZA Dan Marcus, KAYA Mercy et GANGANZAMBI Noble par leurs vraies paroles, avec leur accord (textes provisoires, repérés par un commentaire `À REMPLACER` dans `index.html`)
- [ ] Vérifier la liste des **partenaires**
- [ ] Remplacer l'adresse e-mail de contact par l'adresse officielle de l'école (pied de page et page Contact)
- [ ] Renseigner les vrais liens des **réseaux sociaux** (Facebook, Instagram) dans le pied de page
- [ ] Ajouter une photo pour la filière **Transport & Logistique** (la carte affiche une illustration en attendant)
- [ ] Remplacer `batiment-principal.jpg` par une version en meilleure résolution
- [ ] Vérifier les textes officiels (mot du ministre, mention du ministère de rattachement)

## Droits

Le code source de ce site a été développé pour l'IPTO. Le nom, le logo, les photographies et les textes institutionnels appartiennent à l'IPTO. Tous droits réservés.

## Auteur

Développé par **MIBANTESSA NSILOULOU Georvelain** — [@georvelaindev](https://github.com/georvelaindev)
