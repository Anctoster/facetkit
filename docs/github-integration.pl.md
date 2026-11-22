# Integracja z GitHubem

[🇬🇧 English](github-integration.md) | [🇵🇱 Polski] · Wcześniej: [Szybki start](quick-start.pl.md) → [Włączenie do projektu](project-integration.pl.md)

FacetKit Action sprawdza każdy pull request i utrzymuje na nim jeden aktualny komentarz:

> ### ✅ FacetKit — level **L3** (required: L2)
> | Check | Result | Details |
> | :--- | :--- | :--- |
> | Security scan | ✅ PASS | scan: 4 changed file(s) · 0 finding(s) · 0 blocking |
> | Tests | ✅ PASS | npm test passed |
> | Mutation probe | ✅ PASS | 90 % of mutants noticed (9/10) |

Nie wymaga żadnej konfiguracji w projekcie i działa niezależnie od tego, czy używasz agentów.

## Konfiguracja

```bash
facet init --github        # zapisuje .github/workflows/facetkit.yml i nic więcej
```

albo napisz plik samodzielnie:

```yaml
name: facetkit
on:
  pull_request:
permissions:
  contents: read
  pull-requests: write          # dla komentarza; bez tego raport i tak jest w podsumowaniu zadania
jobs:
  assurance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0        # wymagane: zmiana jest mierzona od miejsca, w którym PR odchodzi od gałęzi docelowej
      - uses: actions/setup-node@v4       # Twoje narzędzia i zależności, aby testy mogły działać
        with:
          node-version: 22
      - run: npm ci
      - uses: Anctoster/facetkit@v0.7.1   # przypnij wydanie lub SHA commita
        with:
          min-level: L2
```

Zatwierdź go i otwórz pull request. Aby był warunkiem scalenia: **Settings → Branches → branch protection → Require status checks → `assurance`**.

## Wejścia i wyjścia

| Wejście | Domyślnie | |
|---|---|---|
| `min-level` | `L2` | najniższy poziom, który przechodzi |
| `test-command` | zgadywane | z `package.json` (npm, pnpm, yarn, bun), `pyproject.toml` / `pytest.ini` / `setup.cfg` / `tox.ini` (pytest), `go.mod`, `pom.xml`, `gradlew` |
| `item-id` | z gałęzi | identyfikator w rodzaju `ABC-12` lub `ITEM-3` w nazwie gałęzi, potem w tytule PR, w przeciwnym razie `PR-<numer>` |
| `max-mutants` | `10` | najwyżej tyle mutantów zmienionych wierszy; każdy uruchamia testy raz |
| `max-minutes` | `10` | limit czasu sondy mutacyjnej |
| `comment` | `true` | zapisz raport jako komentarz do PR |
| `node-version` | `22` | Node.js dla samego FacetKit |

Wyjścia: `level` (`L0`–`L4`) i `passed` (`true`/`false`). Pełny wynik jest wysyłany jako artefakt `facetkit-report` (`facetkit-report.json`) i pokazywany w podsumowaniu zadania.

## Co oznacza poziom

**Bez stanu (stateless)** — przypadek zwykły i jedyny, gdy nie używasz agentów:

| Poziom | Przebieg zobaczył |
|---|---|
| L1 | czysty skan bezpieczeństwa zmiany (bez sekretu, zabronionego pliku, niebezpiecznego polecenia czy wstrzykniętej instrukcji) |
| L2 | testy przechodzą |
| L3 | testy zauważyły co najmniej 80 % celowych uszkodzeń zmienionych wierszy |

Zmiana bez kodu źródłowego — dokumentacja, konfiguracja, workflow — nie ma czego mutować: sonda pokazuje **➖ not needed**, a poziom kończy się na L2.

Ten poziom opisuje jeden przebieg CI. Nie jest podpisany i nie jest pakietem dowodowym.

**Dziennik** — gdy zadanie PR jest w dzienniku projektu (używasz agentów i zatwierdzasz `.facet/`): poziom to ten, którego dowodzi dziennik (werdykt, niezależność, kontrole, mutacje, odstępstwa — zob. [Governance](governance.md)), po tym, jak `facet journal` zweryfikował dziennik, a `facet proof verify` pakiet dowodowy, jeśli zadanie go ma. Sam przebieg go nie podnosi.

Nieudana kontrola powoduje niepowodzenie przebiegu niezależnie od poziomu. Skan, który nie mógł odczytać pliku (binarnego, zbyt dużego), to ostrzeżenie, a nie zaliczenie tego pliku.

## Wybór poziomu

- **Zacznij od `L2`**: skan i testy. Dla zespołu nic się nie zmienia poza komentarzem.
- **Przejdź na `L3`**, gdy komentarz pokazuje przeważnie zauważone mutanty. Każdy wiersz `survived` w raporcie to brakująca asercja.
- Z agentami wymagaj tego, czego wymaga Twoja polityka (`govern.required` w `facet.json`).

## Warto wiedzieć

- **Forki.** Używaj zdarzenia `pull_request`, nigdy `pull_request_target`: kod PR działa w tym zadaniu. Przy PR z forka token nie może pisać komentarzy — przebieg to zgłasza i nadal przechodzi lub nie na własnych zasadach.
- **Czas.** Sonda mutacyjna uruchamia testy raz na każdy mutant (domyślnie 10, tylko na zmienionych wierszach). Dbaj o szybkie polecenie testów, wskaż w `test-command` właściwe testy albo zmniejsz `max-mutants` / `max-minutes`.
- **Sekrety.** Testy działają tylko z podstawowym zestawem zmiennych środowiskowych — `PATH`, `HOME`, `USERPROFILE`, `TEMP`, `TMP`, `LANG`, `SYSTEMROOT`, `COMSPEC`, `PATHEXT`, `TERM`; token GitHuba nigdy do nich nie trafia. Test, który potrzebuje czegoś innego (`JAVA_HOME`, `VIRTUAL_ENV`, proxy), dostaje to przez `govern.env` w `facet.json`.
- **Monorepo.** Action sprawdza katalog główny repozytorium. Dla pakietu w podfolderze uruchom `npx facetkit ci-verify` w kroku `run:` z `working-directory:`.
- **Lokalnie.** `facet ci-verify --base main` daje ten sam raport przed wypchnięciem zmian.

## Świadek w CI

Pakiet dowodowy zrobiony na Twoim komputerze stoi najwyżej na L3, dopóki ktoś inny nie dostanie tych samych odpowiedzi: **świadek** uruchamia kontrole jeszcze raz i podpisuje wynik. Zapis z innej maszyny i innego środowiska — runnera CI — jest `independent` i tylko on pozwala pakietowi stanąć na L4.

1. **Klucz dla CI, raz.** Na zaufanym komputerze: `facet key new`, potem `facet key trust <klucz publiczny> --name ci --role witness` i commit `.facet/trust.json`. Klucz prywatny (plik `.pem` zapisany przez `facet key new`) wstaw do sekretów repozytorium jako `FACET_WITNESS_KEY`, a plik usuń.
2. **Workflow.** Skopiuj z FacetKit [`.github/workflows/facet-witness.yml`](../.github/workflows/facet-witness.yml). Uruchamia się, gdy pull request dostaje etykietę `witness` (i ponownie przy nowych commitach, dopóki ją ma), albo ręcznie ze ścieżką pakietu. Dla każdego pakietu zmienionego w pull requeście pobiera commit wskazany w pakiecie, wykonuje

   ```bash
   facet proof witness --pack <pakiet> --key-env FACET_WITNESS_KEY --out <kopia> --record <zapis>
   ```

   i dołącza podpisany zapis do przebiegu jako artefakt oraz do pull requesta jako komentarz. Pakiet w repozytorium zostaje bez zmian.
3. **Czego CI nie uruchomi.** Kontrola wymagająca programu, którego runner nie ma, mówi to w `govern.checks`: `"model.layers": { "run": "python tools/model_audit.py …", "requires": ["archicad"] }`. Świadek jej nie uruchamia (`not run here`), a zapis, który nie wykonał wszystkich kontroli, za nic nie ręczy — taki pakiet zostaje tam, gdzie był. Na komputerze biura, który ma ten program, `--with archicad,blender` uruchamia i je. Kontrole na wyeksportowanych danych (snapshot modelu w JSON, indeks sceny, obrazy) działają wszędzie.

`--key-env NAZWA` czyta klucz prywatny z tej zmiennej — tekst PEM, z prawdziwymi łamaniami linii lub `\n` — i nie przekazuje go żadnej komendzie uruchamianej przez świadka, cokolwiek wymienia `govern.env`; `FACET_WITNESS_KEY` nie jest przekazywany nigdy. Tablica (`facet board`, *Trust*) pokazuje odsetek pakietów odtworzonych przez niezależnego świadka.

**Trzymaj klucz z dala od kodu, który ocenia.** Sekrety nie trafiają do workflow pull requestów z forków, a tego workflow nie wolno zmieniać na `pull_request_target`. Uruchamiają go tylko osoby, które mogą nadawać etykiety. Narzędzie działa z gałęzi domyślnej, nie z pull requesta.

## Bez Action

Dowolne CI może wykonać tę samą kontrolę:

```bash
git fetch origin main                              # z pełną historią (bez --depth)
npx --yes facetkit ci-verify --base "$(git merge-base origin/main HEAD)" --min-level L2 --test-cmd "npm test"
```

Kończy się kodem 0, gdy poziom został osiągnięty i żadna kontrola nie zawiodła, zapisuje `facetkit-report.json` i drukuje raport w Markdownie.
