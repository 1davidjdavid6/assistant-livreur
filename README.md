# Assistant Livreur — Besançon

Outil d'aide à la décision pour un livreur à vélo (VAE) toutes plateformes
(Uber Eats, Deliveroo, Stuart, Delicity, Just Eat) à Besançon, maintenant
connecté à une vraie base de données avec comptes et tableau de bord admin.

## Structure

```
index.html      → l'outil (protégé par connexion) : évaluation multi-courses,
                   sauvegarde en base, suivi "commandes en cours" + chrono 15 min
login.html      → connexion / inscription (Supabase Auth)
dashboard.html  → tableau de bord admin, temps réel (Supabase Realtime)
css/style.css   → design partagé entre les 3 pages
js/supabase.js  → client Supabase + garde d'authentification
js/timer.js     → chronomètre 15 min, module isolé et autonome
js/app.js       → moteur de décision + logique de la page outil
js/auth.js      → logique de la page de connexion
js/dashboard.js → logique du tableau de bord admin
```

## Stack

- Frontend : HTML5 / CSS3 / JavaScript (aucun framework)
- Backend : Supabase (PostgreSQL, Auth, Realtime, RLS)
- Hébergement : Netlify

## Base de données

Table `profiles` (role `livreur` ou `admin`, créée automatiquement à
l'inscription) et table `courses` (prix, distance, €/km, décision, statut,
chrono). RLS : un livreur ne voit/modifie que ses propres courses ; un admin
voit et modifie tout.

## État des fonctionnalités

- [x] Authentification (Supabase Auth)
- [x] Sauvegarde des courses en base (PostgreSQL / Supabase)
- [x] Politiques RLS (livreur ↔ admin)
- [x] Chronomètre 15 min (délai avant annulation d'une commande)
- [x] Tableau de bord admin en temps réel (Supabase Realtime), recherche/filtre/tri
- [ ] Déploiement continu via Netlify (en cours)

## Devenir admin

Par défaut, tout nouveau compte a le rôle `livreur`. Pour promouvoir un
compte en admin, exécuter dans l'éditeur SQL Supabase :

```sql
update public.profiles set role = 'admin' where id = '<uuid-utilisateur>';
```

L'UUID est visible dans Supabase → Authentication → Users.
