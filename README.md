# Assistant Livreur — Besançon

Outil d'aide à la décision pour un livreur à vélo (VAE) toutes plateformes
(Uber Eats, Deliveroo, Stuart, Delicity, Just Eat) à Besançon. Connecté à
Supabase (comptes, base de données, temps réel) et déployé sur Netlify.

## Structure

```
index.html          → l'outil (protégé par connexion) : évaluation multi-courses,
                        sauvegarde en base, suivi "commandes en cours" + chrono 15 min,
                        affichage des événements (lecture seule)
login.html          → connexion / inscription (Supabase Auth)
dashboard.html       → tableau de bord admin : courses (temps réel, recherche/filtre/tri)
                        + gestion complète des événements (créer/modifier/supprimer)
css/style.css        → design partagé entre les 3 pages
js/supabase.js       → client Supabase + garde d'authentification
js/timer.js          → chronomètre 15 min, module isolé et autonome
js/app.js            → moteur de décision + logique de la page outil + événements (lecture)
js/auth.js           → logique de la page de connexion
js/dashboard.js      → logique du tableau de bord admin (courses)
js/events-admin.js   → gestion des événements par l'admin (CRUD)
```

## Stack

- Frontend : HTML5 / CSS3 / JavaScript (aucun framework)
- Backend : Supabase (PostgreSQL, Auth, Realtime, RLS)
- Hébergement : Netlify (déploiement continu depuis ce dépôt)

## Base de données

- `profiles` — rôle (`livreur` ou `admin`), créé automatiquement à l'inscription.
- `courses` — prix, distance, €/km, décision, statut (`en_attente` | `en_cours` |
  `validee` | `annulee`), chrono 15 min.
- `evenements` — titre, description, date_debut, date_fin. Lecture ouverte à
  tout utilisateur connecté ; création/modification/suppression réservées à
  l'admin (RLS).

## Fonctionnalités

- [x] Authentification (Supabase Auth)
- [x] Sauvegarde des courses en base + RLS (livreur ↔ admin)
- [x] Chronomètre 15 min (délai avant annulation d'une commande)
- [x] Réinitialisation automatique du formulaire "Courses en attente" après
      qu'une course a été enregistrée puis marquée Validée
- [x] Tableau de bord admin en temps réel (Supabase Realtime), recherche/filtre/tri
- [x] Rubrique Événements : gestion admin (CRUD) + affichage livreur (à venir / en cours)
- [x] Déploiement continu via Netlify

## Devenir admin

Par défaut, tout nouveau compte a le rôle `livreur`. Pour promouvoir un
compte en admin, exécuter dans l'éditeur SQL Supabase :

```sql
update public.profiles set role = 'admin' where id = '<uuid-utilisateur>';
```

L'UUID est visible dans Supabase → Authentication → Users.
