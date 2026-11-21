# Włączenie do projektu

[🇬🇧 English](project-integration.md) | [🇵🇱 Polski] · Wcześniej: [Szybki start](quick-start.pl.md) · Dalej: [Integracja z GitHubem](github-integration.pl.md)

FacetKit można przyjąć w czterech rozmiarach. Każdy działa samodzielnie; nic nie zmusza do przejścia na następny.

| Rozmiar | Co dodajesz do projektu | Co dostajesz |
|---|---|---|
| **1. Same narzędzia** | nic | skan, sonda mutacyjna, szwy, ślad wymagań — uruchamiane ręcznie lub w CI ([szybki start](quick-start.pl.md)) |
| **2. Jedna reguła dla własnego agenta** | nic | krótka, sprawdzalna reguła, której agent przestrzega, zamiast długiego promptu |
| **3. Wybrani agenci** | `facet.json`, `facet.items.json`, `.facet/` | dziennik każdego kroku, werdykt inspektora, poziom pewności dla każdego zadania |
| **4. Cały zespół** | to samo | wszystkich dziewięciu agentów, adaptacyjne trasy, raporty kosztów i jakości |

## 1. Same narzędzia

Zob. [szybki start](quick-start.pl.md). Do projektu nic nie jest zapisywane.

## 2. Jedna reguła dla własnego agenta

Twój agent (Claude Code, Cursor, cokolwiek, co potrafi uruchomić polecenie powłoki) pracuje jak dotąd. Dajesz mu jedną umiejętność:

```text
Zanim napiszesz testy, uruchom `facet compose --take spec-trace,falsifiable-tests` i postępuj według tego.
```

`facet list` pokazuje umiejętności; `facet compose --take a,b` drukuje reguły, z których się składają — dość krótkie, by ich przestrzegać. Nie potrzeba konfiguracji ani dziennika.

## 3. Wybrani agenci

Większość zespołów nie chce wszystkich dziewięciu agentów. Wybierz tych, których potrzebujesz:

```bash
facet init --agents slice-builder,proof-inspector            # dodaj --claude, aby skopiować do .claude/ tylko tych agentów
```

`init` skraca domyślny przebieg do wybranych agentów i zachowuje jego kolejność. Typowe wybory:

| Chcesz | `--agents` | Kroki zadania |
|---|---|---|
| Budowa, potem niezależna kontrola | `slice-builder,proof-inspector` | build → proof → commit |
| Testy, które nie przechodzą, zanim powstanie kod, potem budowa, potem sonda mutacyjna | `spec-falsifier,slice-builder,proof-inspector` (to samo co `--minimal`) | spec → build → probe → proof → commit |
| To samo ze scenariuszami akceptacyjnymi | `spec-falsifier,red-first-specifier,slice-builder,proof-inspector` | spec → red → build → probe → proof → green → commit |
| Krok projektowy przed ryzykownymi zmianami | dodaj `blueprint-architect` | … design przed spec … |
| Wdrożenia i migracje | dodaj `release-pilot` | … ops przed proof … |
| Tylko inspektor nad pracą ludzi lub innego narzędzia | `proof-inspector` | proof → commit |

Co robi każdy agent — w [README](../README.pl.md).

**Bez `proof-inspector` nikt nie ocenia pracy.** `init` ustawia wtedy `govern.required` na 0 i zadania zamykają się na L0: dziennik zapisuje, co się stało, ale żaden poziom powyżej L0 nie jest deklarowany.

### Przeprowadzenie zadania

W Claude Code: uruchom go ponownie i wpisz `/facet-item ITEM-1`. W każdym innym przypadku dziennik mówi, co dalej, a Ty (lub Twój agent) to robisz:

```bash
facet flow open ITEM-1
facet flow next                                  # CALL slice-builder · step build · model sonnet
facet flow start build && …agent pracuje… && facet flow end build --status DONE
facet flow next                                  # CALL proof-inspector · step proof
facet flow start proof && … && facet flow end proof --status DONE
facet flow verdict PASS
facet flow close                                 # odmawia, dopóki polityka nie jest spełniona
```

### Mniej kroków dla jednego zadania

Przebieg projektu to najwięcej, co zadanie może dostać. Pojedyncze zadanie może dostać mniej:

- `"skip": ["probe"]` we wpisie zadania w `facet.items.json` pomija ten krok dla tego zadania. Budowy, werdyktu i commita pominąć nie można.
- `facet route --changed` (albo `facet route src/a.ts src/b.ts`, albo `--task "tekst, który wymienia pliki"`) proponuje trasę na podstawie tego, czego dotyka zmiana — zmiana samej dokumentacji pomija więcej; `--apply --item ITEM-1` zapisuje ją w `facet.items.json`.
- `facet flow open ITEM-1 --route a,b` decyduje w chwili otwarcia.

### Dodanie lub usunięcie agenta później

Edytuj `.facet/flow.json`: krok to `{ "id": …, "agent": …, "phase": … }`, a krok kończący się werdyktem ma `"verdict": true`. `init` nigdy nie nadpisuje pliku, więc aby zacząć od nowa, usuń `.facet/flow.json` i uruchom ponownie `facet init --agents …`.

## 4. Cały zespół

```bash
facet init                # wszyscy agenci; kroki opcjonalne (design, spec, probe, ops) działają dla zadania, gdy jego trasa wymienia ich agenta
facet init --claude       # to samo, z agentami i poleceniami dla Claude Code
```

Albo zainstaluj wtyczkę Claude Code — zob. [README](../README.pl.md).

## Co skonfigurować

Wszystko jest opcjonalne i znajduje się w `facet.json` (lub pod `"facetkit"` w `package.json`):

| Klucz | Co robi | Na początek |
|---|---|---|
| `govern.checks` | własne kontrole projektu, uruchamiane przez `facet check` i przez inspektora | `{ "unit": { "run": "npm test", "covers": ["src/**", "test/**"] } }` |
| `govern.required` | najniższy poziom, na którym zadanie może zostać zamknięte (0–4) | `1` |
| `govern.env` | zmienne środowiskowe potrzebne kontrolom (innych nie dostają) | `["NODE_OPTIONS"]` |
| `dirs` | gdzie jest kod — dla szwów i atlasu | zapisywane przez `init` na podstawie tego, co istnieje |

Pełna lista jest w README; poziomy i reguły — w [Governance](governance.md) (po angielsku).

## Co zatwierdzać w repozytorium

Zatwierdzaj `facet.json`, `facet.items.json` i `.facet/` — dziennik w `.facet/journal` to historia pracy i CI go czyta. Dodaj `.work/` do `.gitignore`: są tam logi i pliki robocze każdego zadania.

## Dalej

Te same kontrole na każdym pull requeście: [Integracja z GitHubem](github-integration.pl.md).
