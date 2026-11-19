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

## Verificato in produzione (19 nov 2026, 03:15)
- URL: https://quorum-football-lab.emilianodc-myedu.workers.dev (Cloudflare Workers + D1 `quorum-football-lab-db`, Europa).
- Accesso: Cloudflare Access (team `twilight-frost-2e90`, Zero Trust Free), policy «Cloudflare account members», tutto il traffico; JWT verificato dal server.
- Deploy automatico a ogni push su `main` (GitHub Actions), 5 secret configurati.
- **Causa del blocco OpenAI dimostrata:** credito API esaurito (HTTP 429 `insufficient_quota`) + permesso `List models: Read` assente (HTTP 403), che la versione precedente rendeva bloccante. Regione: OK (IT/FRA). Dopo la ricarica: Responses HTTP 200 con `gpt-6.1-sol`.
- Spiegazione AI reale generata su scenario demo; puntata virtuale salvata in D1.

## Non ancora verificato
- API-Football, Sportmonks, The Odds API: account non ancora attivati.
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

## Aggiornamento 19 nov 2026, 03:50
- Perimetro (scelta di Emiliano, 19/11/2026): Serie A, Premier League, La Liga, Bundesliga, Ligue 1, Coppa Italia (Sportmonks Starter + 1 lega extra, 33 €/mese; trial fino al 3/12/2026). Niente Serie B. Coppe europee e nazionali fuori perimetro.
- API-Football rimosso dall'interfaccia (rischio blocchi/sospensione da IP condivisi Cloudflare); codice conservato.
- Accesso: aggiunto login con codice via email (One-time PIN) e policy «QUORUM utenti autorizzati» (solo emilianodc.myedu@gmail.com).
- Restyling «notte da stadio + tattico», nuovo logo (Q = cerchio di centrocampo), icone app, PWA installabile dietro Access (manifest con credenziali).
- Collegamenti verificati: OpenAI, Sportmonks (Free), The Odds API (Free).

## 19/11/2026 · Value scanner (v1)
- Cloudflare Workers Paid attivo (5 $/mese, approvato da Emiliano).
- Scansione automatica ogni giorno alle 06:40 (cron `40 5 * * *` UTC) + "Aggiorna ora" (solo admin, max 3/giorno, non entro 30 minuti dalla precedente).
- Flusso: calendario Sportmonks (prossimi 3 giorni) → quote The Odds API (h2h + totals, regione EU, 2 crediti per lega) → abbinamento squadre/orario → modello Poisson → consenso di mercato senza margine.
- Stima QUORUM = 35% modello + 65% mercato. Giocata proposta se: valore ≥ 3%, quota ≤ 4,50, ≥ 5 bookmaker, quota migliore entro il 6% della mediana, scarto modello/mercato ≤ max(6 punti, 25% del mercato). Puntata indicativa = ¼ Kelly, max 2%.
- Tutti gli esiti valutati sono salvati in `scanner_rows` (base per regolamento automatico e backtest). Esecuzioni in `scanner_runs`.
- Protezione crediti The Odds API: stop sotto 40 crediti residui (piano free 500/mese).

## 19/11/2026 · Pronostici + modello v2
- Nuova vista iniziale "Pronostici": per ogni partita segno, doppia chance, O/U 2,5, GG/NG, risultato più probabile, gol attesi, classifica, forma (ultime 5), indisponibili.
- Modello v2 (lib/model-v2.ts): rating attacco/difesa per campionato su ~13 mesi (4 finestre Sportmonks da 99 giorni), emivita 120 giorni, shrinkage 4 gol, fattore campo per lega, rho Dixon–Coles per lega. Coppa Italia usa i rating di Serie A. Stato salvato in D1 `model_state` e ricostruito a ogni scansione.
- Indisponibili: include `sidelined.player;sidelined.type` disponibile nel piano Starter. Mostrati, non ancora pesati nel calcolo.
- Prima verifica (42 partite): scarto medio dal mercato 4,8 punti su 1X2, 8,5 su Over/Under 2,5 con il modello che sottostima l'Over di 5,4 punti → da correggere col backtest.
- Le limitazioni dello scanner sono state tolte su richiesta: tutte le giocate con valore > 0 sono visibili, i controlli QUORUM sono un'etichetta. Unico freno: riserva crediti The Odds API (12).

## 19/11/2026 · Backtest e modello v2.1
- Backtest walk-forward (lib/backtest.ts, endpoint /api/backtest solo admin): rifit settimanale solo con dati precedenti, 461 partite negli ultimi 150 giorni, 1.942 risultati totali.
- Griglia testata: emivita 45–320 giorni, shrinkage 1–4, fattore gol 1,00–1,09. Scelti: emivita 250, shrinkage 3, fattore gol 1,07.
- v2.1: log-loss 1X2 0,978 (riferimento frequenze di campionato 1,063); segno più probabile preso 53,6%; Over/Under 2,5 preso 57,5%; gol previsti 3,03 vs reali 3,02; Over previsto 57,2% vs reale 57,7%.
- Calibrazione pronostici principali: 56%→59% presi, 65%→62%, 74%→72%, 84%→95% (20 casi).
- Scarto Over 2,5 dal mercato sulle partite in programma: bias da −5,4 a −1,7 punti.
- Il backtest salvato è mostrato nella pagina Pronostici ("Affidabilità misurata").

## 19/11/2026 · Schedine automatiche
- Vista "Schedine" (lib/tickets.ts): raddoppi con la singola (quota 1,80–2,40), raddoppio in multipla (2–3 esiti, quota 1,90–2,30), multipla prudente (3–4, quota 2,5–4), multipla di valore (solo esiti con valore > 1%), multipla ambiziosa (4–6, quota 10–25), Bomba della settimana (5–8 esiti, quota 50–200, p ≥ 45%, mai contro il mercato).
- Sempre un solo esito per partita. Probabilità = stima QUORUM (35% modello + 65% mercato). "Analizza nel Laboratorio" carica la schedina nel calcolatore di sistemi.
- Orizzonte scanner esteso a 7 giorni (48 partite al 19/11).
- Nota: il valore atteso delle multiple è calcolato sulle quote migliori di bookmaker diversi, quindi è ottimistico rispetto a un solo bookmaker.
