# QUORUM · Football Lab

Private beta for football analysis, mathematical experiments and a virtual bankroll. Working name and visual identity, not a cleared commercial brand.

## What is implemented

- Responsive Italian interface and installable web manifest for Android/iPhone browsers.
- Goal distribution: independent Poisson, 1X2, double chance, both teams to score, total/team goals and exact scores, including a custom score selector.
- Synthetic corners/yellow/red count experiments using a negative-binomial CDF with explicitly hypothetical means and dispersion. Total and team half-goal thresholds. No trained card/corner model is claimed.
- Exhaustive scenario enumeration for up to eight distinct fixtures: singles, full accumulators and k-of-n systems. Distinguishes any winning ticket from net profit after all ticket costs. Rejects multiple selections on the same fixture instead of silently assuming independence.
- Virtual portfolios, immutable bet snapshots, manually entered odds and manually settled outcomes. Win/loss/void handling; net-profit accounting; ROI excludes void stakes. CSV export.
- Server-enforced single-stake, total-open-exposure, worst-case daily-loss and drawdown limits; Rome calendar days; cent-based arithmetic. Compare-and-swap revisions prevent simultaneous stake reservations from bypassing checks.
- D1 records scoped to the platform-authenticated user ID. Private hosting. No real bets, deposits, payments, guaranteed returns or fabricated performance history.
- Optional API-Football and Sportmonks adapters for actual fixtures and a deliberately simple goal-rate baseline based on current-season home/away goal averages. At least five corresponding home/away observations, upcoming matches only. Missing data fails closed. Odds remain manual. This adapter has not been exercised against a paid provider account.

## What is not yet implemented or validated

Conversational OpenAI analyst, data ingestion history, automated odds comparison, fitted/calibrated production models, real-money ledger, provider-verified settlements, backtest engine, automated performance reports, push alerts, live analysis and subscriptions. The beta does not demonstrate a positive edge, profitability or future income. Cross-league cups and national teams require separate validation. Demo outcomes never count as evidence of real-world model performance.

## Planned production architecture

| Layer | Responsibility | Acceptance criterion |
| --- | --- | --- |
| Data ingestion | Licensed fixture/team/player/referee statistics, lineups, injuries, xG and timestamped odds | Coverage and event definitions checked per competition/season; retain missing-value and freshness metadata |
| Goal models | Time-weighted team strengths, Dixon–Coles/bivariate count model; Elo or boosted-tree challengers | Out-of-time calibration and log-loss/Brier score against simple and bookmaker baselines |
| Corners | Overdispersed count regression with team/opponent context | Independently evaluated total/team thresholds; no reuse of goal probabilities |
| Cards | Referee/team discipline model; rare-red occurrence/count model | Adequate samples, rare-event calibration and consistent second-yellow definitions |
| Decision engine | Estimated probability vs available odds, uncertainty, freshness and correlation checks | May recommend no action; no target return baked into selection |
| Risk engine | User-set exposure budgets, limits by fixture/competition/day, stress tests | Consistent enforcement in server-side transactions; no loss-recovery staking |
| AI analyst | Explain supplied facts, model output, limitations and risk state | Cannot invent data, overwrite numeric probabilities or authorize spending; secret setup requires user approval |
| Evidence | Forecast snapshot before kickoff, independent settlement, costs, model version, chronological evaluation | All predictions retained including losses; uncertainty intervals and opportunity/selection bias reported |
| Commercial release | Separate customer accounts, access tiers and monthly billing | Data licenses, target-market requirements and release readiness reviewed; no guaranteed-income claims |

Start with pre-match decisions. Do not apply a pre-match distribution to an in-play score or to extra-time/cup qualification markets. Systems require joint probabilities if fixtures or selections are dependent; the current laboratory labels its independence assumption and blocks same-fixture combinations.

## Coverage scope

Serie A, Premier League, La Liga, Ligue 1; Champions/Europa/Conference; Coppa Italia, Copa del Rey, Coupe de France, FA Cup, League Cup; World Cup, Euros, Nations League, European national qualifiers and international friendlies. Provider competition identifiers are configuration, and actual season/market coverage must be confirmed with the subscribed feed before enabling it.

## Validation plan before personal real-money use

1. Acquire adequate, licensed historical statistics and contemporaneous pre-match odds; record availability timestamps.
2. Train only on earlier periods; rolling validation on later periods. Fit/tune and evaluate on different time intervals. Treat promoted teams, national sides and cross-league cups separately.
3. Compare probabilities with market-implied probabilities after removing bookmaker margin. Check calibration and proper scoring rules, not only hit rate.
4. Forward paper-test all predictions with pre-kickoff timestamps, provider-settled results and real available odds. Report net return, number of bets, maximum drawdown, uncertainty, fees and data/AI costs.
5. Evaluate the joint risk of selections. Correlation, exposure limits, stale information, incomplete samples or unconfirmed lineups can lead to no action.
6. Consider any real-money use and commercial launch only after reviewing evidence. Statistical confidence requires an adequate sample and does not guarantee future profitability.

## Technical operations

Use the Sites-maintained install/build/workflow helpers. D1 binding is `DB`. Schema migrations live in `drizzle/` and are applied at deployment. `API_FOOTBALL_KEY` is an optional runtime secret configured through the hosting secret manager; never store it in source, the client or the manifest. OpenAI credentials are decrypted server-side only when an explicit analysis is requested.

- Math and bankroll tests: `node --experimental-strip-types --test tests/math.test.mjs`
- Local API integration test against the local preview only: `node tests/integration.mjs`
- Type check: `node node_modules/typescript/bin/tsc --noEmit`

Local-only test identities are never used for production authentication. Never trust client-submitted probabilities, ownership or model snapshots. The server recalculates these and scopes every mutation to the signed-in visitor.

## Primary references reviewed 18 November 2026

- API-Football pricing: https://www.api-football.com/pricing/
- API-Football coverage: https://www.api-football.com/coverage/
- API-Football statistics and event definitions: https://www.api-football.com/documentation-v3
- Sportmonks data and advanced-feed comparison: https://www.sportmonks.com/football-api/plans-pricing/
- OpenAI model selection (planned explanatory layer): https://developers.openai.com/api/docs/models
- Corner-count modelling research: https://arxiv.org/abs/2112.13001


## Collegamenti protetti e analista AI

`/collegamenti` permette al proprietario autenticato di inserire le chiavi OpenAI e API-Football. Il browser cifra la chiave con RSA-OAEP 4096 / SHA-256 e un contesto legato al fornitore e al destinatario. D1 conserva esclusivamente il ciphertext. Il server decifra solo durante il controllo o la chiamata al fornitore. Nessun segreto viene incluso nel client, nei log o nel repository. Questa soluzione sostituisce il precedente percorso di inserimento locale; nessuna chiave è stata acquisita tramite chat.

Runtime richiesto: `QUORUM_KEY_PRIVATE_JWK` (secret), `QUORUM_KEY_PUBLIC_JWK` (RSA public JWK), `QUORUM_KEY_RECIPIENT_ID`, `QUORUM_ADMIN_EMAIL` (owner email), `OPENAI_MODEL` (default `gpt-6.2-sol`). Non rigenerare la coppia RSA mentre sono presenti credenziali salvate. Restano compatibili `OPENAI_API_KEY` e `API_FOOTBALL_KEY` come secret nativi, se già configurati.

`/api/report` ricostruisce i fatti dal dataset sintetico o dal fornitore prima di chiamare Responses. Nessuna probabilità ricevuta dal client viene accettata. Usa Structured Outputs, `store:false`, ragionamento low e un massimo di 1800 token in uscita. Non invia nomi dei proprietari o saldi dei portafogli. Sono consentite al massimo 20 richieste AI e 20 verifiche delle chiavi per giorno UTC, mediante contatore atomico D1. Il costo effettivo dipende dai token e non è garantito da questo limite di richieste; configurare anche i controlli del progetto OpenAI.

La verifica della chiave usa GET /v1/models, senza inference. Responses: Request, accesso al modello e credito vengono verificati solo quando l’utente richiede la prima spiegazione. I test locali non provano che la chiave dell’utente sia stata inserita o che l’inference reale funzioni.


## Fornitori aggiuntivi (19 novembre 2026)

Sportmonks è selezionabile nel calendario reale. Gli ID sono prefissati `sm-`; le competizioni sono mappate per nome e paese e le leghe non riconosciute sono escluse. Il modello usa fino a 20 incontri conclusi negli ultimi 100 giorni, separati casa/trasferta e almeno cinque per lato. Si leggono esclusivamente i punteggi cumulativi `2ND_HALF`, mai il totale `CURRENT` comprensivo di supplementari. I dati futuri e incompleti sono esclusi. Non si mediano le probabilità di fornitori diversi.

The Odds API alimenta `/quote`: competizioni ed eventi pre-match, mercati effettivamente disponibili per evento, quote decimali per bookmaker con data di aggiornamento. L’API key passa nell’header `x-api-key` e non nell’URL. Elenco mercati e quote sono azioni esplicite e consumano crediti; cache di un minuto e contatore atomico di 200 consultazioni al giorno UTC. Nessun abbinamento automatico tra identificativi dei fornitori; nessuna integrazione per effettuare giocate.

La pagina Collegamenti mostra i piani mensili pubblicati e link diretti ai fornitori. Non attiva, acquista o disdice abbonamenti. Sportmonks xG, Pressure Index e Predictions sono add-on commerciali separati: la loro lettura e il loro uso nel modello non sono implementati. Opta richiede un preventivo ed è escluso dalla configurazione acquistabile online. Nessuna nuova chiave è stata ricevuta attraverso la chat.

Gli errori OpenAI vengono classificati da codice e messaggio in memoria; nessun corpo upstream viene mostrato o registrato. Un 403 generico non viene più attribuito con certezza al permesso List models. Gli errori di credito e di frequenza vengono distinti. Correlazione tramite request ID solo se contiene caratteri sicuri.
