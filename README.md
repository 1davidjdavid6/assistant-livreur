# Assistant Livreur — Besançon

Outil d'aide à la décision et de suivi d'activité pour un livreur à vélo (VAE)
toutes plateformes à Besançon. Connecté à Supabase et déployé sur Netlify.

## Navigation (outil livreur — index.html)

- 🚗 **Livraison** — évaluation de courses, commandes en cours + chrono 5 min
- 📊 **Performances** — à venir
- 📋 **Historique** — courses validées/annulées (saisies à la main ou importées)
- 📅 **Événements** — lecture seule
- ⚙️ **Profil** — infos du compte, déconnexion

`dashboard.html` (admin uniquement) : Utilisateurs, Import CSV Uber,
Historique des imports, Courses, Événements (CRUD).

## Structure

```
index.html            → outil livreur (5 onglets)
login.html             → connexion / inscription
dashboard.html         → tableau de bord admin
css/style.css          → design partagé
js/supabase.js         → client Supabase + garde d'authentification
js/timer.js            → chronomètre 5 min, module isolé
js/app.js              → logique de l'outil livreur
js/auth.js             → logique de connexion
js/dashboard.js        → courses + gestion des utilisateurs (identifiant Uber)
js/events-admin.js     → gestion des événements (CRUD admin)
js/csv-import.js       → import de relevés CSV Uber (admin)
```

## Chronomètre (5 minutes)

Cercle qui se vide progressivement + affichage MM:SS. Vibration au passage
sous la dernière minute (Android uniquement — l'API Vibration n'existe pas
sur Safari/iOS, limitation de la plateforme, pas un bug). Rouge et message
clair à 00:00. Les commandes déjà en cours avant cette mise à jour gardent
leur durée d'origine (15 min) ; seules les nouvelles commandes utilisent 5 min.

## Import CSV Uber (admin uniquement)

1. **Utilisateurs** : renseigner l'identifiant Uber (email ou nom tel qu'il
   apparaît dans le CSV) de chaque livreur — obligatoire pour que l'import
   sache à qui attribuer les courses.
2. **Importer un relevé Uber** : sélectionner le CSV → mapping des colonnes
   détecté automatiquement (corrigeable) → analyser → résumé (nouvelles,
   doublons, non reconnus, erreurs) → confirmer.
3. Le fichier brut n'est jamais envoyé à Supabase, seules les données
   validées le sont. Dédoublonnage via l'identifiant de course Uber
   (`courses.external_id`, unique en base).
4. Un livreur déjà connecté voit apparaître ses courses importées dans son
   Historique sans avoir à se reconnecter (Realtime).

Aucune connexion à l'API Uber : le fonctionnement reste 100% basé sur un
fichier CSV téléchargé manuellement par l'admin.

## Base de données

- `profiles` — role, nom, shift_started_at, **uber_identifiant** (clé de
  correspondance CSV).
- `courses` — ..., **external_id** (dédoublonnage), **source**
  (`manuel`|`import_csv`), **duree_minutes**.
- `evenements` — inchangé.
- `csv_imports` *(nouveau)* — historique des imports, strictement admin.

RLS mise à jour : un admin peut désormais insérer une course pour un autre
utilisateur (import) et modifier le profil d'un autre utilisateur (associer
son identifiant Uber) — les deux étaient nécessaires pour que la
fonctionnalité soit réellement utilisable, pas seulement affichée.

## Devenir admin

```sql
update public.profiles set role = 'admin' where id = '<uuid-utilisateur>';
```

## Prochaines étapes

- [ ] Onglet Performances (CA jour/semaine, €/heure, meilleurs créneaux)
- [ ] Discussion en attente sur les idées "Objectif 2" (score de
      productivité, heatmap, objectif du jour, résumé de fin de journée)
