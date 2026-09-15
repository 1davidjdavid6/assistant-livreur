# Assistant Livreur — Besançon

Outil d'aide à la décision et de suivi d'activité pour un livreur à vélo (VAE)
toutes plateformes à Besançon. Connecté à Supabase (comptes, base de données,
temps réel) et déployé sur Netlify.

## Navigation

L'outil livreur (`index.html`) est organisé en 5 onglets (barre fixe en bas) :

- 🚗 **Livraison** — évaluation de courses, commandes en cours + chrono 15 min
- 📊 **Performances** — à venir (chiffre d'affaires, €/heure, meilleurs créneaux)
- 📋 **Historique** — courses validées/annulées passées
- 📅 **Événements** — lecture seule des événements créés par l'admin
- ⚙️ **Profil** — infos du compte, déconnexion

`dashboard.html` reste la page admin séparée (gestion des courses + événements).

## Structure

```
index.html           → outil livreur (protégé par connexion), 5 onglets
login.html            → connexion / inscription (Supabase Auth)
dashboard.html        → tableau de bord admin : courses + gestion des événements
css/style.css         → design partagé
js/supabase.js        → client Supabase + garde d'authentification
js/timer.js           → chronomètre 15 min, module isolé
js/app.js             → logique complète de l'outil livreur (décision, onglets,
                          service auto, historique, événements)
js/auth.js            → logique de la page de connexion
js/dashboard.js        → logique du tableau de bord admin (courses)
js/events-admin.js     → gestion des événements par l'admin (CRUD)
```

## Automatisations (vs saisie manuelle)

- **Heures de service** : bouton "Démarrer ma journée" → calcul automatique
  des heures écoulées (remplace l'ancien champ saisi à la main).
- **Événement à proximité** : dérivé automatiquement de la table `evenements`
  (un événement en cours déclenche le conseil, plus besoin de le signaler).

## Base de données

- `profiles` — rôle (`livreur`/`admin`), `shift_started_at` (début de service).
- `courses` — prix, distance, €/km, décision, statut (`en_attente`|`en_cours`|
  `validee`|`annulee`), chrono 15 min. Sert aussi de source pour l'Historique
  et, à terme, les Performances (aucune colonne supplémentaire nécessaire :
  `updated_at - created_at` donne la durée d'une course validée).
- `evenements` — titre, description, date_debut, date_fin. Lecture ouverte,
  écriture réservée à l'admin (RLS).

## Prochaines étapes (audit produit du 15/09)

- [ ] Onglet Performances (CA jour/semaine, €/heure, meilleurs créneaux)
- [ ] Auto-calcul des courses longues enchaînées depuis l'historique
- [ ] Auto-récupération météo (Besançon, API gratuite sans clé)
- [ ] Simplification du comparateur multi-courses (flux single-course prioritaire)
- [ ] Page admin "Utilisateurs" (promotion admin sans SQL manuel)

Volontairement écarté (voir audit) : journalisation exhaustive des actions et
table "sessions" custom — redondant avec les timestamps déjà présents et avec
Supabase Auth.

## Devenir admin

```sql
update public.profiles set role = 'admin' where id = '<uuid-utilisateur>';
```
