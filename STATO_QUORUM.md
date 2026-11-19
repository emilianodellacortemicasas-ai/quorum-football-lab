# QUORUM · Football Lab: stato del lavoro

Questo file prevale sul `README.md` originale, dove i due sono in contrasto. Base di partenza: commit `e7e5494` del passaggio (147 file, hash verificati con `MANIFEST_SHA256.json`). Il progetto è completamente separato da qualsiasi altro progetto di Emiliano.

## Cosa è cambiato rispetto al passaggio (19 nov 2026)

### Identità
Gli header `oai-authenticated-*` di ChatGPT Sites non sono più considerati affidabili in produzione.

- Ogni API passa da `lib/identity.ts`.
- In produzione il server verifica il JWT di **Cloudflare Access**: firma RS256, audience, issuer, scadenza (`lib/access-jwt.ts`).
- `QUORUM_ALLOWED_EMAILS` è un secondo filtro, opzionale.
- Il mock locale funziona solo con `vite dev` su localhost.
- Senza la configurazione Access l'app resta chiusa a tutti (fail-closed).

### OpenAI
- La verifica ora esegue l'elenco dei modelli e una **richiesta Responses reale e minima**.
- Rileva anche la posizione di uscita del server.
- Mostra per ogni passaggio: HTTP, codice, tipo e request ID. Il testo grezzo del fornitore non viene mai esposto.
- La chiave viene salvata se OpenAI la riconosce almeno in un passaggio. Dopo una correzione dei permessi si usa «Ricontrolla», senza reincollarla.
- `List models: Read` non è più obbligatorio. Serve solo `Responses: Request`.

### Modello
Il default `gpt-6.2-sol` non risulta nel catalogo pubblico OpenAI a novembre 2026. Il nuovo default è `gpt-6.1-sol`, configurabile con `OPENAI_MODEL`. La diagnosi conferma quali modelli sono visibili al progetto.

### Ipotesi principale sul 403
OpenAI respinge con 403 (`unsupported_country_region_territory`) le richieste che escono da regioni non supportate. Con i Cloudflare Workers questo è un problema documentato. Il Worker ora viene eseguito in posizione fissa UE (`placement: targeted aws:eu-central-1`).

**L'ipotesi non è ancora provata.** La conferma arriverà dalla prima diagnosi sul server reale.

### Deploy autonomo
- `scripts/quorum-deploy.sh` è idempotente: D1, migrazioni, build, deploy, chiavi di cifratura generate una sola volta, segreti.
- `.github/workflows/deploy.yml` lo esegue da GitHub Actions con i secret del repository.

## Verifiche eseguite qui
- `npm run install:ci`, typecheck, build: OK.
- 28 test automatici passati: i 22 originali più 6 nuovi su JWT e diagnosi OpenAI.
- `wrangler deploy --dry-run` con la configurazione autonoma: OK.
- Build di produzione avviata in locale: pagine 200. Le API rifiutano gli header d'identità falsificati (401/403).

## Non ancora verificato
- Nessuna chiamata reale a OpenAI, API-Football, Sportmonks o The Odds API: il workspace di sviluppo non raggiunge quei domini.
- Deploy reale su Cloudflare e configurazione di Access.
- Il test `tests/integration.mjs` resta da adattare.
- Il modello statistico resta una baseline non calibrata. Nessun rendimento dimostrato.

## Secret del repository GitHub (Settings → Secrets → Actions)
| Nome | Contenuto |
|---|---|
| `CLOUDFLARE_API_TOKEN` | token API Cloudflare (Workers + D1 edit) |
| `CLOUDFLARE_ACCOUNT_ID` | ID account Cloudflare |
| `QUORUM_ADMIN_EMAIL` | email del proprietario |
| `QUORUM_ALLOWED_EMAILS` | email ammesse, separate da virgola |
| `CF_ACCESS_TEAM_DOMAIN` | `<team>.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | Application Audience (AUD) tag dell'app Access |

Le chiavi dei fornitori dati e di OpenAI **non** vanno qui. Si inseriscono nella pagina `/collegamenti` dell'app, dove vengono cifrate nel browser.
