# Szybki start

[🇬🇧 English](quick-start.md) | [🇵🇱 Polski] · Dalej: [Włączenie do projektu](project-integration.pl.md) → [Integracja z GitHubem](github-integration.pl.md)

Dziesięć minut, Twój własny kod, bez agentów i bez konfiguracji. Zobaczysz, co FacetKit mierzy, zanim zdecydujesz, ile z niego chcesz.

Potrzebny jest Node.js 20 lub nowszy i repozytorium git. Sam FacetKit nie ma zależności.

## 1. Uruchom

```bash
npm i -g facetkit        # albo wpisuj "npx facetkit" wszędzie tam, gdzie ten przewodnik pisze "facet"
cd twoj-projekt
```

## 2. Sprawdź jedną zmianę

Zmień coś w kodzie — albo użyj zmiany, którą już masz — i uruchom:

```bash
facet ci-verify --test-cmd "npm test"     # Twoje własne polecenie testów: pytest -q, go test ./..., mvn -q test …
```

To ta sama kontrola, którą GitHub Action wykonuje dla pull requesta, tutaj na Twoich niezatwierdzonych zmianach:

| Poziom | Oznacza |
|---|---|
| **L1** | skan bezpieczeństwa nie znalazł w zmianie sekretu, zabronionego pliku ani wstrzykniętej instrukcji |
| **L2** | testy przechodzą |
| **L3** | FacetKit celowo zepsuł zmienione wiersze (mutanty), a testy zauważyły co najmniej 80 % tych uszkodzeń |

L2 mówi, że testy są zielone. L3 mówi, że zauważyłyby, gdyby zmiana była błędna — i o tę różnicę chodzi w FacetKit. Raport wymienia każdy mutant, którego nikt nie zauważył (`survived: src/price.ts:14`): każdy z nich to brakujący test.

Aby sprawdzić zatwierdzoną pracę, podaj commit, od którego się zaczyna: `facet ci-verify --base main`.

## 3. Narzędzia po kolei

Każde działa samodzielnie, bez przygotowań:

```bash
facet scan                                                  # na czym poległoby drzewo robocze: sekrety, zabronione ścieżki, wstrzyknięty tekst
facet mutate --files src/price.py --test "pytest -q tests/" # których celowych uszkodzeń nie zauważa żaden test
facet seams --changed src/price.py                          # kto zależy od tego pliku i które testy go obejmują
facet trace --spec SPEC.md --tests tests                    # wymagania, których nie weryfikuje żaden test
facet atlas hotspots                                        # pliki często edytowane, od których zależy wiele innych, z małą liczbą testów
```

Rozumieją JavaScript/TypeScript, Python, Go i Javę. Każde kończy się kodem różnym od zera, gdy znajdzie problem, więc każde można wstawić do skryptu lub kroku CI bez zmian.

## 4. Zobacz resztę bez ryzyka

```bash
npx facetkit demo        # tablica z danych syntetycznych: jak wygląda zespół po kilku tygodniach
```

## Co dalej

- **Zostań przy samych narzędziach** — nic więcej nie trzeba. Dodaj `facet ci-verify` do CI: [Integracja z GitHubem](github-integration.pl.md).
- **Daj własnemu agentowi regułę** albo **uruchamiaj tylko wybranych agentów**: [Włączenie do projektu](project-integration.pl.md).
- **Na ile można ufać wynikowi** (poziomy, pakiety dowodowe, świadkowie): [Governance](governance.md) (po angielsku).
