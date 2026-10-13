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

1. Identifier le projet Supabase **réellement utilisé par SIREX**, sauvegarder son schéma/données et tester sur une copie. Le projet Supabase accessible pendant cette correction n’était pas identifié comme celui de SIREX : aucune base distante n’a été modifiée.
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
- Aucune connexion Oracle/SYDONIA ni import automatique d’un export SYDONIA n’était présent dans le dépôt. La déclaration et ses articles sont saisis ici ; cette intégration nécessite les formats d’export et accès correspondants.
- Les devises et unités doivent correspondre pour valider. Aucune conversion de change ni conversion d’unité implicite n’est appliquée.
- Un lien signé de PDF déjà émis peut rester utilisable jusqu’à son expiration (5 minutes) ; la révocation interdit les nouveaux accès/signatures.
- La validation visuelle dans un navigateur n’a pas pu être exécutée dans l’environnement de correction : l’exécutable Chromium était absent et son téléchargement a échoué. Les tests de composants utilisent un DOM de test, avec API simulée, séparément des tests SQL.
