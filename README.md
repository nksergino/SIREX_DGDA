# SIREX DGDA

Suivi des arrêtés, biens autorisés, déclarations et apurements des régimes préférentiels.

## Installer et vérifier

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Configurer `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans Bolt ou dans un fichier `.env.local` non versionné. Utiliser une clé publiable/anon, jamais une clé `service_role`. Le schéma `sirex_private` ne doit **pas** être ajouté aux schémas exposés par le Data API.

## Mise en service de cette correction

1. Utiliser uniquement le projet dédié **SIREX_DGDA** (`mwwdomavlkifgcajdzpp`), distinct du projet utilisé pour NK-Market. Sauvegarder le schéma/données avant une évolution et tester sur une copie. Le schéma initial et les habilitations ont été installés dans ce projet le 13 octobre 2026.
2. Vérifier l’historique des cinq migrations déjà présentes. Appliquer ensuite `supabase/migrations/20261013175235_secure_sirex_and_control_apurement.sql` sur ce projet. Ne pas réexécuter les anciennes migrations si elles ont déjà été appliquées. La nouvelle migration est atomique lorsqu’elle est exécutée par le mécanisme de migration ; dans SQL Editor, entourer le fichier entier de `BEGIN;` et `COMMIT;`.
3. Créer/inviter le premier administrateur dans Supabase Auth, puis ajouter son UUID vérifié dans `sirex_members` **depuis SQL Editor avec un compte privilégié** :

```sql
INSERT INTO public.sirex_members(user_id,full_name,matricule,role,province,active)
VALUES ('REMPLACER_PAR_UUID_AUTH_VERIFIE'::uuid,
        'Nom de l’administrateur', 'MATRICULE', 'super_admin', NULL, true);
```

4. Se connecter avec l’adresse du compte Auth. Un ancien compte créé comme `012345@sirex.dgda.local` peut utiliser son matricule. Le champ matricule du profil est informatif : il ne transforme pas l’adresse d’un compte Auth existant. Il n’y a plus d’auto-inscription depuis SIREX.
5. Dans **Utilisateurs**, habiliter explicitement chaque compte Auth existant. Super-administrateur et administrateur ont une vue nationale ; agent et consultation sont limités à leur province. Consultation n’a aucun droit d’écriture. Le dernier super-administrateur actif est protégé contre la suspension ou la suppression.
6. Déployer le frontend corrigé **après** la migration et le premier accès administrateur. Un frontend corrigé sur un schéma ancien affichera un accès/configuration manquant plutôt que de continuer avec des règles ouvertes.
7. Effectuer la recette sur des arrêtés et déclarations réels, notamment un PDF textuel, un scan et un PDF mixte. Les tests locaux utilisent PostgreSQL embarqué PGlite avec des schémas Auth/Storage de test ; ils ne remplacent pas la recette avec Supabase Auth, PostgREST et le service Storage réels.

### Effet sur les données existantes

Aucun dossier n’est supprimé. Les anciennes validations n’avaient aucune liste d’articles contrôlée : elles passent à **À régulariser**, avec un événement d’audit, et doivent être contrôlées puis validées à nouveau. La consommation est recalculée à partir des validations vérifiées.

Les arrêtés portant le défaut historique XOF ne passent en USD que si tous leurs biens sont en USD et si leur total correspond exactement à la valeur autorisée. Les autres incohérences restent à vérifier. Il ne s’agit pas d’une conversion monétaire.

Les contraintes ajoutées avec `NOT VALID` préservent les dossiers anciens incohérents, mais contrôlent les nouveaux enregistrements. Corriger les anciennes données avant de valider ces contraintes sur tout l’historique.

## Workflow de contrôle

- Créer un opérateur puis son arrêté et sa liste de biens. Le dossier et les lignes sont enregistrés dans une seule transaction. La valeur autorisée est le total CIF des lignes.
- Le PDF est conservé dans un bucket privé. En cas d’échec du PDF après création, **Réessayer le PDF** reprend le même dossier. Un échec d’association nettoie le fichier isolé si les droits le permettent.
- La reconnaissance est effectuée page par page. Les pages avec peu de texte passent à l’OCR français. Des tableaux en colonnes séparées par tabulations, espaces multiples ou `;`/`|` peuvent être proposés. Les lignes ambiguës restent à saisir. **Appliquer les suggestions** remplace la liste du formulaire : vérifier toutes les lignes, les valeurs et les dates dans le document source avant enregistrement. Aucune reconnaissance OCR ne vaut une validation douanière.
- Enregistrer une déclaration puis ouvrir **Voir → Articles déclarés pour le contrôle** pour saisir chaque ligne avec quantité, unité, code SH, valeur CIF et devise. Ne pas confondre nombre de colis et quantité d’un article.
- Rattacher l’arrêté du même bénéficiaire. Dans **Apurement**, **Contrôler** affiche les écarts ; les anomalies sont alimentées lors des écritures des déclarations/articles. **Valider** ne réussit que si les contrôles serveur passent.
- Les contrôles portent sur bénéficiaire, province, dates/statut, désignation exacte normalisée, unité, code SH lorsqu’il est défini dans l’arrêté, quantité cumulée, valeur CIF par bien, plafond global, devise et total des lignes. Les variantes de désignation nécessitent une vérification et correction explicites : aucune similarité approximative n’accorde automatiquement l’exonération.
- Le verrouillage de l’arrêté sérialise les validations concurrentes ; une validation répétée n’ajoute pas deux fois son montant. **Annuler la validation** restitue la consommation et permet la correction des lignes. Les arrêtés/biens déjà consommés doivent être dévalidés avant modification.

## Administration et traçabilité

**Référentiels** présente les 26 provinces, devises et unités disponibles. **Utilisateurs** gère les habilitations, pas les mots de passe ni la création des comptes Auth : ces opérations restent dans Supabase Auth. **Journal d’audit** présente les 200 derniers événements autorisés, sans modification ni suppression possible depuis l’application. L’auteur est déduit de la session côté serveur.

Le graphique et les indicateurs utilisent les données enregistrées ; les totaux sont séparés par devise. Les listes sont paginées lors du chargement et les statuts sont rechargés après les actions.

## Limites restant à tester/intégrer

- Connexion réelle, invitations et récupération de mot de passe selon la configuration Supabase du projet.
- Reconnaissance des tableaux de scans réels, accents et dispositions complexes ; le chargement initial des ressources OCR nécessite une connexion réseau.
- Une connexion directe Oracle/SYDONIA nécessite encore les accès et le format du service. Le module d’import accepte maintenant les exports CSV UTF-8, avec correspondance explicite des colonnes et contrôle avant chargement.
- Les devises et unités doivent correspondre pour valider. Aucune conversion de change ni conversion d’unité implicite n’est appliquée.
- Un lien signé de PDF déjà émis peut rester utilisable jusqu’à son expiration (5 minutes) ; la révocation interdit les nouveaux accès/signatures.
- La validation visuelle dans un navigateur n’a pas pu être exécutée dans l’environnement de correction : l’exécutable Chromium était absent et son téléchargement a échoué. Les tests de composants utilisent un DOM de test, avec API simulée, séparément des tests SQL.

## Import des déclarations et suivi des reliquats

Migration supplémentaire : `20261014043928_add_declaration_import_and_balances.sql`. L’appliquer uniquement après le schéma initial. Pour une installation neuve, `supabase/bootstrap_sirex.sql` contient désormais l’ensemble des migrations ; ne pas réexécuter ce script sur une base déjà installée.

Dans **Déclarations → Importer un fichier CSV**, télécharger le modèle fourni. Il comporte des exemples fictifs à remplacer. Depuis Excel, enregistrer en **CSV UTF-8** ; l’application ne lit pas directement les fichiers `.xlsx`/`.xls`. Un fichier contient les déclarations d’un seul bénéficiaire et une ligne par article, avec au maximum 2 Mo, 2 000 articles et 200 déclarations.

Associer les colonnes de l’export, choisir le format décimal (virgule ou point), le bénéficiaire et éventuellement l’arrêté par défaut. Dates acceptées : `JJ/MM/AAAA` et `AAAA-MM-JJ`. Quantités : trois décimales maximum ; montants : deux. La quantité est celle de l’article, pas le nombre de colis. La valeur CIF est celle de l’article, pas la valeur facture ni le total répété de la déclaration. Les codes SH restent des chaînes de caractères pour conserver les zéros initiaux. Les unités et devises doivent être explicites et conformes aux référentiels actuels.

Les références de déclaration doivent être uniques dans SIREX : utiliser la référence complète de l’export. Les lignes d’une même déclaration doivent avoir les mêmes informations d’en-tête. Un numéro de ligne article permet de distinguer des articles identiques ; sans lui, des lignes identiques sont bloquées pour vérification. Lorsque le total CIF de déclaration est fourni, sa répétition et sa concordance avec les articles sont vérifiées. Aucune déclaration déjà enregistrée n’est remplacée automatiquement.

Vérifier l’aperçu puis confirmer l’import. Le serveur recontrôle le lot, applique les droits par province et enregistre les déclarations au statut **En attente**. Une erreur annule le lot entier. Un nouvel essai du même import après une interruption réutilise un identifiant de réception et évite les doubles créations. Un identifiant réutilisé pour un autre contenu est refusé.

L’historique conserve le nom, l’empreinte SHA-256 fournie pour le fichier, l’auteur et la date de réception. Les déclarations et lignes sont liées au lot et à leur numéro de ligne source. Le fichier original n’est pas conservé dans le stockage PDF : garder l’export source selon les procédures documentaires DGDA. Les compteurs d’historique représentent les données actuellement présentes, et les corrections d’articles restent tracées par l’audit.

Dans **Reliquats**, sélectionner un arrêté pour voir les quantités et valeurs autorisées, importées et restantes par bien. Seules les validations consomment les plafonds ; l’annulation restitue les reliquats. Une désignation/unité ambiguë est signalée et n’affiche pas un faux solde. Les sommes sont séparées par devise, les quantités par unité. Export CSV disponible, avec protection contre les formules injectées dans les champs textuels.

**Nouveau dossier / Nouvel arrêté** ouvre désormais la création du bénéficiaire si aucun opérateur n’existe, puis poursuit vers l’arrêté après enregistrement. Les profils en consultation ne peuvent pas déclencher ces créations.

Le module n’est pas une connexion en temps réel à Oracle/SYDONIA. La recette finale nécessite un export réel anonymisé pour vérifier les correspondances, le format des dates/nombres et le numéro complet de déclaration. Aucun changement n’est effectué dans SYDONIA.

Validation du 14 octobre 2026 : 30 tests locaux (parseur CSV, précision monétaire, droits provinciaux, transactions/idempotence, import de 2 000 articles, reliquats et composants), TypeScript, ESLint et compilation réussis. Le backend des nouveaux modules a été installé dans SIREX_DGDA. Une recette PostgreSQL sur ce projet a vérifié import, reprise sans doublon, validation répétée et restitution des reliquats sous le rôle authenticated ; toutes ses données fictives ont été annulées. Le contrôle de sécurité Supabase signale que la protection des mots de passe compromis est désactivée ; l’activer dans les paramètres Auth avant la mise en production (https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). La recette du frontend dans Bolt avec un fichier réel anonymisé reste nécessaire.
